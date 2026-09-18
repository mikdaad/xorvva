import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  IconArrowLeft, IconCash, IconUserCog, IconPencil, IconPlus, IconTrash, IconHistory,
} from '@tabler/icons-react';
import { AxiosError } from 'axios';
import {
  EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, GENDERS, hrApi, STATUS_BADGE,
  type Department, type Designation, type Employee, type EmployeeHistoryEntry, type EmployeeTab, type EmployeeTabRecord,
} from '../../api/hr.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, Field, Modal, SelectField, Spinner } from '../../components/ui';
import { DynamicForm, renderCell } from '../../components/dynamic';
import { AttachmentView } from '../../components/AttachmentView';
import { EmployeeTabsStrip } from '../../components/hr/EmployeeTabsStrip';
import { roleLevel } from '../../utils/roles';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 last:border-0">
      <span className="text-sm text-dim">{label}</span>
      <span className="text-sm font-medium text-frost">{value ?? '—'}</span>
    </div>
  );
}

export default function EmployeeProfilePage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const canManage = user ? roleLevel(user.role) <= 2 : false;       // Admin/CEO (salary, status)
  const canEditBasic = user ? roleLevel(user.role) <= 3 : false;    // + Managers (profile of own dept)

  const [emp, setEmp] = useState<Employee | null>(null);
  const [tabs, setTabs] = useState<EmployeeTab[]>([]);
  const [history, setHistory] = useState<EmployeeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<'salary' | 'status' | null>(null);

  const activeKey = params.get('tab') || 'basic';
  const setActive = (k: string) => setParams((p) => { p.set('tab', k); return p; }, { replace: true });
  const activeTab = tabs.find((t) => t.key === activeKey);

  const loadTabs = useCallback(async () => {
    const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;
    try { setTabs((await hrApi.listEmployeeTabs(companyId)).data.data ?? []); } catch { /* non-fatal */ }
  }, [user?.role, activeCompanyId]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [e, h] = await Promise.all([hrApi.getEmployee(id), hrApi.getEmployeeHistory(id)]);
      setEmp(e.data.data ?? null);
      setHistory(h.data.data ?? []);
    } catch (e) { setError(err(e, 'Failed to load employee.')); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadTabs(); }, [loadTabs]);

  return (
    <AppShell>
      <Link to="/hr/employees" className="mb-4 inline-flex items-center gap-1.5 text-sm text-frost-dim hover:text-frost">
        <IconArrowLeft size={16} stroke={1.5} /> Back to employees
      </Link>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : !emp ? (
        <Card className="py-14 text-center text-frost-dim">Employee not found.</Card>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-weak text-lg font-bold text-glow">
                {emp.firstName[0]}{emp.lastName[0]}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-heading text-2xl font-semibold tracking-tight text-frost">{emp.fullName}</h1>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[emp.employmentStatus] ?? ''}`}>
                    {emp.employmentStatus}
                  </span>
                </div>
                <div className="text-sm text-frost-dim">{emp.designationTitle} · {emp.departmentName} · {emp.employeeCode}</div>
              </div>
            </div>
            {canManage && (
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setModal('salary')}><IconCash size={18} stroke={1.6} /> Salary</Button>
                <Button variant="ghost" onClick={() => setModal('status')}><IconUserCog size={18} stroke={1.6} /> Status</Button>
              </div>
            )}
          </div>

          <EmployeeTabsStrip
            tabs={tabs} activeKey={activeKey} onSelect={setActive}
            canManage={canManage} companyId={activeCompanyId} onChanged={() => void loadTabs()}
          />

          {activeKey === 'basic' && <ProfileTab emp={emp} canEdit={canEditBasic} companyId={activeCompanyId} onChanged={() => void load()} />}
          {activeKey === 'compensation' && <CompensationTab emp={emp} history={history} canEdit={canManage} companyId={activeCompanyId} onChanged={() => void load()} />}
          {activeTab && (
            <DynamicTab
              key={activeTab.id}
              tab={activeTab}
              employeeId={emp.id}
              canManage={canManage}
              companyId={activeCompanyId}
            />
          )}

          {modal === 'salary' && (
            <SalaryModal employee={emp} companyId={activeCompanyId} onClose={() => setModal(null)}
              onDone={() => { setModal(null); void load(); }} />
          )}
          {modal === 'status' && (
            <StatusModal employee={emp} companyId={activeCompanyId} onClose={() => setModal(null)}
              onDone={() => { setModal(null); void load(); }} />
          )}
        </>
      )}
    </AppShell>
  );
}

