import { useCallback, useEffect, useState } from 'react';
import { IconBuildingCommunity, IconPlus, IconPencil, IconTrash } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import {
  hrApi, DEPARTMENT_FUNCTIONS,
  type Department, type DepartmentFunction, type DepartmentRule, type EmployeeSummary,
} from '../../api/hr.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, Field, Modal, SelectField, Spinner } from '../../components/ui';
import { Pill } from '../../components/dashboard-ui';
import { SearchTh } from '../../components/SearchTh';
import { roleLevel } from '../../utils/roles';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

const contains = (hay: string | undefined | null, needle: string) =>
  (hay ?? '').toLowerCase().includes(needle.toLowerCase());

export default function DepartmentsPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const canManage = user ? roleLevel(user.role) <= 2 : false;

  const [items, setItems] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Department | null>(null); // existing row being edited
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});
  const setFilter = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const load = useCallback(async () => {
    try {
      const [d, e] = await Promise.all([
        hrApi.listDepartments(),
        hrApi.listEmployees({ page: 1, pageSize: 200 }),
      ]);
      setItems(d.data.data ?? []);
      setEmployees(e.data.data?.items ?? []);
    } catch (e) {
      setError(err(e, 'Failed to load departments.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const empById = new Map(employees.map((e) => [e.id, e]));

  const remove = async (d: Department) => {
    if (!confirm(`Delete the "${d.name}" department?`)) return;
    try { await hrApi.deleteDepartment(d.id); toast.success(`${d.name} removed.`); void load(); }
    catch (e) { toast.error(err(e, 'Failed to delete.')); }
  };

  const headName = (d: Department) => (d.headEmployeeId ? empById.get(d.headEmployeeId)?.fullName ?? '' : '');
  const filtered = items.filter((d) =>
    contains(d.name, f.name ?? '') &&
    contains(d.code, f.code ?? '') &&
    (!f.function || d.function === f.function) &&
    contains(headName(d), f.head ?? ''));

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-frost">Departments</h1>
          <p className="mt-1 text-sm text-frost-dim">{items.length} department(s) · organizational structure & rules.</p>
        </div>
        {canManage && <Button onClick={() => setCreating(true)}><IconPlus size={18} stroke={1.5} /> New Department</Button>}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <Card className="py-14 text-center">
          <IconBuildingCommunity size={36} stroke={1.2} className="mx-auto mb-3 text-dim" />
          <p className="text-frost-dim">No departments yet.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-dim">
                <tr>
                  <SearchTh label="Name" value={f.name ?? ''} onChange={(v) => setFilter('name', v)} />
                  <SearchTh label="Code" value={f.code ?? ''} onChange={(v) => setFilter('code', v)} />
                  <SearchTh label="Function" value={f.function ?? ''} onChange={(v) => setFilter('function', v)} options={[...DEPARTMENT_FUNCTIONS]} />
                  <SearchTh label="Head" value={f.head ?? ''} onChange={(v) => setFilter('head', v)} />
                  <th className="px-4 py-3 align-top">Staff</th>
                  <th className="px-4 py-3 align-top">Rules</th>
                  {canManage && <th className="px-4 py-3 text-right align-top">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr><td colSpan={canManage ? 7 : 6} className="px-4 py-10 text-center text-frost-dim">No matching departments.</td></tr>
                ) : filtered.map((d) => {
                  const head = d.headEmployeeId ? empById.get(d.headEmployeeId) : undefined;
                  return (
                    <tr key={d.id} className={canManage ? 'cursor-pointer hover:bg-hover' : ''}
                      onClick={canManage ? () => setEditing(d) : undefined}>
                      <td className="px-4 py-3 font-medium text-frost">{d.name}
                        {d.description && <div className="text-xs font-normal text-dim">{d.description}</div>}
                      </td>
                      <td className="px-4 py-3"><span className="font-mono text-xs text-frost-dim">{d.code}</span></td>
                      <td className="px-4 py-3">
                        {d.function && d.function !== 'General'
                          ? <Pill tone="brand">{d.function}</Pill>
                          : <span className="text-dim">—</span>}
                      </td>
                      <td className="px-4 py-3 text-frost-dim">{head?.fullName ?? <span className="text-dim">No head</span>}</td>
                      <td className="px-4 py-3 text-frost-dim">{d.employeeCount}</td>
                      <td className="px-4 py-3 text-frost-dim">
                        {d.rules.length > 0 ? <Pill tone="neutral">{d.rules.length} rule(s)</Pill> : <span className="text-dim">—</span>}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5 text-dim">
                            <button title="Edit" aria-label="Edit" onClick={(ev) => { ev.stopPropagation(); setEditing(d); }}
                              className="hover:text-glow"><IconPencil size={16} stroke={1.6} /></button>
                            <button title="Delete" aria-label="Delete" onClick={(ev) => { ev.stopPropagation(); void remove(d); }}
                              className="hover:text-danger"><IconTrash size={16} stroke={1.6} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {(creating || editing) && (
        <DepartmentModal
          companyId={activeCompanyId}
          department={editing}
          employees={editing ? employees.filter((e) => e.departmentId === editing.id) : []}
          onClose={() => { setCreating(false); setEditing(null); }}
          onDone={() => { setCreating(false); setEditing(null); void load(); }}
        />
      )}
    </AppShell>
  );
}

function DepartmentModal({ companyId, department, employees, onClose, onDone }: {
  companyId?: string;
  department: Department | null;
  employees: EmployeeSummary[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const isEdit = !!department;
  const [name, setName] = useState(department?.name ?? '');
  const [code, setCode] = useState(department?.code ?? '');
  const [description, setDescription] = useState(department?.description ?? '');
  const [func, setFunc] = useState<DepartmentFunction>(department?.function ?? 'General');
  const [headId, setHeadId] = useState(department?.headEmployeeId ?? '');
  const [rules, setRules] = useState<DepartmentRule[]>(department?.rules ?? []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const setRule = (i: number, patch: Partial<DepartmentRule>) =>
    setRules((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRule = () => setRules((rs) => [...rs, { label: '', value: '' }]);
  const removeRule = (i: number) => setRules((rs) => rs.filter((_, idx) => idx !== i));

  const submit = async () => {
    setError(null);
    if (!name.trim() || !code.trim()) return setError('Name and code are required.');
    const cleanRules = rules.filter((r) => r.label.trim());
    setLoading(true);
    try {
      if (isEdit) {
        await hrApi.updateDepartment(department!.id, {
          name, code, description: description || undefined, function: func,
          headEmployeeId: headId || null, isActive: department!.isActive, rules: cleanRules,
        });
      } else {
        await hrApi.createDepartment({ companyId, name, code, description: description || undefined, function: func, rules: cleanRules });
      }
      toast.success(isEdit ? 'Department updated.' : 'Department created.');
      onDone();
    } catch (e) { setError(err(e, 'Failed to save.')); setLoading(false); }
  };

  return (
    <Modal open title={isEdit ? `Edit — ${department!.name}` : 'New Department'} size="2xl" onClose={onClose}>
      <div className="flex max-h-[72vh] flex-col gap-4 overflow-y-auto pr-1">
        {error && <Alert kind="error">{error}</Alert>}

        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <Field label="Name" placeholder="Engineering" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Code" placeholder="ENG" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <SelectField label="Function" value={func} onChange={(e) => setFunc(e.target.value as DepartmentFunction)}
            options={DEPARTMENT_FUNCTIONS.map((f) => ({ value: f, label: f }))} />
          {isEdit && (
            <SelectField label="Head of department" value={headId} onChange={(e) => setHeadId(e.target.value)}
              options={[{ value: '', label: '— No head —' },
                ...employees.map((e) => ({ value: e.id, label: `${e.fullName} · ${e.designationTitle ?? ''}` }))]} />
          )}
        </div>
        <Field label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <p className="-mt-1 text-xs text-dim">
          The <b className="text-frost-dim">function</b> decides which module this department's head (a Manager) runs —
          e.g. an Accounting department's head becomes the accountant.
        </p>

        {/* Dynamic rules — the department defines its own */}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-dim">Department rules</span>
            <p className="text-xs text-dim">Anything this department sets for itself (e.g. overtime x1.5, site allowance 500).</p>
          </div>
          <Button variant="ghost" onClick={addRule}><IconPlus size={15} stroke={1.8} /> Add rule</Button>
        </div>
        {rules.length === 0 ? (
          <p className="py-2 text-center text-sm text-dim">No rules yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {rules.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-1/2"><Field placeholder="Rule (e.g. Overtime rate)" value={r.label}
                  onChange={(e) => setRule(i, { label: e.target.value })} /></div>
                <div className="flex-1"><Field placeholder="Value (e.g. 1.5x)" value={r.value}
                  onChange={(e) => setRule(i, { value: e.target.value })} /></div>
                <button onClick={() => removeRule(i)} aria-label="Remove rule"
                  className="shrink-0 text-dim hover:text-danger"><IconTrash size={16} stroke={1.6} /></button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>{isEdit ? 'Save' : 'Create'}</Button>
        </div>
      </div>
    </Modal>
  );
}
