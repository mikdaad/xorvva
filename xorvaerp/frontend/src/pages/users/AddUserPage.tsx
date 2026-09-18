import { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { IconInfoCircle, IconLock, IconMail, IconUser } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { authApi } from '../../api/auth.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, Field, SelectField } from '../../components/ui';
import { validateEmail, validateName, validatePassword } from '../../utils/validation';

// Add User is the CEO's tool to assign a Company Admin to a company. Staff (Managers,
// Employees) come from HR → Employees → New Employee, which wires their department + profile.
const COMPANY_ADMIN_ROLE = 2;

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: number;
  companyId: string;
}

const emptyForm = (defaultRole: number, companyId = ''): FormState => ({
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
  role: defaultRole,
  companyId,
});

/**
 * Admin-only user creation. Mirrors backend rules:
 * - Endpoint requires CompanyAdmin or above
 * - You can only assign roles with LOWER privilege than your own
 * - The server forces the new user into your tenant/company
 */
export default function AddUserPage() {
  const { user } = useAuth();

  // Only the CEO assigns Company Admins. Staff go through Add Employee.
  if (!user || user.role !== 'SuperAdmin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <AddUserForm />;
}

function AddUserForm() {
  const roleOptions = [{ value: COMPANY_ADMIN_ROLE, label: 'Company Admin (GM)' }];
  const { companies, activeCompanyId } = useCompany();
  const defaultRole = COMPANY_ADMIN_ROLE;

  // The CEO must choose WHICH company this admin will run.
  const needsCompany = true;

  const [form, setForm] = useState<FormState>(emptyForm(defaultRole));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Default the company to the active/first one once companies load.
  useEffect(() => {
    if (needsCompany && !form.companyId && companies.length > 0) {
      set('companyId', activeCompanyId ?? companies[0].id);
    }
  }, [needsCompany, companies, activeCompanyId, form.companyId]);

  const onSubmit = async () => {
    setError(null);
    setSuccess(null);

    const errors: Partial<Record<keyof FormState, string>> = {
      firstName: validateName(form.firstName, 'First name') ?? undefined,
      lastName: validateName(form.lastName, 'Last name') ?? undefined,
      email: validateEmail(form.email) ?? undefined,
      password: validatePassword(form.password) ?? undefined,
      confirmPassword:
        form.confirmPassword === form.password ? undefined : 'Passwords do not match.',
      companyId: needsCompany && !form.companyId ? 'Choose a company for this user.' : undefined,
    };
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setLoading(true);
    try {
      const res = await authApi.register({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        role: form.role,
        companyId: needsCompany ? form.companyId : undefined,
      });
      if (res.data.pendingApproval) {
        setSuccess('Submitted for approval. The user will be created once approvers sign off.');
        setForm(emptyForm(defaultRole, form.companyId));
      } else if (res.data.success && res.data.data) {
        setSuccess(`User ${res.data.data.email} created successfully.`);
        setForm(emptyForm(defaultRole, form.companyId));
      }
    } catch (err) {
      const axiosError = err as AxiosError<ApiResponse<never>>;
      const errors = axiosError.response?.data?.errors;
      setError(errors?.join(' ') ?? axiosError.response?.data?.message ?? 'Failed to create user.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-frost">Add Company Admin</h1>
        <p className="mt-1 mb-4 text-sm text-frost-dim">
          Assign an admin (GM) to run one of your companies. They'll manage that company's people,
          structure and approvals.
        </p>

        <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <IconInfoCircle size={20} className="mt-0.5 shrink-0 text-glow" />
          <div className="text-sm">
            <div className="font-semibold text-frost">Adding staff (Managers or Employees)?</div>
            <p className="mt-0.5 text-frost-dim">
              This creates an <b>admin login only</b>. To add people who work in a company, use{' '}
              <Link to="/hr/employees" className="font-semibold text-glow hover:underline">HR → Employees → New Employee</Link>
              {' '}— it creates their profile, department and login in one step.
            </p>
          </div>
        </div>

        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onSubmit();
            }}
            noValidate
            className="flex flex-col gap-4"
          >
            {error && <Alert kind="error">{error}</Alert>}
            {success && <Alert kind="success">{success}</Alert>}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="First name"
                placeholder="First name"
                icon={<IconUser size={18} stroke={1.5} />}
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                error={fieldErrors.firstName}
              />
              <Field
                label="Last name"
                placeholder="Last name"
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                error={fieldErrors.lastName}
              />
            </div>

            <Field
              label="Email"
              type="email"
              placeholder="Email address"
              autoComplete="off"
              icon={<IconMail size={18} stroke={1.5} />}
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              error={fieldErrors.email}
            />

            <SelectField
              label="Role"
              options={roleOptions}
              value={form.role}
              onChange={(e) => set('role', Number(e.target.value))}
            />

            {needsCompany && (
              <SelectField
                label="Company"
                options={[
                  { value: '', label: companies.length ? 'Select a company…' : 'No companies yet — create one first' },
                  ...companies.map((c) => ({ value: c.id, label: c.name })),
                ]}
                value={form.companyId}
                onChange={(e) => set('companyId', e.target.value)}
                error={fieldErrors.companyId}
              />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Password"
                type="password"
                placeholder="Min 8 chars, mixed case, digit, symbol"
                autoComplete="new-password"
                icon={<IconLock size={18} stroke={1.5} />}
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                error={fieldErrors.password}
              />
              <Field
                label="Confirm password"
                type="password"
                placeholder="Repeat password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(e) => set('confirmPassword', e.target.value)}
                error={fieldErrors.confirmPassword}
              />
            </div>

            <div className="mt-2 flex justify-end">
              <Button type="submit" loading={loading}>
                Create User
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
