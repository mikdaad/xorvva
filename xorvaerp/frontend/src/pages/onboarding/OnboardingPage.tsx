import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconPlus, IconRocket } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { tenantsApi, type CompanyDto } from '../../api/tenants.api';
import type { ApiResponse } from '../../api/auth.api';
import { useCompany } from '../../stores/CompanyContext';
import { Alert, Button, Card, Field, Logo, Spinner } from '../../components/ui';
import { ModulePicker } from '../../components/ModulePicker';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

/**
 * First-login wizard (CEO). Dynamic: confirm the first company + pick its modules,
 * then add as many companies as wanted, each with its own modules. Skippable — a
 * dashboard checklist covers anything left. Finishing/skipping stamps the tenant onboarded.
 */
export default function OnboardingPage() {
  const { companies, reloadCompanies, loading } = useCompany();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    setFinishing(true);
    try {
      await tenantsApi.completeOnboarding();
      navigate('/dashboard', { replace: true });
    } catch (e) { setError(err(e, 'Could not finish.')); setFinishing(false); }
  };

  return (
    <div className="min-h-screen bg-void">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <Logo size="lg" />
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-frost">Let's set up your organization</h1>
            <p className="mt-1 text-sm text-frost-dim">
              Confirm your companies and choose which modules each one uses. You can change this anytime.
            </p>
          </div>
        </div>

        {error && <div className="mb-4"><Alert kind="error">{error}</Alert></div>}

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : (
          <div className="flex flex-col gap-4">
            {companies.map((c, i) => (
              <CompanyCard key={c.id} company={c} index={i + 1} onChange={reloadCompanies} />
            ))}

            {adding ? (
              <AddCompanyForm onDone={() => { setAdding(false); void reloadCompanies(); }} onCancel={() => setAdding(false)} />
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/30 bg-abyss/50 py-4 text-sm font-medium text-frost-dim transition-colors hover:border-primary/60 hover:text-frost"
              >
                <IconPlus size={18} stroke={1.6} /> Add another company
              </button>
            )}

            <div className="mt-4 flex items-center justify-between">
              <button onClick={() => void finish()} className="text-sm text-dim hover:text-frost-dim">
                Skip for now
              </button>
              <Button loading={finishing} onClick={() => void finish()}>
                <IconRocket size={18} stroke={1.6} /> Finish & go to dashboard
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CompanyCard({ company, index, onChange }: { company: CompanyDto; index: number; onChange: () => Promise<void> }) {
  const [modules, setModules] = useState<string[]>(company.activeModules);
  const [saving, setSaving] = useState(false);

  const toggle = async (m: string) => {
    const next = modules.includes(m) ? modules.filter((x) => x !== m) : [...modules, m];
    if (next.length === 0) return; // keep at least one
    setModules(next);
    setSaving(true);
    try {
      await tenantsApi.setCompanyModules(company.id, next);
      await onChange();
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-weak text-xs font-bold text-glow">{index}</span>
        <span className="font-semibold text-frost">{company.name}</span>
        <span className="text-xs text-dim">{company.currency} · {company.timezone}</span>
        {saving && <Spinner size="sm" />}
      </div>
      <div className="text-xs font-medium uppercase tracking-wide text-dim">Active modules</div>
      <div className="mt-2">
        <ModulePicker selected={modules} onToggle={(m) => void toggle(m)} />
      </div>
    </Card>
  );
}

function AddCompanyForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [timezone, setTimezone] = useState('Asia/Dubai');
  const [modules, setModules] = useState<string[]>(['HR']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = (m: string) =>
    setModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Company name is required.');
    if (modules.length === 0) return setError('Select at least one module.');
    setLoading(true);
    try {
      await tenantsApi.createCompany({ name, currency, timezone, activeModules: modules });
      onDone();
    } catch (e) { setError(err(e, 'Could not add company.')); setLoading(false); }
  };

  return (
    <Card className="border-primary/40 ring-[3px] ring-primary/10">
      <div className="flex flex-col gap-4">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Company name" placeholder="e.g. RightSource IT" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Currency (ISO)" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          <Field label="Timezone (IANA)" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-dim">Modules</div>
          <ModulePicker selected={modules} onToggle={toggle} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Add Company</Button>
        </div>
      </div>
    </Card>
  );
}
