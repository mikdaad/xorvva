import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconBook2, IconPlus, IconLock } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import {
  accountingApi, ACCOUNTING_INDUSTRIES, ACCOUNT_TYPES, SUBTYPES_BY_TYPE, humanizeSubType,
  type Account, type AccountType,
} from '../../api/accounting.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Field, Modal, SelectField, Spinner } from '../../components/ui';
import { Pill } from '../../components/dashboard-ui';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

const money = (n: number) =>
  n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TYPE_TONE: Record<AccountType, 'brand' | 'ok' | 'warn' | 'neutral' | 'bad'> = {
  Asset: 'brand', Liability: 'warn', Equity: 'neutral', Revenue: 'ok', Expense: 'bad',
};

export default function ChartOfAccountsPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const isCeo = user?.role === 'SuperAdmin';
  const companyId = isCeo ? activeCompanyId : undefined;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [industry, setIndustry] = useState(ACCOUNTING_INDUSTRIES[0]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await accountingApi.listAccounts(companyId, true);
      setAccounts(res.data.data ?? []);
    } catch (e) { toast.error(err(e, 'Failed to load the chart of accounts.')); }
    finally { setLoading(false); }
  }, [companyId, toast]);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(
    () => ACCOUNT_TYPES.map((t) => ({ type: t, rows: accounts.filter((a) => a.accountType === t) }))
      .filter((g) => g.rows.length > 0),
    [accounts],
  );

  const seed = async () => {
    setSeeding(true);
    try {
      const res = await accountingApi.seedChartOfAccounts(industry, companyId);
      toast.success(res.data.message ?? 'Chart of accounts created.');
      await load();
    } catch (e) { toast.error(err(e, 'Failed to create the chart of accounts.')); }
    finally { setSeeding(false); }
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-frost">Chart of Accounts</h1>
          <p className="mt-1 text-sm text-frost-dim">The ledger every transaction posts to — grouped by account type.</p>
        </div>
        {accounts.length > 0 && (
          <Button onClick={() => setCreateOpen(true)}><IconPlus size={18} stroke={1.6} /> New account</Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : accounts.length === 0 ? (
        <Card className="mx-auto flex max-w-lg flex-col items-center gap-4 py-14 text-center">
          <IconBook2 size={40} stroke={1.3} className="text-primary" />
          <div>
            <p className="text-lg font-semibold text-frost">Set up your chart of accounts</p>
            <p className="mt-1 text-sm text-frost-dim">
              Pick the template closest to this company's business. You can rename, add, or deactivate
              accounts afterwards — the numbers work off whatever accounts exist.
            </p>
          </div>
          <div className="w-full max-w-xs">
            <SelectField
              label="Industry template"
              options={ACCOUNTING_INDUSTRIES.map((i) => ({ value: i, label: i }))}
              value={industry} onChange={(e) => setIndustry(e.target.value)}
            />
          </div>
          <Button loading={seeding} onClick={() => void seed()}>Create chart of accounts</Button>
          {isCeo && !companyId && (
            <p className="text-xs text-warning">Pick a company in the top bar first.</p>
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map((g) => (
            <Card key={g.type} className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Pill tone={TYPE_TONE[g.type]}>{g.type}</Pill>
                  <span className="text-xs text-dim">{g.rows.length} accounts</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-dim">
                    <tr>
                      <th className="px-4 py-2.5 w-24">Code</th>
                      <th className="px-4 py-2.5">Name</th>
                      <th className="px-4 py-2.5">Sub-type</th>
                      <th className="px-4 py-2.5 text-right">Balance (AED)</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {g.rows.map((a) => (
                      <tr key={a.id} className="hover:bg-hover">
                        <td className="px-4 py-2.5 font-mono text-xs text-frost-dim">{a.code}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 text-frost">
                            {a.name}
                            {a.isSystemAccount && <IconLock size={13} stroke={1.6} className="text-dim" title="System account" />}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-frost-dim">{humanizeSubType(a.accountSubType)}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{money(a.currentBalance)}</td>
                        <td className="px-4 py-2.5">{a.isActive ? <Pill tone="ok">Active</Pill> : <Pill tone="bad">Inactive</Pill>}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setEditing(a)}>Edit</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateAccountModal companyId={companyId} onClose={() => setCreateOpen(false)}
          onDone={() => { setCreateOpen(false); void load(); }} />
      )}
      {editing && (
        <EditAccountModal account={editing} companyId={companyId} onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); void load(); }} />
      )}
    </AppShell>
  );
}

function CreateAccountModal({ companyId, onClose, onDone }: {
  companyId?: string; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({
    code: '', name: '', accountType: 'Asset' as AccountType,
    accountSubType: SUBTYPES_BY_TYPE.Asset[0], description: '',
  });
  const [loading, setLoading] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const onType = (t: AccountType) => setF((s) => ({ ...s, accountType: t, accountSubType: SUBTYPES_BY_TYPE[t][0] }));

  const submit = async () => {
    if (!f.code.trim() || !f.name.trim()) return toast.error('Code and name are required.');
    setLoading(true);
    try {
      await accountingApi.createAccount({ companyId, ...f });
      toast.success('Account created.');
      onDone();
    } catch (e) { toast.error(err(e, 'Failed to create account.')); setLoading(false); }
  };

  return (
    <Modal open title="New account" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Code" value={f.code} onChange={(e) => set('code', e.target.value)} />
          <div className="col-span-2">
            <Field label="Name" value={f.name} onChange={(e) => set('name', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Type" options={ACCOUNT_TYPES.map((t) => ({ value: t, label: t }))}
            value={f.accountType} onChange={(e) => onType(e.target.value as AccountType)} />
          <SelectField label="Sub-type"
            options={SUBTYPES_BY_TYPE[f.accountType].map((s) => ({ value: s, label: humanizeSubType(s) }))}
            value={f.accountSubType} onChange={(e) => set('accountSubType', e.target.value)} />
        </div>
        <Field label="Description (optional)" value={f.description} onChange={(e) => set('description', e.target.value)} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Create account</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditAccountModal({ account, companyId, onClose, onDone }: {
  account: Account; companyId?: string; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(account.name);
  const [description, setDescription] = useState(account.description ?? '');
  const [isActive, setIsActive] = useState(account.isActive);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error('Name is required.');
    setLoading(true);
    try {
      await accountingApi.updateAccount(account.id, { companyId, name, description, isActive });
      toast.success('Account updated.');
      onDone();
    } catch (e) { toast.error(err(e, 'Failed to update account.')); setLoading(false); }
  };

  return (
    <Modal open title={`Edit ${account.code}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-frost-dim">
          <input type="checkbox" className="accent-primary" checked={isActive}
            disabled={account.isSystemAccount}
            onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
        {account.isSystemAccount && (
          <p className="text-xs text-dim">System accounts are posting targets for auto-journals — they can't be deactivated.</p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Save changes</Button>
        </div>
      </div>
    </Modal>
  );
}
