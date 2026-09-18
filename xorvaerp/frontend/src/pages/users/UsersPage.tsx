import { useCallback, useEffect, useState } from 'react';
import { IconSearch, IconUserPlus, IconUsers } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { usersApi } from '../../api/users.api';
import { authApi, type ApiResponse, type UserDto } from '../../api/auth.api';
import { hrApi, type Department } from '../../api/hr.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Field, Modal, SelectField, Spinner } from '../../components/ui';
import { Avatar, Pill } from '../../components/dashboard-ui';
import { ROLE_LABELS, creatableRoles, roleLevel } from '../../utils/roles';
import { validateEmail, validatePassword } from '../../utils/validation';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '•';

const rolePillTone = (role: string): 'brand' | 'ok' | 'warn' | 'neutral' =>
  role === 'SuperAdmin' ? 'brand' : role === 'CompanyAdmin' ? 'ok' : role === 'Manager' ? 'warn' : 'neutral';

export default function UsersPage() {
  const { user } = useAuth();
  const { companies, activeCompany, activeCompanyId } = useCompany();
  const toast = useToast();
  const [rows, setRows] = useState<UserDto[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const isCeo = user?.role === 'SuperAdmin';
  const canCreate = !!user && creatableRoles(user.role).length > 0;
  const companyName = (id?: string) => companies.find((c) => c.id === id)?.name;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await usersApi.list({ search: search || undefined, role: roleFilter || undefined, pageSize: 100 });
      setRows(res.data.data?.items ?? []);
    } catch (e) { toast.error(err(e, 'Failed to load users.')); }
    finally { setLoading(false); }
  }, [search, roleFilter, toast]);

  useEffect(() => { void load(); }, [load]);

  const canManage = (u: UserDto) => !!user && u.id !== user.id && roleLevel(u.role) > roleLevel(user.role);

  const toggleActive = async (u: UserDto) => {
    setBusyId(u.id);
    try {
      await usersApi.setActive(u.id, !u.isActive);
      setRows((rs) => rs.map((r) => (r.id === u.id ? { ...r, isActive: !u.isActive } : r)));
      toast.success(u.isActive ? `${u.fullName} deactivated.` : `${u.fullName} activated.`);
    } catch (e) { toast.error(err(e, 'Failed to update user.')); }
    finally { setBusyId(null); }
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-frost">Users</h1>
          <p className="mt-1 text-sm text-frost-dim">
            {isCeo ? 'Everyone with a login across your companies.'
              : user?.role === 'Manager' ? 'Employees in your company.' : 'People with a login in your company.'}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}><IconUserPlus size={18} stroke={1.6} /> New user</Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="min-w-56 flex-1">
          <Field placeholder="Search name or email…" icon={<IconSearch size={18} stroke={1.5} />}
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-52">
          <SelectField
            options={[
              { value: '', label: 'All roles' },
              { value: 'SuperAdmin', label: 'CEO (Super Admin)' },
              { value: 'CompanyAdmin', label: 'Company Admin' },
              { value: 'Manager', label: 'Manager' },
              { value: 'Employee', label: 'Employee' },
            ]}
            value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <Card className="py-14 text-center">
          <IconUsers size={36} stroke={1.2} className="mx-auto mb-3 text-dim" />
          <p className="text-frost-dim">No users found.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last login</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((u) => (
                  <tr key={u.id} className="hover:bg-hover">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar initials={initials(u.fullName)} size="sm" />
                        <div>
                          <div className="font-medium text-frost">{u.fullName}</div>
                          <div className="text-xs text-dim">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Pill tone={rolePillTone(u.role)}>{ROLE_LABELS[u.role] ?? u.role}</Pill></td>
                    <td className="px-4 py-3 text-frost-dim">{companyName(u.companyId) ?? (u.role === 'SuperAdmin' ? 'All companies' : '—')}</td>
                    <td className="px-4 py-3">{u.isActive ? <Pill tone="ok">Active</Pill> : <Pill tone="bad">Inactive</Pill>}</td>
                    <td className="px-4 py-3 text-xs text-dim">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}</td>
                    <td className="px-4 py-3 text-right">
                      {canManage(u) && (
                        <Button variant={u.isActive ? 'ghost' : 'secondary'} className="px-3 py-1.5 text-xs"
                          loading={busyId === u.id} onClick={() => void toggleActive(u)}>
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {createOpen && user && (
        <CreateUserModal
          callerRole={user.role}
          isCeo={isCeo}
          activeCompanyId={activeCompanyId}
          activeCompanyName={activeCompany?.name}
          onClose={() => setCreateOpen(false)}
          onDone={() => { setCreateOpen(false); void load(); }}
        />
      )}
    </AppShell>
  );
}

function CreateUserModal({ callerRole, isCeo, activeCompanyId, activeCompanyName, onClose, onDone }: {
  callerRole: string; isCeo: boolean; activeCompanyId?: string; activeCompanyName?: string;
  onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const roleOptions = creatableRoles(callerRole);
  const [f, setF] = useState({
    firstName: '', lastName: '', email: '', password: '',
    role: roleOptions[0]?.value ?? 4, departmentId: '',
  });
  const [depts, setDepts] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  // role >= 3 means Manager(3) or Employee(4) — HR staff that belong to a department.
  const needsDept = f.role >= 3;

  // CEO spans companies → scope the department list to the company we're creating in.
  useEffect(() => {
    hrApi.listDepartments(isCeo ? activeCompanyId : undefined)
      .then((r) => setDepts(r.data.data ?? [])).catch(() => {});
  }, [isCeo, activeCompanyId]);

  const submit = async () => {
    if (!f.firstName.trim() || !f.lastName.trim()) return toast.error('First and last name are required.');
    const emailErr = validateEmail(f.email); if (emailErr) return toast.error(emailErr);
    const pwErr = validatePassword(f.password); if (pwErr) return toast.error(pwErr);
    if (isCeo && !activeCompanyId) return toast.error('Pick a company in the top bar first.');
    if (needsDept && !f.departmentId) return toast.error('Choose a department for this person.');
    setLoading(true);
    try {
      await authApi.register({
        firstName: f.firstName, lastName: f.lastName, email: f.email, password: f.password,
        role: f.role,
        companyId: isCeo ? activeCompanyId : undefined,
        departmentId: needsDept ? f.departmentId : undefined,
      });
      toast.success('User created.');
      onDone();
    } catch (e) { toast.error(err(e, 'Failed to create user.')); setLoading(false); }
  };

  return (
    <Modal open title="New user" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-frost-dim">
          Creating in <b className="text-frost">{isCeo ? (activeCompanyName ?? 'the selected company') : 'your company'}</b>
          {isCeo && ' — switch company in the top bar to target another.'}
        </p>

        <div className="grid grid-cols-2 gap-4">
          <Field label="First name" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} />
          <Field label="Last name" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </div>
        <Field label="Email" type="email" autoComplete="off" value={f.email} onChange={(e) => set('email', e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Role" options={roleOptions} value={f.role}
            onChange={(e) => set('role', Number(e.target.value))} />
          {needsDept && (
            <SelectField label="Department"
              options={[{ value: '', label: depts.length ? 'Select…' : 'No departments yet' }, ...depts.map((d) => ({ value: d.id, label: d.name }))]}
              value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)} />
          )}
        </div>
        <Field label="Temporary password" type="password" autoComplete="new-password"
          placeholder="Min 8 chars, mixed case, digit, symbol"
          value={f.password} onChange={(e) => set('password', e.target.value)} />

        {needsDept && (
          <p className="text-xs text-dim">
            Tip: for a full HR profile (salary, leave balances), add staff via HR → Employees → New Employee instead.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Create user</Button>
        </div>
      </div>
    </Modal>
  );
}
