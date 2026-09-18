import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconMail, IconLock } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { useAuth } from '../../stores/AuthContext';
import type { ApiResponse } from '../../api/auth.api';
import { Alert, Button, Card, Field, Logo } from '../../components/ui';
import { ThemeToggle } from '../../components/ThemeToggle';
import { validateEmail } from '../../utils/validation';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);

    const errors = {
      email: validateEmail(email) ?? undefined,
      password: password ? undefined : 'Password is required.',
    };
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    setLoading(true);
    try {
      await login(email, password);
      // GuestRoute redirects to /dashboard once the user state updates
    } catch (err) {
      const axiosError = err as AxiosError<ApiResponse<never>>;
      setError(axiosError.response?.data?.message ?? 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative grid min-h-screen bg-void lg:grid-cols-[1.05fr_1fr]">
      <ThemeToggle className="absolute right-4 top-4 z-10" />

      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden border-r border-border lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="mesh pointer-events-none absolute inset-0 opacity-50" />
        <Link to="/" className="relative"><Logo /></Link>
        <div className="relative max-w-md">
          <p className="label-mono text-glow">Xorva ERP · v2</p>
          <h2 className="mt-3 font-heading text-[36px] font-semibold leading-[1.12] tracking-tight text-frost">
            Engineered for the people who run the numbers.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-frost-dim">
            HR, accounting and sales on a single ledger — with the controls a growing UAE business actually needs.
          </p>
          <dl className="mt-8 grid max-w-sm grid-cols-3 gap-3">
            {[['1', 'ledger'], ['F4–F9', 'vouchers'], ['5%', 'VAT-ready']].map(([v, k]) => (
              <div key={k} className="panel rounded-lg px-3 py-2.5">
                <dt className="label-mono text-dim">{k}</dt>
                <dd className="mt-1 font-heading text-lg font-semibold text-frost">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="relative font-mono text-[11px] text-dim">© {new Date().getFullYear()} Xorva</p>
      </aside>

      {/* Form */}
      <div className="relative flex items-center justify-center p-6">
      <Card className="animate-pop panel-strong relative w-full max-w-[400px] p-8 shadow-soft-lg">
        <div className="mb-8 flex flex-col gap-5">
          <span className="lg:hidden"><Logo /></span>
          <div>
            <h1 className="font-heading text-[22px] font-semibold tracking-tight text-frost">Welcome back</h1>
            <p className="mt-1 text-sm text-frost-dim">Sign in to your workspace</p>
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

          <Field
            label="Email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            icon={<IconMail size={18} stroke={1.5} />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
          />

          <Field
            label="Password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            icon={<IconLock size={18} stroke={1.5} />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
          />

          <Button type="submit" block loading={loading} className="mt-1">
            Sign in
          </Button>

          <p className="text-center text-[13px] text-dim">
            New organisation?{' '}
            <Link to="/signup" className="font-semibold text-glow hover:underline">
              Create your workspace
            </Link>
          </p>
          <p className="text-center text-xs text-dim">Joining an existing one? Ask your administrator for an invite.</p>
        </form>
      </Card>
      </div>
    </div>
  );
}
