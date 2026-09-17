import { useCallback, useEffect, useState } from 'react';
import { IconBuilding, IconPlus, IconSettings } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { tenantsApi, type CompanyDto } from '../../api/tenants.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, Field, Modal, Spinner } from '../../components/ui';
import { ModulePicker } from '../../components/ModulePicker';
import { roleLevel } from '../../utils/roles';

const apiError = (err: unknown, fallback: string) => {
  const ax = err as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? fallback;
};

export default function CompaniesPage() {
  const { user } = useAuth();
  const isSuperAdmin = user ? roleLevel(user.role) <= 1 : false;

  const [companies, setCompanies] = useState<CompanyDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await tenantsApi.listCompanies();
      setCompanies(res.data.data ?? []);
    } catch (err) {
      setError(apiError(err, 'Failed to load companies.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyDto | null>(null);

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-frost">Companies</h1>
          <p className="mt-1 text-sm text-frost-dim">
            Legal entities in your organization. Modules are activated per company.
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <IconPlus size={18} stroke={1.5} /> New Company
          </Button>
        )}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {companies.map((company) => (
            <Card key={company.id}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-glow">
                    <IconBuilding size={22} stroke={1.5} />
                  </div>
                  <div>
                    <div className="font-semibold text-frost">{company.name}</div>
                    <div className="text-xs text-dim">
                      {company.currency} · {company.timezone}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" onClick={() => setEditing(company)}>
                  <IconSettings size={18} stroke={1.5} />
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {company.activeModules.map((m) => (
                  <span
                    key={m}
                    className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium text-glow"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateCompanyModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void load();
        }}
      />

      {editing && (
        <CompanySettingsModal
          company={editing}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </AppShell>
  );
}

// ─── Create Company (SuperAdmin) ────────────────────────────────

function CreateCompanyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [timezone, setTimezone] = useState('Asia/Dubai');
  const [modules, setModules] = useState<string[]>(['HR']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleModule = (m: string) =>
    setModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Company name is required.');
    if (modules.length === 0) return setError('Select at least one module.');

    setLoading(true);
    try {
      await tenantsApi.createCompany({ name, currency, timezone, activeModules: modules });
      setName('');
      setModules(['HR']);
      onCreated();
    } catch (err) {
      setError(apiError(err, 'Failed to create company.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} title="New Company" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Company name" placeholder="e.g. RightSource IT Solutions" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Currency (ISO)" placeholder="AED" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          <Field label="Timezone (IANA)" placeholder="Asia/Dubai" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>
        <div>
          <div className="mb-2 text-sm font-medium text-frost-dim">Active modules</div>
          <ModulePicker selected={modules} onToggle={toggleModule} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Create Company</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Company Settings + Modules ─────────────────────────────────

function CompanySettingsModal({
  company,
  isSuperAdmin,
  onClose,
  onSaved,
}: {
  company: CompanyDto;
  isSuperAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(company.name);
  const [currency, setCurrency] = useState(company.currency);
  const [timezone, setTimezone] = useState(company.timezone);
  const [modules, setModules] = useState<string[]>(company.activeModules);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleModule = (m: string) =>
    setModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await tenantsApi.updateCompanySettings(company.id, { name, currency, timezone });
      // Module activation is SuperAdmin-only (subscription-level decision)
      if (isSuperAdmin) {
        await tenantsApi.setCompanyModules(company.id, modules);
      }
      onSaved();
    } catch (err) {
      setError(apiError(err, 'Failed to save settings.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open title={`Settings — ${company.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Company name" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Currency (ISO)" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          <Field label="Timezone (IANA)" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>
        {isSuperAdmin && (
          <div>
            <div className="mb-2 text-sm font-medium text-frost-dim">Active modules</div>
            <ModulePicker selected={modules} onToggle={toggleModule} />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Save Changes</Button>
        </div>
      </div>
    </Modal>
  );
}

