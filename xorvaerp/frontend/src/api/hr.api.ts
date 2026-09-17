import client from './client';
import type { ApiResponse } from './auth.api';
import type { DynFieldType } from '../components/dynamic';

// ─── Types ──────────────────────────────────────────────────────

export type DepartmentFunction = 'General' | 'HR' | 'Accounting' | 'Sales' | 'Operations' | 'Procurement';
export const DEPARTMENT_FUNCTIONS: DepartmentFunction[] = ['General', 'HR', 'Accounting', 'Sales', 'Operations', 'Procurement'];

export interface DepartmentRule {
  label: string;
  value: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string;
  function: DepartmentFunction;
  headEmployeeId?: string;
  parentDepartmentId?: string;
  isActive: boolean;
  employeeCount: number;
  rules: DepartmentRule[];
  createdAt: string;
}

export interface Designation {
  id: string;
  title: string;
  code?: string;
  category?: string;
  description?: string;
  isActive: boolean;
  employeeCount: number;
}

export interface EmployeeSummary {
  id: string;
  employeeCode: string;
  fullName: string;
  email?: string;
  departmentId: string;
  departmentName?: string;
  designationId: string;
  designationTitle?: string;
  employmentStatus: string;
  employmentType: string;
  joinDate: string;
  basicSalary?: number | null;
  currency: string;
  isActive: boolean;
}

export interface EmployeeHistoryEntry {
  id: string;
  changeType: string;
  oldValue?: string;
  newValue?: string;
  changedByEmail: string;
  reason?: string;
  changedAt: string;
}

