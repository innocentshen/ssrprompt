import apiClient from './client';
import type {
  Prompt,
  PromptListItem,
  PromptVersion,
  PublicPromptListItem,
  PublicPromptDetail,
  CreatePromptDto,
  UpdatePromptDto,
} from '@ssrprompt/shared';

/**
 * Prompts API
 */
export const promptsApi = {
  /**
   * Get all prompts (list view)
   */
  list: () => apiClient.get<PromptListItem[]>('/prompts'),

  /**
   * Get prompt by ID with full details
   */
  getById: (id: string) => apiClient.get<Prompt>(`/prompts/${id}`),

  /**
   * Create a new prompt
   */
  create: (data: CreatePromptDto) => apiClient.post<Prompt>('/prompts', data),

  /**
   * Update a prompt
   */
  update: (id: string, data: UpdatePromptDto) => apiClient.put<Prompt>(`/prompts/${id}`, data),

  /**
   * Delete a prompt
   */
  delete: (id: string) => apiClient.delete<void>(`/prompts/${id}`),

  /**
   * Update prompt order
   */
  updateOrder: (id: string, orderIndex: number) =>
    apiClient.put<Prompt>(`/prompts/${id}/order`, { orderIndex }),

  /**
   * Batch update order for multiple prompts
   */
  batchUpdateOrder: (updates: { id: string; orderIndex: number }[]) =>
    apiClient.put<{ success: boolean }>('/prompts/batch-order', updates),

  /**
   * Get versions for a prompt
   */
  getVersions: (promptId: string) =>
    apiClient.get<PromptVersion[]>(`/prompts/${promptId}/versions`),

  /**
   * Create a new version
   */
  createVersion: (
    promptId: string,
    data: {
      content: string;
      commitMessage?: string;
      variables?: unknown[];
      messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
      config?: Record<string, unknown>;
      defaultModelId?: string | null;
    }
  ) => apiClient.post<PromptVersion>(`/prompts/${promptId}/versions`, data),

  /**
   * Get a specific version
   */
  getVersion: (promptId: string, version: number) =>
    apiClient.get<PromptVersion>(`/prompts/${promptId}/versions/${version}`),

  // ============ Public Prompt Plaza ============

  /**
   * List all public prompts for the plaza
   */
  listPublic: () => apiClient.get<PublicPromptListItem[]>('/prompts/public'),

  /**
   * Get public prompt detail (latest public version snapshot)
   */
  getPublicById: (id: string) => apiClient.get<PublicPromptDetail>(`/prompts/public/${id}`),

  /**
   * Get public versions for a public prompt
   */
  getPublicVersions: (promptId: string) =>
    apiClient.get<PromptVersion[]>(`/prompts/public/${promptId}/versions`),

  /**
   * Get a specific public version for a public prompt
   */
  getPublicVersion: (promptId: string, version: number) =>
    apiClient.get<PromptVersion>(`/prompts/public/${promptId}/versions/${version}`),

  /**
   * Copy a public prompt into the user's space
   */
  copyPublic: (promptId: string, data?: { version?: number; name?: string }) =>
    apiClient.post<Prompt>(`/prompts/public/${promptId}/copy`, data ?? {}),
};
