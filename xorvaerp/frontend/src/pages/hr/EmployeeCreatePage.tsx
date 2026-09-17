import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  IconArrowLeft, IconUser, IconLayoutGrid, IconPlus, IconTrash, IconDeviceFloppy,
} from '@tabler/icons-react';
import { AxiosError } from 'axios';
import {
  EMPLOYMENT_TYPES, GENDERS, hrApi,
  type Department, type Designation, type EmployeeTab,
} from '../../api/hr.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, Field, SelectField, Spinner } from '../../components/ui';
import { DynamicFields } from '../../components/dynamic';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

const hasAnyValue = (v: Record<string, unknown>) =>
  Object.values(v).some((x) => x !== undefined && x !== null && x !== '' && x !== false);

/**
 * Full-page, tabbed New Employee form — lives inside the HR module (below the header), not a modal.
 * Tab 1 "Basic" is the fixed spine that creates the employee (approvable New Hire); the remaining
 * tabs are the admin-designed dynamic sections, filled in the same flow and saved as tab records.
 */
export default function EmployeeCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;
  const uploadFile = (file: File) =>
    hrApi.uploadFile(file, companyId).then((r) => ({ url: r.data.data!.url, fileName: r.data.data!.fileName }));

  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [tabs, setTabs] = useState<EmployeeTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string>('basic');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Basic spine
  const [f, setF] = useState({
    firstName: '', lastName: '', email: '', phone: '', gender: 'Male',
    departmentId: '', designationId: '',
    joinDate: new Date().toISOString().slice(0, 10), employmentType: 'FullTime', basicSalary: '',
    emergencyContactName: '', emergencyContactPhone: '',
    grantAccess: false, accessRole: 'Employee', accessPassword: '',
  });
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  // Dynamic tab data: single-form tabs → one values object; list tabs → array of rows.
  const [single, setSingle] = useState<Record<string, Record<string, unknown>>>({});
  const [lists, setLists] = useState<Record<string, Record<string, unknown>[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, g, t] = await Promise.all([
        hrApi.listDepartments(companyId),
        hrApi.listDesignations(),
        hrApi.listEmployeeTabs(companyId),
      ]);
      const deps = d.data.data ?? [];
      const desigs = g.data.data ?? [];
      setDepartments(deps);
      setDesignations(desigs);
      setTabs(t.data.data ?? []);
      setF((s) => ({ ...s, departmentId: deps[0]?.id ?? '', designationId: desigs[0]?.id ?? '' }));
    } catch (e) { setError(err(e, 'Failed to load form.')); }
    finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const steps = useMemo(
    () => [{ key: 'basic', label: 'Basic', list: false }, ...tabs.map((t) => ({ key: t.id, label: t.label, list: t.isList }))],
    [tabs],
  );

  const setSingleVal = (tabId: string, key: string, value: unknown) =>
    setSingle((s) => ({ ...s, [tabId]: { ...(s[tabId] ?? {}), [key]: value } }));
  const addRow = (tabId: string) =>
    setLists((s) => ({ ...s, [tabId]: [...(s[tabId] ?? []), {}] }));
  const setRowVal = (tabId: string, i: number, key: string, value: unknown) =>
    setLists((s) => ({ ...s, [tabId]: (s[tabId] ?? []).map((r, idx) => (idx === i ? { ...r, [key]: value } : r)) }));
  const removeRow = (tabId: string, i: number) =>
    setLists((s) => ({ ...s, [tabId]: (s[tabId] ?? []).filter((_, idx) => idx !== i) }));

  const submit = async () => {
    setError(null);
    if (!f.firstName.trim() || !f.lastName.trim()) { setActive('basic'); return setError('First and last name are required.'); }
    if (f.grantAccess) {
      if (!f.email.trim()) { setActive('basic'); return setError('Email is required to grant system access.'); }
      if (f.accessPassword.length < 8) { setActive('basic'); return setError('Password must be at least 8 characters.'); }
    }
    setSaving(true);
    try {
      const res = await hrApi.createEmployee({
        companyId,
        firstName: f.firstName, lastName: f.lastName, email: f.email || undefined, phone: f.phone || undefined,
        gender: f.gender, departmentId: f.departmentId, designationId: f.designationId,
        joinDate: f.joinDate, employmentType: f.employmentType, basicSalary: Number(f.basicSalary || 0),
        emergencyContactName: f.emergencyContactName || undefined,
        emergencyContactPhone: f.emergencyContactPhone || undefined,
        grantAccess: f.grantAccess,
        ...(f.grantAccess ? { accessRole: f.accessRole, accessPassword: f.accessPassword } : {}),
      });

      // New Hire may be approvable — then no employee exists yet to attach tab data to.
      if (res.data.pendingApproval) {
        toast.success('Submitted for approval. Profile & contract details can be added once approved.');
        navigate('/hr/employees');
        return;
      }

      const employee = res.data.data;
      if (!employee) { toast.success('Employee created.'); navigate('/hr/employees'); return; }

      // Persist the dynamic-tab data (best-effort; the employee already exists).
      let tabErrors = 0;
      for (const t of tabs) {
        try {
          if (t.isList) {
            for (const row of (lists[t.id] ?? [])) {
              if (hasAnyValue(row)) await hrApi.saveEmployeeTabRecord({ employeeTabId: t.id, employeeId: employee.id, values: row });
            }
          } else {
            const vals = single[t.id] ?? {};
            if (hasAnyValue(vals)) await hrApi.saveEmployeeTabRecord({ employeeTabId: t.id, employeeId: employee.id, values: vals });
          }
        } catch { tabErrors++; }
      }

      if (tabErrors > 0) toast.error(`Employee created, but ${tabErrors} section(s) failed to save — add them from the record.`);
      else toast.success(`${employee.fullName} created.`);
      navigate(`/hr/employees/${employee.id}`);
    } catch (e) { setError(err(e, 'Failed to create employee.')); setSaving(false); }
  };

  const activeTab = tabs.find((t) => t.id === active);
  const blocked = !departments.length || !designations.length;

  const tabBtn = (on: boolean) =>
    `flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
      on ? 'border-primary text-frost' : 'border-transparent text-frost-dim hover:text-frost'
    }`;

  return (
    <AppShell>
      <Link to="/hr/employees" className="mb-4 inline-flex items-center gap-1.5 text-sm text-frost-dim hover:text-frost">
        <IconArrowLeft size={16} stroke={1.5} /> Back to employees
      </Link>

      <div className="mb-5">
        <h1 className="text-3xl font-bold text-frost">New Employee</h1>
        <p className="mt-1 text-sm text-frost-dim">Fill the Basic tab to create the employee, then the other tabs — or add them later.</p>
      </div>

      {error && <div className="mb-4"><Alert kind="error">{error}</Alert></div>}
      {blocked && <div className="mb-4"><Alert kind="error">Create at least one Department and one Designation before adding employees.</Alert></div>}

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : (
        <>
          {/* In-form tab bar */}
          <div className="mb-5 flex items-center gap-1 overflow-x-auto border-b border-border">
            {steps.map((s) => {
              const Icon = s.key === 'basic' ? IconUser : IconLayoutGrid;
              return (
                <button key={s.key} onClick={() => setActive(s.key)} className={tabBtn(active === s.key)}>
                  <Icon size={16} stroke={1.6} /> {s.label}
                </button>
              );
            })}
          </div>

          {/* Basic spine */}
          {active === 'basic' && (
            <Card className="max-w-5xl">
              <div className="flex flex-col gap-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-dim">Personal</div>
                <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="First name" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} />
                  <Field label="Last name" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} />
                  <SelectField label="Gender" options={GENDERS.map((g) => ({ value: g, label: g }))}
                    value={f.gender} onChange={(e) => set('gender', e.target.value)} />
                  <Field label="Email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
                  <Field label="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
                </div>

                <div className="text-xs font-semibold uppercase tracking-wide text-dim">Employment</div>
                <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  <SelectField label="Department" options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)} />
                  <SelectField label="Designation" options={designations.map((d) => ({ value: d.id, label: d.title }))}
                    value={f.designationId} onChange={(e) => set('designationId', e.target.value)} />
                  <SelectField label="Type" options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: t }))}
                    value={f.employmentType} onChange={(e) => set('employmentType', e.target.value)} />
                  <Field label="Join date" type="date" value={f.joinDate} onChange={(e) => set('joinDate', e.target.value)} />
                  <Field label="Basic salary" type="number" value={f.basicSalary} onChange={(e) => set('basicSalary', e.target.value)} />
                </div>

                <div className="text-xs font-semibold uppercase tracking-wide text-dim">Emergency contact</div>
                <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Name" value={f.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} />
                  <Field label="Phone" value={f.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone', e.target.value)} />
                </div>

                <div className="text-xs font-semibold uppercase tracking-wide text-dim">System access</div>
                <label className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3.5 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary"
                    checked={f.grantAccess} onChange={(e) => set('grantAccess', e.target.checked)} />
                  <span>
                    <span className="block text-sm font-medium text-frost">Grant this person a login</span>
                    <span className="block text-xs text-dim">They'll sign in with the email above. A Manager gets their department automatically.</span>
                  </span>
                </label>
                {f.grantAccess && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <SelectField label="Access role"
                      options={[{ value: 'Employee', label: 'Employee' }, { value: 'Manager', label: 'Manager' }]}
                      value={f.accessRole} onChange={(e) => set('accessRole', e.target.value)} />
                    <Field label="Temporary password" type="password" autoComplete="new-password"
                      value={f.accessPassword} onChange={(e) => set('accessPassword', e.target.value)} />
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Dynamic single-form tab */}
          {activeTab && !activeTab.isList && (
            <Card className="max-w-5xl">
              {activeTab.fields.length === 0 ? (
                <p className="py-6 text-center text-sm text-frost-dim">This tab has no fields yet.</p>
              ) : (
                <DynamicFields fields={activeTab.fields} values={single[activeTab.id] ?? {}}
                  columns={3} uploadFile={uploadFile} set={(k, v) => setSingleVal(activeTab.id, k, v)} />
              )}
            </Card>
          )}

          {/* Dynamic list tab — add multiple rows */}
          {activeTab && activeTab.isList && (
            <div className="flex max-w-5xl flex-col gap-3">
              {(lists[activeTab.id] ?? []).map((row, i) => (
                <Card key={i}>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-dim">{activeTab.label} #{i + 1}</span>
                    <button onClick={() => removeRow(activeTab.id, i)} aria-label="Remove row"
                      className="text-dim hover:text-danger"><IconTrash size={16} stroke={1.6} /></button>
                  </div>
                  <DynamicFields fields={activeTab.fields} values={row}
                    columns={3} uploadFile={uploadFile} set={(k, v) => setRowVal(activeTab.id, i, k, v)} />
                </Card>
              ))}
              <Button variant="ghost" onClick={() => addRow(activeTab.id)}>
                <IconPlus size={16} stroke={1.6} /> Add {activeTab.label} row
              </Button>
            </div>
          )}

          {/* Footer actions */}
          <div className="mt-6 flex max-w-5xl justify-end gap-2">
            <Button variant="ghost" onClick={() => navigate('/hr/employees')}>Cancel</Button>
            <Button loading={saving} disabled={blocked} onClick={() => void submit()}>
              <IconDeviceFloppy size={18} stroke={1.6} /> Create Employee
            </Button>
          </div>
        </>
      )}
    </AppShell>
  );
}