const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed'];

// ─── Core tab: Profile ──────────────────────────────────────────

function ProfileTab({ emp, canEdit, companyId, onChanged }: {
  emp: Employee; canEdit: boolean; companyId?: string; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      {canEdit && (
        <div className="mb-3 flex justify-end">
          <Button variant="ghost" onClick={() => setEditing(true)}><IconPencil size={16} stroke={1.6} /> Edit</Button>
        </div>
      )}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <h3 className="mb-2 text-sm font-semibold text-frost">Personal</h3>
        <Row label="Email" value={emp.email} />
        <Row label="Phone" value={emp.phone} />
        <Row label="Date of birth" value={emp.dateOfBirth} />
        <Row label="Gender" value={emp.gender} />
        <Row label="Nationality" value={emp.nationality} />
        <Row label="National ID" value={emp.nationalId} />
        <Row label="Marital status" value={emp.maritalStatus} />
        <Row label="Emergency contact" value={emp.emergencyContactName} />
        <Row label="Emergency phone" value={emp.emergencyContactPhone} />
      </Card>
      <Card>
        <h3 className="mb-2 text-sm font-semibold text-frost">Employment</h3>
        <Row label="Department" value={emp.departmentName} />
        <Row label="Designation" value={emp.designationTitle} />
        <Row label="Type" value={emp.employmentType} />
        <Row label="Branch" value={emp.branchName} />
        <Row label="Join date" value={emp.joinDate} />
        <Row label="Probation ends" value={emp.probationEndDate} />
        <Row label="Confirmed" value={emp.confirmationDate} />
        <Row label="Reports to" value={emp.reportingToName} />
        <Row label="Login account" value={emp.hasUserAccount ? 'Linked' : 'None'} />
      </Card>
    </div>
    {editing && (
      <BasicEditModal employee={emp} companyId={companyId}
        onClose={() => setEditing(false)} onDone={() => { setEditing(false); onChanged(); }} />
    )}
    </>
  );
}

// ─── Core tab: Compensation (salary + real history timeline) ────

