import { prisma } from '../config/database.js';
import { decrypt, encrypt } from '../utils/crypto.js';
import { filesService } from './files.service.js';
import { AppError } from '@ssrprompt/shared';
import { Prisma } from '@prisma/client';

import type {
  OcrProvider,
  OcrCredentialSource,
  OcrTestResult,
  UpdateOcrProviderSettingsDto,
  OcrProviderSettings,
  OcrSystemProviderSettings,
  UpdateOcrSystemProviderSettingsDto,
} from '@ssrprompt/shared';

type EffectiveOcrConfig = {
  enabled: boolean;
  provider: OcrProvider;
  baseUrl: string | null;
  apiKey: string | null;
  credentialSource: OcrCredentialSource;
};

const OCR_TEST_PREVIEW_LIMIT = 100_000;

function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().replace(/\/+$/, '') || null;
}

function paddleRequiresToken(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host.endsWith('aistudio-app.com') || host.endsWith('aistudio.baidu.com') || host.endsWith('ai.baidu.com');
  } catch {
    return false;
  }
}

function last4(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return trimmed;
  return trimmed.slice(-4);
}

function safeDecrypt(ciphertext: string | null): string | null {
  if (!ciphertext) return null;
  try {
    return decrypt(ciphertext);
  } catch {
    return null;
  }
}

function mimeToPaddleFileType(mimeType: string): 0 | 1 {
  if (mimeType === 'application/pdf') return 0;
  if (mimeType.startsWith('image/')) return 1;
  throw new AppError(400, 'VALIDATION_ERROR', `Unsupported OCR mime type: ${mimeType}`);
}

function buildAuthorization(value: string, defaultScheme: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  // If caller already provided an auth scheme (e.g. "token xxx", "Bearer yyy"), keep it as-is.
  if (/^[A-Za-z][A-Za-z0-9_-]*\s+/.test(trimmed)) return trimmed;
  return `${defaultScheme} ${trimmed}`;
}

function extractStringsDeep(value: unknown, out: string[], depth = 0): void {
  if (depth > 6) return;
  if (typeof value === 'string') {
    const v = value.trim();
    if (v) out.push(v);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) extractStringsDeep(item, out, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Prefer well-known keys first
      if (k === 'text' || k === 'texts' || k === 'rec_texts' || k === 'recTexts') {
        extractStringsDeep(v, out, depth + 1);
        continue;
      }
      extractStringsDeep(v, out, depth + 1);
    }
  }
}

