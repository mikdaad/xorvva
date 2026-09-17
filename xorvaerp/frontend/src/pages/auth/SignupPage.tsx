import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconBuilding, IconBuildingSkyscraper, IconLock, IconMail, IconUser } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { tenantsApi } from '../../api/tenants.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { Alert, Button, Card, Field, Logo } from '../../components/ui';
import { ThemeToggle } from '../../components/ThemeToggle';
import { validateEmail, validateName, validatePassword } from '../../utils/validation';

interface FormState {
  tenantName: string;
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

/**
 * PUBLIC SaaS onboarding: creates Tenant + first Company + SuperAdmin (CEO)
 * account atomically on the server, then logs the CEO straight in.
 */
export default function SignupPage() {
  const { login } = useAuth();
  const [form, setForm] = useState<FormState>({
    tenantName: '',
    companyName: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async () => {
    setError(null);

    const errors: Partial<Record<keyof FormState, string>> = {
      tenantName: validateName(form.tenantName, 'Organization name') ?? undefined,
      companyName: validateName(form.companyName, 'Company name') ?? undefined,
      firstName: validateName(form.firstName, 'First name') ?? undefined,
      lastName: validateName(form.lastName, 'Last name') ?? undefined,
      email: validateEmail(form.email) ?? undefined,
      password: validatePassword(form.password) ?? undefined,
      confirmPassword:
        form.confirmPassword === form.password ? undefined : 'Passwords do not match.',
    };
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setLoading(true);
    try {
      await tenantsApi.registerTenant({
        tenantName: form.tenantName,
        companyName: form.companyName,
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
      });
      // Signup returns no tokens by design — chain a normal login.
      // GuestRoute redirects to /dashboard once the user state updates.
      await login(form.email, form.password);
    } catch (err) {
      const axiosError = err as AxiosError<ApiResponse<never>>;
      const errors = axiosError.response?.data?.errors;
      setError(
        errors?.join(' ') ?? axiosError.response?.data?.message ?? 'Signup failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-void p-4">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-[120px]" />
      <ThemeToggle className="absolute right-4 top-4" />

      <Card className="relative w-full max-w-xl p-8">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <Logo size="lg" />
          <div>
            <h1 className="text-2xl font-bold text-frost">Create your organization</h1>
            <p className="mt-1 text-sm text-frost-dim">
              Your corporation, its first company, and your CEO account — in one step.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
          noValidate
          className="flex flex-col gap-4"
        >
          {error && <Alert kind="error">{error}</Alert>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Organization (group) name"
              placeholder="e.g. RightSource Group"
              icon={<IconBuildingSkyscraper size={18} stroke={1.5} />}
              value={form.tenantName}
              onChange={(e) => set('tenantName', e.target.value)}
              error={fieldErrors.tenantName}
            />
            <Field
              label="First company name"
              placeholder="e.g. RightSource Trading"
              icon={<IconBuilding size={18} stroke={1.5} />}
              value={form.companyName}
              onChange={(e) => set('companyName', e.target.value)}
              error={fieldErrors.companyName}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Your first name"
              placeholder="First name"
              icon={<IconUser size={18} stroke={1.5} />}
              value={form.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              error={fieldErrors.firstName}
            />
            <Field
              label="Your last name"
              placeholder="Last name"
              value={form.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              error={fieldErrors.lastName}
            />
          </div>

          <Field
            label="Work email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            icon={<IconMail size={18} stroke={1.5} />}
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            error={fieldErrors.email}
          />

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

          <Button type="submit" block loading={loading}>
            Create Organization
          </Button>

          <p className="text-center text-sm text-dim">
            Already have an account?{' '}
            <Link to="/login" className="text-glow hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </Card>
    </div>
  );
}
