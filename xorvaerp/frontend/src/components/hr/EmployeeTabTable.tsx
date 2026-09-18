import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconEye, IconPencil, IconTrash, IconDownload, IconFileExport } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { hrApi, STATUS_BADGE, type EmployeeTab, type EmployeeTabView, type EmployeeTabRow } from '../../api/hr.api';
import type { ApiResponse } from '../../api/auth.api';
import { useToast } from '../../stores/ToastContext';
import { Alert, Button, Card, Modal, Spinner } from '../ui';
import { SearchTh } from '../SearchTh';
import { AttachmentView } from '../AttachmentView';
import { DynamicForm, renderCell } from '../dynamic';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};

/**
 * The employees-by-tab table. Every field of the tab is a column; search lives in each column
 * heading (click the icon → input opens there). The Employee heading searches name/code.
 * Paginated (no page scroll); inline edit + row actions (view / edit / delete / download PDF) + CSV.
 */
export function EmployeeTabTable({ tab, companyId, canManage }: {
  tab: EmployeeTab; companyId?: string; canManage: boolean;
}) {
  const nav = useNavigate();
  const toast = useToast();
  const pageSize = 10;

  const [view, setView] = useState<EmployeeTabView | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<EmployeeTabRow | null>(null);
  const [exporting, setExporting] = useState(false);

  // Only the fields marked "show in list" are columns (keeps the table focused); if the tab
  // has none marked, fall back to all so the table isn't empty. Each column still gets header search.
  const fields = useMemo(() => {
    const shown = tab.fields.filter((f) => f.showInList);
    return shown.length > 0 ? shown : tab.fields;
  }, [tab.fields]);
  const uploadFile = (file: File) =>
    hrApi.uploadFile(file, companyId).then((r) => ({ url: r.data.data!.url, fileName: r.data.data!.fileName }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hrApi.employeeTabView(tab.id, { companyId, page, pageSize, search, filters });
      setView(res.data.data ?? null);
    } catch (e) { toast.error(err(e, 'Failed to load.')); }
    finally { setLoading(false); }
  }, [tab.id, companyId, page, search, filters, toast]);

  // Debounced fetch (covers header-search typing across all columns).
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t); }, [load]);

  const setFilter = (k: string, v: string) => {
    setFilters((f) => { const n = { ...f }; if (v) n[k] = v; else delete n[k]; return n; });
    setPage(1);
  };
  const setSearchVal = (v: string) => { setSearch(v); setPage(1); };

  const save = async (values: Record<string, unknown>) => {
    if (!editing) return;
    try {
      await hrApi.saveEmployeeTabRecord({
        employeeTabId: tab.id, employeeId: editing.employeeId, recordId: editing.recordId ?? undefined, values,
      });
      toast.success('Saved.'); setEditing(null); void load();
    } catch (e) { toast.error(err(e, 'Failed to save.')); }
  };

  const remove = async (row: EmployeeTabRow) => {
    if (!row.recordId) return;
    if (!confirm(`Delete this ${tab.label} record for ${row.employeeName}?`)) return;
    try { await hrApi.deleteEmployeeTabRecord(row.recordId); toast.success('Removed.'); void load(); }
    catch (e) { toast.error(err(e, 'Failed to delete.')); }
  };

  const download = async (row: EmployeeTabRow) => {
    try {
      const res = await hrApi.employeePdf(row.employeeId);
      saveBlob(res.data, `${row.employeeName.replace(/\s+/g, '-')}.pdf`);
    } catch (e) { toast.error(err(e, 'Failed to download PDF.')); }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await hrApi.employeeTabView(tab.id, { companyId, page: 1, pageSize: 500, search, filters });
      const data = res.data.data;
      if (!data) return;
      const header = ['Employee', 'Code', ...fields.map((c) => c.label)];
      const lines = data.rows.map((r) => [r.employeeName, r.employeeCode, ...fields.map((c) => renderCell(c, r.values[c.key]))]);
      const csv = [header, ...lines]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${tab.label.replace(/\s+/g, '-')}.csv`);
    } catch (e) { toast.error(err(e, 'Export failed.')); }
    finally { setExporting(false); }
  };

  const rows = view?.rows ?? [];
  const totalPages = view?.totalPages ?? 1;

  return (
    <div>
      {/* Search lives in the column headings; only Export lives outside the table. */}
      <div className="mb-3 flex items-center justify-end gap-2">
        <Button variant="ghost" loading={exporting} onClick={() => void exportCsv()}>
          <IconFileExport size={16} stroke={1.6} /> Export
        </Button>
      </div>

      {loading && !view ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border">
                <tr>
                  <SearchTh label="Employee" value={search} onChange={setSearchVal} />
                  {fields.map((f) => (
                    f.isFilterable ? (
                      <SearchTh key={f.key} label={f.label} value={filters[f.key] ?? ''}
                        onChange={(v) => setFilter(f.key, v)}
                        options={f.type === 'Select' ? f.options ?? undefined : undefined} />
                    ) : (
                      <th key={f.key} className="px-4 py-3 align-top">{f.label}</th>
                    )
                  ))}
                  <th className="px-4 py-3 text-right align-top">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 ? (
                  <tr><td colSpan={fields.length + 2} className="px-4 py-10 text-center text-frost-dim">No matching records.</td></tr>
                ) : rows.map((row, i) => {
                  // For list tabs, merge an employee's Employee cell across their rows (one person, many entries).
                  const firstOfGroup = !tab.isList || i === 0 || rows[i - 1].employeeId !== row.employeeId;
                  let span = 1;
                  if (tab.isList && firstOfGroup) {
                    let j = i + 1;
                    while (j < rows.length && rows[j].employeeId === row.employeeId) { span++; j++; }
                  }
                  return (
                  <tr key={(row.recordId ?? row.employeeId) + i}
                    onClick={() => nav(`/hr/employees/${row.employeeId}?tab=${tab.key}`)}
                    className={`cursor-pointer hover:bg-hover ${tab.isList && firstOfGroup && i > 0 ? 'border-t-2 border-border' : ''}`}>
                    {firstOfGroup && (
                    <td className="px-4 py-3 align-top" rowSpan={tab.isList ? span : 1}>
                      <div className="font-medium text-frost">{row.employeeName}</div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-dim">{row.employeeCode}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[row.employmentStatus] ?? ''}`}>
                          {row.employmentStatus}
                        </span>
                      </div>
                    </td>
                    )}
                    {fields.map((c) => (
                      <td key={c.key} className="px-4 py-3 text-frost-dim">
                        {c.type === 'Attachment'
                          ? <AttachmentView url={row.values[c.key] as string | undefined} />
                          : renderCell(c, row.values[c.key])}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5 text-dim">
                        <button title="View" aria-label="View" onClick={(e) => { e.stopPropagation(); nav(`/hr/employees/${row.employeeId}?tab=${tab.key}`); }}
                          className="hover:text-frost"><IconEye size={16} stroke={1.6} /></button>
                        {canManage && (
                          <button title="Edit" aria-label="Edit" onClick={(e) => { e.stopPropagation(); setEditing(row); }}
                            className="hover:text-glow"><IconPencil size={16} stroke={1.6} /></button>
                        )}
                        {canManage && row.recordId && (
                          <button title="Delete" aria-label="Delete" onClick={(e) => { e.stopPropagation(); void remove(row); }}
                            className="hover:text-danger"><IconTrash size={16} stroke={1.6} /></button>
                        )}
                        <button title="Download PDF" aria-label="Download PDF" onClick={(e) => { e.stopPropagation(); void download(row); }}
                          className="hover:text-frost"><IconDownload size={16} stroke={1.6} /></button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="text-sm text-frost-dim">Page {page} / {totalPages} · {view?.totalCount ?? 0} total</span>
          <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {editing && (
        <Modal open title={`${editing.recordId ? 'Edit' : 'Add'} ${tab.label} — ${editing.employeeName}`}
          size="3xl" onClose={() => setEditing(null)}>
          {tab.fields.length === 0 ? (
            <Alert kind="error">This tab has no fields.</Alert>
          ) : (
            <DynamicForm fields={tab.fields} initial={editing.values} submitLabel="Save" columns={2}
              uploadFile={uploadFile} onSubmit={(v) => void save(v)} onCancel={() => setEditing(null)} />
          )}
        </Modal>
      )}
    </div>
  );
}