function extractPaddleText(prunedResult: unknown): string {
  if (!prunedResult) return '';
  if (typeof prunedResult === 'string') return prunedResult.trim();

  if (prunedResult && typeof prunedResult === 'object') {
    const record = prunedResult as Record<string, unknown>;
    const candidates = [
      record.rec_texts,
      record.recTexts,
      record.texts,
      record.text,
    ];

    for (const c of candidates) {
      if (Array.isArray(c) && c.every((x) => typeof x === 'string')) {
        return (c as string[]).map((s) => s.trim()).filter(Boolean).join('\n');
      }
      if (typeof c === 'string') {
        const v = c.trim();
        if (v) return v;
      }
    }
  }

  const strings: string[] = [];
  extractStringsDeep(prunedResult, strings);
  // Deduplicate while preserving order.
  const seen = new Set<string>();
  const deduped = strings.filter((s) => {
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
  return deduped.join('\n');
}

function extractPaddleVlText(layoutParsingResult: unknown): string {
  if (!layoutParsingResult) return '';
  if (typeof layoutParsingResult === 'string') return layoutParsingResult.trim();

  if (layoutParsingResult && typeof layoutParsingResult === 'object') {
    const record = layoutParsingResult as Record<string, unknown>;
    const markdownText = (record.markdown as any)?.text;
    if (typeof markdownText === 'string') {
      const v = markdownText.trim();
      if (v) return v;
    }
    return extractPaddleText(record.prunedResult);
  }

  return '';
}

async function paddleOcrExtract(config: { baseUrl: string; apiKey?: string | null }, file: { buffer: Buffer; mimeType: string }): Promise<{ pages: string[]; fullText: string }> {
  const url = (() => {
    try {
      const u = new URL(config.baseUrl);
      const segments = u.pathname.split('/').filter(Boolean);
      if (segments.includes('ocr')) return u.toString();
      u.pathname = `${u.pathname.replace(/\/+$/, '')}/ocr`;
      return u.toString();
    } catch {
      return config.baseUrl.endsWith('/ocr') ? config.baseUrl : `${config.baseUrl}/ocr`;
    }
  })();

  console.log(`[OCR:Paddle] Starting request to ${url}, file size: ${file.buffer.byteLength} bytes`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (config.apiKey && config.apiKey.trim()) {
    // Baidu AI Studio PaddleOCR expects: Authorization: token <TOKEN>
    headers['Authorization'] = buildAuthorization(config.apiKey, 'token');
  }

  const body = {
    file: file.buffer.toString('base64'),
    fileType: mimeToPaddleFileType(file.mimeType),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  const requestStart = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    console.log(`[OCR:Paddle] Response received in ${Date.now() - requestStart}ms, status: ${res.status}`);

    const text = await res.text();
    const sanitizedText = text.replace(/^\uFEFF/, '');
    let json: any;
    try {
      json = JSON.parse(sanitizedText);
    } catch {
      const contentType = res.headers.get('content-type');
      const snippet = sanitizedText.trim().replace(/\s+/g, ' ').slice(0, 240);
      const message = `PaddleOCR returned non-JSON response (status ${res.status}${contentType ? `, content-type ${contentType}` : ''}${snippet ? `, snippet ${JSON.stringify(snippet)}` : ''})`;
      throw new AppError(502, 'PROVIDER_ERROR', message, {
        status: res.status,
        contentType: res.headers.get('content-type'),
        body: text.slice(0, 2000),
      });
    }

    if (!res.ok) {
      throw new AppError(502, 'PROVIDER_ERROR', 'PaddleOCR request failed', { status: res.status, body: json });
    }

    if (json?.errorCode !== 0) {
      throw new AppError(502, 'PROVIDER_ERROR', json?.errorMsg || 'PaddleOCR returned error', { body: json });
    }

    const ocrResults = json?.result?.ocrResults;
    if (!Array.isArray(ocrResults) || ocrResults.length === 0) {
      return { pages: [], fullText: '' };
    }

    const pages = ocrResults.map((r: any) => extractPaddleText(r?.prunedResult));
    const fullText = pages.filter(Boolean).join('\n\n');
    return { pages, fullText };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('abort')) {
      throw new AppError(504, 'PROVIDER_ERROR', 'PaddleOCR timeout (120s)');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function paddleOcrVlExtract(
  config: { baseUrl: string; apiKey?: string | null },
  file: { buffer: Buffer; mimeType: string }
): Promise<{ pages: string[]; fullText: string }> {
  const url = (() => {
    try {
      const u = new URL(config.baseUrl);
      const segments = u.pathname.split('/').filter(Boolean);
      if (segments.includes('layout-parsing')) return u.toString();
      u.pathname = `${u.pathname.replace(/\/+$/, '')}/layout-parsing`;
      return u.toString();
    } catch {
      return config.baseUrl.endsWith('/layout-parsing') ? config.baseUrl : `${config.baseUrl}/layout-parsing`;
    }
  })();

  console.log(`[OCR:Paddle-VL] Starting request to ${url}, file size: ${file.buffer.byteLength} bytes`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (config.apiKey && config.apiKey.trim()) {
    // Baidu AI Studio PaddleOCR expects: Authorization: token <TOKEN>
    headers['Authorization'] = buildAuthorization(config.apiKey, 'token');
  }

  const body = {
    file: file.buffer.toString('base64'),
    fileType: mimeToPaddleFileType(file.mimeType),
    // Avoid returning large base64 images in the response; we only need text.
    visualize: false,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);

  const requestStart = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    console.log(`[OCR:Paddle-VL] Response received in ${Date.now() - requestStart}ms, status: ${res.status}`);

    const text = await res.text();
    const sanitizedText = text.replace(/^\uFEFF/, '');
    let json: any;
    try {
      json = JSON.parse(sanitizedText);
    } catch {
      const contentType = res.headers.get('content-type');
      const snippet = sanitizedText.trim().replace(/\s+/g, ' ').slice(0, 240);
      const message = `PaddleOCR-VL returned non-JSON response (status ${res.status}${contentType ? `, content-type ${contentType}` : ''}${snippet ? `, snippet ${JSON.stringify(snippet)}` : ''})`;
      throw new AppError(502, 'PROVIDER_ERROR', message, {
        status: res.status,
        contentType: res.headers.get('content-type'),
        body: text.slice(0, 2000),
      });
    }

    if (!res.ok) {
      throw new AppError(502, 'PROVIDER_ERROR', 'PaddleOCR-VL request failed', { status: res.status, body: json });
    }

    if (json?.errorCode !== 0) {
      throw new AppError(502, 'PROVIDER_ERROR', json?.errorMsg || 'PaddleOCR-VL returned error', { body: json });
    }

    const layoutParsingResults = json?.result?.layoutParsingResults;
    if (!Array.isArray(layoutParsingResults) || layoutParsingResults.length === 0) {
      return { pages: [], fullText: '' };
    }

    const pages = layoutParsingResults.map((r: any) => extractPaddleVlText(r)).map((p: string) => p.trim()).filter(Boolean);
    const fullText = pages.join('\n\n');
    return { pages, fullText };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('abort')) {
      throw new AppError(504, 'PROVIDER_ERROR', 'PaddleOCR-VL timeout (180s)');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function datalabExtract(
  config: { baseUrl: string; apiKey: string },
  file: { buffer: Buffer; mimeType: string; filename: string }
): Promise<{ pages: string[]; fullText: string; pageCount?: number }> {
  const baseUrl = config.baseUrl;
  const markerUrl = baseUrl.endsWith('/marker') ? baseUrl : `${baseUrl}/marker`;
  const headers: Record<string, string> = {
    'X-API-Key': config.apiKey,
  };

  console.log(`[OCR:Datalab] Starting upload to ${markerUrl}, file: ${file.filename}, size: ${file.buffer.byteLength} bytes`);

  const form = new FormData();
  // Copy into a plain Uint8Array to avoid SharedArrayBuffer typing issues in Node fetch types.
  const bytes = new Uint8Array(file.buffer.byteLength);
  bytes.set(file.buffer);
  form.append('file', new Blob([bytes], { type: file.mimeType }), file.filename);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);

  const uploadStart = Date.now();
  try {
    const startRes = await fetch(markerUrl, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
    });

    console.log(`[OCR:Datalab] Upload completed in ${Date.now() - uploadStart}ms, status: ${startRes.status}`);

    const startText = await startRes.text();
    let startJson: any;
    try {
      startJson = JSON.parse(startText);
    } catch {
      throw new AppError(502, 'PROVIDER_ERROR', 'Datalab returned non-JSON response', { status: startRes.status, body: startText.slice(0, 2000) });
    }

    if (!startRes.ok) {
      throw new AppError(502, 'PROVIDER_ERROR', 'Datalab request failed', { status: startRes.status, body: startJson });
    }

    const requestId = startJson?.request_id || startJson?.requestId;
    const requestCheckUrl = startJson?.request_check_url || startJson?.requestCheckUrl;
    console.log(`[OCR:Datalab] Got request_id: ${requestId}, polling...`);

    const checkUrl: string | null =
      typeof requestCheckUrl === 'string'
        ? requestCheckUrl
        : (typeof requestId === 'string' ? `${markerUrl}/${requestId}` : null);

    if (!checkUrl) {
      throw new AppError(502, 'PROVIDER_ERROR', 'Datalab did not return request_id');
    }

    const pollStart = Date.now();
    while (true) {
      if (Date.now() - pollStart > 180_000) {
        throw new AppError(504, 'PROVIDER_ERROR', 'Datalab timeout (180s)');
      }

      // eslint-disable-next-line no-await-in-loop
      const pollRes = await fetch(checkUrl, { method: 'GET', headers, signal: controller.signal });
      const pollText = await pollRes.text();
      let pollJson: any;
      try {
        pollJson = JSON.parse(pollText);
      } catch {
        throw new AppError(502, 'PROVIDER_ERROR', 'Datalab returned non-JSON response (poll)', { status: pollRes.status, body: pollText.slice(0, 2000) });
      }

      if (!pollRes.ok) {
        throw new AppError(502, 'PROVIDER_ERROR', 'Datalab poll failed', { status: pollRes.status, body: pollJson });
      }

      const status = String(pollJson?.status || '').toLowerCase();
      console.log(`[OCR:Datalab] Poll status: ${status}, elapsed: ${Date.now() - pollStart}ms`);

      if (status === 'completed' || status === 'complete' || status === 'success') {
        const markdown = typeof pollJson?.markdown === 'string' ? pollJson.markdown : '';
        const pageCount = typeof pollJson?.page_count === 'number' ? pollJson.page_count : undefined;
        const pages = Array.isArray(pollJson?.pages) && pollJson.pages.every((p: any) => typeof p === 'string')
          ? (pollJson.pages as string[])
          : (markdown ? [markdown] : []);
        return {
          pages,
          fullText: pages.filter(Boolean).join('\n\n'),
          pageCount,
        };
      }

      if (status === 'failed' || status === 'error') {
        const err = pollJson?.error || pollJson?.message || pollJson?.detail || 'Datalab OCR failed';
        throw new AppError(502, 'PROVIDER_ERROR', String(err), { body: pollJson });
      }

      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('abort')) {
      throw new AppError(504, 'PROVIDER_ERROR', 'Datalab timeout');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export class OcrService {
  private async getSettingRow(userId: string) {
    return prisma.ocrProviderSetting.findUnique({ where: { userId } });
  }

  private async getSystemDefaults(): Promise<{
    paddle: { baseUrl: string | null; apiKey: string | null };
    paddle_vl: { baseUrl: string | null; apiKey: string | null };
    datalab: { baseUrl: string | null; apiKey: string | null };
  }> {
    const rows = await prisma.ocrSystemProviderConfig.findMany();
    const byProvider = new Map(rows.map((r) => [r.provider as OcrProvider, r]));

    const paddleRow = byProvider.get('paddle') ?? null;
    const paddleVlRow = byProvider.get('paddle_vl') ?? null;
    const datalabRow = byProvider.get('datalab') ?? null;

    return {
      paddle: {
        baseUrl: normalizeBaseUrl(paddleRow?.baseUrl ?? null),
        apiKey: safeDecrypt(paddleRow?.apiKey ?? null),
      },
      paddle_vl: {
        baseUrl: normalizeBaseUrl(paddleVlRow?.baseUrl ?? null),
        apiKey: safeDecrypt(paddleVlRow?.apiKey ?? null),
      },
      datalab: {
        baseUrl: normalizeBaseUrl(datalabRow?.baseUrl ?? null),
        apiKey: safeDecrypt(datalabRow?.apiKey ?? null),
      },
    };
  }

  private async resolveEffectiveConfig(
    userId: string,
    override?: Partial<{
      provider: OcrProvider;
      credentialSource: OcrCredentialSource;
      baseUrl: string | null;
      apiKey: string | null;
      enabled: boolean;
    }>
  ): Promise<EffectiveOcrConfig> {
    const system = await this.getSystemDefaults();
    const row = await this.getSettingRow(userId);

    const enabled = override?.enabled ?? row?.enabled ?? false;
    const provider = override?.provider ?? (row?.provider as OcrProvider | undefined) ?? 'paddle';
    const credentialSource = override?.credentialSource ?? (row?.credentialSource as OcrCredentialSource | undefined) ?? 'system';

    if (credentialSource === 'system') {
      const defaults = provider === 'datalab'
        ? system.datalab
        : (provider === 'paddle_vl' ? system.paddle_vl : system.paddle);
      return {
        enabled,
        provider,
        credentialSource,
        baseUrl: defaults.baseUrl,
        apiKey: defaults.apiKey,
      };
    }

    const baseUrl = normalizeBaseUrl(override?.baseUrl ?? (row?.baseUrl ?? null));
    const apiKeyEncrypted = row?.apiKey ?? null;
    const overrideApiKey = override?.apiKey ?? null;

    const apiKey = overrideApiKey && overrideApiKey.trim()
      ? overrideApiKey.trim()
      : (apiKeyEncrypted ? decrypt(apiKeyEncrypted) : null);

    return {
      enabled,
      provider,
      credentialSource,
      baseUrl,
      apiKey,
    };
  }

  async getSettings(userId: string): Promise<OcrProviderSettings> {
    const system = await this.getSystemDefaults();
    const row = await this.getSettingRow(userId);
    const provider = (row?.provider as OcrProvider | undefined) ?? 'paddle';
    const credentialSource = (row?.credentialSource as OcrCredentialSource | undefined) ?? 'system';

    const effective = await this.resolveEffectiveConfig(userId);

    const hasApiKey = effective.credentialSource === 'system'
      ? !!effective.apiKey
      : !!(row?.apiKey);

    return {
      enabled: row?.enabled ?? false,
      provider,
      credentialSource,
      baseUrl: effective.baseUrl,
      hasApiKey,
      apiKeyLast4: row?.apiKeyLast4 ?? null,
      systemDefaults: {
        paddle: { baseUrl: system.paddle.baseUrl },
        paddle_vl: { baseUrl: system.paddle_vl.baseUrl },
        datalab: { baseUrl: system.datalab.baseUrl },
      },
    };
  }

  async updateSettings(userId: string, data: UpdateOcrProviderSettingsDto): Promise<OcrProviderSettings> {
    const row = await this.getSettingRow(userId);

    const nextProvider: OcrProvider = (data.provider ?? (row?.provider as OcrProvider | undefined) ?? 'paddle');
    const nextCredentialSource: OcrCredentialSource = (data.credentialSource ?? (row?.credentialSource as OcrCredentialSource | undefined) ?? 'system');

    let update: any = {};
    if (typeof data.enabled === 'boolean') update.enabled = data.enabled;
    if (data.provider) update.provider = data.provider;
    if (data.credentialSource) update.credentialSource = data.credentialSource;

    if (nextCredentialSource === 'custom') {
      if (data.baseUrl !== undefined) {
        update.baseUrl = normalizeBaseUrl(data.baseUrl);
      }

      if (typeof data.apiKey === 'string' && data.apiKey.trim()) {
        update.apiKey = encrypt(data.apiKey.trim());
        update.apiKeyLast4 = last4(data.apiKey);
      }

      // If switching to custom and provider is datalab, require a key eventually (test will fail otherwise).
      const baseUrl = normalizeBaseUrl(update.baseUrl ?? row?.baseUrl ?? null);
      if (!baseUrl) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Base URL is required for custom OCR provider');
      }
      if (nextProvider === 'datalab') {
        const hasKey = !!(update.apiKey ?? row?.apiKey);
        if (!hasKey) {
          throw new AppError(400, 'VALIDATION_ERROR', 'API key is required for Datalab');
        }
      }
    } else {
      // System credentials: keep DB clean (do not persist keys or base URL).
      update.baseUrl = null;
      update.apiKey = null;
      update.apiKeyLast4 = null;
    }

    await prisma.ocrProviderSetting.upsert({
      where: { userId },
      update,
      create: {
        user: { connect: { id: userId } },
        enabled: update.enabled ?? false,
        provider: nextProvider,
        credentialSource: nextCredentialSource,
        baseUrl: update.baseUrl ?? null,
        apiKey: update.apiKey ?? null,
        apiKeyLast4: update.apiKeyLast4 ?? null,
      },
    });

    return this.getSettings(userId);
  }

  async getSystemSettings(): Promise<OcrSystemProviderSettings> {
    const rows = await prisma.ocrSystemProviderConfig.findMany();
    const byProvider = new Map(rows.map((r) => [r.provider as OcrProvider, r]));

    const toConfig = (provider: OcrProvider) => {
      const row = byProvider.get(provider) ?? null;
      return {
        baseUrl: normalizeBaseUrl(row?.baseUrl ?? null),
        hasApiKey: !!row?.apiKey,
        apiKeyLast4: row?.apiKeyLast4 ?? null,
      };
    };

    return {
      paddle: toConfig('paddle'),
      paddle_vl: toConfig('paddle_vl'),
      datalab: toConfig('datalab'),
    };
  }

  async updateSystemSettings(data: UpdateOcrSystemProviderSettingsDto): Promise<OcrSystemProviderSettings> {
    const entries: Array<{
      provider: OcrProvider;
      config: { baseUrl?: string | null; apiKey?: string | null };
    }> = [];

    if (data.paddle) entries.push({ provider: 'paddle', config: data.paddle });
    if (data.paddle_vl) entries.push({ provider: 'paddle_vl', config: data.paddle_vl });
    if (data.datalab) entries.push({ provider: 'datalab', config: data.datalab });

    for (const { provider, config } of entries) {
      const update: Record<string, unknown> = {};

      if (Object.prototype.hasOwnProperty.call(config, 'baseUrl')) {
        update.baseUrl = normalizeBaseUrl(config.baseUrl ?? null);
      }

      if (Object.prototype.hasOwnProperty.call(config, 'apiKey')) {
        const raw = config.apiKey;
        if (raw === null) {
          update.apiKey = null;
          update.apiKeyLast4 = null;
        } else if (typeof raw === 'string') {
          const trimmed = raw.trim();
          if (!trimmed) {
            update.apiKey = null;
            update.apiKeyLast4 = null;
          } else {
            update.apiKey = encrypt(trimmed);
            update.apiKeyLast4 = last4(trimmed);
          }
        }
      }

      if (Object.keys(update).length === 0) continue;

      await prisma.ocrSystemProviderConfig.upsert({
        where: { provider: provider as any },
        update,
        create: {
          provider: provider as any,
          baseUrl: (update.baseUrl as string | null | undefined) ?? null,
          apiKey: (update.apiKey as string | null | undefined) ?? null,
          apiKeyLast4: (update.apiKeyLast4 as string | null | undefined) ?? null,
        },
      });
    }

    return this.getSystemSettings();
  }

  async test(
    userId: string,
    file: { buffer: Buffer; mimeType: string; filename: string },
    override?: Partial<{ provider: OcrProvider; credentialSource: OcrCredentialSource; baseUrl: string | null; apiKey: string | null }>
  ): Promise<OcrTestResult> {
    const effective = await this.resolveEffectiveConfig(userId, override);

    if (!effective.baseUrl) {
      return {
        success: false,
        provider: effective.provider,
        latencyMs: 0,
        error: 'OCR provider base URL is not configured',
      };
    }

    if (effective.provider === 'datalab' && !effective.apiKey) {
      return {
        success: false,
        provider: effective.provider,
        latencyMs: 0,
        error: 'Datalab API key is not configured',
      };
    }

    if ((effective.provider === 'paddle' || effective.provider === 'paddle_vl') && !effective.apiKey && effective.baseUrl && paddleRequiresToken(effective.baseUrl)) {
      return {
        success: false,
        provider: effective.provider,
        latencyMs: 0,
        error: 'PaddleOCR token is not configured',
      };
    }

    const started = Date.now();
    try {
      if (effective.provider === 'paddle') {
        const { pages, fullText } = await paddleOcrExtract(
          { baseUrl: effective.baseUrl, apiKey: effective.apiKey },
          { buffer: file.buffer, mimeType: file.mimeType }
        );

        const latencyMs = Date.now() - started;
        const previewText = fullText.slice(0, OCR_TEST_PREVIEW_LIMIT);

        return {
          success: true,
          provider: 'paddle',
          latencyMs,
          pageCount: pages.length || undefined,
          charCount: fullText.length,
          previewText,
          pagesPreview: pages.slice(0, 5).map((p) => p.slice(0, 500)),
        };
      }

      if (effective.provider === 'paddle_vl') {
        const { pages, fullText } = await paddleOcrVlExtract(
          { baseUrl: effective.baseUrl, apiKey: effective.apiKey },
          { buffer: file.buffer, mimeType: file.mimeType }
        );

        const latencyMs = Date.now() - started;
        const previewText = fullText.slice(0, OCR_TEST_PREVIEW_LIMIT);

        return {
          success: true,
          provider: 'paddle_vl',
          latencyMs,
          pageCount: pages.length || undefined,
          charCount: fullText.length,
          previewText,
          pagesPreview: pages.slice(0, 5).map((p) => p.slice(0, 500)),
        };
      }

      const { pages, fullText, pageCount } = await datalabExtract(
        { baseUrl: effective.baseUrl, apiKey: effective.apiKey! },
        file
      );

      const latencyMs = Date.now() - started;
      const previewText = fullText.slice(0, OCR_TEST_PREVIEW_LIMIT);

      return {
        success: true,
        provider: 'datalab',
        latencyMs,
        pageCount: pageCount ?? (pages.length || undefined),
        charCount: fullText.length,
        previewText,
        pagesPreview: pages.slice(0, 5).map((p) => p.slice(0, 500)),
      };
    } catch (error) {
      const latencyMs = Date.now() - started;
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        provider: effective.provider,
        latencyMs,
        error: message,
      };
    }
  }

  async extractForFile(
    userId: string,
    fileId: string,
    override?: Partial<{ provider: OcrProvider }>
  ): Promise<{ provider: OcrProvider; pages: string[]; fullText: string }> {
    const effective = await this.resolveEffectiveConfig(userId, override?.provider ? { provider: override.provider } : undefined);

    if (!effective.enabled) {
      throw new AppError(400, 'INVALID_REQUEST', 'OCR is disabled');
    }

    if (!effective.baseUrl) {
      throw new AppError(400, 'INVALID_REQUEST', 'OCR provider base URL is not configured');
    }

    if (effective.provider === 'datalab' && !effective.apiKey) {
      throw new AppError(400, 'INVALID_REQUEST', 'Datalab API key is not configured');
    }

    if ((effective.provider === 'paddle' || effective.provider === 'paddle_vl') && !effective.apiKey && paddleRequiresToken(effective.baseUrl)) {
      throw new AppError(400, 'INVALID_REQUEST', 'PaddleOCR token is not configured');
    }

    const existing = await prisma.ocrResult.findUnique({
      where: {
        userId_fileId_provider: {
          userId,
          fileId,
          provider: effective.provider as any,
        },
      },
    });

    if (existing && existing.status === 'success' && existing.fullText) {
      const pages = Array.isArray(existing.pages) ? (existing.pages as unknown as string[]) : [];
      return { provider: effective.provider, pages, fullText: existing.fullText };
    }

    const { meta, buffer } = await filesService.downloadBuffer(userId, fileId);
    const mimeType = meta.mimeType;
    const filename = meta.originalName;

    if (!(mimeType === 'application/pdf' || mimeType.startsWith('image/'))) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Only PDF and image files are supported for OCR');
    }

    try {
      let pages: string[] = [];
      let fullText = '';

      if (effective.provider === 'paddle') {
        const result = await paddleOcrExtract({ baseUrl: effective.baseUrl, apiKey: effective.apiKey }, { buffer, mimeType });
        pages = result.pages;
        fullText = result.fullText;
      } else if (effective.provider === 'paddle_vl') {
        const result = await paddleOcrVlExtract({ baseUrl: effective.baseUrl, apiKey: effective.apiKey }, { buffer, mimeType });
        pages = result.pages;
        fullText = result.fullText;
      } else {
        const result = await datalabExtract({ baseUrl: effective.baseUrl, apiKey: effective.apiKey! }, { buffer, mimeType, filename });
        pages = result.pages;
        fullText = result.fullText;
      }

      await prisma.ocrResult.upsert({
        where: {
          userId_fileId_provider: {
            userId,
            fileId,
            provider: effective.provider as any,
          },
        },
        update: {
          status: 'success',
          errorMessage: null,
          fullText,
          pages: pages as any,
        },
        create: {
          user: { connect: { id: userId } },
          file: { connect: { id: fileId } },
          provider: effective.provider as any,
          status: 'success',
          errorMessage: null,
          fullText,
          pages: pages as any,
        },
      });

      return { provider: effective.provider, pages, fullText };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OCR failed';

      await prisma.ocrResult.upsert({
        where: {
          userId_fileId_provider: {
            userId,
            fileId,
            provider: effective.provider as any,
          },
        },
        update: {
          status: 'failed',
          errorMessage: message,
          fullText: '',
          pages: Prisma.DbNull,
        },
        create: {
          user: { connect: { id: userId } },
          file: { connect: { id: fileId } },
          provider: effective.provider as any,
          status: 'failed',
          errorMessage: message,
          fullText: '',
          pages: Prisma.DbNull,
        },
      });

      throw new AppError(502, 'PROVIDER_ERROR', message, { stage: 'ocr', provider: effective.provider });
    }
  }
}

export const ocrService = new OcrService();
