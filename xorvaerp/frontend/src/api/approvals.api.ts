import client from './client';
import type { ApiResponse } from './auth.api';

// Role names as the backend serializes them (JsonStringEnumConverter).
export type RoleName = 'SystemAdmin' | 'SuperAdmin' | 'CompanyAdmin' | 'Manager' | 'Employee';
export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'ApprovedButFailed';
export type StepStatus = 'Pending' | 'Approved' | 'Rejected' | 'Skipped';

export interface ModuleActions {
  module: string;
  actions: { actionKey: string; displayName: string; supportsAmountThreshold: boolean }[];
}

export interface ApprovalRule {
  id: string;
  companyId: string;
  name: string;
  module: string;
  actionKey: string;
  approverRoles: RoleName[];
  isActive: boolean;
  isMandatory: boolean;
  /** Money gate: the rule only requires approval at or above this amount. Null = always. */
  amountThreshold?: number | null;
  createdAt: string;
  readOnly: boolean;
}

export interface ApprovalStep {
  order: number;
  requiredRole: RoleName;
  status: StepStatus;
  actedByEmail?: string;
  comment?: string;
  actedAt?: string;
}

export interface ApprovalRequest {
  id: string;
  companyId: string;
  actionKey: string;
  title: string;
  status: ApprovalStatus;
  requesterEmail: string;
  ruleNameSnapshot: string;
  outcome?: string;
  createdAt: string;
  completedAt?: string;
  steps: ApprovalStep[];
  currentStepOrder?: number;
  canAct: boolean;
}

export const approvalsApi = {
  // ─── Rules ──────────────────────────────────────────────
  registry: (companyId: string) =>
    client.get<ApiResponse<ModuleActions[]>>('/approval-rules/registry', { params: { companyId } }),

  listRules: (companyId?: string) =>
    client.get<ApiResponse<ApprovalRule[]>>('/approval-rules', { params: { companyId } }),

  createRule: (data: {
    companyId: string;
    name: string;
    actionKey: string;
    approverRoles: RoleName[];
    isActive: boolean;
    isMandatory: boolean;
    amountThreshold?: number | null;
  }) => client.post<ApiResponse<ApprovalRule>>('/approval-rules', data),

  updateRule: (id: string, data: {
    name: string;
    approverRoles: RoleName[];
    isActive: boolean;
    isMandatory: boolean;
    amountThreshold?: number | null;
  }) => client.put<ApiResponse<ApprovalRule>>(`/approval-rules/${id}`, data),

  deleteRule: (id: string) => client.delete<ApiResponse<null>>(`/approval-rules/${id}`),

  // ─── Requests ───────────────────────────────────────────
  pending: () => client.get<ApiResponse<ApprovalRequest[]>>('/approvals/pending'),
  history: () => client.get<ApiResponse<ApprovalRequest[]>>('/approvals/history'),
  /** Requests the current user submitted (available to any role). Optional actionKey filter. */
  myRequests: (actionKey?: string) =>
    client.get<ApiResponse<ApprovalRequest[]>>('/my-requests', { params: actionKey ? { actionKey } : undefined }),
  approve: (id: string, comment?: string) =>
    client.post<ApiResponse<ApprovalRequest>>(`/approvals/${id}/approve`, { comment }),
  reject: (id: string, reason?: string) =>
    client.post<ApiResponse<ApprovalRequest>>(`/approvals/${id}/reject`, { reason }),
};

// Approver roles a rule can use, lowest privilege first (sequential order).
export const APPROVER_ROLES: { value: RoleName; label: string }[] = [
  { value: 'Manager', label: 'Manager' },
  { value: 'CompanyAdmin', label: 'Company Admin' },
  { value: 'SuperAdmin', label: 'CEO (Super Admin)' },
];

/** Friendly labels for approvable action keys (what the request actually is). */
export const ACTION_LABELS: Record<string, string> = {
  'HR.CreateEmployee': 'New Hire',
  'HR.SalaryChange': 'Salary Change',
  'HR.ChangeEmployeeStatus': 'Employee Status Change',
  'HR.TerminateEmployee': 'Termination',
  'HR.LeaveRequest': 'Leave Request',
  'Auth.RegisterUser': 'New User',
};

export const STATUS_STYLES: Record<ApprovalStatus, string> = {
  Pending: 'bg-warning/15 text-warning',
  Approved: 'bg-success/15 text-success',
  Rejected: 'bg-danger/15 text-danger',
  Cancelled: 'bg-frost-dim/15 text-frost-dim',
  ApprovedButFailed: 'bg-danger/15 text-danger',
};
