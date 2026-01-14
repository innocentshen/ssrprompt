import { z } from 'zod';

export const OcrProviderSchema = z.enum(['paddle', 'paddle_vl', 'datalab']);
export const OcrCredentialSourceSchema = z.enum(['system', 'custom']);

export const UpdateOcrProviderSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  provider: OcrProviderSchema.optional(),
  credentialSource: OcrCredentialSourceSchema.optional(),
  baseUrl: z.string().url().nullable().optional(),
  apiKey: z.string().min(1).nullable().optional(),
});

export type UpdateOcrProviderSettingsInput = z.infer<typeof UpdateOcrProviderSettingsSchema>;

const UpdateOcrSystemProviderConfigSchema = z.object({
  baseUrl: z.string().url().nullable().optional(),
  apiKey: z.string().nullable().optional(),
});

export const UpdateOcrSystemProviderSettingsSchema = z.object({
  paddle: UpdateOcrSystemProviderConfigSchema.optional(),
  paddle_vl: UpdateOcrSystemProviderConfigSchema.optional(),
  datalab: UpdateOcrSystemProviderConfigSchema.optional(),
});

export type UpdateOcrSystemProviderSettingsInput = z.infer<typeof UpdateOcrSystemProviderSettingsSchema>;
