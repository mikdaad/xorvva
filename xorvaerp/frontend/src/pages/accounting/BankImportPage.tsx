import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  IconUpload, IconFileTypeCsv, IconSparkles, IconLink, IconLinkOff, IconEyeOff, IconChevronLeft,
  IconAdjustments, IconPlus, IconPencil, IconTrash, IconCheck, IconBuildingBank,
} from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type Account, type BankAccount, type Contact } from '../../api/accounting.api';
import {
  ledgerApi, fmtDate, fmtMoney,
  type BankCsvPreview, type BankMatchCandidate, type BankMatchRule, type BankMatchRuleInput, type BankMatchStatus,
  type BankStatement, type BankStatementDetail, type BankStatementLine, type VoucherType, type BankMatchPatternField,
} from '../../api/ledger.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, Field, Modal, SelectField, Spinner } from '../../components/ui';
import { Pill, StatTile, EmptyHint } from '../../components/dashboard-ui';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

const MATCH_TONE: Record<BankMatchStatus, 'neutral' | 'brand' | 'ok' | 'warn' | 'bad'> = { Unmatched: 'warn', Suggested: 'brand', Matched: 'ok', Ignored: 'neutral' };
const IMPORT_TONE: Record<string, 'neutral' | 'brand' | 'ok' | 'warn' | 'bad'> = { Pending: 'neutral', Processing: 'brand', Completed: 'ok', PartiallyCompleted: 'warn', Failed: 'bad' };
const RULE_FIELDS: BankMatchPatternField[] = ['Description', 'Reference', 'ChequeNumber'];
const RULE_VOUCHERS: VoucherType[] = ['Receipt', 'Payment', 'Contra', 'Journal'];

type View = 'list' | 'import' | 'statement' | 'rules';

