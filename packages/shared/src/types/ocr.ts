export type OcrProvider = 'paddle' | 'datalab';

export type OcrCredentialSource = 'system' | 'custom';

export interface OcrProviderSettings {
  enabled: boolean;
  provider: OcrProvider;
  credentialSource: OcrCredentialSource;
  baseUrl: string | null;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  systemDefaults: {
    paddle: { baseUrl: string | null };
    datalab: { baseUrl: string | null };
  };
}

export interface UpdateOcrProviderSettingsDto {
  enabled?: boolean;
  provider?: OcrProvider;
  credentialSource?: OcrCredentialSource;
  baseUrl?: string | null;
  apiKey?: string | null;
}

export interface OcrSystemProviderConfig {
  baseUrl: string | null;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
}

export interface OcrSystemProviderSettings {
  paddle: OcrSystemProviderConfig;
  datalab: OcrSystemProviderConfig;
}

export interface UpdateOcrSystemProviderSettingsDto {
  paddle?: { baseUrl?: string | null; apiKey?: string | null };
  datalab?: { baseUrl?: string | null; apiKey?: string | null };
}

export interface OcrTestResult {
  success: boolean;
  provider: OcrProvider;
  latencyMs: number;
  pageCount?: number;
  charCount?: number;
  previewText?: string;
  pagesPreview?: string[];
  error?: string;
}
