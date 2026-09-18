import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconPlus, IconTrash, IconBook } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import {
  accountingApi, type Account, type JournalSummary, type ManualJournalLineInput,
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
const money = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

export default function JournalsPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [rows, setRows] = useState<JournalSummary[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [voiding, setVoiding] = useState<JournalSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [j, a] = await Promise.all([
        accountingApi.listJournals(companyId),
        accountingApi.listAccounts(companyId, false),
      ]);
      setRows(j.data.data ?? []);
      setAccounts(a.data.data ?? []);
    } catch (e) { toast.error(err(e, 'Failed to load journals.')); }
    finally { setLoading(false); }
  }, [companyId, toast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[26px] font-semibold tracking-tight text-frost">Journals</h1>
          <p className="mt-1 text-sm text-frost-dim">The general ledger — every posting, balanced and immutable.</p>
        </div>
        <Button disabled={accounts.length === 0} onClick={() => setCreateOpen(true)}>
          <IconPlus size={18} stroke={1.6} /> New journal
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconBook size={40} stroke={1.3} className="text-primary" />
          <p className="text-frost-dim">
            {accounts.length === 0
              ? 'Create the chart of accounts first, then post journals here.'
              : 'No journals yet. Post your first manual journal.'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((j) => (
                  <tr key={j.id} className="hover:bg-hover">
                    <td className="px-4 py-3 font-mono text-xs text-frost">{j.entryNumber}</td>
                    <td className="px-4 py-3 text-frost-dim">{new Date(j.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-frost-dim">{j.description}</td>
                    <td className="px-4 py-3 text-frost-dim">{j.sourceType}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-frost-dim">{money(j.totalDebit)}</td>
                    <td className="px-4 py-3">
                      {j.status === 'Posted' ? <Pill tone="ok">Posted</Pill>
                        : j.status === 'Voided' ? <Pill tone="neutral">Voided</Pill>
                        : <Pill tone="warn">{j.status}</Pill>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {j.status === 'Posted' && j.sourceType === 'Manual' && (
                        <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setVoiding(j)}>Void</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {createOpen && (
        <CreateJournalModal companyId={companyId} accounts={accounts}
          onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); void load(); }} />
      )}
      {voiding && (
        <VoidJournalModal journal={voiding} companyId={companyId}
          onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); void load(); }} />
      )}
    </AppShell>
  );
}

interface LineRow { accountId: string; debit: string; credit: string; description: string; }
const blankLine = (): LineRow => ({ accountId: '', debit: '', credit: '', description: '' });

function CreateJournalModal({ companyId, accounts, onClose, onDone }: {
  companyId?: string; accounts: Account[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [fxRate, setFxRate] = useState('');
  const [lines, setLines] = useState<LineRow[]>([blankLine(), blankLine()]);
  const [loading, setLoading] = useState(false);
  const isForeign = currency.trim().toUpperCase() !== 'AED' && currency.trim() !== '';

  const options = useMemo(
    () => [{ value: '', label: 'Select account…' },
      ...accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))],
    [accounts],
  );

  const setLine = (i: number, patch: Partial<LineRow>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.005;

  const submit = async () => {
    const payload: ManualJournalLineInput[] = lines
      .filter((l) => l.accountId && (parseFloat(l.debit) || parseFloat(l.credit)))
      .map((l) => ({
        accountId: l.accountId,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        description: l.description || undefined,
      }));
    if (payload.length < 2) return toast.error('A journal needs at least two lines with an account and an amount.');
    if (!balanced) return toast.error('Debits and credits must balance.');
    const cur = currency.trim().toUpperCase() || 'AED';
    const rateNum = fxRate.trim() ? Number(fxRate) : undefined;
    if (cur !== 'AED' && rateNum !== undefined && !(rateNum > 0)) return toast.error('Exchange rate must be greater than zero.');

    setLoading(true);
    try {
      await accountingApi.createManualJournal({ companyId, date, description, currency: cur, exchangeRate: cur !== 'AED' ? rateNum : undefined, lines: payload });
      toast.success('Journal posted.');
      onDone();
    } catch (e) { toast.error(err(e, 'Failed to post journal.')); setLoading(false); }
  };

  return (
    <Modal open title="New manual journal" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Field label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Field label="Currency" placeholder="AED" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value)} />
          {isForeign && (
            <Field label="Exchange rate (optional)" type="number" step="0.000001" placeholder="latest on file"
              value={fxRate} onChange={(e) => setFxRate(e.target.value)} />
          )}
        </div>
        {isForeign && (
          <p className="-mt-2 text-xs text-dim">
            Enter amounts in {currency.trim().toUpperCase()}; the ledger posts in AED at this rate (blank = latest Exchange Rate on file).
          </p>
        )}

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_7rem_7rem_1.5rem] gap-2 label-mono text-dim">
            <span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span><span />
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem_7rem_1.5rem] items-center gap-2">
              <SelectField options={options} value={l.accountId} onChange={(e) => setLine(i, { accountId: e.target.value })} />
              <input className="rounded-lg border border-border bg-surface px-2 py-2 text-right text-sm text-frost"
                inputMode="decimal" placeholder="0.00" value={l.debit}
                onChange={(e) => setLine(i, { debit: e.target.value, credit: '' })} />
              <input className="rounded-lg border border-border bg-surface px-2 py-2 text-right text-sm text-frost"
                inputMode="decimal" placeholder="0.00" value={l.credit}
                onChange={(e) => setLine(i, { credit: e.target.value, debit: '' })} />
              <button type="button" className="text-dim hover:text-danger disabled:opacity-30"
                disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
                <IconTrash size={16} stroke={1.6} />
              </button>
            </div>
          ))}
          <button type="button" className="self-start text-sm text-primary hover:underline"
            onClick={() => setLines((ls) => [...ls, blankLine()])}>+ Add line</button>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-surface px-4 py-2 text-sm">
          <span className={balanced ? 'text-success' : 'text-warning'}>
            {balanced ? 'Balanced' : `Out by ${money(Math.abs(totalDebit - totalCredit))}`}
          </span>
          <span className="font-mono tabular-nums text-frost-dim">
            Dr {money(totalDebit)} · Cr {money(totalCredit)}
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} disabled={!balanced} onClick={() => void submit()}>Post journal</Button>
        </div>
      </div>
    </Modal>
  );
}

function VoidJournalModal({ journal, companyId, onClose, onDone }: {
  journal: JournalSummary; companyId?: string; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await accountingApi.voidJournal(journal.id, { companyId, reason: reason || undefined });
      toast.success('Journal voided — a reversing entry was posted.');
      onDone();
    } catch (e) { toast.error(err(e, 'Failed to void journal.')); setLoading(false); }
  };

  return (
    <Modal open title={`Void ${journal.entryNumber}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-frost-dim">
          Posted entries are never deleted. Voiding posts a <b className="text-frost">reversing</b> journal that
          cancels this one, keeping a full audit trail.
        </p>
        <Field label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" loading={loading} onClick={() => void submit()}>Void journal</Button>
        </div>
      </div>
    </Modal>
  );
}
