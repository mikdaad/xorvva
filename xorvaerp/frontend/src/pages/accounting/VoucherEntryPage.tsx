import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { IconDeviceFloppy, IconPlus, IconTrash, IconKeyboard, IconFileText, IconSend } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type Account, type Contact, type TaxRate } from '../../api/accounting.api';
import {
  ledgerApi, fmtMoney, todayIso,
  type CostCentre, type CostCentreDimension, type Product, type SaveVoucherRequest, type Voucher,
  type VoucherEntryLine, type VoucherType, type VoucherTypeInfo,
} from '../../api/ledger.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, Field } from '../../components/ui';
import { Pill } from '../../components/dashboard-ui';
import { SearchSelect } from '../../components/accounting/SearchSelect';
import type { VoucherPrefill } from './DocumentInboxPage';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};
const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;

interface Row {
  key: string;
  accountId: string;
  productId: string;
  description: string;
  drCr: 'DR' | 'CR';
  amount: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  taxRateId: string;
  costCentreId: string;
}
let seq = 0;
const blankRow = (drCr: 'DR' | 'CR' = 'DR'): Row => ({
  key: `r${++seq}`, accountId: '', productId: '', description: '', drCr,
  amount: '', quantity: '1', unitPrice: '', discountPct: '0', taxRateId: '', costCentreId: '',
});

/** Entry-screen types in Tally order (F4–F9). Credit/debit notes remain on their own pages. */
const ENTRY_ORDER: VoucherType[] = ['Contra', 'Payment', 'Receipt', 'Journal', 'SalesInvoice', 'PurchaseBill'];

