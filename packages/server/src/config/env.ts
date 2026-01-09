import 'dotenv/config';
import { z } from 'zod';

function isValidUrl(value: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Environment variable schema with validation
 * Server will crash on startup if required variables are missing
 */
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3001'),

  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL URL'),

  // Authentication
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  // Encryption
  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),

  // CORS
  CORS_ORIGIN: z.string().optional().default('http://localhost:5173'),

  // Rate limiting (optional)
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).optional().default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).optional().default('100'),

  // File Storage (S3 compatible, e.g. MinIO)
  S3_ENDPOINT: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const trimmed = v.trim();
      if (!trimmed) return undefined;
      return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    })
    .refine((v) => v === undefined || isValidUrl(v), {
      message: 'S3_ENDPOINT must be a valid URL (or host, e.g. jpminio.zeabur.app)',
    }),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_REGION: z.string().optional().default('us-east-1'),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
}

export const env = validateEnv();

console.log('✅ Environment validated successfully');
console.log(`   NODE_ENV: ${env.NODE_ENV}`);
console.log(`   PORT: ${env.PORT}`);
