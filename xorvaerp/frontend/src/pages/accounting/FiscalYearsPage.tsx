import { useCallback, useEffect, useState } from 'react';
import { IconPlus, IconCalendarStats, IconLock, IconLockOpen, IconShieldLock } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type FiscalYear, type FiscalPeriod, type PeriodCloseStatus } from '../../api/accounting.api';
import { ledgerApi } from '../../api/ledger.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Field, Modal, Spinner } from '../../components/ui';
import { Pill } from '../../components/dashboard-ui';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};
const shortMonth = (iso: string) => new Date(iso).toLocaleDateString('en-AE', { month: 'short' });

export default function FiscalYearsPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [years, setYears] = useState<FiscalYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await accountingApi.listFiscalYears(companyId); setYears(r.data.data ?? []); }
    catch (e) { toast.error(err(e, 'Failed to load fiscal years.')); }
    finally { setLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  /** Open → Soft-closed → Hard-closed → Open. Soft close still lets company admins post adjustments. */
  const cyclePeriod = async (p: FiscalPeriod) => {
    const current: PeriodCloseStatus = p.closeStatus ?? (p.isClosed ? 'HardClosed' : 'Open');
    const next: PeriodCloseStatus = current === 'Open' ? 'SoftClosed' : current === 'SoftClosed' ? 'HardClosed' : 'Open';
    setBusy(p.id);
    try { const r = await ledgerApi.setPeriodCloseStatus(p.id, next, companyId); toast.success(r.data.message ?? 'Period updated.'); await load(); }
    catch (e) { toast.error(err(e, 'Failed to update period.')); }
    finally { setBusy(null); }
  };
  const closeYear = async (id: string) => {
    setBusy(id);
    try { const r = await accountingApi.closeYear(id, companyId); toast.success(r.data.message ?? 'Year closed.'); await load(); }
    catch (e) { toast.error(err(e, 'Failed to close year.')); }
    finally { setBusy(null); }
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-frost">Fiscal Years</h1>
          <p className="mt-1 text-sm text-frost-dim">Lock periods to freeze the books; year-end close rolls profit into retained earnings.</p>
          <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-dim">
            <span className="inline-flex items-center gap-1"><IconLockOpen size={12} className="text-primary" /> Open</span>
            <span className="inline-flex items-center gap-1"><IconLock size={12} className="text-warning" /> Soft-closed (admins may adjust)</span>
            <span className="inline-flex items-center gap-1"><IconShieldLock size={12} /> Hard-closed</span>
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><IconPlus size={18} stroke={1.6} /> New fiscal year</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : years.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconCalendarStats size={38} stroke={1.2} className="text-primary" />
          <p className="text-frost-dim">No fiscal years yet. Create one to lock periods and close the year.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {years.map((y) => (
            <Card key={y.id}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-frost">{y.name}</span>
                  {y.isClosed ? <Pill tone="neutral">Closed</Pill> : <Pill tone="ok">Open</Pill>}
                </div>
                {!y.isClosed && (
                  <Button variant="secondary" className="text-xs" loading={busy === y.id} onClick={() => void closeYear(y.id)}>
                    <IconLock size={15} stroke={1.6} /> Close year
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {y.periods.map((p) => {
                  const st: PeriodCloseStatus = p.closeStatus ?? (p.isClosed ? 'HardClosed' : 'Open');
                  const cls = st === 'HardClosed' ? 'border-border bg-surface text-dim'
                    : st === 'SoftClosed' ? 'border-warning/40 bg-warning/10 text-warning'
                    : 'border-primary/30 text-frost hover:bg-hover';
                  const hint = y.isClosed ? 'Year closed'
                    : st === 'Open' ? 'Open — click to soft-close (admins can still adjust)'
                    : st === 'SoftClosed' ? 'Soft-closed — click to hard-close (no further postings)'
                    : 'Hard-closed — click to re-open';
                  return (
                    <button key={p.id} type="button" disabled={y.isClosed || busy === p.id}
                      onClick={() => void cyclePeriod(p)}
                      className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-xs transition-colors disabled:opacity-60 ${cls}`}
                      title={hint}>
                      <span>{shortMonth(p.startDate)}</span>
                      {st === 'HardClosed' ? <IconShieldLock size={13} stroke={1.6} /> : st === 'SoftClosed' ? <IconLock size={13} stroke={1.6} /> : <IconLockOpen size={13} stroke={1.6} className="text-primary" />}
                    </button>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      {createOpen && <CreateModal companyId={companyId} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); void load(); }} />}
    </AppShell>
  );
}

function CreateModal({ companyId, onClose, onDone }: { companyId?: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try { await accountingApi.createFiscalYear(year, companyId); toast.success(`FY${year} created.`); onDone(); }
    catch (e) { toast.error(err(e, 'Failed to create fiscal year.')); setLoading(false); }
  };

  return (
    <Modal open title="New fiscal year" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-frost-dim">Creates a Jan–Dec fiscal year with twelve monthly periods.</p>
        <Field label="Year" type="number" value={String(year)} onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}
