import client from './client';
import type { ApiResponse } from './auth.api';

export interface ApprovalPreview {
  id: string;
  title: string;
  requesterEmail: string;
  createdAt: string;
}
export interface CompanySummary {
  id: string;
  name: string;
  employeeCount: number;
  modules: string[];
}
export interface HireItem {
  fullName: string;
  departmentName?: string;
  createdAt: string;
}
export interface EmployeeMini {
  fullName: string;
  employeeCode: string;
  departmentName?: string;
  designationTitle?: string;
  joinDate: string;
}
export interface LeaveBalanceMini {
  leaveTypeName: string;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
}

export interface Dashboard {
  role: string;
  pendingApprovalCount?: number;
  pendingApprovals?: ApprovalPreview[];
  companyCount?: number;
  totalEmployees?: number;
  companies?: CompanySummary[];
  employeeCount?: number;
  departmentCount?: number;
  onLeaveToday?: number;
  recentHires?: HireItem[];
  teamSize?: number;
  teamOnLeave?: number;
  profile?: EmployeeMini;
  leaveBalance?: LeaveBalanceMini[];
}

export interface AdminOverview {
  tenantCount: number;
  companyCount: number;
  userCount: number;
  employeeCount: number;
  recentSignups: { name: string; contactEmail: string; companyCount: number; createdAt: string }[];
}

export const dashboardApi = {
  get: () => client.get<ApiResponse<Dashboard>>('/dashboard'),
  adminOverview: () => client.get<ApiResponse<AdminOverview>>('/admin/overview'),
};
