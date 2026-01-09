import apiClient from './client';

export interface UserListItem {
  id: string;
  email: string;
  name: string | null;
  status: 'active' | 'inactive' | 'suspended';
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  roles: string[];
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export const usersApi = {
  list: () => apiClient.get<UserListItem[]>('/users'),
  getRoles: () => apiClient.get<Role[]>('/users/roles'),
  updateStatus: (id: string, status: string) =>
    apiClient.put(`/users/${id}/status`, { status }),
  updateRoles: (id: string, roles: string[]) =>
    apiClient.put(`/users/${id}/roles`, { roles }),
  delete: (id: string) => apiClient.delete(`/users/${id}`),
};