export default function BankImportPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [view, setView] = useState<View>('list');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankFilter, setBankFilter] = useState('');
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([accountingApi.listBankAccounts(companyId), ledgerApi.listStatements(companyId, bankFilter || undefined)]);
      setBankAccounts((b.data.data ?? []).filter((x) => x.isActive));
      setStatements(s.data.data ?? []);
    } catch (e) { toast.error(err(e, 'Failed to load bank statements.')); }
    finally { setLoading(false); }
  }, [companyId, bankFilter, toast]);
  useEffect(() => { if (view === 'list') void loadList(); }, [view, loadList]);

  // ── statement detail ──
  const [detail, setDetail] = useState<BankStatementDetail | null>(null);
  const [lineFilter, setLineFilter] = useState<BankMatchStatus | ''>('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const openStatement = useCallback(async (id: string, filter: BankMatchStatus | '' = lineFilter) => {
    setDetailLoading(true); setView('statement');
    try { setDetail((await ledgerApi.getStatement(id, companyId, filter)).data.data ?? null); }
    catch (e) { toast.error(err(e, 'Failed to load statement.')); setView('list'); }
    finally { setDetailLoading(false); }
  }, [companyId, lineFilter, toast]);

  const suggest = async () => {
    if (!detail) return;
    setSuggesting(true);
    try {
      const r = (await ledgerApi.suggestMatches(detail.statement.id, companyId)).data;
      toast.success(r.message ?? 'Suggestions refreshed.');
      await openStatement(detail.statement.id);
    } catch (e) { toast.error(err(e, 'Suggestion run failed.')); }
    finally { setSuggesting(false); }
  };

  const lineAction = async (line: BankStatementLine, action: 'unmatch' | 'ignore') => {
    if (!detail) return;
    try {
      if (action === 'unmatch') await ledgerApi.unmatchLine(line.id, companyId); else await ledgerApi.ignoreLine(line.id, companyId);
      await openStatement(detail.statement.id);
    } catch (e) { toast.error(err(e, 'Action failed.')); }
  };

  // ── candidate picker ──
  const [matching, setMatching] = useState<BankStatementLine | null>(null);
  const [candidates, setCandidates] = useState<BankMatchCandidate[] | null>(null);
  const [exactAmount, setExactAmount] = useState(true);
  const [windowDays, setWindowDays] = useState(30);
  const [confirming, setConfirming] = useState<string | null>(null);
  useEffect(() => {
    if (!matching) { setCandidates(null); return; }
    let cancelled = false;
    setCandidates(null);
    ledgerApi.matchCandidates(matching.id, companyId, windowDays, exactAmount)
      .then((r) => { if (!cancelled) setCandidates(r.data.data ?? []); })
      .catch((e) => { if (!cancelled) { toast.error(err(e, 'Could not load candidates.')); setCandidates([]); } });
    return () => { cancelled = true; };
  }, [matching, companyId, windowDays, exactAmount, toast]);

  const confirm = async (c: BankMatchCandidate) => {
    if (!matching || !detail) return;
    setConfirming(c.journalLineId);
    try {
      await ledgerApi.confirmMatch(matching.id, c.journalLineId, companyId);
      toast.success(`Matched to ${c.entryNumber}.`);
      setMatching(null);
      await openStatement(detail.statement.id);
    } catch (e) { toast.error(err(e, 'Match failed.')); }
    finally { setConfirming(null); }
  };

  // ── import wizard ──
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BankCsvPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [impBank, setImpBank] = useState('');
  const [impDate, setImpDate] = useState('');
  const [impOpen, setImpOpen] = useState('');
  const [impClose, setImpClose] = useState('');
  const [impError, setImpError] = useState<string | null>(null);

  const pickFile = async (f: File | null) => {
    setFile(f); setPreview(null); setImpError(null);
    if (!f) return;
    setPreviewing(true);
    try {
      const p = (await ledgerApi.previewStatement(f, companyId)).data.data ?? null;
      setPreview(p);
      if (p && !p.success) setImpError(p.errors.join(' ') || 'Could not parse this file.');
    } catch (e) { setImpError(err(e, 'Preview failed.')); }
    finally { setPreviewing(false); }
  };

  const runImport = async () => {
    if (!file || !impBank) return;
    setImporting(true); setImpError(null);
    try {
      const r = (await ledgerApi.importStatement({ file, bankAccountId: impBank, companyId, statementDate: impDate || undefined, openingBalance: impOpen || undefined, closingBalance: impClose || undefined })).data;
      toast.success(r.message ?? `Imported ${r.data?.statement.lineCount ?? ''} lines.`);
      setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = '';
      if (r.data) { setDetail(r.data); setView('statement'); } else setView('list');
    } catch (e) { setImpError(err(e, 'Import failed.')); }
    finally { setImporting(false); }
  };

  // ── rules ──
  const [rules, setRules] = useState<BankMatchRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [ruleModal, setRuleModal] = useState<(BankMatchRuleInput & { id?: string }) | null>(null);
  const [ruleBusy, setRuleBusy] = useState(false);
  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const [r, a, c] = await Promise.all([ledgerApi.listRules(companyId), accountingApi.listAccounts(companyId, false), accountingApi.listContacts(companyId)]);
      setRules(r.data.data ?? []); setAccounts(a.data.data ?? []); setContacts(c.data.data ?? []);
    } catch (e) { toast.error(err(e, 'Failed to load rules.')); }
    finally { setRulesLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { if (view === 'rules') void loadRules(); }, [view, loadRules]);

  const saveRule = async () => {
    if (!ruleModal) return;
    setRuleBusy(true);
    try {
      await ledgerApi.saveRule({ ...ruleModal, companyId, targetAccountId: ruleModal.targetAccountId || null, targetContactId: ruleModal.targetContactId || null, targetVoucherType: ruleModal.targetVoucherType || null });
      toast.success('Rule saved.'); setRuleModal(null); await loadRules();
    } catch (e) { toast.error(err(e, 'Could not save rule.')); }
    finally { setRuleBusy(false); }
  };
  const deleteRule = async (r: BankMatchRule) => {
    try { await ledgerApi.deleteRule(r.id, companyId); toast.success('Rule deleted.'); await loadRules(); }
    catch (e) { toast.error(err(e, 'Delete failed.')); }
  };

  const accountName = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])) as Record<string, string>, [accounts]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-frost">Bank statements</h1>
          <p className="mt-1 text-sm text-frost-dim">Import CSV statements from UAE banks, auto-suggest matches against the ledger and reconcile line by line.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {view !== 'list' && <Button variant="ghost" onClick={() => { setView('list'); setDetail(null); }}><IconChevronLeft size={16} /> All statements</Button>}
          <Button variant="secondary" onClick={() => setView('rules')}><IconAdjustments size={16} stroke={1.6} /> Matching rules</Button>
          <Button onClick={() => setView('import')}><IconUpload size={18} stroke={1.6} /> Import CSV</Button>
        </div>
      </div>

      {/* ── LIST ── */}
      {view === 'list' && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="w-64">
              <SelectField label="Bank account" value={bankFilter} onChange={(e) => setBankFilter(e.target.value)} options={[{ value: '', label: 'All bank accounts' }, ...bankAccounts.map((b) => ({ value: b.id, label: b.name }))]} />
            </div>
          </div>
          <Card className="overflow-hidden p-0">
            {loading ? <div className="flex justify-center py-16"><Spinner /></div> : statements.length === 0 ? (
              <EmptyHint>No statements imported yet. Click <strong>Import CSV</strong> to get started.</EmptyHint>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-dim">
                  <tr><th className="px-4 py-2.5">Bank account</th><th className="px-4 py-2.5">Period</th><th className="px-4 py-2.5">Source</th><th className="px-4 py-2.5 text-right">Lines</th><th className="px-4 py-2.5 text-right">Debits</th><th className="px-4 py-2.5 text-right">Credits</th><th className="px-4 py-2.5">Reconciliation</th><th className="px-4 py-2.5">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {statements.map((s) => (
                    <tr key={s.id} className="cursor-pointer hover:bg-hover" onClick={() => void openStatement(s.id)}>
                      <td className="px-4 py-2.5 text-frost"><IconBuildingBank size={14} className="mr-1.5 inline text-dim" />{s.bankAccountName ?? '—'}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-frost-dim">{fmtDate(s.periodFrom)} → {fmtDate(s.periodTo)}</td>
                      <td className="px-4 py-2.5 text-xs text-dim">{s.sourceFormat ?? ''} <span className="text-frost-dim">{s.sourceFile}</span></td>
                      <td className="px-4 py-2.5 text-right text-frost-dim">{s.lineCount}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{fmtMoney(s.totalDebits)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{fmtMoney(s.totalCredits)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex h-2 w-40 overflow-hidden rounded-full bg-surface" title={`${s.matchedCount} matched · ${s.suggestedCount} suggested · ${s.unmatchedCount} unmatched · ${s.ignoredCount} ignored`}>
                          {[['bg-success', s.matchedCount], ['bg-primary', s.suggestedCount], ['bg-warning', s.unmatchedCount], ['bg-dim', s.ignoredCount]].map(([cls, n], i) => (
                            <span key={i} className={cls as string} style={{ width: `${s.lineCount ? (Number(n) / s.lineCount) * 100 : 0}%` }} />
                          ))}
                        </div>
                        <span className="text-[11px] text-dim">{s.matchedCount}/{s.lineCount} matched</span>
                      </td>
                      <td className="px-4 py-2.5"><Pill tone={IMPORT_TONE[s.importStatus] ?? 'neutral'}>{s.importStatus}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {/* ── IMPORT WIZARD ── */}
      {view === 'import' && (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <Card className="space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); void pickFile(e.dataTransfer.files?.[0] ?? null); }}
              onClick={() => fileRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface/40 px-4 py-10 text-center transition-colors hover:border-primary"
            >
              <IconFileTypeCsv size={32} stroke={1.4} className="text-primary" />
              <p className="text-sm font-medium text-frost">{file ? file.name : 'Drop a CSV here or click to browse'}</p>
              <p className="text-xs text-dim">Emirates NBD, ADCB, FAB, Mashreq, DIB, RAKBANK or a generic Date / Description / Debit / Credit layout.</p>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0] ?? null)} />
            </div>
            <SelectField label="Bank account" required value={impBank} onChange={(e) => setImpBank(e.target.value)} options={[{ value: '', label: 'Select…' }, ...bankAccounts.map((b) => ({ value: b.id, label: `${b.name}${b.bankName ? ` · ${b.bankName}` : ''}` }))]} />
            <Field label="Statement date (optional)" type="date" value={impDate} onChange={(e) => setImpDate(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Opening balance" type="number" step="0.01" value={impOpen} onChange={(e) => setImpOpen(e.target.value)} />
              <Field label="Closing balance" type="number" step="0.01" value={impClose} onChange={(e) => setImpClose(e.target.value)} />
            </div>
            {impError && <Alert kind="error">{impError}</Alert>}
            <Button block loading={importing} disabled={!file || !impBank || !preview?.success || previewing} onClick={() => void runImport()}>
              <IconUpload size={16} /> Import {preview?.success ? `${preview.lineCount} lines` : ''}
            </Button>
          </Card>

          <Card className="overflow-hidden p-0">
            {previewing ? <div className="flex justify-center py-16"><Spinner /></div> : !preview ? (
              <EmptyHint>Choose a file to see a parsed preview before anything is written.</EmptyHint>
            ) : (
              <>
                <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-4">
                  <Mini label="Detected format" value={preview.bankFormat} />
                  <Mini label="Rows" value={`${preview.lineCount}${preview.skippedRows ? ` (+${preview.skippedRows} skipped)` : ''}`} />
                  <Mini label="Period" value={preview.periodFrom ? `${fmtDate(preview.periodFrom)} → ${fmtDate(preview.periodTo)}` : '—'} />
                  <Mini label="Debits / credits" value={`${fmtMoney(preview.totalDebits)} / ${fmtMoney(preview.totalCredits)}`} />
                </div>
                {preview.errors.length > 0 && <div className="p-4"><Alert kind="error">{preview.errors.slice(0, 5).join(' · ')}</Alert></div>}
                <div className="max-h-[520px] overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 border-b border-border bg-abyss text-xs uppercase text-dim">
                      <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Description</th><th className="px-4 py-2">Ref</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th><th className="px-4 py-2 text-right">Balance</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.sample.map((l, i) => (
                        <tr key={i}>
                          <td className="whitespace-nowrap px-4 py-1.5 text-frost-dim">{fmtDate(l.lineDate)}</td>
                          <td className="max-w-[320px] truncate px-4 py-1.5 text-frost" title={l.description}>{l.description}</td>
                          <td className="px-4 py-1.5 font-mono text-xs text-dim">{l.reference ?? l.chequeNumber ?? ''}</td>
                          <td className="px-4 py-1.5 text-right font-mono tabular-nums text-frost-dim">{l.debit ? fmtMoney(l.debit) : ''}</td>
                          <td className="px-4 py-1.5 text-right font-mono tabular-nums text-frost-dim">{l.credit ? fmtMoney(l.credit) : ''}</td>
                          <td className="px-4 py-1.5 text-right font-mono tabular-nums text-dim">{l.balance != null ? fmtMoney(l.balance) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.lineCount > preview.sample.length && <p className="px-4 py-2 text-xs text-dim">Showing first {preview.sample.length} of {preview.lineCount} rows.</p>}
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* ── STATEMENT DETAIL ── */}
      {view === 'statement' && (
        detailLoading || !detail ? <div className="flex justify-center py-16"><Spinner /></div> : (
          <>
            <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <StatTile label="Bank account" value={<span className="text-lg">{detail.statement.bankAccountName ?? '—'}</span>} hint={`${fmtDate(detail.statement.periodFrom)} → ${fmtDate(detail.statement.periodTo)}`} />
              <StatTile label="Matched" value={detail.statement.matchedCount} hint={`of ${detail.statement.lineCount}`} tone="success" />
              <StatTile label="Suggested" value={detail.statement.suggestedCount} hint="review & confirm" tone="primary" />
              <StatTile label="Unmatched" value={detail.statement.unmatchedCount} hint="need attention" tone="warning" />
              <StatTile label="Ignored" value={detail.statement.ignoredCount} hint="bank charges etc." />
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {(['', 'Unmatched', 'Suggested', 'Matched', 'Ignored'] as const).map((s) => (
                <button key={s || 'all'} type="button" onClick={() => { setLineFilter(s); void openStatement(detail.statement.id, s); }}
                  className={`rounded-lg px-3 py-1.5 text-sm ${lineFilter === s ? 'bg-primary/15 text-frost' : 'text-frost-dim hover:bg-hover'}`}>{s || 'All lines'}</button>
              ))}
              <span className="flex-1" />
              <Button variant="secondary" loading={suggesting} onClick={() => void suggest()}><IconSparkles size={16} stroke={1.6} /> Auto-suggest matches</Button>
            </div>
            <Card className="overflow-hidden p-0">
              {detail.lines.length === 0 ? <EmptyHint>No lines in this view.</EmptyHint> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase text-dim">
                      <tr><th className="px-4 py-2.5">#</th><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Description</th><th className="px-4 py-2.5 text-right">Debit</th><th className="px-4 py-2.5 text-right">Credit</th><th className="px-4 py-2.5">Match</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5" /></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {detail.lines.map((l) => (
                        <tr key={l.id} className="hover:bg-hover">
                          <td className="px-4 py-2.5 text-xs text-dim">{l.lineNumber}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-frost-dim">{fmtDate(l.lineDate)}</td>
                          <td className="max-w-[360px] px-4 py-2.5">
                            <div className="truncate text-frost" title={l.description}>{l.description}</div>
                            {(l.reference || l.chequeNumber) && <div className="font-mono text-[11px] text-dim">{l.reference}{l.chequeNumber ? ` · chq ${l.chequeNumber}` : ''}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{l.debit ? fmtMoney(l.debit) : ''}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{l.credit ? fmtMoney(l.credit) : ''}</td>
                          <td className="max-w-[260px] px-4 py-2.5 text-xs">
                            {l.matchedEntryNumber ? (
                              <><span className="font-mono text-frost">{l.matchedEntryNumber}</span><div className="truncate text-dim">{l.matchedDescription}</div></>
                            ) : l.suggestedAccountName ? (
                              <><span className="text-frost-dim">→ {l.suggestedAccountName}</span>{l.matchRuleName && <div className="text-dim">rule: {l.matchRuleName}</div>}</>
                            ) : <span className="text-dim">—</span>}
                          </td>
                          <td className="px-4 py-2.5"><Pill tone={MATCH_TONE[l.matchStatus]}>{l.matchStatus}</Pill></td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">
                            {l.matchStatus === 'Matched' ? (
                              <IconBtn title="Unmatch" onClick={() => void lineAction(l, 'unmatch')}><IconLinkOff size={16} stroke={1.6} /></IconBtn>
                            ) : (
                              <>
                                <IconBtn title="Match to ledger entry" onClick={() => setMatching(l)}><IconLink size={16} stroke={1.6} /></IconBtn>
                                {l.matchStatus !== 'Ignored' && <IconBtn title="Ignore" onClick={() => void lineAction(l, 'ignore')}><IconEyeOff size={16} stroke={1.6} /></IconBtn>}
                                {l.matchStatus === 'Ignored' && <IconBtn title="Un-ignore" onClick={() => void lineAction(l, 'unmatch')}><IconLinkOff size={16} stroke={1.6} /></IconBtn>}
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )
      )}

      {/* ── RULES ── */}
      {view === 'rules' && (
        <>
          <div className="mb-3 flex justify-end">
            <Button onClick={() => setRuleModal({ ruleName: '', pattern: '', patternField: 'Description', priority: 100, isActive: true })}><IconPlus size={16} /> New rule</Button>
          </div>
          <Card className="overflow-hidden p-0">
            {rulesLoading ? <div className="flex justify-center py-16"><Spinner /></div> : rules.length === 0 ? (
              <EmptyHint>No rules. Rules run after exact-amount matching and suggest a ledger for recurring descriptions (e.g. <code>DEWA|ETISALAT</code> → Utilities).</EmptyHint>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-dim">
                  <tr><th className="px-4 py-2.5">Priority</th><th className="px-4 py-2.5">Rule</th><th className="px-4 py-2.5">Pattern</th><th className="px-4 py-2.5">Suggests</th><th className="px-4 py-2.5 text-right">Used</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5" /></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rules.map((r) => (
                    <tr key={r.id} className="hover:bg-hover">
                      <td className="px-4 py-2.5 text-frost-dim">{r.priority}</td>
                      <td className="px-4 py-2.5 text-frost">{r.ruleName}{r.description && <div className="text-xs text-dim">{r.description}</div>}</td>
                      <td className="px-4 py-2.5"><code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-frost">{r.pattern}</code> <span className="text-xs text-dim">on {r.patternField}</span></td>
                      <td className="px-4 py-2.5 text-frost-dim">{r.targetAccountId ? accountName[r.targetAccountId] ?? '…' : '—'}{r.targetVoucherType && <span className="ml-1 text-xs text-dim">({r.targetVoucherType})</span>}</td>
                      <td className="px-4 py-2.5 text-right text-frost-dim">{r.timesUsed}</td>
                      <td className="px-4 py-2.5">{r.isActive ? <Pill tone="ok">Active</Pill> : <Pill tone="neutral">Off</Pill>}</td>
                      <td className="px-4 py-2.5 text-right">
                        <IconBtn title="Edit" onClick={() => setRuleModal({ id: r.id, ruleName: r.ruleName, description: r.description, pattern: r.pattern, patternField: r.patternField, targetAccountId: r.targetAccountId, targetContactId: r.targetContactId, targetVoucherType: r.targetVoucherType, priority: r.priority, isActive: r.isActive })}><IconPencil size={16} stroke={1.6} /></IconBtn>
                        <IconBtn title="Delete" danger onClick={() => void deleteRule(r)}><IconTrash size={16} stroke={1.6} /></IconBtn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {/* Candidate picker */}
      <Modal open={!!matching} title="Match to ledger entry" onClose={() => setMatching(null)} size="2xl">
        {matching && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface/50 px-4 py-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-frost">{matching.description}</span>
                <span className="font-mono tabular-nums text-frost">{matching.debit ? `−${fmtMoney(matching.debit)}` : `+${fmtMoney(matching.credit)}`}</span>
              </div>
              <div className="text-xs text-dim">{fmtDate(matching.lineDate)} {matching.reference ? `· ${matching.reference}` : ''}</div>
            </div>
            <div className="flex flex-wrap items-end gap-4 text-sm">
              <label className="flex items-center gap-2 text-frost-dim"><input type="checkbox" className="h-4 w-4 accent-primary" checked={exactAmount} onChange={(e) => setExactAmount(e.target.checked)} /> Exact amount only</label>
              <div className="w-32"><Field label="Window (days)" type="number" min={1} max={365} value={windowDays} onChange={(e) => setWindowDays(parseInt(e.target.value || '30', 10))} /></div>
            </div>
            {candidates === null ? <div className="flex justify-center py-8"><Spinner /></div> : candidates.length === 0 ? (
              <EmptyHint>No unreconciled ledger lines found. Widen the window or untick “exact amount” — or post the voucher first.</EmptyHint>
            ) : (
              <div className="max-h-80 overflow-auto rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 border-b border-border bg-abyss text-xs uppercase text-dim"><tr><th className="px-3 py-2">Entry</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2" /></tr></thead>
                  <tbody className="divide-y divide-border">
                    {candidates.map((c) => (
                      <tr key={c.journalLineId} className="hover:bg-hover">
                        <td className="px-3 py-2 font-mono text-xs text-frost">{c.entryNumber}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-frost-dim">{fmtDate(c.date)}</td>
                        <td className="max-w-[260px] truncate px-3 py-2 text-frost-dim">{c.description}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-frost">{c.debit ? `Dr ${fmtMoney(c.debit)}` : `Cr ${fmtMoney(c.credit)}`}</td>
                        <td className="px-3 py-2 text-right"><Button variant="secondary" loading={confirming === c.journalLineId} onClick={() => void confirm(c)}><IconCheck size={14} /> Match</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Rule modal */}
      <Modal open={!!ruleModal} title={ruleModal?.id ? 'Edit rule' : 'New matching rule'} onClose={() => setRuleModal(null)} size="xl">
        {ruleModal && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void saveRule(); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Rule name" required value={ruleModal.ruleName} onChange={(e) => setRuleModal({ ...ruleModal, ruleName: e.target.value })} />
              <Field label="Priority (lower runs first)" type="number" value={ruleModal.priority} onChange={(e) => setRuleModal({ ...ruleModal, priority: parseInt(e.target.value || '100', 10) })} />
              <Field label="Pattern (case-insensitive regex)" required placeholder="DEWA|ETISALAT|DU " value={ruleModal.pattern} onChange={(e) => setRuleModal({ ...ruleModal, pattern: e.target.value })} />
              <SelectField label="Match against" value={ruleModal.patternField} onChange={(e) => setRuleModal({ ...ruleModal, patternField: e.target.value as BankMatchPatternField })} options={RULE_FIELDS.map((f) => ({ value: f, label: f }))} />
              <SelectField label="Suggest ledger" value={ruleModal.targetAccountId ?? ''} onChange={(e) => setRuleModal({ ...ruleModal, targetAccountId: e.target.value || null })} options={[{ value: '', label: '— none —' }, ...accounts.filter((a) => a.isActive).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))]} />
              <SelectField label="Suggest party" value={ruleModal.targetContactId ?? ''} onChange={(e) => setRuleModal({ ...ruleModal, targetContactId: e.target.value || null })} options={[{ value: '', label: '— none —' }, ...contacts.map((c) => ({ value: c.id, label: c.name }))]} />
              <SelectField label="Suggest voucher type" value={ruleModal.targetVoucherType ?? ''} onChange={(e) => setRuleModal({ ...ruleModal, targetVoucherType: (e.target.value || null) as VoucherType | null })} options={[{ value: '', label: '— none —' }, ...RULE_VOUCHERS.map((v) => ({ value: v, label: v }))]} />
              <Field label="Description" value={ruleModal.description ?? ''} onChange={(e) => setRuleModal({ ...ruleModal, description: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-frost-dim"><input type="checkbox" className="h-4 w-4 accent-primary" checked={ruleModal.isActive} onChange={(e) => setRuleModal({ ...ruleModal, isActive: e.target.checked })} /> Active</label>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setRuleModal(null)}>Cancel</Button><Button type="submit" loading={ruleBusy}>Save rule</Button></div>
          </form>
        )}
      </Modal>
    </AppShell>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] font-bold uppercase tracking-wider text-dim">{label}</p><p className="mt-0.5 text-sm text-frost">{value}</p></div>;
}
function IconBtn({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick} className={`rounded p-1.5 text-dim hover:bg-hover ${danger ? 'hover:text-danger' : 'hover:text-frost'}`}>{children}</button>;
}
