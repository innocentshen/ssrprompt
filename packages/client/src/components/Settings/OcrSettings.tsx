import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Save, FlaskConical, Loader2 } from 'lucide-react';
import { Button, Input, Modal, useToast } from '../ui';
import { useOcrSettingsStore } from '../../store/useOcrSettingsStore';
import { useAuthStore } from '../../store/useAuthStore';
import { ocrApi } from '../../api/ocr';
import type { OcrProvider, OcrCredentialSource, OcrTestResult, OcrSystemProviderSettings } from '../../types';

function providerLabel(provider: OcrProvider, t: (k: string) => string): string {
  return provider === 'paddle' ? 'PaddleOCR' : t('datalabExperimental');
}

function credentialLabel(source: OcrCredentialSource, t: (k: string) => string): string {
  return source === 'system' ? t('credentialSystem') : t('credentialCustom');
}

export function OcrSettings() {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { showToast } = useToast();
  const { settings, isLoading, fetchSettings, saveSettings } = useOcrSettingsStore();
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('admin') ?? false;

  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState<OcrProvider>('paddle');
  const [credentialSource, setCredentialSource] = useState<OcrCredentialSource>('system');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  const [systemSettings, setSystemSettings] = useState<OcrSystemProviderSettings | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemSaving, setSystemSaving] = useState(false);
  const [systemPaddleBaseUrl, setSystemPaddleBaseUrl] = useState('');
  const [systemPaddleApiKey, setSystemPaddleApiKey] = useState('');
  const [systemDatalabBaseUrl, setSystemDatalabBaseUrl] = useState('');
  const [systemDatalabApiKey, setSystemDatalabApiKey] = useState('');
  const [clearSystemPaddleKey, setClearSystemPaddleKey] = useState(false);
  const [clearSystemDatalabKey, setClearSystemDatalabKey] = useState(false);

  useEffect(() => {
    fetchSettings().catch(() => {});
  }, [fetchSettings]);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setProvider(settings.provider);
    setCredentialSource(settings.credentialSource);
    setBaseUrl(settings.baseUrl || '');
    // Never hydrate stored key back into the input; show last4 as a hint.
    setApiKey('');
  }, [settings]);

  useEffect(() => {
    if (!isAdmin) return;
    setSystemLoading(true);
    ocrApi.getSystemSettings()
      .then((s) => {
        setSystemSettings(s);
        setSystemPaddleBaseUrl(s.paddle.baseUrl || '');
        setSystemDatalabBaseUrl(s.datalab.baseUrl || '');
      })
      .catch((e) => {
        showToast('error', e instanceof Error ? e.message : t('loadFailed'));
      })
      .finally(() => setSystemLoading(false));
  }, [isAdmin, showToast, t]);

  const effectiveBaseUrl = useMemo(() => {
    if (!settings) return baseUrl || '';
    if (credentialSource === 'custom') return baseUrl || '';
    const sys = settings.systemDefaults[provider];
    return sys.baseUrl || '';
  }, [settings, credentialSource, provider, baseUrl]);

  const apiKeyHint = useMemo(() => {
    if (!settings) return '';
    if (credentialSource !== 'custom') return '';
    if (!settings.hasApiKey || !settings.apiKeyLast4) return '';
    return t('apiKeyLast4', { last4: settings.apiKeyLast4 });
  }, [settings, credentialSource, t]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        enabled,
        provider,
        credentialSource,
      };
      if (credentialSource === 'custom') {
        payload.baseUrl = baseUrl || null;
        const trimmed = apiKey.trim();
        if (trimmed) payload.apiKey = trimmed;
      }

      await saveSettings(payload);
      showToast('success', t('settingsSaved'));
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : t('saveConfigFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSystem = async () => {
    setSystemSaving(true);
    try {
      const payload: any = {
        paddle: {
          baseUrl: systemPaddleBaseUrl || null,
          ...(clearSystemPaddleKey ? { apiKey: null } : (systemPaddleApiKey.trim() ? { apiKey: systemPaddleApiKey.trim() } : {})),
        },
        datalab: {
          baseUrl: systemDatalabBaseUrl || null,
          ...(clearSystemDatalabKey ? { apiKey: null } : (systemDatalabApiKey.trim() ? { apiKey: systemDatalabApiKey.trim() } : {})),
        },
      };

      const next = await ocrApi.updateSystemSettings(payload);
      setSystemSettings(next);
      setSystemPaddleBaseUrl(next.paddle.baseUrl || '');
      setSystemDatalabBaseUrl(next.datalab.baseUrl || '');
      setSystemPaddleApiKey('');
      setSystemDatalabApiKey('');
      setClearSystemPaddleKey(false);
      setClearSystemDatalabKey(false);

      // Refresh user-visible systemDefaults / effective config
      fetchSettings(true).catch(() => {});
      showToast('success', t('settingsSaved'));
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : t('saveConfigFailed'));
    } finally {
      setSystemSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-200 light:text-slate-800">
            {t('fileOcrSettingsTitle')}
          </h2>
          <p className="text-sm text-slate-500 light:text-slate-600">
            {t('fileOcrSettingsDesc')}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setTestOpen(true)} disabled={!settings || isLoading}>
          <FlaskConical className="w-4 h-4 mr-1" />
          {t('testProvider')}
        </Button>
      </div>

      <div className="bg-slate-800/30 light:bg-slate-100 rounded-lg p-4 border border-slate-700 light:border-slate-200 space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-400 light:text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('loading')}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-200 light:text-slate-800">{t('enableFileOcr')}</p>
            <p className="text-xs text-slate-500 light:text-slate-600">{t('enableFileOcrHint')}</p>
          </div>
          <button
            onClick={() => setEnabled((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              enabled ? 'bg-cyan-600' : 'bg-slate-700 light:bg-slate-300'
            }`}
            aria-label={t('enableFileOcr')}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-300 light:text-slate-700 mb-1">
              {t('ocrProvider')}
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as OcrProvider)}
              className="w-full px-3 py-2 bg-slate-900 light:bg-white border border-slate-700 light:border-slate-300 rounded-lg text-sm text-slate-200 light:text-slate-800 focus:outline-none focus:border-cyan-500"
            >
              <option value="paddle">PaddleOCR</option>
              <option value="datalab">{t('datalabExperimental')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 light:text-slate-700 mb-1">
              {t('credentialSource')}
            </label>
            <select
              value={credentialSource}
              onChange={(e) => setCredentialSource(e.target.value as OcrCredentialSource)}
              className="w-full px-3 py-2 bg-slate-900 light:bg-white border border-slate-700 light:border-slate-300 rounded-lg text-sm text-slate-200 light:text-slate-800 focus:outline-none focus:border-cyan-500"
            >
              <option value="system">{t('credentialSystem')}</option>
              <option value="custom">{t('credentialCustom')}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('baseUrl')}
            value={effectiveBaseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            disabled={credentialSource === 'system'}
            placeholder={t('baseUrlPlaceholder')}
          />
          <Input
            label={t('apiKey')}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={credentialSource === 'system'}
            placeholder={apiKeyHint || t('apiKeyPlaceholder')}
            type="password"
          />
        </div>

        <div className="flex justify-end">
          <Button variant="primary" onClick={handleSave} loading={saving}>
            <Save className="w-4 h-4 mr-1" />
            {t('saveSettings')}
          </Button>
        </div>
      </div>

      <OcrTestModal
        isOpen={testOpen}
        onClose={() => setTestOpen(false)}
        provider={provider}
        credentialSource={credentialSource}
        baseUrl={baseUrl}
        apiKey={apiKey}
        tCommon={tCommon}
      />

      {isAdmin && (
        <div className="bg-slate-800/30 light:bg-slate-100 rounded-lg p-4 border border-slate-700 light:border-slate-200 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 light:text-slate-800">
              {t('systemOcrProviderConfigTitle')}
            </h3>
            <p className="text-xs text-slate-500 light:text-slate-600">
              {t('systemOcrProviderConfigDesc')}
            </p>
          </div>

          {systemLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-400 light:text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('loading')}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={`PaddleOCR ${t('baseUrl')}`}
              value={systemPaddleBaseUrl}
              onChange={(e) => setSystemPaddleBaseUrl(e.target.value)}
              placeholder={t('baseUrlPlaceholder')}
            />
            <div className="space-y-2">
              <Input
                label={`PaddleOCR ${t('apiKey')}`}
                value={systemPaddleApiKey}
                onChange={(e) => setSystemPaddleApiKey(e.target.value)}
                placeholder={systemSettings?.paddle?.hasApiKey && systemSettings.paddle.apiKeyLast4 ? t('apiKeyLast4', { last4: systemSettings.paddle.apiKeyLast4 }) : t('apiKeyPlaceholder')}
                type="password"
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setClearSystemPaddleKey(true);
                    setSystemPaddleApiKey('');
                  }}
                >
                  {tCommon('clear')}
                </Button>
                {clearSystemPaddleKey && (
                  <span className="text-xs text-slate-500 light:text-slate-600">{t('apiKeyWillBeCleared')}</span>
                )}
              </div>
            </div>

            <Input
              label={`${t('datalabExperimental')} ${t('baseUrl')}`}
              value={systemDatalabBaseUrl}
              onChange={(e) => setSystemDatalabBaseUrl(e.target.value)}
              placeholder={t('baseUrlPlaceholder')}
            />
            <div className="space-y-2">
              <Input
                label={`${t('datalabExperimental')} ${t('apiKey')}`}
                value={systemDatalabApiKey}
                onChange={(e) => setSystemDatalabApiKey(e.target.value)}
                placeholder={systemSettings?.datalab?.hasApiKey && systemSettings.datalab.apiKeyLast4 ? t('apiKeyLast4', { last4: systemSettings.datalab.apiKeyLast4 }) : t('apiKeyPlaceholder')}
                type="password"
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setClearSystemDatalabKey(true);
                    setSystemDatalabApiKey('');
                  }}
                >
                  {tCommon('clear')}
                </Button>
                {clearSystemDatalabKey && (
                  <span className="text-xs text-slate-500 light:text-slate-600">{t('apiKeyWillBeCleared')}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="primary" onClick={handleSaveSystem} loading={systemSaving} disabled={systemLoading}>
              <Save className="w-4 h-4 mr-1" />
              {t('saveSettings')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function OcrTestModal({
  isOpen,
  onClose,
  provider,
  credentialSource,
  baseUrl,
  apiKey,
  tCommon,
}: {
  isOpen: boolean;
  onClose: () => void;
  provider: OcrProvider;
  credentialSource: OcrCredentialSource;
  baseUrl: string;
  apiKey: string;
  tCommon: (key: string, options?: any) => string;
}) {
  const { t } = useTranslation('settings');
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<OcrTestResult | null>(null);

  const handleRun = async () => {
    if (!file) {
      showToast('error', t('chooseFileFirst'));
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const override = {
        provider,
        credentialSource,
        ...(credentialSource === 'custom' ? { baseUrl: baseUrl || null, apiKey: apiKey.trim() || null } : {}),
      };
      const r = await ocrApi.test(file, override);
      setResult(r);
      showToast(r.success ? 'success' : 'error', r.success ? t('testSuccess') : (r.error || t('testFailed')));
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : t('testFailed'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setFile(null);
        setResult(null);
        onClose();
      }}
      title={t('testProvider')}
      size="xl"
    >
      <div className="space-y-4">
        <div className="text-sm text-slate-400 light:text-slate-600">
          <div>{t('ocrProvider')}: {providerLabel(provider, t)}</div>
          <div>{t('credentialSource')}: {credentialLabel(credentialSource, t)}</div>
        </div>

        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-slate-300 light:text-slate-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 light:file:bg-slate-200 light:file:text-slate-800 light:hover:file:bg-slate-300"
        />

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{tCommon('close')}</Button>
          <Button variant="primary" onClick={handleRun} loading={running}>
            {t('runTest')}
          </Button>
        </div>

        {result && (
          <div className="rounded-lg border border-slate-700 light:border-slate-200 bg-slate-900/50 light:bg-white p-4 space-y-2">
            <div className="text-sm text-slate-300 light:text-slate-700">
              <span className={result.success ? 'text-green-400 light:text-green-600' : 'text-rose-400 light:text-rose-600'}>
                {result.success ? tCommon('success') : tCommon('error')}
              </span>
              <span className="ml-3 text-slate-500 light:text-slate-600">
                {t('latencyMs', { ms: result.latencyMs })}
              </span>
              {typeof result.pageCount === 'number' && (
                <span className="ml-3 text-slate-500 light:text-slate-600">
                  {t('pages', { count: result.pageCount })}
                </span>
              )}
              {typeof result.charCount === 'number' && (
                <span className="ml-3 text-slate-500 light:text-slate-600">
                  {t('chars', { count: result.charCount })}
                </span>
              )}
            </div>

            {result.error && (
              <div className="text-sm text-rose-300 light:text-rose-700">
                {result.error}
              </div>
            )}

            {result.previewText && (
              <pre className="max-h-64 overflow-auto text-xs text-slate-300 light:text-slate-700 whitespace-pre-wrap font-mono">
                {result.previewText}
              </pre>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
