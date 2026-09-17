import client from './client';

export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: string;
  tenantId?: string;
  companyId?: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: UserDto;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
  /** True when the action was intercepted and queued for approval (HTTP 202). */
  pendingApproval?: boolean;
  approvalRequestId?: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    client.post<ApiResponse<AuthResponse>>('/auth/login', { email, password }),

  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role?: number;
    tenantId?: string;
    companyId?: string;
    departmentId?: string;
  }) => client.post<ApiResponse<UserDto>>('/auth/register', data),

  me: () => client.get<ApiResponse<UserDto>>('/auth/me'),

  refresh: (token: string) =>
    client.post<ApiResponse<AuthResponse>>('/auth/refresh', { token }),
};
