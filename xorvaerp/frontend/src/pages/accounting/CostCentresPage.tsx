import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { IconPlus, IconPencil, IconTrash, IconSitemap, IconChartBar, IconFolder, IconTag } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import {
  ledgerApi, fmtMoney, DIMENSION_TYPES,
  type CostCentre, type CostCentreDimension, type CostCentreDimensionType, type CostCentreReport,
} from '../../api/ledger.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Field, Modal, SelectField, Spinner } from '../../components/ui';
import { Pill, EmptyHint } from '../../components/dashboard-ui';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

type Tab = 'centres' | 'report';

export default function CostCentresPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [dimensions, setDimensions] = useState<CostCentreDimension[]>([]);
  const [centres, setCentres] = useState<CostCentre[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDim, setSelectedDim] = useState<string>('');
  const [showInactive, setShowInactive] = useState(false);
  const [tab, setTab] = useState<Tab>('centres');

  const [dimModal, setDimModal] = useState<Partial<CostCentreDimension> | null>(null);
  const [ccModal, setCcModal] = useState<Partial<CostCentre> | null>(null);
  const [deleting, setDeleting] = useState<CostCentre | null>(null);
  const [busy, setBusy] = useState(false);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState<CostCentreReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([ledgerApi.listDimensions(companyId, true), ledgerApi.listCostCentres(companyId, undefined, true)]);
      setDimensions(d.data.data ?? []);
      setCentres(c.data.data ?? []);
    } catch (e) { toast.error(err(e, 'Failed to load cost centres.')); }
    finally { setLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selectedDim && dimensions.length) setSelectedDim(dimensions[0].id);
  }, [dimensions, selectedDim]);

  const loadReport = useCallback(async () => {
    setReportLoading(true);
    try { setReport((await ledgerApi.costCentreReport(companyId, selectedDim || undefined, from || undefined, to || undefined)).data.data ?? null); }
    catch (e) { toast.error(err(e, 'Failed to load the cost centre report.')); }
    finally { setReportLoading(false); }
  }, [companyId, selectedDim, from, to, toast]);
  useEffect(() => { if (tab === 'report') void loadReport(); }, [tab, loadReport]);

  const activeDim = dimensions.find((d) => d.id === selectedDim);
  const tree = useMemo(() => {
    const list = centres.filter((c) => c.dimensionId === selectedDim && (showInactive || c.isActive));
    const byParent = new Map<string | undefined, CostCentre[]>();
    for (const c of list) {
      const k = c.parentId && list.some((x) => x.id === c.parentId) ? c.parentId : undefined;
      byParent.set(k, [...(byParent.get(k) ?? []), c]);
    }
    const out: { node: CostCentre; depth: number }[] = [];
    const walk = (parent: string | undefined, depth: number) => {
      for (const n of (byParent.get(parent) ?? []).sort((a, b) => a.code.localeCompare(b.code))) {
        out.push({ node: n, depth });
        walk(n.id, depth + 1);
      }
    };
    walk(undefined, 0);
    return out;
  }, [centres, selectedDim, showInactive]);

  const saveDim = async () => {
    if (!dimModal) return;
    setBusy(true);
    try {
      await ledgerApi.saveDimension({ ...dimModal, companyId });
      toast.success(dimModal.id ? 'Dimension updated.' : 'Dimension created.');
      setDimModal(null); await load();
    } catch (e) { toast.error(err(e, 'Could not save dimension.')); }
    finally { setBusy(false); }
  };

  const saveCc = async () => {
    if (!ccModal || !ccModal.dimensionId) return;
    setBusy(true);
    try {
      await ledgerApi.saveCostCentre({
        ...ccModal, companyId, dimensionId: ccModal.dimensionId,
        parentId: ccModal.parentId || undefined,
        budget: ccModal.budget === undefined || Number.isNaN(ccModal.budget) ? undefined : ccModal.budget,
        startDate: ccModal.startDate || undefined, endDate: ccModal.endDate || undefined,
      });
      toast.success(ccModal.id ? 'Cost centre updated.' : 'Cost centre created.');
      setCcModal(null); await load();
    } catch (e) { toast.error(err(e, 'Could not save cost centre.')); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await ledgerApi.deleteCostCentre(deleting.id, companyId);
      toast.success(`Deleted ${deleting.code}.`);
      setDeleting(null); await load();
    } catch (e) { toast.error(err(e, 'Cost centre is in use — deactivate it instead.')); }
    finally { setBusy(false); }
  };

  const groupOptions = centres.filter((c) => c.dimensionId === (ccModal?.dimensionId ?? selectedDim) && c.isGroup && c.id !== ccModal?.id);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-frost">Cost centres</h1>
          <p className="mt-1 text-sm text-frost-dim">Departments, projects, locations — tag any voucher line and report spend by dimension.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setDimModal({ dimensionType: 'Department', isActive: true, isMandatory: false, sortOrder: dimensions.length })}>
            <IconTag size={16} stroke={1.6} /> New dimension
          </Button>
          <Button disabled={!selectedDim} onClick={() => setCcModal({ dimensionId: selectedDim, isActive: true, isGroup: false })}>
            <IconPlus size={18} stroke={1.6} /> New cost centre
          </Button>
        </div>
      </div>

      {loading ? <div className="flex justify-center py-16"><Spinner /></div> : dimensions.length === 0 ? (
        <Card><EmptyHint>No dimensions yet. Create one (e.g. “Department”) and then add cost centres under it.</EmptyHint></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          {/* Dimension list */}
          <Card className="p-3">
            <p className="mb-2 px-2 text-[11px] font-bold uppercase tracking-wider text-dim">Dimensions</p>
            <ul className="space-y-1">
              {[...dimensions].sort((a, b) => a.sortOrder - b.sortOrder).map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedDim(d.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors
                      ${d.id === selectedDim ? 'bg-brand-weak text-frost' : 'text-frost-dim hover:bg-hover'}`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <IconSitemap size={16} stroke={1.6} className="shrink-0 text-dim" />
                      <span className="truncate">{d.name}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      {d.isMandatory && <Pill tone="warn">req</Pill>}
                      {!d.isActive && <Pill tone="neutral">off</Pill>}
                      <span className="text-xs text-dim">{d.costCentreCount}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {activeDim && (
              <div className="mt-3 border-t border-border px-2 pt-3 text-xs text-frost-dim">
                <div className="flex items-center justify-between">
                  <span><Pill tone="brand">{activeDim.dimensionType}</Pill> <span className="ml-1 font-mono">{activeDim.code}</span></span>
                  <button type="button" className="text-primary hover:underline" onClick={() => setDimModal(activeDim)}>Edit</button>
                </div>
                {activeDim.description && <p className="mt-2">{activeDim.description}</p>}
              </div>
            )}
          </Card>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <TabBtn active={tab === 'centres'} onClick={() => setTab('centres')}><IconFolder size={16} stroke={1.6} /> Centres</TabBtn>
              <TabBtn active={tab === 'report'} onClick={() => setTab('report')}><IconChartBar size={16} stroke={1.6} /> Spend report</TabBtn>
              <span className="flex-1" />
              {tab === 'centres' ? (
                <label className="flex items-center gap-2 text-sm text-frost-dim">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
                </label>
              ) : (
                <div className="flex items-end gap-2">
                  <Field label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  <Field label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              )}
            </div>

            {tab === 'centres' ? (
              <Card className="overflow-hidden p-0">
                {tree.length === 0 ? <EmptyHint>No cost centres in {activeDim?.name ?? 'this dimension'} yet.</EmptyHint> : (
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border">
                      <tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Name</th><th className="px-4 py-3 text-right">Budget</th><th className="px-4 py-3">Validity</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {tree.map(({ node, depth }) => (
                        <tr key={node.id} className="hover:bg-hover">
                          <td className="px-4 py-3 font-mono text-frost-dim">{node.code}</td>
                          <td className="px-4 py-3 text-frost" style={{ paddingLeft: `${16 + depth * 20}px` }}>
                            <span className={node.isGroup ? 'font-semibold' : ''}>{node.isGroup && <IconFolder size={14} className="mr-1.5 inline text-dim" />}{node.name}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-frost-dim">{node.budget != null ? fmtMoney(node.budget) : '—'}</td>
                          <td className="px-4 py-3 text-xs text-dim">{node.startDate || node.endDate ? `${node.startDate ?? '…'} → ${node.endDate ?? '…'}` : 'Always'}</td>
                          <td className="px-4 py-3">{node.isActive ? <Pill tone="ok">Active</Pill> : <Pill tone="neutral">Inactive</Pill>}</td>
                          <td className="px-4 py-3 text-right">
                            <button type="button" className="rounded p-1.5 text-dim hover:bg-hover hover:text-frost" aria-label="Edit" onClick={() => setCcModal(node)}><IconPencil size={16} stroke={1.6} /></button>
                            <button type="button" className="rounded p-1.5 text-dim hover:bg-hover hover:text-danger" aria-label="Delete" onClick={() => setDeleting(node)}><IconTrash size={16} stroke={1.6} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            ) : (
              <Card className="overflow-hidden p-0">
                {reportLoading ? <div className="flex justify-center py-12"><Spinner /></div> : !report || report.rows.length === 0 ? (
                  <EmptyHint>No postings tagged to {activeDim?.name ?? 'this dimension'} in the selected range.</EmptyHint>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border">
                      <tr><th className="px-4 py-3">Cost centre</th><th className="px-4 py-3 text-right">Debit</th><th className="px-4 py-3 text-right">Credit</th><th className="px-4 py-3 text-right">Net</th><th className="px-4 py-3 text-right">Budget</th><th className="px-4 py-3 text-right">Variance</th><th className="px-4 py-3 text-right">Lines</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {report.rows.map((r) => (
                        <tr key={r.costCentreId} className="hover:bg-hover">
                          <td className="px-4 py-3 text-frost" style={{ paddingLeft: `${16 + Math.max(0, r.level - 1) * 20}px` }}>
                            <span className="mr-2 font-mono text-xs text-dim">{r.code}</span><span className={r.isGroup ? 'font-semibold' : ''}>{r.name}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-frost-dim">{fmtMoney(r.debit)}</td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-frost-dim">{fmtMoney(r.credit)}</td>
                          <td className={`px-4 py-3 text-right font-mono tabular-nums ${r.net < 0 ? 'text-success' : 'text-frost'}`}>{fmtMoney(r.net)}</td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-frost-dim">{r.budget != null ? fmtMoney(r.budget) : '—'}</td>
                          <td className={`px-4 py-3 text-right font-mono tabular-nums ${r.variance == null ? 'text-dim' : r.variance < 0 ? 'text-danger' : 'text-success'}`}>{r.variance != null ? fmtMoney(r.variance) : '—'}</td>
                          <td className="px-4 py-3 text-right text-dim">{r.lineCount}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-border font-semibold">
                      <tr>
                        <td className="px-4 py-3 text-frost">Total</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-frost">{fmtMoney(report.totalDebit)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-frost">{fmtMoney(report.totalCredit)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-frost">{fmtMoney(report.totalNet)}</td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Dimension modal */}
      <Modal open={!!dimModal} title={dimModal?.id ? 'Edit dimension' : 'New dimension'} onClose={() => setDimModal(null)}>
        {dimModal && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void saveDim(); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" required value={dimModal.name ?? ''} onChange={(e) => setDimModal({ ...dimModal, name: e.target.value })} />
              <Field label="Code" required placeholder="DEPT" value={dimModal.code ?? ''} onChange={(e) => setDimModal({ ...dimModal, code: e.target.value.toUpperCase() })} />
              <SelectField label="Type" value={dimModal.dimensionType ?? 'Custom'} onChange={(e) => setDimModal({ ...dimModal, dimensionType: e.target.value as CostCentreDimensionType })} options={DIMENSION_TYPES.map((t) => ({ value: t, label: t }))} />
              <Field label="Sort order" type="number" value={dimModal.sortOrder ?? 0} onChange={(e) => setDimModal({ ...dimModal, sortOrder: parseInt(e.target.value || '0', 10) })} />
            </div>
            <Field label="Description" value={dimModal.description ?? ''} onChange={(e) => setDimModal({ ...dimModal, description: e.target.value })} />
            <div className="flex flex-wrap gap-6 text-sm text-frost-dim">
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={!!dimModal.isMandatory} onChange={(e) => setDimModal({ ...dimModal, isMandatory: e.target.checked })} /> Mandatory on every voucher line</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={dimModal.isActive ?? true} onChange={(e) => setDimModal({ ...dimModal, isActive: e.target.checked })} /> Active</label>
            </div>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setDimModal(null)}>Cancel</Button><Button type="submit" loading={busy}>Save</Button></div>
          </form>
        )}
      </Modal>

      {/* Cost centre modal */}
      <Modal open={!!ccModal} title={ccModal?.id ? `Edit ${ccModal.code}` : 'New cost centre'} onClose={() => setCcModal(null)}>
        {ccModal && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void saveCc(); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Dimension" value={ccModal.dimensionId ?? ''} disabled={!!ccModal.id} onChange={(e) => setCcModal({ ...ccModal, dimensionId: e.target.value, parentId: undefined })} options={dimensions.map((d) => ({ value: d.id, label: d.name }))} />
              <SelectField label="Parent group" value={ccModal.parentId ?? ''} onChange={(e) => setCcModal({ ...ccModal, parentId: e.target.value || undefined })} options={[{ value: '', label: '— top level —' }, ...groupOptions.map((g) => ({ value: g.id, label: `${g.code} · ${g.name}` }))]} />
              <Field label="Code" required placeholder="MKT" value={ccModal.code ?? ''} onChange={(e) => setCcModal({ ...ccModal, code: e.target.value.toUpperCase() })} />
              <Field label="Name" required value={ccModal.name ?? ''} onChange={(e) => setCcModal({ ...ccModal, name: e.target.value })} />
              <Field label="Budget" type="number" step="0.01" min="0" value={ccModal.budget ?? ''} onChange={(e) => setCcModal({ ...ccModal, budget: e.target.value === '' ? undefined : parseFloat(e.target.value) })} />
              <div />
              <Field label="Valid from" type="date" value={ccModal.startDate?.slice(0, 10) ?? ''} onChange={(e) => setCcModal({ ...ccModal, startDate: e.target.value || undefined })} />
              <Field label="Valid to" type="date" value={ccModal.endDate?.slice(0, 10) ?? ''} onChange={(e) => setCcModal({ ...ccModal, endDate: e.target.value || undefined })} />
            </div>
            <div className="flex flex-wrap gap-6 text-sm text-frost-dim">
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={!!ccModal.isGroup} onChange={(e) => setCcModal({ ...ccModal, isGroup: e.target.checked })} /> Group (holds children, not postings)</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={ccModal.isActive ?? true} onChange={(e) => setCcModal({ ...ccModal, isActive: e.target.checked })} /> Active</label>
            </div>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setCcModal(null)}>Cancel</Button><Button type="submit" loading={busy}>Save</Button></div>
          </form>
        )}
      </Modal>

      <Modal open={!!deleting} title={`Delete ${deleting?.code ?? ''}?`} onClose={() => setDeleting(null)}>
        <p className="mb-4 text-sm text-frost-dim">Only cost centres with no postings and no children can be deleted. Otherwise, mark it inactive.</p>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleting(null)}>Keep</Button><Button variant="danger" loading={busy} onClick={() => void doDelete()}>Delete</Button></div>
      </Modal>
    </AppShell>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? 'bg-brand-weak text-frost' : 'text-frost-dim hover:bg-hover'}`}>
      {children}
    </button>
  );
}
