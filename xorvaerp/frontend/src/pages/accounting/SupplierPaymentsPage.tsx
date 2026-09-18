import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconPlus, IconCashBanknote } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, PAYMENT_METHODS, type BankAccount, type BillSummary, type Contact, type SupplierPayment } from '../../api/accounting.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Field, Modal, SelectField, Spinner } from '../../components/ui';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};
const money = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const isOpen = (b: BillSummary) => (b.status === 'Posted' || b.status === 'PartiallyPaid') && b.balanceDue > 0;

export default function SupplierPaymentsPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [rows, setRows] = useState<SupplierPayment[]>([]);
  const [suppliers, setSuppliers] = useState<Contact[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [bills, setBills] = useState<BillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c, b, bl] = await Promise.all([
        accountingApi.listSupplierPayments(companyId),
        accountingApi.listContacts(companyId, 'Supplier'),
        accountingApi.listBankAccounts(companyId),
        accountingApi.listBills(companyId),
      ]);
      setRows(p.data.data ?? []);
      setSuppliers(c.data.data ?? []);
      setBanks(b.data.data ?? []);
      setBills(bl.data.data ?? []);
    } catch (e) { toast.error(err(e, 'Failed to load supplier payments.')); }
    finally { setLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  const canRecord = suppliers.length > 0 && banks.length > 0 && bills.some(isOpen);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[26px] font-semibold tracking-tight text-frost">Supplier Payments</h1>
          <p className="mt-1 text-sm text-frost-dim">Pay suppliers and settle open bills.</p>
        </div>
        <Button disabled={!canRecord} onClick={() => setCreateOpen(true)}><IconPlus size={18} stroke={1.6} /> Record payment</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconCashBanknote size={38} stroke={1.2} className="text-primary" />
          <p className="text-frost-dim">{banks.length === 0 ? 'Add a bank account first.' : !bills.some(isOpen) ? 'No open bills to pay yet.' : 'No supplier payments yet.'}</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border">
                <tr><th className="px-4 py-3">Number</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Method</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Reference</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-hover">
                    <td className="px-4 py-3 font-mono text-xs text-frost">{p.number}</td>
                    <td className="px-4 py-3 text-frost-dim">{p.contactName}</td>
                    <td className="px-4 py-3 text-frost-dim">{new Date(p.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-frost-dim">{p.method}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-frost-dim">{p.currency !== 'AED' ? `${p.currency} ` : ''}{money(p.amount)}</td>
                    <td className="px-4 py-3 text-dim">{p.reference ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {createOpen && (
        <RecordModal companyId={companyId} suppliers={suppliers} banks={banks} bills={bills}
          onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); void load(); }} />
      )}
    </AppShell>
  );
}

