import { Provider } from '@prisma/client';
import { providersRepository } from '../repositories/index.js';
import { CreateProviderInput, UpdateProviderInput, TestConnectionInput, AppError } from '@ssrprompt/shared';

export interface TestConnectionResult {
  success: boolean;
  message: string;
  latencyMs?: number;
}

export class ProvidersService {
  /**
   * Get all providers for a user
   */
  async findAll(userId: string): Promise<Provider[]> {
    return providersRepository.findAll(userId);
  }

  /**
   * Get provider by ID
   */
  async findById(userId: string, id: string): Promise<Provider | null> {
    return providersRepository.findById(userId, id);
  }

  /**
   * Get provider with models
   */
  async findWithModels(userId: string, id: string) {
    return providersRepository.findWithModels(userId, id);
  }

  /**
   * Create a new provider
   */
  async create(userId: string, data: CreateProviderInput): Promise<Provider> {
    return providersRepository.create(userId, {
      name: data.name,
      type: data.type,
      apiKey: data.apiKey,
      baseUrl: data.baseUrl,
      enabled: data.enabled ?? false,
    });
  }

  /**
   * Update a provider
   */
  async update(userId: string, id: string, data: UpdateProviderInput): Promise<Provider> {
    return providersRepository.update(userId, id, data);
  }

  /**
   * Delete a provider and all its models
   */
  async delete(userId: string, id: string): Promise<Provider> {
    // Models are deleted automatically via Prisma cascade
    return providersRepository.delete(userId, id);
  }

  /**
   * Test connection to a provider API
   */
  async testConnection(data: TestConnectionInput): Promise<TestConnectionResult> {
    const startTime = Date.now();

    try {
      const { type, apiKey, baseUrl } = data;

      // Build test URL based on provider type
      let testUrl: string;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      switch (type) {
        case 'openai':
          testUrl = baseUrl ? `${baseUrl}/models` : 'https://api.openai.com/v1/models';
          headers['Authorization'] = `Bearer ${apiKey}`;
          break;
        case 'anthropic':
          testUrl = baseUrl ? `${baseUrl}/messages` : 'https://api.anthropic.com/v1/messages';
          headers['x-api-key'] = apiKey;
          headers['anthropic-version'] = '2023-06-01';
          break;
        case 'gemini':
          testUrl = baseUrl
            ? `${baseUrl}/models`
            : `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
          if (!baseUrl) {
            delete headers['Content-Type'];
          } else {
            headers['Authorization'] = `Bearer ${apiKey}`;
          }
          break;
        case 'openrouter':
          // /models is public and doesn't validate API keys; use /credits to verify auth without spending tokens.
          testUrl = baseUrl ? `${baseUrl}/credits` : 'https://openrouter.ai/api/v1/credits';
          headers['Authorization'] = `Bearer ${apiKey}`;
          break;
        case 'custom':
          if (!baseUrl) {
            throw new AppError(400, 'VALIDATION_ERROR', 'Base URL is required for custom providers');
          }
          testUrl = `${baseUrl}/models`;
          headers['Authorization'] = `Bearer ${apiKey}`;
          break;
        default:
          throw new AppError(400, 'VALIDATION_ERROR', `Unsupported provider type: ${type}`);
      }

      // Make test request
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        let response: Response;

        if (type === 'anthropic') {
          response = await fetch(testUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: 'claude-3-haiku-20240307',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'Hi' }],
            }),
            signal: controller.signal,
          });
        } else {
          response = await fetch(testUrl, {
            method: 'GET',
            headers: type === 'gemini' && !baseUrl ? undefined : headers,
            signal: controller.signal,
          });
        }

        clearTimeout(timeout);
        const latencyMs = Date.now() - startTime;

        if (response.ok) {
          return {
            success: true,
            message: 'Connection successful',
            latencyMs,
          };
        }

        const errorBody = await response.text();
        let errorMessage = `API returned ${response.status}`;

        try {
          const errorJson = JSON.parse(errorBody);
          errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
        } catch {
          // Use default error message
        }

        if (type === 'openrouter' && response.status === 401 && /cookie auth credentials/i.test(errorMessage)) {
          errorMessage = 'OpenRouter authentication failed: API key is missing or invalid.';
        }

        return {
          success: false,
          message: errorMessage,
          latencyMs,
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      if (error instanceof AppError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('abort')) {
        return {
          success: false,
          message: 'Connection timeout (10s)',
          latencyMs,
        };
      }

      return {
        success: false,
        message: `Connection failed: ${errorMessage}`,
        latencyMs,
      };
    }
  }
}

export const providersService = new ProvidersService();