function CompensationTab({ emp, history, canEdit, companyId, onChanged }: {
  emp: Employee; history: EmployeeHistoryEntry[]; canEdit: boolean; companyId?: string; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const salaryHistory = history.filter((h) => h.changeType === 'Salary');
  const money = (v?: string | number | null) =>
    v == null || v === '' ? '—' : `${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${emp.currency}`;

  return (
    <>
      {canEdit && (
        <div className="mb-3 flex justify-end">
          <Button variant="ghost" onClick={() => setEditing(true)}><IconPencil size={16} stroke={1.6} /> Edit</Button>
        </div>
      )}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <h3 className="mb-2 text-sm font-semibold text-frost">Current compensation</h3>
        <Row label="Basic salary" value={emp.basicSalary != null ? money(emp.basicSalary) : '—'} />
        <Row label="Currency" value={emp.currency} />
        <Row label="Bank" value={emp.bankName} />
        <Row label="Account number" value={emp.accountNumber} />
        <Row label="IBAN" value={emp.iban} />
      </Card>
      <Card>
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-frost">
          <IconHistory size={16} stroke={1.6} /> Salary history
        </h3>
        {salaryHistory.length === 0 ? (
          <p className="py-6 text-center text-sm text-frost-dim">No salary changes recorded yet.</p>
        ) : (
          <ol className="relative ml-1 border-l border-border">
            {salaryHistory.map((h) => (
              <li key={h.id} className="mb-4 ml-4 last:mb-0">
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                <div className="flex items-center gap-2 text-sm font-medium text-frost">
                  {money(h.oldValue)} <span className="text-dim">→</span> {money(h.newValue)}
                </div>
                <div className="text-xs text-dim">
                  {new Date(h.changedAt).toLocaleDateString()} · {h.changedByEmail}
                  {h.reason ? ` · ${h.reason}` : ''}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
    {editing && (
      <CompensationEditModal employee={emp} companyId={companyId}
        onClose={() => setEditing(false)} onDone={() => { setEditing(false); onChanged(); }} />
    )}
    </>
  );
}

// ─── Edit modals for the core Basic & Compensation tabs ────────

function BasicEditModal({ employee, companyId, onClose, onDone }: {
  employee: Employee; companyId?: string; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [f, setF] = useState({
    firstName: employee.firstName, lastName: employee.lastName, email: employee.email ?? '', phone: employee.phone ?? '',
    gender: employee.gender ?? 'Male', dateOfBirth: employee.dateOfBirth ?? '', nationality: employee.nationality ?? '',
    nationalId: employee.nationalId ?? '', maritalStatus: employee.maritalStatus ?? '',
    emergencyContactName: employee.emergencyContactName ?? '', emergencyContactPhone: employee.emergencyContactPhone ?? '',
    emergencyContactRelation: employee.emergencyContactRelation ?? '',
    departmentId: employee.departmentId, designationId: employee.designationId, employmentType: employee.employmentType ?? 'FullTime',
  });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    hrApi.listDepartments(companyId).then((r) => setDepartments(r.data.data ?? []));
    hrApi.listDesignations().then((r) => setDesignations(r.data.data ?? []));
  }, [companyId]);

  const submit = async () => {
    setError(null);
    if (!f.firstName.trim() || !f.lastName.trim()) return setError('First and last name are required.');
    setLoading(true);
    try {
      await hrApi.updateEmployee(employee.id, {
        firstName: f.firstName, lastName: f.lastName, email: f.email || undefined, phone: f.phone || undefined,
        gender: f.gender, dateOfBirth: f.dateOfBirth || undefined, nationality: f.nationality || undefined,
        nationalId: f.nationalId || undefined, maritalStatus: f.maritalStatus || undefined,
        emergencyContactName: f.emergencyContactName || undefined, emergencyContactPhone: f.emergencyContactPhone || undefined,
        emergencyContactRelation: f.emergencyContactRelation || undefined,
        departmentId: f.departmentId, designationId: f.designationId, employmentType: f.employmentType,
        reportingToId: employee.reportingToId || undefined, branchId: employee.branchId || undefined,
        bankName: employee.bankName || undefined, accountNumber: employee.accountNumber || undefined, iban: employee.iban || undefined,
      });
      toast.success('Employee updated.');
      onDone();
    } catch (e) { setError(err(e, 'Failed to update.')); setLoading(false); }
  };

  return (
    <Modal open title={`Edit — ${employee.fullName}`} size="2xl" onClose={onClose}>
      <div className="flex max-h-[72vh] flex-col gap-4 overflow-y-auto pr-1">
        {error && <Alert kind="error">{error}</Alert>}
        <div className="label-mono text-dim">Personal</div>
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="First name" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} />
          <Field label="Last name" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} />
          <SelectField label="Gender" options={GENDERS.map((g) => ({ value: g, label: g }))} value={f.gender} onChange={(e) => set('gender', e.target.value)} />
          <Field label="Email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
          <Field label="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
          <Field label="Date of birth" type="date" value={f.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
          <Field label="Nationality" value={f.nationality} onChange={(e) => set('nationality', e.target.value)} />
          <Field label="National ID" value={f.nationalId} onChange={(e) => set('nationalId', e.target.value)} />
          <SelectField label="Marital status" options={[{ value: '', label: '—' }, ...MARITAL_STATUSES.map((m) => ({ value: m, label: m }))]}
            value={f.maritalStatus} onChange={(e) => set('maritalStatus', e.target.value)} />
        </div>
        <div className="label-mono text-dim">Employment</div>
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField label="Department" options={departments.map((d) => ({ value: d.id, label: d.name }))} value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)} />
          <SelectField label="Designation" options={designations.map((d) => ({ value: d.id, label: d.title }))} value={f.designationId} onChange={(e) => set('designationId', e.target.value)} />
          <SelectField label="Type" options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: t }))} value={f.employmentType} onChange={(e) => set('employmentType', e.target.value)} />
        </div>
        <div className="label-mono text-dim">Emergency contact</div>
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" value={f.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} />
          <Field label="Phone" value={f.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone', e.target.value)} />
          <Field label="Relation" value={f.emergencyContactRelation} onChange={(e) => set('emergencyContactRelation', e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function CompensationEditModal({ employee, companyId, onClose, onDone }: {
  employee: Employee; companyId?: string; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [salary, setSalary] = useState(String(employee.basicSalary ?? ''));
  const [reason, setReason] = useState('');
  const [bankName, setBankName] = useState(employee.bankName ?? '');
  const [accountNumber, setAccountNumber] = useState(employee.accountNumber ?? '');
  const [iban, setIban] = useState(employee.iban ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null); setLoading(true);
    try {
      // Bank details save directly (send the full profile to preserve the rest).
      await hrApi.updateEmployee(employee.id, {
        firstName: employee.firstName, lastName: employee.lastName, email: employee.email || undefined, phone: employee.phone || undefined,
        dateOfBirth: employee.dateOfBirth || undefined, gender: employee.gender, nationality: employee.nationality || undefined,
        nationalId: employee.nationalId || undefined, maritalStatus: employee.maritalStatus || undefined,
        emergencyContactName: employee.emergencyContactName || undefined, emergencyContactPhone: employee.emergencyContactPhone || undefined,
        emergencyContactRelation: employee.emergencyContactRelation || undefined,
        departmentId: employee.departmentId, designationId: employee.designationId,
        reportingToId: employee.reportingToId || undefined, branchId: employee.branchId || undefined,
        employmentType: employee.employmentType,
        bankName: bankName || undefined, accountNumber: accountNumber || undefined, iban: iban || undefined,
      });
      // Salary is approvable — only when it actually changed.
      const newSalary = Number(salary || 0);
      if (newSalary !== (employee.basicSalary ?? 0)) {
        const res = await hrApi.changeSalary(employee.id, { companyId, newSalary, reason: reason || undefined });
        if (res.data.pendingApproval) toast.info('Bank details saved. Salary change submitted for approval.');
        else toast.success('Compensation updated.');
      } else {
        toast.success('Compensation updated.');
      }
      onDone();
    } catch (e) { setError(err(e, 'Failed to update.')); setLoading(false); }
  };

  return (
    <Modal open title={`Edit compensation — ${employee.fullName}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <Alert kind="error">{error}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={`Basic salary (${employee.currency})`} type="number" value={salary} onChange={(e) => setSalary(e.target.value)} />
          <Field label="Reason for salary change" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <p className="-mt-2 text-xs text-dim">Changing the salary may need approval before it takes effect. Bank details save immediately.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Bank name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
          <Field label="Account number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
        </div>
        <Field label="IBAN" value={iban} onChange={(e) => setIban(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Dynamic tab (admin-designed): single form OR list table ────

function DynamicTab({ tab, employeeId, canManage, companyId }: {
  tab: EmployeeTab; employeeId: string; canManage: boolean; companyId?: string;
}) {
  const toast = useToast();
  const uploadFile = (file: File) =>
    hrApi.uploadFile(file, companyId).then((r) => ({ url: r.data.data!.url, fileName: r.data.data!.fileName }));
  const [records, setRecords] = useState<EmployeeTabRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<{ record: EmployeeTabRecord | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRecords((await hrApi.listEmployeeTabRecords(tab.id, employeeId)).data.data ?? []); }
    catch (e) { toast.error(err(e, 'Failed to load records.')); }
    finally { setLoading(false); }
  }, [tab.id, employeeId, toast]);

  useEffect(() => { void load(); }, [load]);

  const save = async (values: Record<string, unknown>, recordId?: string) => {
    await hrApi.saveEmployeeTabRecord({ employeeTabId: tab.id, employeeId, recordId, values });
    toast.success('Saved.');
    setEditor(null);
    void load();
  };

  const remove = async (rec: EmployeeTabRecord) => {
    if (!confirm('Delete this row?')) return;
    try { await hrApi.deleteEmployeeTabRecord(rec.id); toast.success('Removed.'); void load(); }
    catch (e) { toast.error(err(e, 'Failed to delete.')); }
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;

  // ── Single form: one record per employee ──
  if (!tab.isList) {
    const record = records[0] ?? null;
    return (
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-frost">{tab.label}</h3>
          {canManage && (
            <Button variant="ghost" onClick={() => setEditor({ record })}>
              {record ? <><IconPencil size={16} stroke={1.6} /> Edit</> : <><IconPlus size={16} stroke={1.6} /> Fill in</>}
            </Button>
          )}
        </div>
        {!record ? (
          <p className="py-8 text-center text-sm text-frost-dim">No {tab.label.toLowerCase()} details yet.</p>
        ) : (
          <div>
            {tab.fields.map((f) => (
              f.type === 'Attachment' ? (
                <div key={f.key} className="flex items-center justify-between border-b border-border py-2.5 last:border-0">
                  <span className="text-sm text-dim">{f.label}</span>
                  <AttachmentView url={(record.data as Record<string, unknown>)[f.key] as string | undefined} />
                </div>
              ) : (
                <Row key={f.key} label={f.label} value={renderCell(f, (record.data as Record<string, unknown>)[f.key])} />
              )
            ))}
          </div>
        )}
        {editor && (
          <Modal open title={record ? `Edit ${tab.label}` : tab.label} size="3xl" onClose={() => setEditor(null)}>
            <DynamicForm
              fields={tab.fields}
              initial={editor.record?.data as Record<string, unknown> | undefined}
              submitLabel="Save"
              columns={2}
              uploadFile={uploadFile}
              onSubmit={(v) => void save(v, editor.record?.id)}
              onCancel={() => setEditor(null)}
            />
          </Modal>
        )}
      </Card>
    );
  }

  // ── List table: many rows per employee ──
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-semibold text-frost">{tab.label}</h3>
        {canManage && (
          <Button variant="ghost" onClick={() => setEditor({ record: null })}>
            <IconPlus size={16} stroke={1.6} /> Add row
          </Button>
        )}
      </div>
      {records.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-frost-dim">No {tab.label.toLowerCase()} rows yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-y border-border label-mono text-dim">
              <tr>
                {tab.fields.map((f) => <th key={f.key} className="px-4 py-3">{f.label}</th>)}
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map((rec) => (
                <tr key={rec.id} className="hover:bg-hover">
                  {tab.fields.map((f) => (
                    <td key={f.key} className="px-4 py-3 text-frost-dim">
                      {f.type === 'Attachment'
                        ? <AttachmentView url={(rec.data as Record<string, unknown>)[f.key] as string | undefined} />
                        : renderCell(f, (rec.data as Record<string, unknown>)[f.key])}
                    </td>
                  ))}
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => setEditor({ record: rec })} aria-label="Edit row"
                          className="text-dim hover:text-frost"><IconPencil size={16} stroke={1.6} /></button>
                        <button onClick={() => void remove(rec)} aria-label="Delete row"
                          className="text-dim hover:text-danger"><IconTrash size={16} stroke={1.6} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editor && (
        <Modal open title={editor.record ? `Edit ${tab.label}` : `Add ${tab.label}`} size="3xl" onClose={() => setEditor(null)}>
          <DynamicForm
            fields={tab.fields}
            initial={editor.record?.data as Record<string, unknown> | undefined}
            submitLabel="Save"
            columns={2}
            uploadFile={uploadFile}
            onSubmit={(v) => void save(v, editor.record?.id)}
            onCancel={() => setEditor(null)}
          />
        </Modal>
      )}
    </Card>
  );
}

// ─── Salary / Status modals (unchanged) ─────────────────────────

function SalaryModal({ employee, companyId, onClose, onDone }: {
  employee: Employee; companyId?: string; onClose: () => void; onDone: () => void;
}) {
  const [salary, setSalary] = useState(String(employee.basicSalary ?? ''));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null); setPending(null); setLoading(true);
    try {
      const res = await hrApi.changeSalary(employee.id, { companyId, newSalary: Number(salary || 0), reason: reason || undefined });
      if (res.data.pendingApproval) { setPending('Submitted for approval.'); setLoading(false); }
      else onDone();
    } catch (e) { setError(err(e, 'Failed to change salary.')); setLoading(false); }
  };

  return (
    <Modal open title="Change salary" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <Alert kind="error">{error}</Alert>}
        {pending && <Alert kind="success">{pending}</Alert>}
        <Field label="New salary" type="number" value={salary} onChange={(e) => setSalary(e.target.value)} />
        <Field label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function StatusModal({ employee, companyId, onClose, onDone }: {
  employee: Employee; companyId?: string; onClose: () => void; onDone: () => void;
}) {
  const [status, setStatus] = useState(employee.employmentStatus);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null); setPending(null); setLoading(true);
    try {
      const res = await hrApi.changeStatus(employee.id, { companyId, newStatus: status, reason: reason || undefined });
      if (res.data.pendingApproval) { setPending('Submitted for approval.'); setLoading(false); }
      else onDone();
    } catch (e) { setError(err(e, 'Failed to change status.')); setLoading(false); }
  };

  return (
    <Modal open title="Change status" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <Alert kind="error">{error}</Alert>}
        {pending && <Alert kind="success">{pending}</Alert>}
        <SelectField label="Status" options={EMPLOYMENT_STATUSES.map((s) => ({ value: s, label: s }))}
          value={status} onChange={(e) => setStatus(e.target.value)} />
        <Field label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
