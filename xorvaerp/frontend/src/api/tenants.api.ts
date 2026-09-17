import client from './client';
import type { ApiResponse } from './auth.api';

export interface TenantDto {
  id: string;
  name: string;
  contactEmail: string;
  isActive: boolean;
  createdAt: string;
  companyCount: number;
  onboardedAt?: string | null;
}

export interface CompanyDto {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  activeModules: string[];
  isActive: boolean;
  createdAt: string;
}

export interface BranchDto {
  id: string;
  companyId: string;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  isActive: boolean;
  createdAt: string;
}

export interface TenantSignupResult {
  tenantId: string;
  tenantName: string;
  companyId: string;
  companyName: string;
  adminEmail: string;
}

/** Mirrors backend ModuleCatalog — the source of truth is the server. */
export const MODULE_CATALOG = [
  'HR',
  'Accounting',
  'Sales',
  'Purchasing',
  'Inventory',
  'Payroll',
  'POS',
  'Reports',
] as const;

export const tenantsApi = {
  registerTenant: (data: {
    tenantName: string;
    companyName: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => client.post<ApiResponse<TenantSignupResult>>('/tenants/register', data),

  currentTenant: () => client.get<ApiResponse<TenantDto>>('/tenants/current'),

  completeOnboarding: () => client.post<ApiResponse<null>>('/tenants/complete-onboarding', {}),

  listCompanies: () => client.get<ApiResponse<CompanyDto[]>>('/companies'),

  createCompany: (data: {
    name: string;
    currency?: string;
    timezone?: string;
    activeModules?: string[];
  }) => client.post<ApiResponse<CompanyDto>>('/companies', data),

  updateCompanySettings: (id: string, data: { name: string; currency: string; timezone: string }) =>
    client.put<ApiResponse<CompanyDto>>(`/companies/${id}/settings`, data),

  setCompanyModules: (id: string, modules: string[]) =>
    client.put<ApiResponse<CompanyDto>>(`/companies/${id}/modules`, { modules }),

  listBranches: (companyId?: string) =>
    client.get<ApiResponse<BranchDto[]>>('/branches', { params: { companyId } }),

  createBranch: (data: {
    companyId: string;
    name: string;
    address?: string;
    city?: string;
    country?: string;
  }) => client.post<ApiResponse<BranchDto>>('/branches', data),
};
