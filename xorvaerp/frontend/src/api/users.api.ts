import client from './client';
import type { ApiResponse, UserDto } from './auth.api';

export interface Paged<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Org-level user administration. The list is role-scoped by the backend
    (CEO → whole tenant, Company Admin → their company). */
export const usersApi = {
  list: (params: { role?: string; page?: number; pageSize?: number; search?: string }) =>
    client.get<ApiResponse<Paged<UserDto>>>('/users', { params }),
  setActive: (id: string, isActive: boolean) =>
    client.put<ApiResponse<UserDto>>(`/users/${id}/active`, { isActive }),
};
