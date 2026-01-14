import apiClient from './client';
import type { PromptGroup, CreatePromptGroupDto, UpdatePromptGroupDto } from '@ssrprompt/shared';

/**
 * Prompt Groups API
 */
export const promptGroupsApi = {
  /**
   * List all prompt groups (flat list)
   */
  list: () => apiClient.get<PromptGroup[]>('/prompt-groups'),

  /**
   * Create a new group
   */
  create: (data: CreatePromptGroupDto) => apiClient.post<PromptGroup>('/prompt-groups', data),

  /**
   * Update a group
   */
  update: (id: string, data: UpdatePromptGroupDto) => apiClient.put<PromptGroup>(`/prompt-groups/${id}`, data),

  /**
   * Delete a group
   */
  delete: (id: string) => apiClient.delete<void>(`/prompt-groups/${id}`),
};

