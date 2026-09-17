import { useCallback, useEffect, useState } from 'react';
import { IconMapPin, IconPlus } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { tenantsApi, type BranchDto, type CompanyDto } from '../../api/tenants.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, Field, Modal, SelectField, Spinner } from '../../components/ui';
import { roleLevel } from '../../utils/roles';

const apiError = (err: unknown, fallback: string) => {
  const ax = err as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? fallback;
};

export default function BranchesPage() {
  const { user } = useAuth();
  // CompanyAdmin (2) and above can create branches — mirrors [RequireRole(CompanyAdmin)]
  const canCreate = user ? roleLevel(user.role) <= 2 : false;

  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [companies, setCompanies] = useState<CompanyDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [branchRes, companyRes] = await Promise.all([
        tenantsApi.listBranches(),
        tenantsApi.listCompanies(),
      ]);
      setBranches(branchRes.data.data ?? []);
      setCompanies(companyRes.data.data ?? []);
    } catch (err) {
      setError(apiError(err, 'Failed to load branches.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? '—';

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-frost">Branches</h1>
          <p className="mt-1 text-sm text-frost-dim">Physical locations of your companies.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <IconPlus size={18} stroke={1.5} /> New Branch
          </Button>
        )}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : branches.length === 0 ? (
        <Card className="py-14 text-center">
          <IconMapPin size={36} stroke={1.2} className="mx-auto mb-3 text-dim" />
          <p className="text-frost-dim">No branches yet.</p>
          {canCreate && (
            <p className="mt-1 text-sm text-dim">Create the first location for one of your companies.</p>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {branches.map((branch) => (
            <Card key={branch.id}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-glow">
                  <IconMapPin size={22} stroke={1.5} />
                </div>
                <div>
                  <div className="font-semibold text-frost">{branch.name}</div>
                  <div className="text-xs text-dim">
                    {companyName(branch.companyId)}
                    {branch.city ? ` · ${branch.city}` : ''}
                    {branch.country ? `, ${branch.country}` : ''}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateBranchModal
        open={createOpen}
        companies={companies}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void load();
        }}
      />
    </AppShell>
  );
}

function CreateBranchModal({
  open,
  companies,
  onClose,
  onCreated,
}: {
  open: boolean;
  companies: CompanyDto[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [companyId, setCompanyId] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setPending(null);
    const targetCompany = companyId || companies[0]?.id;
    if (!targetCompany) return setError('No company available.');
    if (!name.trim()) return setError('Branch name is required.');

    setLoading(true);
    try {
      const res = await tenantsApi.createBranch({
        companyId: targetCompany,
        name,
        city: city || undefined,
        country: country || undefined,
        address: address || undefined,
      });
      setName('');
      setCity('');
      setCountry('');
      setAddress('');
      // An approval rule may have intercepted this — the branch is queued, not created.
      if (res.data.pendingApproval) {
        setPending('Submitted for approval. The branch will be created once approvers sign off.');
      } else {
        onCreated();
      }
    } catch (err) {
      setError(apiError(err, 'Failed to create branch.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} title="New Branch" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <Alert kind="error">{error}</Alert>}
        {pending && <Alert kind="success">{pending}</Alert>}
        <SelectField
          label="Company"
          options={companies.map((c) => ({ value: c.id, label: c.name }))}
          value={companyId || companies[0]?.id || ''}
          onChange={(e) => setCompanyId(e.target.value)}
        />
        <Field label="Branch name" placeholder="e.g. Dubai Office" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="City" placeholder="Dubai" value={city} onChange={(e) => setCity(e.target.value)} />
          <Field label="Country" placeholder="UAE" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
        <Field label="Address (optional)" placeholder="Street, building..." value={address} onChange={(e) => setAddress(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Create Branch</Button>
        </div>
      </div>
    </Modal>
  );
}
