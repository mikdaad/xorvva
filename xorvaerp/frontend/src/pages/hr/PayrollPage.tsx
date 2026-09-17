import { useCallback, useEffect, useState } from 'react';
import { IconPlus, IconCashBanknote } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { hrApi, type PayRun, type PayRunSummary } from '../../api/hr.api';
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
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const period = (y: number, m: number) => `${MONTHS[m - 1]} ${y}`;

export default function PayrollPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [rows, setRows] = useState<PayRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [viewing, setViewing] = useState<PayRun | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await hrApi.listPayRuns(companyId); setRows(r.data.data ?? []); }
    catch (e) { toast.error(err(e, 'Failed to load pay runs.')); }
    finally { setLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  const post = async (id: string) => {
    setBusyId(id);
    try { await hrApi.postPayRun(id, companyId); toast.success('Pay run posted — salary journal created.'); await load(); }
    catch (e) { toast.error(err(e, 'Failed to post pay run.')); }
    finally { setBusyId(null); }
  };
  const view = async (id: string) => {
    try { const r = await hrApi.getPayRun(id, companyId); setViewing(r.data.data ?? null); }
    catch (e) { toast.error(err(e, 'Failed to load pay run.')); }
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-frost">Payroll</h1>
          <p className="mt-1 text-sm text-frost-dim">Run monthly payroll. Posting accrues the salary journal in Accounting.</p>
        </div>
        <Button onClick={() => setRunOpen(true)}><IconPlus size={18} stroke={1.6} /> Run payroll</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconCashBanknote size={38} stroke={1.2} className="text-primary" />
          <p className="text-frost-dim">No pay runs yet. Run payroll for a month to generate payslips.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-dim">
                <tr>
                  <th className="px-4 py-3">Number</th><th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3 text-right">Employees</th><th className="px-4 py-3 text-right">Net total</th>
                  <th className="px-4 py-3">Status</th><th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-hover">
                    <td className="px-4 py-2.5 font-mono text-xs text-frost">{p.number}</td>
                    <td className="px-4 py-2.5 text-frost-dim">{period(p.year, p.month)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-frost-dim">{p.employeeCount}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{money(p.totalNet)}</td>
                    <td className="px-4 py-2.5">{p.status === 'Posted' ? <Pill tone="ok">Posted</Pill> : <Pill tone="neutral">Draft</Pill>}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => void view(p.id)}>View</Button>
                      {p.status === 'Draft' && (
                        <Button className="ml-1 px-3 py-1.5 text-xs" loading={busyId === p.id} onClick={() => void post(p.id)}>Post</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {runOpen && <RunModal companyId={companyId} onClose={() => setRunOpen(false)} onDone={() => { setRunOpen(false); void load(); }} />}
      {viewing && <ViewModal payRun={viewing} onClose={() => setViewing(null)} />}
    </AppShell>
  );
}

function RunModal({ companyId, onClose, onDone }: { companyId?: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await hrApi.runPayroll({ companyId, year, month });
      toast.success('Pay run created.');
      onDone();
    } catch (e) { toast.error(err(e, 'Failed to run payroll.')); setLoading(false); }
  };

  return (
    <Modal open title="Run payroll" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-frost-dim">Generates a draft payslip for every active employee at their basic salary.</p>
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Month" options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
            value={String(month)} onChange={(e) => setMonth(Number(e.target.value))} />
          <Field label="Year" type="number" value={String(year)} onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Create pay run</Button>
        </div>
      </div>
    </Modal>
  );
}

function ViewModal({ payRun, onClose }: { payRun: PayRun; onClose: () => void }) {
  return (
    <Modal open title={`${payRun.number} · ${period(payRun.year, payRun.month)}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-dim">
              <tr><th className="py-2">Employee</th><th className="py-2 text-right">Gross</th><th className="py-2 text-right">Deductions</th><th className="py-2 text-right">Net</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payRun.payslips.map((s) => (
                <tr key={s.id}>
                  <td className="py-2 text-frost">{s.employeeName}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-frost-dim">{money(s.gross)}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-frost-dim">{money(s.deductions)}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-frost">{money(s.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border font-semibold text-frost">
              <tr><td className="py-2">Total</td><td className="py-2 text-right font-mono tabular-nums">{money(payRun.totalGross)}</td><td className="py-2 text-right font-mono tabular-nums">{money(payRun.totalDeductions)}</td><td className="py-2 text-right font-mono tabular-nums">{money(payRun.totalNet)}</td></tr>
            </tfoot>
          </table>
        </div>
        <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Close</Button></div>
      </div>
    </Modal>
  );
}
