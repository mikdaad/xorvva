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
    <div className="relative flex min-h-screen items-center justify-center bg-void p-4">
      {/* Ambient brand glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-[120px]" />
      <ThemeToggle className="absolute right-4 top-4" />

      <Card className="relative w-full max-w-md p-8">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <Logo size="lg" />
          <div>
            <h1 className="text-2xl font-bold text-frost">Welcome back</h1>
            <p className="mt-1 text-sm text-frost-dim">Sign in to your account to continue</p>
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
            type="email"
            placeholder="Email address"
            autoComplete="email"
            icon={<IconMail size={18} stroke={1.5} />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
          />

          <Field
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            icon={<IconLock size={18} stroke={1.5} />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
          />

          <Button type="submit" block loading={loading}>
            Sign In
          </Button>

          <p className="text-center text-sm text-dim">
            New corporation?{' '}
            <Link to="/signup" className="text-glow hover:underline">
              Create your organization
            </Link>
            <br />
            Joining an existing one? Contact your administrator.
          </p>
        </form>
      </Card>
    </div>
  );
}