export default function VoucherEntryPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const navigate = useNavigate();
  const { id: draftId } = useParams<{ id?: string }>();
  const [params] = useSearchParams();
  const location = useLocation();
  const prefill = (location.state as { prefill?: VoucherPrefill } | null)?.prefill;
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  // ── reference data ──
  const [types, setTypes] = useState<VoucherTypeInfo[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [costCentres, setCostCentres] = useState<CostCentre[]>([]);
  const [dimensions, setDimensions] = useState<CostCentreDimension[]>([]);
  const [loadingRef, setLoadingRef] = useState(true);

  // ── voucher header ──
  const initialType = prefill?.voucherType ?? (params.get('type') as VoucherType | null) ?? 'Payment';
  const [voucherType, setVoucherType] = useState<VoucherType>(ENTRY_ORDER.includes(initialType) ? initialType : 'Payment');
  const [voucherDate, setVoucherDate] = useState(prefill?.voucherDate ?? todayIso());
  const [dueDate, setDueDate] = useState(prefill?.dueDate ?? '');
  const [contactId, setContactId] = useState(prefill?.contactId ?? '');
  const [reference, setReference] = useState(prefill?.reference ?? '');
  const [narration, setNarration] = useState(prefill?.narration ?? '');
  const [placeOfSupply, setPlaceOfSupply] = useState(prefill?.placeOfSupply ?? '');
  const [rows, setRows] = useState<Row[]>(() => prefill?.lines.length
    ? prefill.lines.map((l) => ({ ...blankRow('CR'), accountId: l.accountId ?? '', productId: l.productId ?? '', description: l.description, quantity: String(l.quantity), unitPrice: String(l.unitPrice), amount: String(l.unitPrice * l.quantity) }))
    : [blankRow('DR'), blankRow('CR')]);
  const [linkedDocumentId] = useState<string | undefined>(prefill?.documentId);
  const [editing, setEditing] = useState<Voucher | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<'post' | 'draft' | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const config = useMemo<VoucherTypeInfo | undefined>(() => types.find((t) => t.type === voucherType), [types, voucherType]);
  const isInvoice = config?.mode === 'Invoice';
  const isSettlement = config?.mode === 'Settlement';

  // ── load reference data ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingRef(true);
      try {
        const [t, a, c, tr, p, cc, d] = await Promise.all([
          ledgerApi.voucherTypes(),
          accountingApi.listAccounts(companyId, false),
          accountingApi.listContacts(companyId),
          accountingApi.listTaxRates(companyId),
          ledgerApi.listProducts(companyId).catch(() => null),
          ledgerApi.listCostCentres(companyId, undefined, false, true).catch(() => null),
          ledgerApi.listDimensions(companyId).catch(() => null),
        ]);
        if (cancelled) return;
        setTypes(t.data.data ?? []);
        setAccounts((a.data.data ?? []).filter((x) => x.isActive));
        setContacts(c.data.data ?? []);
        setTaxRates((tr.data.data ?? []).filter((x) => x.isActive));
        setProducts(p?.data.data ?? []);
        setCostCentres(cc?.data.data ?? []);
        setDimensions((d?.data.data ?? []).filter((x) => x.isActive));
      } catch (e) { if (!cancelled) toast.error(err(e, 'Failed to load voucher reference data.')); }
      finally { if (!cancelled) setLoadingRef(false); }
    })();
    return () => { cancelled = true; };
  }, [companyId, toast]);

  // Inbox prefill carries VAT as a percentage; resolve it to a tax-rate id once rates are known.
  useEffect(() => {
    if (!prefill?.lines.length || taxRates.length === 0) return;
    setRows((prev) => prev.map((r, i) => {
      const pct = prefill.lines[i]?.taxRate;
      if (r.taxRateId || pct == null) return r;
      const match = taxRates.find((t) => Math.abs(t.rate - pct) < 0.001);
      return match ? { ...r, taxRateId: match.id } : r;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxRates]);

  // ── load an existing draft for editing ──
  useEffect(() => {
    if (!draftId) { setEditing(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const v = (await ledgerApi.getVoucher(draftId, companyId)).data.data!;
        if (cancelled) return;
        if (v.status !== 'Draft') { toast.error(`Voucher ${v.voucherNumber} is ${v.status} and cannot be edited.`); navigate('/accounting/vouchers'); return; }
        setEditing(v);
        setVoucherType(v.voucherType);
        setVoucherDate(v.voucherDate.slice(0, 10));
        setDueDate(v.dueDate?.slice(0, 10) ?? '');
        setContactId(v.contactId ?? '');
        setReference(v.reference ?? '');
        setNarration(v.narration ?? '');
        setPlaceOfSupply(v.placeOfSupply ?? '');
        setRows(v.lines.map((l) => ({
          key: `r${++seq}`, accountId: l.accountId, productId: l.productId ?? '', description: l.description ?? '',
          drCr: l.drCr, amount: String(l.lineAmount), quantity: String(l.quantity), unitPrice: String(l.unitPrice),
          discountPct: String(l.discountPct), taxRateId: l.taxRateId ?? '', costCentreId: l.costCentreId ?? '',
        })));
      } catch (e) { if (!cancelled) toast.error(err(e, 'Draft not found.')); }
    })();
    return () => { cancelled = true; };
  }, [draftId, companyId, toast, navigate]);

  // ── switching type resets the grid (Tally behaviour) ──
  const switchType = useCallback((next: VoucherType) => {
    if (editing) return; // a draft keeps its type
    setVoucherType(next);
    setRows([blankRow('DR'), blankRow('CR')]);
    setContactId('');
    setError(null);
    setNotice(null);
  }, [editing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^F[4-9]$/.test(e.key)) {
        const next = types.find((t) => t.shortcut === e.key);
        if (next) { e.preventDefault(); switchType(next.type); }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !(e.target as HTMLElement)?.closest('input,textarea')) {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [types, switchType]);

  // ── option lists ──
  const accountOptions = useMemo(() => accounts.map((a) => ({ value: a.id, label: a.name, hint: a.code, keywords: a.accountType })), [accounts]);
  const partyOptions = useMemo(() => {
    const wanted = config?.direction === 'Outward' ? 'Customer' : 'Supplier';
    const filtered = config?.requiresParty || isSettlement
      ? contacts.filter((c) => c.contactType === wanted || c.contactType === 'Both')
      : contacts;
    return (filtered.length ? filtered : contacts).map((c) => ({ value: c.id, label: c.name, hint: c.code, keywords: c.taxNumber ?? '' }));
  }, [contacts, config, isSettlement]);
  const productOptions = useMemo(() => products.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.name, hint: p.code ?? undefined })), [products]);
  const taxOptions = useMemo(() => taxRates.map((t) => ({ value: t.id, label: `${t.name} (${t.rate}%)` })), [taxRates]);
  const costCentreOptions = useMemo(
    () => costCentres.filter((c) => c.isActive && !c.isGroup).map((c) => ({ value: c.id, label: c.name, hint: c.code, keywords: c.dimensionName ?? '' })),
    [costCentres],
  );
  const showCostCentres = costCentreOptions.length > 0;
  const mandatoryDims = useMemo(() => dimensions.filter((d) => d.isMandatory), [dimensions]);

  // ── row helpers ──
  const update = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = useCallback(() => setRows((prev) => {
    // Alternate Dr/Cr for journal-style entry so the second line is ready to balance.
    const last = prev[prev.length - 1];
    return [...prev, blankRow(last?.drCr === 'DR' ? 'CR' : 'DR')];
  }), []);
  const removeRow = (key: string) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));

  const applyProduct = (key: string, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) { update(key, { productId }); return; }
    update(key, {
      productId,
      description: p.description || p.name,
      unitPrice: p.salesPrice ? String(p.salesPrice) : '',
      accountId: p.salesAccountId ?? '',
      taxRateId: p.taxRateId ?? '',
    });
  };

  // ── totals (mirrors VoucherEngine) ──
  const totals = useMemo(() => {
    if (isInvoice) {
      let sub = 0, tax = 0;
      for (const r of rows) {
        if (!r.accountId) continue;
        const net = num(r.quantity) * num(r.unitPrice) * (1 - num(r.discountPct) / 100);
        const rate = taxRates.find((t) => t.id === r.taxRateId)?.rate ?? 0;
        sub += net; tax += net * rate / 100;
      }
      return { subtotal: round2(sub), tax: round2(tax), grand: round2(sub + tax), debit: 0, credit: 0, balanced: true };
    }
    let dr = 0, cr = 0;
    for (const r of rows) {
      if (!r.accountId) continue;
      const a = Math.abs(num(r.amount));
      if (r.drCr === 'DR') dr += a; else cr += a;
    }
    return { subtotal: 0, tax: 0, grand: round2(Math.max(dr, cr)), debit: round2(dr), credit: round2(cr), balanced: Math.abs(dr - cr) < 0.005 };
  }, [rows, isInvoice, taxRates]);
  const difference = round2(totals.debit - totals.credit);

  /** Enter moves to the next field (Tally); Enter on the last cell appends a row. */
  const onGridKeyDown = useCallback((e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
    e.preventDefault();
    const focusables = Array.from(
      formRef.current?.querySelectorAll<HTMLElement>('input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled])') ?? [],
    ).filter((el) => el.offsetParent !== null);
    const i = focusables.indexOf(target);
    if (i >= 0 && i < focusables.length - 1) focusables[i + 1].focus();
    else if (i === focusables.length - 1 && target.closest('tbody')) addRow();
  }, [addRow]);

  // ── submit ──
  const submit = async (asDraft: boolean) => {
    setError(null); setNotice(null);
    if (!config) return;
    const active = rows.filter((r) => r.accountId);
    if (!asDraft) {
      if (active.length === 0) { setError('Add at least one ledger line.'); return; }
      if (!isInvoice && !totals.balanced) { setError(`Entry is not balanced — debits ${fmtMoney(totals.debit)} vs credits ${fmtMoney(totals.credit)}.`); return; }
      if (isInvoice && totals.grand <= 0) { setError('Invoice total must be greater than zero.'); return; }
      if (config.requiresParty && !contactId) { setError(`Select a ${config.direction === 'Outward' ? 'customer' : 'supplier'}.`); return; }
      if (mandatoryDims.length && showCostCentres) {
        const missing = active.find((r) => !r.costCentreId);
        if (missing) { setError(`Cost centre is mandatory (${mandatoryDims.map((d) => d.name).join(', ')}) — fill it on every line.`); return; }
      }
    }
    const lines: VoucherEntryLine[] = active.map((r) => ({
      accountId: r.accountId,
      productId: isInvoice && r.productId ? r.productId : null,
      description: r.description || null,
      drCr: r.drCr,
      amount: isInvoice ? 0 : Math.abs(num(r.amount)),
      quantity: isInvoice ? num(r.quantity) : 1,
      unitPrice: isInvoice ? num(r.unitPrice) : Math.abs(num(r.amount)),
      discountPct: isInvoice ? num(r.discountPct) : 0,
      taxRateId: isInvoice && r.taxRateId ? r.taxRateId : null,
      costCentreId: r.costCentreId || null,
    }));
    const body: SaveVoucherRequest = {
      companyId, voucherId: editing?.id, voucherType, voucherDate,
      dueDate: isInvoice && dueDate ? dueDate : null,
      contactId: contactId || null, reference: reference || undefined, narration: narration || undefined,
      placeOfSupply: isInvoice && placeOfSupply ? placeOfSupply : undefined,
      lines, saveAsDraft: asDraft,
    };
    setSaving(asDraft ? 'draft' : 'post');
    try {
      const res = (await ledgerApi.saveVoucher(body)).data;
      const v = res.data;
      if (res.pendingApproval) {
        toast.success(res.message ?? 'Voucher submitted for approval.');
        setNotice(res.message ?? 'Submitted for approval.');
      } else if (asDraft) {
        toast.success(`Draft ${v?.voucherNumber ?? ''} saved.`);
        if (v && !editing) { navigate(`/accounting/vouchers/${v.id}/edit`, { replace: true }); return; }
      } else {
        if (v && linkedDocumentId) {
          try { await ledgerApi.acceptDocument(linkedDocumentId, v.id, companyId); toast.success('Source document linked.'); }
          catch (e) { toast.error(err(e, 'Voucher posted, but the inbox document could not be linked.')); }
        }
        toast.success(`Posted ${v?.voucherNumber ?? 'voucher'}${v?.entryNumber ? ` → ${v.entryNumber}` : ''}.`);
        setNotice(`Posted ${v?.voucherNumber ?? ''}${v?.entryNumber ? ` (journal ${v.entryNumber})` : ''}.`);
        if (editing) { navigate('/accounting/vouchers'); return; }
        if (linkedDocumentId) { navigate(`/accounting/inbox?doc=${linkedDocumentId}`); return; }
      }
      if (!asDraft) {
        setRows([blankRow('DR'), blankRow('CR')]);
        setContactId(''); setReference(''); setNarration(''); setDueDate('');
        (formRef.current?.querySelector<HTMLElement>('tbody input, tbody [role=combobox]'))?.focus();
      }
    } catch (e) { setError(err(e, 'Could not save the voucher.')); }
    finally { setSaving(null); }
  };

  const partyLabel = config?.direction === 'Outward' ? 'Customer' : config?.direction === 'Inward' ? 'Supplier' : 'Party';
  const entryTypes = ENTRY_ORDER.map((t) => types.find((x) => x.type === t)).filter((x): x is VoucherTypeInfo => !!x);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[26px] font-semibold tracking-tight text-frost">{editing ? `Edit draft ${editing.voucherNumber}` : 'Voucher entry'}</h1>
          <p className="mt-1 text-sm text-frost-dim">Tally-style single screen for contra, payment, receipt, journal, sales and purchase vouchers.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-dim">
          <IconKeyboard size={16} stroke={1.6} />
          <Kbd>F4</Kbd>–<Kbd>F9</Kbd> switch · <Kbd>Enter</Kbd> next field · <Kbd>Ctrl+A</Kbd> post
        </div>
      </div>

      {linkedDocumentId && (
        <div className="mb-4"><Alert kind="success">Pre-filled from an inbox document — review every line, then post. The document will be linked to the new voucher automatically.</Alert></div>
      )}

      {/* Voucher type switcher */}
      <div className="mb-4 flex flex-wrap gap-2">
        {entryTypes.map((t) => (
          <button
            key={t.type}
            type="button"
            disabled={!!editing && editing.voucherType !== t.type}
            onClick={() => switchType(t.type)}
            className={`btn-3d-soft flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-40
              ${t.type === voucherType ? 'border-primary bg-brand-weak text-frost ring-[3px] ring-primary/15' : 'panel text-frost-dim hover:border-border-strong'}`}
          >
            <Kbd>{t.shortcut}</Kbd>
            <span className="font-medium">{t.label}</span>
          </button>
        ))}
        {config && <span className="self-center text-xs text-dim">{config.description}</span>}
      </div>

      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); void submit(false); }} onKeyDown={onGridKeyDown}>
        {/* Header */}
        <Card className="mb-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date" type="date" required value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
            <SearchSelect
              label={partyLabel}
              required={config?.requiresParty}
              value={contactId}
              onChange={setContactId}
              options={partyOptions}
              placeholder={config?.requiresParty ? `Search ${partyLabel.toLowerCase()}…` : 'None'}
              disabled={loadingRef}
            />
            <Field label="Reference" placeholder="Cheque / PO / invoice no." value={reference} onChange={(e) => setReference(e.target.value)} />
            {isInvoice ? (
              <Field label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-frost-dim">Voucher</span>
                <div className="flex h-[42px] items-center gap-2">
                  <Pill tone="brand">{config?.label ?? '—'}</Pill>
                  {editing && <Pill tone="warn">Draft</Pill>}
                </div>
              </div>
            )}
            {isInvoice && (
              <Field label="Place of supply" placeholder="e.g. Abu Dhabi" value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} />
            )}
            <div className={isInvoice ? 'sm:col-span-2 lg:col-span-3' : 'sm:col-span-2 lg:col-span-4'}>
              <Field label="Narration" placeholder="Being …" value={narration} onChange={(e) => setNarration(e.target.value)} />
            </div>
          </div>
        </Card>

        {/* Grid */}
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="w-8 px-3 py-2.5">#</th>
                  {isInvoice && <th className="min-w-[180px] px-2 py-2.5">Item</th>}
                  <th className="min-w-[220px] px-2 py-2.5">Ledger</th>
                  <th className="min-w-[160px] px-2 py-2.5">Narration</th>
                  {showCostCentres && <th className="min-w-[150px] px-2 py-2.5">Cost centre</th>}
                  {isInvoice ? (
                    <>
                      <th className="w-20 px-2 py-2.5 text-right">Qty</th>
                      <th className="w-28 px-2 py-2.5 text-right">Rate</th>
                      <th className="w-20 px-2 py-2.5 text-right">Disc %</th>
                      <th className="min-w-[130px] px-2 py-2.5">Tax</th>
                      <th className="w-32 px-2 py-2.5 text-right">Amount</th>
                    </>
                  ) : (
                    <>
                      <th className="w-24 px-2 py-2.5 text-center">Dr / Cr</th>
                      <th className="w-36 px-2 py-2.5 text-right">Amount</th>
                    </>
                  )}
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, idx) => {
                  const net = num(r.quantity) * num(r.unitPrice) * (1 - num(r.discountPct) / 100);
                  const rate = taxRates.find((t) => t.id === r.taxRateId)?.rate ?? 0;
                  const lineTotal = round2(net + net * rate / 100);
                  return (
                    <tr key={r.key} className="align-top hover:bg-hover/60">
                      <td className="px-3 py-2 text-xs text-dim">{idx + 1}</td>
                      {isInvoice && (
                        <td className="px-2 py-1.5">
                          <SearchSelect size="sm" aria-label={`Item ${idx + 1}`} value={r.productId} onChange={(v) => applyProduct(r.key, v)} options={productOptions} placeholder="Item…" />
                        </td>
                      )}
                      <td className="px-2 py-1.5">
                        <SearchSelect size="sm" aria-label={`Ledger ${idx + 1}`} value={r.accountId} onChange={(v) => update(r.key, { accountId: v })} options={accountOptions} placeholder="Search ledger…" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input className={cell} placeholder="Line narration" value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} />
                      </td>
                      {showCostCentres && (
                        <td className="px-2 py-1.5">
                          <SearchSelect size="sm" aria-label={`Cost centre ${idx + 1}`} value={r.costCentreId} onChange={(v) => update(r.key, { costCentreId: v })} options={costCentreOptions} placeholder={mandatoryDims.length ? 'Required' : 'Optional'} />
                        </td>
                      )}
                      {isInvoice ? (
                        <>
                          <td className="px-2 py-1.5"><input className={`${cell} text-right`} type="number" step="any" min="0" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} /></td>
                          <td className="px-2 py-1.5"><input className={`${cell} text-right`} type="number" step="0.01" min="0" value={r.unitPrice} onChange={(e) => update(r.key, { unitPrice: e.target.value })} /></td>
                          <td className="px-2 py-1.5"><input className={`${cell} text-right`} type="number" step="0.01" min="0" max="100" value={r.discountPct} onChange={(e) => update(r.key, { discountPct: e.target.value })} /></td>
                          <td className="px-2 py-1.5">
                            <select className={cell} value={r.taxRateId} onChange={(e) => update(r.key, { taxRateId: e.target.value })}>
                              <option value="">No tax</option>
                              {taxOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-2 text-right font-mono tabular-nums text-frost">{fmtMoney(lineTotal)}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-1.5">
                            <select
                              className={`${cell} text-center font-semibold ${r.drCr === 'DR' ? 'text-success' : 'text-warning'}`}
                              value={r.drCr}
                              onChange={(e) => update(r.key, { drCr: e.target.value as 'DR' | 'CR' })}
                              onKeyDown={(e) => { if (e.key === 'd' || e.key === 'D') update(r.key, { drCr: 'DR' }); if (e.key === 'c' || e.key === 'C') update(r.key, { drCr: 'CR' }); }}
                            >
                              <option value="DR">Dr</option>
                              <option value="CR">Cr</option>
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <input className={`${cell} text-right font-mono tabular-nums`} type="number" step="0.01" min="0" placeholder="0.00" value={r.amount} onChange={(e) => update(r.key, { amount: e.target.value })} />
                          </td>
                        </>
                      )}
                      <td className="px-2 py-1.5">
                        <button type="button" tabIndex={-1} aria-label="Remove line" onClick={() => removeRow(r.key)} disabled={rows.length <= 1}
                          className="rounded p-1.5 text-dim hover:bg-hover hover:text-danger disabled:opacity-30">
                          <IconTrash size={16} stroke={1.6} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-4 py-3">
            <Button type="button" variant="ghost" onClick={addRow}><IconPlus size={16} stroke={1.6} /> Add line</Button>
            {isInvoice ? (
              <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm">
                <dt className="text-dim">Subtotal</dt><dd className="text-right font-mono tabular-nums text-frost">{fmtMoney(totals.subtotal)}</dd>
                <dt className="text-dim">VAT</dt><dd className="text-right font-mono tabular-nums text-frost">{fmtMoney(totals.tax)}</dd>
                <dt className="font-semibold text-frost">Total</dt><dd className="text-right font-mono text-base font-bold tabular-nums text-frost">{fmtMoney(totals.grand)}</dd>
              </dl>
            ) : (
              <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm">
                <dt className="text-dim">Debit</dt><dd className="text-right font-mono tabular-nums text-frost">{fmtMoney(totals.debit)}</dd>
                <dt className="text-dim">Credit</dt><dd className="text-right font-mono tabular-nums text-frost">{fmtMoney(totals.credit)}</dd>
                <dt className={`font-semibold ${totals.balanced ? 'text-success' : 'text-danger'}`}>{totals.balanced ? 'Balanced' : 'Difference'}</dt>
                <dd className={`text-right font-mono font-bold tabular-nums ${totals.balanced ? 'text-success' : 'text-danger'}`}>{totals.balanced ? '✓' : fmtMoney(Math.abs(difference))}</dd>
              </dl>
            )}
          </div>
        </Card>

        {error && <div className="mt-4"><Alert kind="error">{error}</Alert></div>}
        {notice && <div className="mt-4"><Alert kind="success">{notice}</Alert></div>}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/accounting/vouchers')}><IconFileText size={16} stroke={1.6} /> Register</Button>
          <Button type="button" variant="secondary" loading={saving === 'draft'} disabled={!!saving || loadingRef} onClick={() => void submit(true)}>
            <IconDeviceFloppy size={16} stroke={1.6} /> Save draft
          </Button>
          <Button type="submit" loading={saving === 'post'} disabled={!!saving || loadingRef}>
            <IconSend size={16} stroke={1.6} /> {editing ? 'Post draft' : 'Save & post'} <span className="ml-1 hidden text-xs opacity-70 sm:inline">Ctrl+A</span>
          </Button>
        </div>
      </form>
    </AppShell>
  );
}

const cell = 'w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-frost placeholder:text-dim focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25';

function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}
