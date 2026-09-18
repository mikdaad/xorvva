import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconPlus, IconFileTypePdf, IconFileSpreadsheet, IconArrowBackUp, IconBan, IconPencil, IconSearch, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type Contact } from '../../api/accounting.api';
import {
  ledgerApi, fmtDate, fmtMoney, VOUCHER_STATUS_TONE,
  type Voucher, type VoucherRegister, type VoucherStatus, type VoucherType, type VoucherTypeInfo,
} from '../../api/ledger.api';
import type { ApiResponse } from '../../api/auth.api';
import { useReportScope } from '../../components/accounting/useReportScope';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Field, Modal, SelectField, Spinner } from '../../components/ui';
import { Pill, StatTile } from '../../components/dashboard-ui';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};
const STATUSES: VoucherStatus[] = ['Draft', 'Submitted', 'Posted', 'Reversed', 'Cancelled'];
const PAGE = 50;

const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

export default function VoucherRegisterPage() {
  const { companyId, scopeControl } = useReportScope();
  const toast = useToast();
  const navigate = useNavigate();

  const [types, setTypes] = useState<VoucherTypeInfo[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState('');
  const [type, setType] = useState<VoucherType | ''>('');
  const [status, setStatus] = useState<VoucherStatus | ''>('');
  const [contactId, setContactId] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [offset, setOffset] = useState(0);

  const [data, setData] = useState<VoucherRegister | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'Pdf' | 'Xlsx' | null>(null);
  const [detail, setDetail] = useState<Voucher | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reversing, setReversing] = useState<Voucher | null>(null);
  const [cancelling, setCancelling] = useState<Voucher | null>(null);
  const [reason, setReason] = useState('');
  const [reversalDate, setReversalDate] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setOffset(0); }, [from, to, type, status, contactId, debounced, companyId]);

  useEffect(() => {
    ledgerApi.voucherTypes().then((r) => setTypes(r.data.data ?? [])).catch(() => undefined);
    accountingApi.listContacts(companyId).then((r) => setContacts(r.data.data ?? [])).catch(() => undefined);
  }, [companyId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await ledgerApi.listVouchers({ companyId, from, to, type, status, contactId, search: debounced, limit: PAGE, offset });
      setData(r.data.data ?? null);
    } catch (e) { toast.error(err(e, 'Failed to load the voucher register.')); }
    finally { setLoading(false); }
  }, [companyId, from, to, type, status, contactId, debounced, offset, toast]);

  useEffect(() => { void load(); }, [load]);

  const typeLabel = useMemo(() => Object.fromEntries(types.map((t) => [t.type, t.label])) as Record<string, string>, [types]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try { setDetail((await ledgerApi.getVoucher(id, companyId)).data.data ?? null); }
    catch (e) { toast.error(err(e, 'Failed to load voucher.')); }
    finally { setDetailLoading(false); }
  };

  const doExport = async (format: 'Pdf' | 'Xlsx') => {
    setExporting(format);
    try { await ledgerApi.exportReport({ reportType: 'Transactions', format, companyId, from, to, voucherType: type, status, contactId, search: debounced }); }
    catch (e) { toast.error(err(e, 'Export failed.')); }
    finally { setExporting(null); }
  };

  const doReverse = async () => {
    if (!reversing) return;
    setBusy(true);
    try {
      const r = (await ledgerApi.reverseVoucher(reversing.id, { companyId, reason: reason.trim(), reversalDate: reversalDate || undefined })).data;
      toast.success(r.pendingApproval ? (r.message ?? 'Reversal submitted for approval.') : `Reversed ${reversing.voucherNumber}.`);
      setReversing(null); setReason(''); setReversalDate(''); setDetail(null);
      await load();
    } catch (e) { toast.error(err(e, 'Reversal failed.')); }
    finally { setBusy(false); }
  };

  const doCancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    try {
      await ledgerApi.cancelVoucher(cancelling.id, companyId);
      toast.success(`Cancelled ${cancelling.voucherNumber}.`);
      setCancelling(null); setDetail(null);
      await load();
    } catch (e) { toast.error(err(e, 'Cancel failed.')); }
    finally { setBusy(false); }
  };

  const rows = data?.rows ?? [];
  const total = data?.totalCount ?? 0;
  const pageNo = Math.floor(offset / PAGE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-frost">Voucher register</h1>
          <p className="mt-1 text-sm text-frost-dim">Every voucher across all types — drill into lines, reverse, or export.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {scopeControl}
          <Button variant="secondary" loading={exporting === 'Pdf'} disabled={!!exporting} onClick={() => void doExport('Pdf')}><IconFileTypePdf size={16} stroke={1.6} /> PDF</Button>
          <Button variant="secondary" loading={exporting === 'Xlsx'} disabled={!!exporting} onClick={() => void doExport('Xlsx')}><IconFileSpreadsheet size={16} stroke={1.6} /> Excel</Button>
          <Button onClick={() => navigate('/accounting/vouchers/new')}><IconPlus size={18} stroke={1.6} /> New voucher</Button>
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatTile label="Vouchers" value={loading && !data ? '…' : total.toLocaleString()} hint={`page ${pageNo} of ${pages}`} />
        <StatTile label="Total (base)" value={fmtMoney(data?.totalBaseAmount)} hint="sum of filtered vouchers" tone="success" />
        <StatTile label="Filters" value={[type && typeLabel[type], status, contactId && 'party', debounced && 'search'].filter(Boolean).length} hint="active" tone="warning" />
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Field label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value as VoucherType | '')}
            options={[{ value: '', label: 'All types' }, ...types.map((t) => ({ value: t.type, label: t.label }))]} />
          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as VoucherStatus | '')}
            options={[{ value: '', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: s }))]} />
          <SelectField label="Party" value={contactId} onChange={(e) => setContactId(e.target.value)}
            options={[{ value: '', label: 'Any party' }, ...contacts.map((c) => ({ value: c.id, label: c.name }))]} />
          <Field label="Search" placeholder="Number, reference, narration" icon={<IconSearch size={16} />} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {loading && !data ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-dim">No vouchers match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-dim">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Voucher</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Party</th>
                  <th className="px-4 py-2.5">Reference / narration</th>
                  <th className="px-4 py-2.5">Journal</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-hover" onClick={() => void openDetail(r.id)}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-frost-dim">{fmtDate(r.voucherDate)}</td>
                    <td className="px-4 py-2.5 font-mono text-frost">{r.voucherNumber}</td>
                    <td className="px-4 py-2.5 text-frost-dim">{typeLabel[r.voucherType] ?? r.voucherType}</td>
                    <td className="px-4 py-2.5 text-frost">{r.contactName ?? <span className="text-dim">—</span>}</td>
                    <td className="max-w-[260px] truncate px-4 py-2.5 text-frost-dim" title={r.narration ?? ''}>{r.reference ? <span className="text-frost">{r.reference}</span> : null}{r.reference && r.narration ? ' · ' : ''}{r.narration}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-dim">{r.entryNumber ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums text-frost">
                      {fmtMoney(r.totalAmount)} <span className="text-xs text-dim">{r.currency}</span>
                    </td>
                    <td className="px-4 py-2.5"><Pill tone={VOUCHER_STATUS_TONE[r.status]}>{r.status}</Pill></td>
                    <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      {r.status === 'Draft' && (
                        <Link to={`/accounting/vouchers/${r.id}/edit`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><IconPencil size={14} /> Edit</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-frost-dim">
            <span>Showing {offset + 1}–{Math.min(offset + PAGE, total)} of {total.toLocaleString()}</span>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={offset === 0 || loading} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}><IconChevronLeft size={16} /> Prev</Button>
              <Button variant="ghost" disabled={offset + PAGE >= total || loading} onClick={() => setOffset((o) => o + PAGE)}>Next <IconChevronRight size={16} /></Button>
            </div>
          </div>
        )}
      </Card>

      {/* Detail modal */}
      <Modal open={!!detail || detailLoading} title={detail ? `${typeLabel[detail.voucherType] ?? detail.voucherType} ${detail.voucherNumber}` : 'Loading…'} onClose={() => setDetail(null)} size="3xl">
        {detailLoading || !detail ? <div className="flex justify-center py-10"><Spinner /></div> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={VOUCHER_STATUS_TONE[detail.status]}>{detail.status}</Pill>
              <span className="text-sm text-frost-dim">{fmtDate(detail.voucherDate)}</span>
              {detail.contactName && <span className="text-sm text-frost">· {detail.contactName}</span>}
              {detail.entryNumber && <span className="font-mono text-xs text-dim">· journal {detail.entryNumber}</span>}
              {detail.reversalOfId && <Pill tone="neutral">Reversal</Pill>}
              {detail.reversedById && <Pill tone="neutral">Reversed</Pill>}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <dt className="text-dim">Reference</dt><dd className="text-frost">{detail.reference || '—'}</dd>
              <dt className="text-dim">Currency</dt><dd className="text-frost">{detail.currency} @ {detail.exchangeRate}</dd>
              {detail.dueDate && <><dt className="text-dim">Due</dt><dd className="text-frost">{fmtDate(detail.dueDate)}</dd></>}
              {detail.placeOfSupply && <><dt className="text-dim">Place of supply</dt><dd className="text-frost">{detail.placeOfSupply}</dd></>}
              <dt className="text-dim">Narration</dt><dd className="col-span-3 text-frost">{detail.narration || '—'}</dd>
              {detail.reversalReason && <><dt className="text-dim">Reversal reason</dt><dd className="col-span-3 text-frost">{detail.reversalReason}</dd></>}
            </dl>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-dim">
                  <tr>
                    <th className="px-3 py-2">#</th><th className="px-3 py-2">Ledger</th><th className="px-3 py-2">Narration</th><th className="px-3 py-2">Cost centre</th>
                    <th className="px-3 py-2 text-right">Qty × rate</th><th className="px-3 py-2 text-right">Tax</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {detail.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-1.5 text-xs text-dim">{l.lineNumber}</td>
                      <td className="px-3 py-1.5 text-frost"><span className="font-mono text-xs text-dim">{l.accountCode}</span> {l.accountName}</td>
                      <td className="px-3 py-1.5 text-frost-dim">{l.description}</td>
                      <td className="px-3 py-1.5 text-frost-dim">{l.costCentreName ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-frost-dim">{l.quantity !== 1 || l.unitPrice !== l.lineAmount ? `${l.quantity} × ${fmtMoney(l.unitPrice)}` : ''}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-frost-dim">{l.taxAmount ? fmtMoney(l.taxAmount) : ''}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-frost">{l.drCr === 'DR' ? fmtMoney(l.lineTotal) : ''}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-frost">{l.drCr === 'CR' ? fmtMoney(l.lineTotal) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border text-sm font-semibold">
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-frost-dim">Subtotal {fmtMoney(detail.subTotal)} · VAT {fmtMoney(detail.taxTotal)}</td>
                    <td colSpan={3} className="px-3 py-2 text-right font-mono tabular-nums text-frost">Total {fmtMoney(detail.totalAmount)} {detail.currency}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {detail.status === 'Draft' && <Button variant="secondary" onClick={() => navigate(`/accounting/vouchers/${detail.id}/edit`)}><IconPencil size={16} /> Edit draft</Button>}
              {(detail.status === 'Draft' || detail.status === 'Submitted') && <Button variant="danger" onClick={() => setCancelling(detail)}><IconBan size={16} /> Cancel voucher</Button>}
              {detail.status === 'Posted' && !detail.reversedById && <Button variant="danger" onClick={() => { setReversing(detail); setReversalDate(''); setReason(''); }}><IconArrowBackUp size={16} /> Reverse</Button>}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!reversing} title={`Reverse ${reversing?.voucherNumber ?? ''}`} onClose={() => setReversing(null)}>
        <div className="space-y-4">
          <p className="text-sm text-frost-dim">A mirror-image voucher will be posted and the original marked Reversed. The ledger stays immutable — nothing is deleted.</p>
          <Field label="Reason" required placeholder="Why is this voucher being reversed?" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Field label="Reversal date (optional)" type="date" value={reversalDate} onChange={(e) => setReversalDate(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReversing(null)}>Keep</Button>
            <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={() => void doReverse()}>Reverse voucher</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!cancelling} title={`Cancel ${cancelling?.voucherNumber ?? ''}`} onClose={() => setCancelling(null)}>
        <div className="space-y-4">
          <p className="text-sm text-frost-dim">The draft will be marked Cancelled. It was never posted, so no ledger entry is affected.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelling(null)}>Keep</Button>
            <Button variant="danger" loading={busy} onClick={() => void doCancel()}>Cancel voucher</Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
