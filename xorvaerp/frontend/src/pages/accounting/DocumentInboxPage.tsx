import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  IconUpload, IconSparkles, IconCheck, IconX, IconChevronLeft, IconFileInvoice, IconExternalLink,
  IconPencil, IconLink, IconSearch, IconAlertTriangle,
} from '@tabler/icons-react';
import { AxiosError } from 'axios';
import {
  ledgerApi, fmtDate, fmtMoney,
  type DocumentKind, type InboxDocument, type InboxDocumentDetail, type InboxDocumentStatus, type InboxList,
  type VoucherRegisterRow, type ExtractedInvoice,
} from '../../api/ledger.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, Field, Modal, SelectField, Spinner } from '../../components/ui';
import { Pill, EmptyHint } from '../../components/dashboard-ui';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

const STATUS_TONE: Record<InboxDocumentStatus, 'neutral' | 'brand' | 'ok' | 'warn' | 'bad'> = {
  Pending: 'neutral', Processing: 'brand', Extracted: 'warn', Accepted: 'ok', Rejected: 'neutral', Failed: 'bad',
};
const KINDS: DocumentKind[] = ['PurchaseInvoice', 'SalesInvoice', 'Receipt', 'Other'];
const KIND_LABEL: Record<DocumentKind, string> = { PurchaseInvoice: 'Purchase invoice', SalesInvoice: 'Sales invoice', Receipt: 'Receipt', Other: 'Other' };
const HEADER_FIELDS: { name: string; label: string; type?: 'date' | 'number' }[] = [
  { name: 'supplier_name', label: 'Supplier' }, { name: 'supplier_trn', label: 'Supplier TRN' },
  { name: 'buyer_name', label: 'Buyer' }, { name: 'buyer_trn', label: 'Buyer TRN' },
  { name: 'invoice_number', label: 'Invoice no.' }, { name: 'invoice_date', label: 'Invoice date', type: 'date' },
  { name: 'due_date', label: 'Due date', type: 'date' }, { name: 'currency', label: 'Currency' },
  { name: 'place_of_supply', label: 'Place of supply' },
  { name: 'subtotal', label: 'Subtotal', type: 'number' }, { name: 'tax_total', label: 'VAT', type: 'number' }, { name: 'grand_total', label: 'Grand total', type: 'number' },
];
const confTone = (c: number | undefined | null): 'ok' | 'warn' | 'bad' => (c ?? 0) >= 0.85 ? 'ok' : (c ?? 0) >= 0.6 ? 'warn' : 'bad';

/** What the voucher screen receives when the user clicks “Create voucher from extraction”. */
export interface VoucherPrefill {
  documentId: string;
  voucherType: 'PurchaseBill' | 'SalesInvoice';
  voucherDate?: string;
  dueDate?: string;
  reference?: string;
  narration?: string;
  contactId?: string;
  placeOfSupply?: string;
  lines: { accountId?: string; productId?: string; description: string; quantity: number; unitPrice: number; taxRate?: number }[];
}

