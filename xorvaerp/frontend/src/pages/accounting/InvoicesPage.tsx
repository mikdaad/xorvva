import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconPlus, IconTrash, IconFileInvoice, IconFileTypeXml, IconCopy, IconDownload, IconAlertTriangle } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import {
  accountingApi, type Contact, type InvoiceSummary, type InvoiceLineInput, type TaxRate, type EInvoice,
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

const STATUS_TONE: Record<string, 'brand' | 'ok' | 'warn' | 'neutral' | 'bad'> = {
  Draft: 'neutral', Posted: 'brand', PartiallyPaid: 'warn', Paid: 'ok', Voided: 'bad',
};

export default function InvoicesPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [rows, setRows] = useState<InvoiceSummary[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [einvoiceId, setEinvoiceId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, cust, tax] = await Promise.all([
        accountingApi.listInvoices(companyId),
        accountingApi.listContacts(companyId, 'Customer'),
        accountingApi.listTaxRates(companyId),
      ]);
      setRows(inv.data.data ?? []);
      setCustomers(cust.data.data ?? []);
      setTaxRates(tax.data.data ?? []);
    } catch (e) { toast.error(err(e, 'Failed to load invoices.')); }
    finally { setLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  const post = async (id: string) => {
    setBusyId(id);
    try { const res = await accountingApi.postInvoice(id, companyId); toast.success(res.data.message ?? 'Invoice posted — journal created.'); await load(); }
    catch (e) { toast.error(err(e, 'Failed to post invoice.')); }
    finally { setBusyId(null); }
  };
  const voidInv = async (id: string) => {
    setBusyId(id);
    try { await accountingApi.voidInvoice(id, { companyId }); toast.success('Invoice voided.'); await load(); }
    catch (e) { toast.error(err(e, 'Failed to void invoice.')); }
    finally { setBusyId(null); }
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[26px] font-semibold tracking-tight text-frost">Invoices</h1>
          <p className="mt-1 text-sm text-frost-dim">Bill customers. Posting an invoice creates its journal automatically.</p>
        </div>
        <Button disabled={customers.length === 0} onClick={() => setCreateOpen(true)}>
          <IconPlus size={18} stroke={1.6} /> New invoice
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconFileInvoice size={38} stroke={1.2} className="text-primary" />
          <p className="text-frost-dim">
            {customers.length === 0 ? 'Add a customer (Contacts) first, then raise an invoice.' : 'No invoices yet.'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-4 py-3">Number</th><th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Date</th><th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Status</th><th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((i) => (
                  <tr key={i.id} className="hover:bg-hover">
                    <td className="px-4 py-3 font-mono text-xs text-frost">{i.number}</td>
                    <td className="px-4 py-3 text-frost-dim">{i.contactName}</td>
                    <td className="px-4 py-3 text-frost-dim">{new Date(i.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-frost-dim">{new Date(i.dueDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-frost-dim">{i.currency !== 'AED' ? `${i.currency} ` : ''}{money(i.total)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-frost-dim">{i.currency !== 'AED' ? `${i.currency} ` : ''}{money(i.balanceDue)}</td>
                    <td className="px-4 py-3"><Pill tone={STATUS_TONE[i.status] ?? 'neutral'}>{i.status}</Pill></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {i.status === 'Draft' && (
                          <Button className="px-3 py-1.5 text-xs" loading={busyId === i.id} onClick={() => void post(i.id)}>Post</Button>
                        )}
                        {i.status !== 'Draft' && i.status !== 'Voided' && (
                          <Button variant="ghost" className="px-2.5 py-1.5 text-xs" onClick={() => setEinvoiceId(i.id)} title="Generate UBL / PINT AE e-invoice">
                            <IconFileTypeXml size={15} stroke={1.6} /> e-Invoice
                          </Button>
                        )}
                        {i.status === 'Posted' && (
                          <Button variant="ghost" className="px-3 py-1.5 text-xs" loading={busyId === i.id} onClick={() => void voidInv(i.id)}>Void</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {createOpen && (
        <CreateInvoiceModal companyId={companyId} customers={customers} taxRates={taxRates}
          onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); void load(); }} />
      )}

      {einvoiceId && (
        <EInvoiceModal id={einvoiceId} companyId={companyId} onClose={() => setEinvoiceId(null)} />
      )}
    </AppShell>
  );
}

// ─── E-invoice (UBL / PINT AE) export modal ─────────────────────

function EInvoiceModal({ id, companyId, onClose }: { id: string; companyId?: string; onClose: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<EInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    accountingApi.getInvoiceEInvoice(id, companyId)
      .then((r) => setData(r.data.data ?? null))
      .catch((e) => toast.error(err(e, 'Failed to generate e-invoice.')))
      .finally(() => setLoading(false));
  }, [id, companyId, toast]);

  const copy = async () => {
    if (!data) return;
    try { await navigator.clipboard.writeText(data.xml); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { toast.error('Could not copy to clipboard.'); }
  };

  const download = () => {
    if (!data) return;
    const blob = new Blob([data.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = data.fileName;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal open title="E-invoice (UBL 2.1 · PINT AE)" onClose={onClose}>
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : !data ? (
        <p className="py-8 text-center text-frost-dim">Nothing to show.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-frost-dim">
              <span className="font-mono text-frost">{data.fileName}</span> · {data.format}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => void copy()}>
                <IconCopy size={15} stroke={1.6} /> {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button className="px-3 py-1.5 text-xs" onClick={download}>
                <IconDownload size={15} stroke={1.6} /> Download XML
              </Button>
            </div>
          </div>

          {data.warnings.length > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs text-warning">
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                <IconAlertTriangle size={14} stroke={1.8} /> Before filing
              </div>
              <ul className="list-disc space-y-0.5 pl-5">
                {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-surface p-3 text-[11px] leading-relaxed text-frost-dim">
            {data.xml}
          </pre>
          <p className="text-xs text-dim">
            This is the invoice document. Transmitting it to the FTA / over the Peppol network is done through a
            certified Access Point.
          </p>
        </div>
      )}
    </Modal>
  );
}

interface LineRow { description: string; quantity: string; unitPrice: string; taxRateId: string; }
const blankLine = (): LineRow => ({ description: '', quantity: '1', unitPrice: '', taxRateId: '' });

function CreateInvoiceModal({ companyId, customers, taxRates, onClose, onDone }: {
  companyId?: string; customers: Contact[]; taxRates: TaxRate[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [contactId, setContactId] = useState(customers[0]?.id ?? '');
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [fxRate, setFxRate] = useState('');
  const [lines, setLines] = useState<LineRow[]>([blankLine()]);
  const [loading, setLoading] = useState(false);
  const isForeign = currency.trim().toUpperCase() !== 'AED' && currency.trim() !== '';

  const rateOf = (id: string) => taxRates.find((t) => t.id === id)?.rate ?? 0;
  const taxOptions = useMemo(
    () => [{ value: '', label: 'No tax' }, ...taxRates.map((t) => ({ value: t.id, label: t.name }))],
    [taxRates],
  );
  const setLine = (i: number, patch: Partial<LineRow>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  // Shared cell style so every line input lines up at the same height.
  const cell = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-frost placeholder:text-dim focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary';
  const lineGrid = 'grid grid-cols-[minmax(9rem,1fr)_4rem_7rem_9rem_7rem_2rem] items-center gap-2';

  const calc = lines.map((l) => {
    const amount = (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0);
    const tax = amount * rateOf(l.taxRateId) / 100;
    return { amount, tax };
  });
  const subTotal = calc.reduce((s, c) => s + c.amount, 0);
  const taxTotal = calc.reduce((s, c) => s + c.tax, 0);

  const submit = async () => {
    const payload: InvoiceLineInput[] = lines
      .filter((l) => l.description.trim() && (parseFloat(l.unitPrice) || 0) >= 0 && (parseFloat(l.quantity) || 0) > 0)
      .map((l) => ({
        description: l.description.trim(),
        quantity: parseFloat(l.quantity) || 0,
        unitPrice: parseFloat(l.unitPrice) || 0,
        taxRateId: l.taxRateId || undefined,
      }));
    if (!contactId) return toast.error('Choose a customer.');
    if (payload.length === 0) return toast.error('Add at least one line with a description and amount.');

    const cur = currency.trim().toUpperCase() || 'AED';
    const rateNum = fxRate.trim() ? Number(fxRate) : undefined;
    if (cur !== 'AED' && rateNum !== undefined && !(rateNum > 0)) return toast.error('Exchange rate must be greater than zero.');

    setLoading(true);
    try {
      await accountingApi.createInvoice({
        companyId, contactId, date, dueDate: dueDate || undefined, notes: notes || undefined,
        currency: cur, exchangeRate: cur !== 'AED' ? rateNum : undefined, lines: payload,
      });
      toast.success('Invoice created (draft). Post it to book the journal.');
      onDone();
    } catch (e) { toast.error(err(e, 'Failed to create invoice.')); setLoading(false); }
  };

  return (
    <Modal open title="New invoice" onClose={onClose} size="3xl">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1">
            <SelectField label="Customer" options={customers.map((c) => ({ value: c.id, label: c.name }))}
              value={contactId} onChange={(e) => setContactId(e.target.value)} />
          </div>
          <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Field label="Due date (optional)" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Currency" placeholder="AED" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value)} />
          {isForeign && (
            <Field label="Exchange rate (optional)" type="number" step="0.000001" placeholder="latest on file"
              value={fxRate} onChange={(e) => setFxRate(e.target.value)} />
          )}
        </div>
        {isForeign && (
          <p className="-mt-2 text-xs text-dim">
            Amounts below are in {currency.trim().toUpperCase()}. The ledger posts in AED at this rate (leave blank to use the latest Exchange Rate on file).
          </p>
        )}

        <div className="flex flex-col gap-2">
          <div className="mb-1 text-sm font-semibold text-frost">Line items</div>
          <div className={`${lineGrid} px-1 text-[11px] font-semibold uppercase tracking-wide text-dim`}>
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit price</span>
            <span>Tax</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          {lines.map((l, i) => (
            <div key={i} className={lineGrid}>
              <input className={cell} placeholder="Item or service"
                value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
              <input className={`${cell} text-right`} inputMode="decimal" placeholder="1"
                value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              <input className={`${cell} text-right`} inputMode="decimal" placeholder="0.00"
                value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
              <SelectField options={taxOptions} value={l.taxRateId} onChange={(e) => setLine(i, { taxRateId: e.target.value })} />
              <div className="text-right font-mono text-sm tabular-nums text-frost">{money(calc[i].amount)}</div>
              <button type="button" aria-label="Remove line"
                className="flex justify-center text-dim transition-colors hover:text-danger disabled:opacity-30"
                disabled={lines.length <= 1} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
                <IconTrash size={16} stroke={1.6} />
              </button>
            </div>
          ))}
          <button type="button" className="self-start text-sm font-medium text-primary hover:underline"
            onClick={() => setLines((ls) => [...ls, blankLine()])}>+ Add line</button>
        </div>

        <div className="ml-auto w-64 space-y-1 rounded-lg bg-surface px-4 py-3 text-sm">
          <div className="flex justify-between text-frost-dim"><span>Subtotal</span><span className="font-mono tabular-nums">{money(subTotal)}</span></div>
          <div className="flex justify-between text-frost-dim"><span>VAT</span><span className="font-mono tabular-nums">{money(taxTotal)}</span></div>
          <div className="flex justify-between border-t border-border pt-1 font-semibold text-frost"><span>Total</span><span className="font-mono tabular-nums">{money(subTotal + taxTotal)}</span></div>
        </div>

        <Field label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Create draft</Button>
        </div>
      </div>
    </Modal>
  );
}
