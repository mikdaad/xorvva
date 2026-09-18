import { useCallback, useEffect, useState } from 'react';
import { IconId, IconPlus, IconPencil, IconTrash } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { hrApi, type Designation } from '../../api/hr.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, Field, Modal, Spinner } from '../../components/ui';
import { Pill } from '../../components/dashboard-ui';
import { SearchTh } from '../../components/SearchTh';
import { roleLevel } from '../../utils/roles';

const contains = (hay: string | undefined | null, needle: string) =>
  (hay ?? '').toLowerCase().includes(needle.toLowerCase());

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

export default function DesignationsPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const canManage = user ? roleLevel(user.role) <= 2 : false;
  const [items, setItems] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Designation | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const setFilter = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const load = useCallback(async () => {
    try {
      const res = await hrApi.listDesignations();
      setItems(res.data.data ?? []);
    } catch (e) { setError(err(e, 'Failed to load designations.')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const remove = async (d: Designation) => {
    if (!confirm(`Delete the "${d.title}" designation?`)) return;
    try { await hrApi.deleteDesignation(d.id); toast.success(`${d.title} removed.`); void load(); }
    catch (e) { toast.error(err(e, 'Failed to delete.')); }
  };

  const filtered = items.filter((d) =>
    contains(d.title, f.title ?? '') &&
    contains(d.code, f.code ?? '') &&
    contains(d.category, f.category ?? '') &&
    (!f.status || (d.isActive ? 'Active' : 'Inactive') === f.status));

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-frost">Designations</h1>
          <p className="mt-1 text-sm text-frost-dim">{items.length} title(s) · job titles and pay-grade tiers.</p>
        </div>
        {canManage && <Button onClick={() => setCreating(true)}><IconPlus size={18} stroke={1.5} /> New Designation</Button>}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <Card className="py-14 text-center">
          <IconId size={36} stroke={1.2} className="mx-auto mb-3 text-dim" />
          <p className="text-frost-dim">No designations yet.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border">
                <tr>
                  <SearchTh label="Title" value={f.title ?? ''} onChange={(v) => setFilter('title', v)} />
                  <SearchTh label="Code" value={f.code ?? ''} onChange={(v) => setFilter('code', v)} />
                  <SearchTh label="Category" value={f.category ?? ''} onChange={(v) => setFilter('category', v)} />
                  <th className="px-4 py-3 align-top">Staff</th>
                  <SearchTh label="Status" value={f.status ?? ''} onChange={(v) => setFilter('status', v)} options={['Active', 'Inactive']} />
                  {canManage && <th className="px-4 py-3 text-right align-top">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr><td colSpan={canManage ? 6 : 5} className="px-4 py-10 text-center text-frost-dim">No matching designations.</td></tr>
                ) : filtered.map((d) => (
                  <tr key={d.id} className={canManage ? 'cursor-pointer hover:bg-hover' : ''}
                    onClick={canManage ? () => setEditing(d) : undefined}>
                    <td className="px-4 py-3 font-medium text-frost">{d.title}
                      {d.description && <div className="text-xs font-normal text-dim">{d.description}</div>}
                    </td>
                    <td className="px-4 py-3">{d.code ? <span className="font-mono text-xs text-frost-dim">{d.code}</span> : <span className="text-dim">—</span>}</td>
                    <td className="px-4 py-3">{d.category ? <Pill tone="brand">{d.category}</Pill> : <span className="text-dim">—</span>}</td>
                    <td className="px-4 py-3 text-frost-dim">{d.employeeCount}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${d.isActive ? 'bg-[var(--c-ok-weak)] text-success' : 'bg-frost-dim/15 text-frost-dim'}`}>
                        {d.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5 text-dim">
                          <button title="Edit" aria-label="Edit" onClick={(ev) => { ev.stopPropagation(); setEditing(d); }}
                            className="hover:text-glow"><IconPencil size={16} stroke={1.6} /></button>
                          <button title="Delete" aria-label="Delete" onClick={(ev) => { ev.stopPropagation(); void remove(d); }}
                            className="hover:text-danger"><IconTrash size={16} stroke={1.6} /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {(creating || editing) && (
        <DesignationModal
          companyId={activeCompanyId}
          designation={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onDone={() => { setCreating(false); setEditing(null); void load(); }}
        />
      )}
    </AppShell>
  );
}

function DesignationModal({ companyId, designation, onClose, onDone }: {
  companyId?: string; designation: Designation | null; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const isEdit = !!designation;
  const [title, setTitle] = useState(designation?.title ?? '');
  const [code, setCode] = useState(designation?.code ?? '');
  const [category, setCategory] = useState(designation?.category ?? '');
  const [description, setDescription] = useState(designation?.description ?? '');
  const [isActive, setIsActive] = useState(designation?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!title.trim()) return setError('Title is required.');
    setLoading(true);
    try {
      if (isEdit) {
        await hrApi.updateDesignation(designation!.id, { title, code: code || undefined, category: category || undefined, description: description || undefined, isActive });
      } else {
        await hrApi.createDesignation({ companyId, title, code: code || undefined, category: category || undefined, description: description || undefined });
      }
      toast.success(isEdit ? 'Designation updated.' : 'Designation created.');
      onDone();
    } catch (e) { setError(err(e, 'Failed to save.')); setLoading(false); }
  };

  return (
    <Modal open title={isEdit ? `Edit — ${designation!.title}` : 'New Designation'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Title" placeholder="Senior Software Engineer" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code (optional)" placeholder="SSE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <Field label="Category (optional)" placeholder="Technical / Management / Support" value={category}
            onChange={(e) => setCategory(e.target.value)} />
        </div>
        <Field label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-frost-dim">
            <input type="checkbox" className="h-4 w-4 rounded border-border accent-primary"
              checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>{isEdit ? 'Save' : 'Create'}</Button>
        </div>
      </div>
    </Modal>
  );
}