function RecordModal({ companyId, suppliers, banks, bills, onClose, onDone }: {
  companyId?: string; suppliers: Contact[]; banks: BankAccount[]; bills: BillSummary[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [contactId, setContactId] = useState('');
  const [bankAccountId, setBankAccountId] = useState(banks[0]?.id ?? '');
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState('Bank');
  const [reference, setReference] = useState('');
  const [payCurrency, setPayCurrency] = useState('AED');
  const [fxRate, setFxRate] = useState('');
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const contactOpen = useMemo(() => bills.filter((b) => b.contactId === contactId && isOpen(b)), [bills, contactId]);
  const currencies = useMemo(() => [...new Set(contactOpen.map((b) => b.currency))], [contactOpen]);
  const openBills = useMemo(() => contactOpen.filter((b) => b.currency === payCurrency), [contactOpen, payCurrency]);
  const total = openBills.reduce((s, b) => s + (parseFloat(alloc[b.id]) || 0), 0);
  const isForeign = payCurrency !== 'AED';

  const pickSupplier = (id: string) => {
    setContactId(id);
    setAlloc({});
    setFxRate('');
    const first = bills.find((b) => b.contactId === id && isOpen(b));
    setPayCurrency(first?.currency ?? 'AED');
  };

  const submit = async () => {
    const allocations = openBills.map((b) => ({ billId: b.id, amount: parseFloat(alloc[b.id]) || 0 })).filter((a) => a.amount > 0);
    if (!contactId) return toast.error('Choose a supplier.');
    if (!bankAccountId) return toast.error('Choose a bank account.');
    if (allocations.length === 0) return toast.error('Allocate the payment to at least one bill.');
    const rateNum = fxRate.trim() ? Number(fxRate) : undefined;
    if (isForeign && rateNum !== undefined && !(rateNum > 0)) return toast.error('Exchange rate must be greater than zero.');
    setLoading(true);
    try {
      await accountingApi.recordSupplierPayment({
        companyId, contactId, date, bankAccountId, method, reference: reference || undefined,
        currency: payCurrency, exchangeRate: isForeign ? rateNum : undefined, allocations,
      });
      toast.success('Supplier payment recorded.');
      onDone();
    } catch (e) { toast.error(err(e, 'Failed to record payment.')); setLoading(false); }
  };

  return (
    <Modal open title="Record supplier payment" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Supplier" options={[{ value: '', label: 'Select…' }, ...suppliers.map((c) => ({ value: c.id, label: c.name }))]} value={contactId} onChange={(e) => pickSupplier(e.target.value)} />
          <SelectField label="Bank account" options={banks.map((b) => ({ value: b.id, label: b.name }))} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} />
          <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <SelectField label="Method" options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} value={method} onChange={(e) => setMethod(e.target.value)} />
          {currencies.length > 1 && (
            <SelectField label="Currency" options={currencies.map((c) => ({ value: c, label: c }))}
              value={payCurrency} onChange={(e) => { setPayCurrency(e.target.value); setAlloc({}); setFxRate(''); }} />
          )}
          {isForeign && (
            <Field label={`Rate (AED per 1 ${payCurrency})`} type="number" step="0.000001" placeholder="latest on file"
              value={fxRate} onChange={(e) => setFxRate(e.target.value)} />
          )}
        </div>
        {isForeign && (
          <p className="-mt-1 text-xs text-dim">
            Settling {payCurrency} bills. Cash is booked in AED at this rate; any difference vs. the bill rate posts as FX gain/loss.
          </p>
        )}

        {contactId && (openBills.length === 0 ? (
          <p className="text-sm text-frost-dim">This supplier has no open bills.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_7rem_7rem] gap-2 label-mono text-dim"><span>Bill</span><span className="text-right">Balance</span><span className="text-right">Pay</span></div>
            {openBills.map((b) => (
              <div key={b.id} className="grid grid-cols-[1fr_7rem_7rem] items-center gap-2">
                <span className="text-sm text-frost">{b.number}</span>
                <span className="text-right font-mono text-sm tabular-nums text-frost-dim">{money(b.balanceDue)}</span>
                <input className="rounded-lg border border-border bg-surface px-2 py-2 text-right text-sm text-frost" inputMode="decimal" placeholder="0.00" value={alloc[b.id] ?? ''} onChange={(e) => setAlloc((a) => ({ ...a, [b.id]: e.target.value }))} />
              </div>
            ))}
            <button type="button" className="self-start text-xs text-primary hover:underline" onClick={() => setAlloc(Object.fromEntries(openBills.map((b) => [b.id, String(b.balanceDue)])))}>Pay all in full</button>
          </div>
        ))}

        <div className="flex items-center justify-between rounded-lg bg-surface px-4 py-2 text-sm">
          <span className="text-frost-dim">Total payment</span><span className="font-mono tabular-nums text-frost">{isForeign ? `${payCurrency} ` : ''}{money(total)}</span>
        </div>
        <Field label="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} disabled={total <= 0} onClick={() => void submit()}>Record payment</Button>
        </div>
      </div>
    </Modal>
  );
}
