import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconPlus, IconCash } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import {
  accountingApi, PAYMENT_METHODS,
  type BankAccount, type Contact, type CustomerPayment, type InvoiceSummary,
} from '../../api/accounting.api';
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
const isOpen = (i: InvoiceSummary) => (i.status === 'Posted' || i.status === 'PartiallyPaid') && i.balanceDue > 0;

export default function PaymentsPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [rows, setRows] = useState<CustomerPayment[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c, b, i] = await Promise.all([
        accountingApi.listPayments(companyId),
        accountingApi.listContacts(companyId, 'Customer'),
        accountingApi.listBankAccounts(companyId),
        accountingApi.listInvoices(companyId),
      ]);
      setRows(p.data.data ?? []);
      setCustomers(c.data.data ?? []);
      setBanks(b.data.data ?? []);
      setInvoices(i.data.data ?? []);
    } catch (e) { toast.error(err(e, 'Failed to load payments.')); }
    finally { setLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  const canRecord = customers.length > 0 && banks.length > 0 && invoices.some(isOpen);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-frost">Payments</h1>
          <p className="mt-1 text-sm text-frost-dim">Record money received and settle customer invoices.</p>
        </div>
        <Button disabled={!canRecord} onClick={() => setCreateOpen(true)}>
          <IconPlus size={18} stroke={1.6} /> Record payment
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconCash size={38} stroke={1.2} className="text-primary" />
          <p className="text-frost-dim">
            {banks.length === 0 ? 'Add a bank account first (Accounting → Bank Accounts).'
              : !invoices.some(isOpen) ? 'No open invoices to pay yet.' : 'No payments recorded yet.'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-4 py-3">Number</th><th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Date</th><th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Reference</th>
                </tr>
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
        <RecordPaymentModal companyId={companyId} customers={customers} banks={banks} invoices={invoices}
          onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); void load(); }} />
      )}
    </AppShell>
  );
}

function RecordPaymentModal({ companyId, customers, banks, invoices, onClose, onDone }: {
  companyId?: string; customers: Contact[]; banks: BankAccount[]; invoices: InvoiceSummary[];
  onClose: () => void; onDone: () => void;
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

  const contactOpen = useMemo(
    () => invoices.filter((i) => i.contactId === contactId && (i.status === 'Posted' || i.status === 'PartiallyPaid') && i.balanceDue > 0),
    [invoices, contactId],
  );
  // A payment settles invoices of one currency; offer the customer's open-invoice currencies.
  const currencies = useMemo(() => [...new Set(contactOpen.map((i) => i.currency))], [contactOpen]);
  const openInvoices = useMemo(() => contactOpen.filter((i) => i.currency === payCurrency), [contactOpen, payCurrency]);
  const total = openInvoices.reduce((s, i) => s + (parseFloat(alloc[i.id]) || 0), 0);
  const isForeign = payCurrency !== 'AED';

  const pickCustomer = (id: string) => {
    setContactId(id);
    setAlloc({});
    setFxRate('');
    const first = invoices.find((i) => i.contactId === id && (i.status === 'Posted' || i.status === 'PartiallyPaid') && i.balanceDue > 0);
    setPayCurrency(first?.currency ?? 'AED');
  };

  const submit = async () => {
    const allocations = openInvoices
      .map((i) => ({ invoiceId: i.id, amount: parseFloat(alloc[i.id]) || 0 }))
      .filter((a) => a.amount > 0);
    if (!contactId) return toast.error('Choose a customer.');
    if (!bankAccountId) return toast.error('Choose a bank account.');
    if (allocations.length === 0) return toast.error('Allocate the payment to at least one invoice.');
    const rateNum = fxRate.trim() ? Number(fxRate) : undefined;
    if (isForeign && rateNum !== undefined && !(rateNum > 0)) return toast.error('Exchange rate must be greater than zero.');

    setLoading(true);
    try {
      await accountingApi.recordPayment({
        companyId, contactId, date, bankAccountId, method, reference: reference || undefined,
        currency: payCurrency, exchangeRate: isForeign ? rateNum : undefined, allocations,
      });
      toast.success('Payment recorded.');
      onDone();
    } catch (e) { toast.error(err(e, 'Failed to record payment.')); setLoading(false); }
  };

  return (
    <Modal open title="Record payment" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Customer"
            options={[{ value: '', label: 'Select…' }, ...customers.map((c) => ({ value: c.id, label: c.name }))]}
            value={contactId} onChange={(e) => pickCustomer(e.target.value)} />
          <SelectField label="Bank account" options={banks.map((b) => ({ value: b.id, label: b.name }))}
            value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} />
          <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <SelectField label="Method" options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
            value={method} onChange={(e) => setMethod(e.target.value)} />
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
            Settling {payCurrency} invoices. Cash is booked in AED at this rate; any difference vs. the invoice rate posts as FX gain/loss.
          </p>
        )}

        {contactId && (
          openInvoices.length === 0 ? (
            <p className="text-sm text-frost-dim">This customer has no open invoices.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-[1fr_7rem_7rem] gap-2 text-xs uppercase text-dim">
                <span>Invoice</span><span className="text-right">Balance</span><span className="text-right">Pay</span>
              </div>
              {openInvoices.map((i) => (
                <div key={i.id} className="grid grid-cols-[1fr_7rem_7rem] items-center gap-2">
                  <span className="text-sm text-frost">{i.number}</span>
                  <span className="text-right font-mono text-sm tabular-nums text-frost-dim">{money(i.balanceDue)}</span>
                  <input className="rounded-lg border border-border bg-surface px-2 py-2 text-right text-sm text-frost"
                    inputMode="decimal" placeholder="0.00" value={alloc[i.id] ?? ''}
                    onChange={(e) => setAlloc((a) => ({ ...a, [i.id]: e.target.value }))} />
                </div>
              ))}
              <button type="button" className="self-start text-xs text-primary hover:underline"
                onClick={() => setAlloc(Object.fromEntries(openInvoices.map((i) => [i.id, String(i.balanceDue)])))}>
                Pay all in full
              </button>
            </div>
          )
        )}

        <div className="flex items-center justify-between rounded-lg bg-surface px-4 py-2 text-sm">
          <span className="text-frost-dim">Total payment</span>
          <span className="font-mono tabular-nums text-frost">{isForeign ? `${payCurrency} ` : ''}{money(total)}</span>
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
