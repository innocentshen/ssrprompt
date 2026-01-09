// Re-export all types
export * from './provider.js';
export * from './prompt.js';
export * from './trace.js';
export * from './evaluation.js';
export * from './auth.js';
export * from './ocr.js';

// Common API Response Types
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
