import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconPlus, IconUsers, IconTrash, IconEye, IconDownload, IconFileExport } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import {
  hrApi, STATUS_BADGE, EMPLOYMENT_TYPES,
  type Department, type Designation, type EmployeeSummary, type EmployeeTab,
} from '../../api/hr.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, Spinner } from '../../components/ui';
import { SearchTh } from '../../components/SearchTh';
import { EmployeeTabsStrip } from '../../components/hr/EmployeeTabsStrip';
import { EmployeeTabTable } from '../../components/hr/EmployeeTabTable';
import { roleLevel } from '../../utils/roles';

const contains = (hay: string | undefined | null, needle: string) =>
  (hay ?? '').toLowerCase().includes(needle.toLowerCase());

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};

const money = (v?: number | null, cur?: string) =>
  v == null ? '—' : `${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur ?? ''}`.trim();

export default function EmployeesPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const navigate = useNavigate();
  const canCreate = user ? roleLevel(user.role) <= 2 : false;

  const [rows, setRows] = useState<EmployeeSummary[]>([]);
  const [page, setPage] = useState(1);
  const [f, setF] = useState<Record<string, string>>({});
  const setFilter = (k: string, v: string) => { setF((s) => ({ ...s, [k]: v })); setPage(1); };
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<EmployeeTab[]>([]);
  const [activeTab, setActiveTab] = useState('basic');
  const [refLoaded, setRefLoaded] = useState(false); // departments/designations fetched yet?
  const pageSize = 10;

  const scopedCompanyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;
  const loadTabs = useCallback(async () => {
    try { setTabs((await hrApi.listEmployeeTabs(scopedCompanyId)).data.data ?? []); } catch { /* non-fatal */ }
  }, [scopedCompanyId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Load the roster once; search/filter + pagination happen client-side (per-column headers).
      const res = await hrApi.listEmployees({ page: 1, pageSize: 500 });
      setRows(res.data.data?.items ?? []);
    } catch (e) { setError(err(e, 'Failed to load employees.')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [activeTab]);
  useEffect(() => { void loadTabs(); }, [loadTabs]);
  useEffect(() => {
    Promise.all([hrApi.listDepartments(), hrApi.listDesignations()])
      .then(([d, g]) => { setDepartments(d.data.data ?? []); setDesignations(g.data.data ?? []); })
      .finally(() => setRefLoaded(true));
  }, []);

  const deleteEmployee = async (e: EmployeeSummary) => {
    if (!confirm(`Permanently delete ${e.fullName}? This removes their record, HR data and login. This cannot be undone.`)) return;
    try {
      await hrApi.deleteEmployee(e.id);
      toast.success(`${e.fullName} removed.`);
      await load();
    } catch (er) { toast.error(err(er, 'Failed to delete employee.')); }
  };

  const downloadPdf = async (e: EmployeeSummary) => {
    try {
      const res = await hrApi.employeePdf(e.id);
      saveBlob(res.data, `${e.fullName.replace(/\s+/g, '-')}.pdf`);
    } catch (er) { toast.error(err(er, 'Failed to download PDF.')); }
  };

  const dynamicTab = tabs.find((t) => t.key === activeTab); // a designed tab (not Basic/Compensation)
  const isComp = activeTab === 'compensation';

  const filtered = rows.filter((e) => {
    if (f.employee && !contains(`${e.fullName} ${e.employeeCode}`, f.employee)) return false;
    if (isComp) {
      if (f.salary && !contains(e.basicSalary == null ? '' : String(e.basicSalary), f.salary)) return false;
      if (f.currency && !contains(e.currency, f.currency)) return false;
    } else {
      if (f.department && !contains(e.departmentName, f.department)) return false;
      if (f.designation && !contains(e.designationTitle, f.designation)) return false;
      if (f.type && e.employmentType !== f.type) return false;
      if (f.join && !contains(e.joinDate, f.join)) return false;
    }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const exportCsv = () => {
    const cols: { label: string; get: (e: EmployeeSummary) => string }[] = isComp
      ? [{ label: 'Basic salary', get: (e) => money(e.basicSalary, e.currency) }]
      : [
          { label: 'Department', get: (e) => e.departmentName ?? '' },
          { label: 'Designation', get: (e) => e.designationTitle ?? '' },
          { label: 'Type', get: (e) => e.employmentType },
          { label: 'Join date', get: (e) => e.joinDate },
        ];
    const header = ['Employee', 'Code', 'Status', ...cols.map((c) => c.label)];
    const lines = filtered.map((e) => [e.fullName, e.employeeCode, e.employmentStatus, ...cols.map((c) => c.get(e))]);
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${isComp ? 'Compensation' : 'Basic'}.csv`);
  };

  return (
    <AppShell>
      <div className="mb-2 flex flex-wrap items-end justify-end gap-4">
        {canCreate && (
          <Button onClick={() => navigate('/hr/employees/new')} disabled={!departments.length || !designations.length}>
            <IconPlus size={18} stroke={1.5} /> New Employee
          </Button>
        )}
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {canCreate && refLoaded && (!departments.length || !designations.length) && (
        <Alert kind="error">Create at least one Department and one Designation before adding employees.</Alert>
      )}

      <EmployeeTabsStrip
        tabs={tabs} activeKey={activeTab} onSelect={setActiveTab}
        canManage={canCreate} companyId={activeCompanyId} onChanged={() => void loadTabs()}
      />
      {dynamicTab ? (
        <EmployeeTabTable key={dynamicTab.id} tab={dynamicTab} companyId={activeCompanyId} canManage={canCreate} />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={exportCsv}>
              <IconFileExport size={16} stroke={1.6} /> Export
            </Button>
          </div>
          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : rows.length === 0 ? (
            <Card className="py-14 text-center">
              <IconUsers size={36} stroke={1.2} className="mx-auto mb-3 text-dim" />
              <p className="text-frost-dim">No employees found.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-dim">
                    <tr>
                      <SearchTh label="Employee" value={f.employee ?? ''} onChange={(v) => setFilter('employee', v)} />
                      {isComp ? (
                        <SearchTh label="Basic salary" value={f.salary ?? ''} onChange={(v) => setFilter('salary', v)} />
                      ) : (
                        <>
                          <SearchTh label="Department" value={f.department ?? ''} onChange={(v) => setFilter('department', v)} />
                          <SearchTh label="Designation" value={f.designation ?? ''} onChange={(v) => setFilter('designation', v)} />
                          <SearchTh label="Type" value={f.type ?? ''} onChange={(v) => setFilter('type', v)} options={[...EMPLOYMENT_TYPES]} />
                          <SearchTh label="Join date" value={f.join ?? ''} onChange={(v) => setFilter('join', v)} />
                        </>
                      )}
                      <th className="px-4 py-3 text-right align-top">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pageRows.length === 0 ? (
                      <tr><td colSpan={isComp ? 3 : 6} className="px-4 py-10 text-center text-frost-dim">No matching employees.</td></tr>
                    ) : pageRows.map((e) => (
                      <tr key={e.id} onClick={() => navigate(`/hr/employees/${e.id}?tab=${activeTab}`)}
                        className="cursor-pointer hover:bg-hover">
                        <td className="px-4 py-3">
                          <div className="font-medium text-frost">{e.fullName}</div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-dim">{e.employeeCode}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[e.employmentStatus] ?? ''}`}>
                              {e.employmentStatus}
                            </span>
                          </div>
                        </td>
                        {isComp ? (
                          <>
                            <td className="px-4 py-3 text-frost-dim">{money(e.basicSalary, e.currency)}</td>
                        
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-frost-dim">{e.departmentName}</td>
                            <td className="px-4 py-3 text-frost-dim">{e.designationTitle}</td>
                            <td className="px-4 py-3 text-frost-dim">{e.employmentType}</td>
                            <td className="px-4 py-3 text-frost-dim">{e.joinDate}</td>
                          </>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5 text-dim">
                            <button title="View" aria-label="View"
                              onClick={(ev) => { ev.stopPropagation(); navigate(`/hr/employees/${e.id}?tab=${activeTab}`); }}
                              className="hover:text-frost"><IconEye size={16} stroke={1.6} /></button>
                            <button title="Download PDF" aria-label="Download PDF"
                              onClick={(ev) => { ev.stopPropagation(); void downloadPdf(e); }}
                              className="hover:text-frost"><IconDownload size={16} stroke={1.6} /></button>
                            {canCreate && (
                              <button title="Delete employee" aria-label={`Delete ${e.fullName}`}
                                onClick={(ev) => { ev.stopPropagation(); void deleteEmployee(e); }}
                                className="hover:text-danger"><IconTrash size={16} stroke={1.6} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <span className="text-sm text-frost-dim">Page {page} / {totalPages}</span>
              <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