export interface Employee extends EmployeeSummary {
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth?: string;
  gender: string;
  nationality?: string;
  nationalId?: string;
  maritalStatus?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  reportingToId?: string;
  reportingToName?: string;
  branchId?: string;
  branchName?: string;
  joinDate: string;
  probationEndDate?: string;
  confirmationDate?: string;
  basicSalary?: number;
  currency: string;
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  notes?: string;
  profilePhotoUrl?: string;
  hasUserAccount: boolean;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface LeaveType {
  id: string;
  name: string;
  code: string;
  defaultDays: number;
  isPaid: boolean;
  isActive: boolean;
}

export interface LeaveBalance {
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeCode: string;
  year: number;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  isPaid: boolean;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName?: string;
  leaveTypeId: string;
  leaveTypeName?: string;
  fromDate: string;
  toDate: string;
  totalDays: number;
  reason: string;
  status: string;
  createdAt: string;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
}

export interface Payslip {
  id: string;
  employeeId: string;
  employeeName: string;
  gross: number;
  deductions: number;
  net: number;
}

export interface PayRun {
  id: string;
  number: string;
  year: number;
  month: number;
  payDate: string;
  status: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  journalEntryId?: string;
  payslips: Payslip[];
}

export interface PayRunSummary {
  id: string;
  number: string;
  year: number;
  month: number;
  payDate: string;
  status: string;
  totalNet: number;
  employeeCount: number;
}

// ─── Employee-record tabs (admin-designed dynamic sections) ─────

export interface EmployeeTabField {
  id: string;
  key: string;
  label: string;
  type: DynFieldType;
  isRequired: boolean;
  sortOrder: number;
  options?: string[] | null;
  showInList: boolean;
  isFilterable: boolean;
}

export interface EmployeeTab {
  id: string;
  key: string;
  label: string;
  isList: boolean;
  icon?: string | null;
  sortOrder: number;
  fields: EmployeeTabField[];
}

export interface EmployeeTabRecord {
  id: string;
  employeeTabId: string;
  employeeId: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string | null;
}

export interface EmployeeTabRow {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  employmentStatus: string;
  recordId?: string | null;
  values: Record<string, unknown>;
}

export interface EmployeeTabView {
  tabId: string;
  tabKey: string;
  tabLabel: string;
  isList: boolean;
  columns: EmployeeTabField[];
  filters: EmployeeTabField[];
  rows: EmployeeTabRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface EmployeeTabFieldInput {
  label: string;
  type: DynFieldType;
  isRequired: boolean;
  options?: string[] | null;
  showInList?: boolean;
  isFilterable?: boolean;
}

export const GENDERS = ['Male', 'Female', 'Other'];
export const EMPLOYMENT_TYPES = ['FullTime', 'PartTime', 'Contract', 'Intern'];
export const EMPLOYMENT_STATUSES = ['Active', 'OnProbation', 'OnLeave', 'Resigned', 'Terminated'];

// ─── API ────────────────────────────────────────────────────────

export interface HrOverview {
  employeeCount: number;
  departmentCount: number;
  designationCount: number;
  onLeaveToday: number;
  pendingLeaveCount: number;
}

export const hrApi = {
  overview: (companyId?: string) =>
    client.get<ApiResponse<HrOverview>>('/hr/overview', { params: companyId ? { companyId } : undefined }),
  // Departments
  listDepartments: (companyId?: string) =>
    client.get<ApiResponse<Department[]>>('/departments', { params: companyId ? { companyId } : undefined }),
  createDepartment: (data: { companyId?: string; name: string; code: string; description?: string; function?: DepartmentFunction; rules?: DepartmentRule[] }) =>
    client.post<ApiResponse<Department>>('/departments', data),
  updateDepartment: (id: string, data: { name: string; code: string; description?: string; function?: DepartmentFunction; headEmployeeId?: string | null; isActive?: boolean; rules?: DepartmentRule[] }) =>
    client.put<ApiResponse<Department>>(`/departments/${id}`, data),
  deleteDepartment: (id: string) => client.delete<ApiResponse<null>>(`/departments/${id}`),

  // Designations
  listDesignations: () => client.get<ApiResponse<Designation[]>>('/designations'),
  createDesignation: (data: { companyId?: string; title: string; code?: string; category?: string; description?: string }) =>
    client.post<ApiResponse<Designation>>('/designations', data),
  updateDesignation: (id: string, data: { title: string; code?: string; category?: string; description?: string; isActive?: boolean }) =>
    client.put<ApiResponse<Designation>>(`/designations/${id}`, data),
  deleteDesignation: (id: string) => client.delete<ApiResponse<null>>(`/designations/${id}`),

  // Employees
  listEmployees: (params: Record<string, unknown>) =>
    client.get<ApiResponse<Paged<EmployeeSummary>>>('/employees', { params }),
  getEmployee: (id: string) => client.get<ApiResponse<Employee>>(`/employees/${id}`),
  updateEmployee: (id: string, data: Record<string, unknown>) =>
    client.put<ApiResponse<Employee>>(`/employees/${id}`, data),
  getEmployeeHistory: (id: string) => client.get<ApiResponse<EmployeeHistoryEntry[]>>(`/employees/${id}/history`),
  myProfile: () => client.get<ApiResponse<Employee>>('/employees/me'),
  createEmployee: (data: Record<string, unknown>) =>
    client.post<ApiResponse<Employee>>('/employees', data),
  seedDemoEmployees: (companyId?: string, reset = false) =>
    client.post<ApiResponse<{ created: number; skipped: number; removed: number; password: string; logins: string[] }>>(
      '/employees/seed-demo', { companyId, reset }),
  deleteEmployee: (id: string) => client.delete<ApiResponse<boolean>>(`/employees/${id}`),
  changeSalary: (id: string, data: { companyId?: string; newSalary: number; reason?: string }) =>
    client.put<ApiResponse<Employee>>(`/employees/${id}/salary`, data),
  changeStatus: (id: string, data: { companyId?: string; newStatus: string; reason?: string }) =>
    client.put<ApiResponse<Employee>>(`/employees/${id}/status`, data),

  // Employee-record tabs (admin-designed sections)
  listEmployeeTabs: (companyId?: string) =>
    client.get<ApiResponse<EmployeeTab[]>>('/hr/employee-tabs', { params: companyId ? { companyId } : undefined }),
  createEmployeeTab: (data: { companyId?: string; label: string; isList: boolean; icon?: string; fields: EmployeeTabFieldInput[] }) =>
    client.post<ApiResponse<EmployeeTab>>('/hr/employee-tabs', data),
  updateEmployeeTab: (id: string, data: { label: string; fields: (EmployeeTabFieldInput & { id?: string })[] }) =>
    client.put<ApiResponse<EmployeeTab>>(`/hr/employee-tabs/${id}`, data),
  seedEmployeeTabs: (companyId?: string) =>
    client.post<ApiResponse<EmployeeTab[]>>('/hr/employee-tabs/seed-defaults', { companyId }),
  deleteEmployeeTab: (id: string) => client.delete<ApiResponse<boolean>>(`/hr/employee-tabs/${id}`),
  listEmployeeTabRecords: (tabId: string, employeeId: string) =>
    client.get<ApiResponse<EmployeeTabRecord[]>>(`/hr/employee-tabs/${tabId}/records`, { params: { employeeId } }),
  employeeTabView: (tabId: string, params: {
    companyId?: string; page?: number; pageSize?: number; search?: string;
    filters?: Record<string, string>; expiringDays?: number;
  }) =>
    client.get<ApiResponse<EmployeeTabView>>(`/hr/employee-tabs/${tabId}/view`, {
      params: {
        companyId: params.companyId,
        page: params.page, pageSize: params.pageSize,
        search: params.search || undefined,
        filters: params.filters && Object.keys(params.filters).length ? JSON.stringify(params.filters) : undefined,
        expiringDays: params.expiringDays,
      },
    }),
  employeePdf: (id: string) => client.get<Blob>(`/employees/${id}/pdf`, { responseType: 'blob' }),
  uploadFile: (file: File, companyId?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    if (companyId) fd.append('companyId', companyId);
    return client.post<ApiResponse<{ id: string; url: string; fileName: string; contentType: string; size: number }>>(
      '/hr/files', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  saveEmployeeTabRecord: (data: { employeeTabId: string; employeeId: string; recordId?: string; values: Record<string, unknown> }) =>
    client.post<ApiResponse<EmployeeTabRecord>>('/hr/employee-tabs/records', data),
  deleteEmployeeTabRecord: (id: string) => client.delete<ApiResponse<boolean>>(`/hr/employee-tabs/records/${id}`),

  // Leave types
  listLeaveTypes: () => client.get<ApiResponse<LeaveType[]>>('/leave-types'),
  seedLeaveTypes: (companyId?: string) =>
    client.post<ApiResponse<LeaveType[]>>('/leave-types/seed-defaults', { companyId }),
  createLeaveType: (data: Record<string, unknown>) =>
    client.post<ApiResponse<LeaveType>>('/leave-types', data),

  // Leaves
  applyLeave: (data: { leaveTypeId: string; fromDate: string; toDate: string; reason: string }) =>
    client.post<ApiResponse<LeaveRequest>>('/leaves', data),
  myLeaves: () => client.get<ApiResponse<LeaveRequest[]>>('/leaves/me'),
  leaveBalance: () => client.get<ApiResponse<LeaveBalance[]>>('/leaves/balance'),
  teamLeaves: () => client.get<ApiResponse<LeaveRequest[]>>('/leaves'),
  cancelLeave: (id: string) => client.put<ApiResponse<null>>(`/leaves/${id}/cancel`, {}),

  // Holidays
  listHolidays: () => client.get<ApiResponse<Holiday[]>>('/holidays'),
  createHoliday: (data: { companyId?: string; name: string; date: string }) =>
    client.post<ApiResponse<Holiday>>('/holidays', data),
  deleteHoliday: (id: string) => client.delete<ApiResponse<null>>(`/holidays/${id}`),

  // Payroll
  listPayRuns: (companyId?: string) =>
    client.get<ApiResponse<PayRunSummary[]>>('/payroll', { params: companyId ? { companyId } : undefined }),
  getPayRun: (id: string, companyId?: string) =>
    client.get<ApiResponse<PayRun>>(`/payroll/${id}`, { params: companyId ? { companyId } : undefined }),
  runPayroll: (data: { companyId?: string; year: number; month: number; payDate?: string }) =>
    client.post<ApiResponse<PayRun>>('/payroll', data),
  postPayRun: (id: string, companyId?: string) =>
    client.post<ApiResponse<PayRun>>(`/payroll/${id}/post`, {}, { params: companyId ? { companyId } : undefined }),
};

export const STATUS_BADGE: Record<string, string> = {
  Active: 'bg-success/15 text-success',
  OnProbation: 'bg-warning/15 text-warning',
  OnLeave: 'bg-glow/15 text-glow',
  Resigned: 'bg-frost-dim/15 text-frost-dim',
  Terminated: 'bg-danger/15 text-danger',
  Approved: 'bg-success/15 text-success',
  Pending: 'bg-warning/15 text-warning',
  Rejected: 'bg-danger/15 text-danger',
  Cancelled: 'bg-frost-dim/15 text-frost-dim',
};