export default function DocumentInboxPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [list, setList] = useState<InboxList | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<InboxDocumentStatus | ''>((params.get('status') as InboxDocumentStatus | null) ?? '');
  const [kind, setKind] = useState<DocumentKind | ''>('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList((await ledgerApi.listDocuments({ companyId, status, kind, search: debounced, limit: 100 })).data.data ?? null); }
    catch (e) { toast.error(err(e, 'Failed to load the inbox.')); }
    finally { setLoading(false); }
  }, [companyId, status, kind, debounced, toast]);
  useEffect(() => { void load(); }, [load]);

  // ── upload ──
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadKind, setUploadKind] = useState<DocumentKind>('PurchaseInvoice');
  const [uploading, setUploading] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let lastId: string | null = null;
    try {
      for (const f of Array.from(files)) {
        const r = (await ledgerApi.uploadDocument({ file: f, companyId, documentKind: uploadKind, extractNow: true })).data;
        lastId = r.data?.document.id ?? null;
        if (r.message) toast.success(r.message);
      }
      await load();
      if (files.length === 1 && lastId) setParams({ doc: lastId });
    } catch (e) { toast.error(err(e, 'Upload failed.')); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  // ── review ──
  const docId = params.get('doc');
  const [detail, setDetail] = useState<InboxDocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editField, setEditField] = useState<{ name: string; label: string; value: string; type?: 'date' | 'number' } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try { setDetail((await ledgerApi.getDocument(id, companyId)).data.data ?? null); }
    catch (e) { toast.error(err(e, 'Document not found.')); setParams({}); }
    finally { setDetailLoading(false); }
  }, [companyId, toast, setParams]);

  useEffect(() => {
    if (!docId) { setDetail(null); return; }
    void loadDetail(docId);
  }, [docId, loadDetail]);

  // Poll while Gemini is working.
  useEffect(() => {
    if (!detail || (detail.document.status !== 'Processing' && detail.document.status !== 'Pending')) return;
    const t = setTimeout(() => void loadDetail(detail.document.id), 3000);
    return () => clearTimeout(t);
  }, [detail, loadDetail]);

  useEffect(() => {
    if (!docId) { setFileUrl(null); return; }
    let url: string | null = null;
    let cancelled = false;
    ledgerApi.fetchDocumentFile(docId, companyId)
      .then((r) => { if (cancelled) return; url = URL.createObjectURL(r.data); setFileUrl(url); })
      .catch(() => { if (!cancelled) setFileUrl(null); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [docId, companyId]);

  const extraction = detail?.extraction ?? null;
  const data: ExtractedInvoice = useMemo(() => extraction?.extractedData ?? {}, [extraction]);
  const fieldMap = useMemo(() => Object.fromEntries((extraction?.fields ?? []).map((f) => [f.fieldName, f])), [extraction]);
  const finalValue = (name: string) => fieldMap[name]?.finalValue ?? fieldMap[name]?.extractedValue ?? (data as unknown as Record<string, unknown>)[name]?.toString() ?? '';

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) toast.success(ok); if (docId) await loadDetail(docId); await load(); }
    catch (e) { toast.error(err(e, 'Action failed.')); }
    finally { setBusy(null); }
  };

  const saveField = async () => {
    if (!editField || !detail) return;
    await run('field', () => ledgerApi.overrideField(detail.document.id, editField.name, editField.value || null, companyId), 'Field updated.');
    setEditField(null);
  };

  const createVoucher = () => {
    if (!detail) return;
    const kindOut = detail.document.documentKind === 'SalesInvoice';
    const prefill: VoucherPrefill = {
      documentId: detail.document.id,
      voucherType: kindOut ? 'SalesInvoice' : 'PurchaseBill',
      voucherDate: finalValue('invoice_date') || undefined,
      dueDate: finalValue('due_date') || undefined,
      reference: finalValue('invoice_number') || undefined,
      narration: `${kindOut ? 'Invoice to' : 'Bill from'} ${finalValue(kindOut ? 'buyer_name' : 'supplier_name') || 'party'}${finalValue('invoice_number') ? ` #${finalValue('invoice_number')}` : ''}`,
      contactId: data.matched_party_id ?? undefined,
      placeOfSupply: finalValue('place_of_supply') || undefined,
      lines: (data.line_items ?? []).map((li, i) => ({
        accountId: li.matched_account_id ?? undefined,
        productId: li.matched_item_id ?? undefined,
        description: fieldMap[`line_items[${i}].description`]?.finalValue ?? li.description ?? '',
        quantity: li.quantity && li.quantity > 0 ? li.quantity : 1,
        unitPrice: li.unit_price ?? (li.amount && li.quantity ? li.amount / li.quantity : li.amount ?? 0),
        taxRate: li.tax_rate ?? undefined,
      })),
    };
    navigate('/accounting/vouchers/new', { state: { prefill } });
  };

  const counts = list?.statusCounts ?? {};

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[26px] font-semibold tracking-tight text-frost">Document inbox</h1>
          <p className="mt-1 text-sm text-frost-dim">Drop supplier invoices and receipts — Gemini extracts the fields, you review, and a voucher is one click away.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {docId && <Button variant="ghost" onClick={() => setParams({})}><IconChevronLeft size={16} /> Inbox</Button>}
          <div className="w-44"><SelectField value={uploadKind} onChange={(e) => setUploadKind(e.target.value as DocumentKind)} options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} /></div>
          <Button loading={uploading} onClick={() => fileRef.current?.click()}><IconUpload size={18} stroke={1.6} /> Upload</Button>
          <input ref={fileRef} type="file" multiple accept=".pdf,image/*" className="hidden" onChange={(e) => void upload(e.target.files)} />
        </div>
      </div>

      {!docId ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {(['', 'Pending', 'Processing', 'Extracted', 'Accepted', 'Rejected', 'Failed'] as const).map((s) => (
              <button key={s || 'all'} type="button" onClick={() => setStatus(s)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${status === s ? 'bg-brand-weak text-frost' : 'text-frost-dim hover:bg-hover'}`}>
                {s || 'All'}<span className="rounded-full bg-surface px-1.5 text-[11px] text-dim">{s ? counts[s] ?? 0 : Object.values(counts).reduce((a, b) => a + b, 0)}</span>
              </button>
            ))}
            <span className="flex-1" />
            <div className="w-44"><SelectField value={kind} onChange={(e) => setKind(e.target.value as DocumentKind | '')} options={[{ value: '', label: 'All kinds' }, ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))]} /></div>
            <div className="w-64"><Field placeholder="Search file, supplier, invoice no." icon={<IconSearch size={16} />} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files); }}
          >
            <Card className="overflow-hidden p-0">
              {loading && !list ? <div className="flex justify-center py-16"><Spinner /></div> : !list || list.rows.length === 0 ? (
                <EmptyHint>Nothing here. Drag PDFs or photos onto this table, or use <strong>Upload</strong>.</EmptyHint>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border">
                    <tr><th className="px-4 py-3">Document</th><th className="px-4 py-3">Kind</th><th className="px-4 py-3">Supplier / invoice</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Confidence</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Voucher</th><th className="px-4 py-3">Uploaded</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {list.rows.map((d: InboxDocument) => (
                      <tr key={d.id} className="cursor-pointer hover:bg-hover" onClick={() => setParams({ doc: d.id })}>
                        <td className="max-w-[260px] px-4 py-3"><div className="flex items-center gap-2 text-frost"><IconFileInvoice size={16} className="shrink-0 text-dim" /><span className="truncate" title={d.fileName}>{d.fileName}</span></div><div className="text-[11px] text-dim">{d.mimeType}{d.pageCount ? ` · ${d.pageCount}p` : ''}{d.fileSize ? ` · ${(d.fileSize / 1024).toFixed(0)} KB` : ''}</div></td>
                        <td className="px-4 py-3 text-frost-dim">{KIND_LABEL[d.documentKind]}</td>
                        <td className="px-4 py-3 text-frost">{d.supplierName ?? <span className="text-dim">—</span>}{d.invoiceNumber && <div className="font-mono text-xs text-dim">{d.invoiceNumber}</div>}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-frost">{d.grandTotal != null ? fmtMoney(d.grandTotal) : ''}</td>
                        <td className="px-4 py-3">{d.confidenceScore != null && <Pill tone={confTone(d.confidenceScore)}>{Math.round(d.confidenceScore * 100)}%</Pill>}</td>
                        <td className="px-4 py-3"><Pill tone={STATUS_TONE[d.status]}>{d.status}</Pill></td>
                        <td className="px-4 py-3 font-mono text-xs text-frost-dim">{d.createdVoucherNumber ?? ''}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-dim">{fmtDate(d.uploadedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </>
      ) : detailLoading && !detail ? <div className="flex justify-center py-16"><Spinner /></div> : detail && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          {/* Preview */}
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-frost" title={detail.document.fileName}>{detail.document.fileName}</p><p className="text-[11px] text-dim">{KIND_LABEL[detail.document.documentKind]} · uploaded {fmtDate(detail.document.uploadedAt)}</p></div>
              {fileUrl && <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><IconExternalLink size={14} /> Open</a>}
            </div>
            <div className="h-[70vh] bg-surface/40">
              {!fileUrl ? <div className="flex h-full items-center justify-center"><Spinner /></div>
                : detail.document.mimeType.startsWith('image/') ? <img src={fileUrl} alt={detail.document.fileName} className="mx-auto h-full object-contain" />
                : <iframe title="document" src={fileUrl} className="h-full w-full" />}
            </div>
          </Card>

          {/* Extraction review */}
          <div className="space-y-4">
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={STATUS_TONE[detail.document.status]}>{detail.document.status}</Pill>
                {extraction && <Pill tone={confTone(extraction.confidenceScore)}>{Math.round(extraction.confidenceScore * 100)}% · {extraction.confidenceLevel}</Pill>}
                {extraction && <span className="text-xs text-dim">{extraction.modelUsed}{extraction.processingTimeMs ? ` · ${(extraction.processingTimeMs / 1000).toFixed(1)}s` : ''}</span>}
                <span className="flex-1" />
                {detail.document.status !== 'Accepted' && detail.document.status !== 'Processing' && (
                  <Button variant="secondary" loading={busy === 'extract'} disabled={!detail.extractionAvailable}
                    title={detail.extractionAvailable ? undefined : 'Gemini is not configured on the server (Gemini:ApiKey).'}
                    onClick={() => void run('extract', () => ledgerApi.extractDocument(detail.document.id, companyId), 'Extraction started.')}>
                    <IconSparkles size={16} stroke={1.6} /> {extraction ? 'Re-extract' : 'Extract with AI'}
                  </Button>
                )}
              </div>
              {detail.document.statusMessage && <p className="mt-2 text-sm text-frost-dim">{detail.document.statusMessage}</p>}
              {!detail.extractionAvailable && !extraction && (
                <div className="mt-3"><Alert kind="error"><IconAlertTriangle size={14} className="mr-1 inline" /> AI extraction is unavailable — set <code>Gemini:ApiKey</code> in the API configuration. You can still link this document to a voucher manually.</Alert></div>
              )}
              {detail.document.createdVoucherNumber && (
                <p className="mt-3 text-sm text-success"><IconCheck size={14} className="mr-1 inline" /> Linked to voucher <span className="font-mono">{detail.document.createdVoucherNumber}</span>.</p>
              )}
            </Card>

            {extraction && (
              <>
                <Card className="overflow-hidden p-0">
                  <p className="border-b border-border px-4 py-2 label-mono text-dim">Header & totals — click a value to correct it</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2">
                    {HEADER_FIELDS.map((f) => {
                      const s = fieldMap[f.name];
                      const val = finalValue(f.name);
                      const overridden = s?.userOverride != null;
                      return (
                        <button key={f.name} type="button" disabled={detail.document.status === 'Accepted'}
                          onClick={() => setEditField({ name: f.name, label: f.label, value: val, type: f.type })}
                          className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 text-left hover:bg-hover disabled:cursor-default disabled:hover:bg-transparent">
                          <span className="text-xs text-dim">{f.label}</span>
                          <span className="flex items-center gap-2">
                            <span className={`text-sm ${val ? 'text-frost' : 'text-dim'} ${f.type === 'number' ? 'font-mono tabular-nums' : ''}`}>{val ? (f.type === 'number' ? fmtMoney(parseFloat(val)) : val) : '—'}</span>
                            {overridden ? <Pill tone="brand"><IconPencil size={10} /> edited</Pill> : s && <span className={`h-2 w-2 rounded-full ${confTone(s.confidence) === 'ok' ? 'bg-success' : confTone(s.confidence) === 'warn' ? 'bg-warning' : 'bg-danger'}`} title={`${Math.round(s.confidence * 100)}% confidence`} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Card>

                <Card className="overflow-hidden p-0">
                  <p className="border-b border-border px-4 py-2 label-mono text-dim">Line items ({data.line_items?.length ?? 0})</p>
                  {(data.line_items ?? []).length === 0 ? <EmptyHint>No line items detected.</EmptyHint> : (
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border"><tr><th className="px-4 py-2">Description</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">VAT %</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Match</th></tr></thead>
                      <tbody className="divide-y divide-border">
                        {(data.line_items ?? []).map((li, i) => (
                          <tr key={i} className="hover:bg-hover">
                            <td className="px-4 py-1.5 text-frost">
                              <button type="button" className="text-left hover:underline" disabled={detail.document.status === 'Accepted'}
                                onClick={() => setEditField({ name: `line_items[${i}].description`, label: `Line ${i + 1} description`, value: fieldMap[`line_items[${i}].description`]?.finalValue ?? li.description ?? '' })}>
                                {fieldMap[`line_items[${i}].description`]?.finalValue ?? li.description ?? '—'}
                              </button>
                            </td>
                            <td className="px-4 py-1.5 text-right font-mono tabular-nums text-frost-dim">{li.quantity ?? ''}</td>
                            <td className="px-4 py-1.5 text-right font-mono tabular-nums text-frost-dim">{li.unit_price != null ? fmtMoney(li.unit_price) : ''}</td>
                            <td className="px-4 py-1.5 text-right font-mono tabular-nums text-frost-dim">{li.tax_rate ?? ''}</td>
                            <td className="px-4 py-1.5 text-right font-mono tabular-nums text-frost">{li.amount != null ? fmtMoney(li.amount) : ''}</td>
                            <td className="px-4 py-1.5 text-xs">{li.matched_item_id ? <Pill tone="ok">item</Pill> : li.matched_account_id ? <Pill tone="brand">ledger</Pill> : <span className="text-dim">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              </>
            )}

            {detail.document.status !== 'Accepted' && detail.document.status !== 'Rejected' && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => { setRejectReason(''); setRejectOpen(true); }}><IconX size={16} /> Reject</Button>
                <Button variant="secondary" onClick={() => setLinkOpen(true)}><IconLink size={16} /> Link existing voucher</Button>
                <Button disabled={!extraction} onClick={createVoucher}><IconFileInvoice size={16} /> Create voucher from extraction</Button>
              </div>
            )}
            {detail.document.status === 'Rejected' && <Alert kind="error">Rejected{detail.document.statusMessage ? ` — ${detail.document.statusMessage}` : ''}. <button type="button" className="underline" onClick={() => void run('extract', () => ledgerApi.extractDocument(detail.document.id, companyId))}>Re-open by re-extracting</button>.</Alert>}
          </div>
        </div>
      )}

      {/* Field override */}
      <Modal open={!!editField} title={editField ? `Correct: ${editField.label}` : ''} onClose={() => setEditField(null)}>
        {editField && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void saveField(); }}>
            <Field label={editField.label} type={editField.type === 'number' ? 'number' : editField.type === 'date' ? 'date' : 'text'} step={editField.type === 'number' ? '0.01' : undefined} autoFocus value={editField.value} onChange={(e) => setEditField({ ...editField, value: e.target.value })} />
            {fieldMap[editField.name]?.extractedValue && <p className="text-xs text-dim">AI read: <span className="text-frost-dim">{fieldMap[editField.name].extractedValue}</span> ({Math.round((fieldMap[editField.name].confidence ?? 0) * 100)}%)</p>}
            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => { setEditField({ ...editField, value: '' }); }}>Clear override</Button>
              <div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => setEditField(null)}>Cancel</Button><Button type="submit" loading={busy === 'field'}>Save</Button></div>
            </div>
          </form>
        )}
      </Modal>

      {/* Link existing voucher */}
      {detail && <LinkVoucherModal open={linkOpen} onClose={() => setLinkOpen(false)} companyId={companyId} busy={busy === 'accept'}
        onPick={(v) => void run('accept', () => ledgerApi.acceptDocument(detail.document.id, v.id, companyId), `Linked to ${v.voucherNumber}.`).then(() => setLinkOpen(false))} />}

      {/* Reject */}
      <Modal open={rejectOpen} title="Reject document" onClose={() => setRejectOpen(false)}>
        <div className="space-y-4">
          <Field label="Reason (optional)" placeholder="Duplicate, not an invoice, unreadable…" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={busy === 'reject'} onClick={() => detail && void run('reject', () => ledgerApi.rejectDocument(detail.document.id, rejectReason || undefined, companyId), 'Document rejected.').then(() => setRejectOpen(false))}>Reject</Button></div>
        </div>
      </Modal>
    </AppShell>
  );
}

function LinkVoucherModal({ open, onClose, companyId, onPick, busy }: { open: boolean; onClose: () => void; companyId?: string; onPick: (v: VoucherRegisterRow) => void; busy: boolean }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<VoucherRegisterRow[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try { setRows(((await ledgerApi.listVouchers({ companyId, search: q.trim(), limit: 20 })).data.data?.rows ?? []).filter((r) => r.status !== 'Cancelled' && r.status !== 'Reversed')); }
      catch { setRows([]); }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [open, q, companyId]);
  return (
    <Modal open={open} title="Link to an existing voucher" onClose={onClose} size="xl">
      <div className="space-y-3">
        <Field placeholder="Voucher number, reference, narration…" icon={<IconSearch size={16} />} autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-80 overflow-auto rounded-lg border border-border">
          {loading ? <div className="flex justify-center py-8"><Spinner /></div> : rows.length === 0 ? <EmptyHint>No vouchers found.</EmptyHint> : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id}>
                  <button type="button" disabled={busy} onClick={() => onPick(r)} className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-hover">
                    <span><span className="font-mono text-frost">{r.voucherNumber}</span> <span className="text-frost-dim">{r.contactName ?? ''}</span><div className="text-xs text-dim">{fmtDate(r.voucherDate)} · {r.voucherType} · {r.status}</div></span>
                    <span className="font-mono tabular-nums text-frost">{fmtMoney(r.totalAmount)} <span className="text-xs text-dim">{r.currency}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
