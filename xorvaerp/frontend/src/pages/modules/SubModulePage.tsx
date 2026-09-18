import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { IconPlus, IconPencil, IconTrash } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { platformApi, type CustomRecord, type EntityDefinition } from '../../api/platform.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, Modal, Spinner } from '../../components/ui';
import { DynamicForm, renderCell } from '../../components/dynamic';

const apiError = (err: unknown, fallback: string) => {
  const ax = err as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? fallback;
};

/**
 * A tenant-defined sub-module's records page. It lives INSIDE its parent module — the module
 * header + sidebar (driven by the definition's moduleKey) provide navigation, so this renders
 * exactly like any native module page (Employees, Departments, …). No standalone "Studio".
 */
export default function SubModulePage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [def, setDef] = useState<EntityDefinition | null>(null);
  const [records, setRecords] = useState<CustomRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CustomRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, r] = await Promise.all([
        platformApi.getDefinition(id),
        platformApi.listRecords(id, companyId),
      ]);
      setDef(d.data.data ?? null);
      setRecords(r.data.data ?? []);
    } catch (err) {
      setError(apiError(err, 'Failed to load records.'));
    } finally {
      setLoading(false);
    }
  }, [id, companyId]);

  useEffect(() => { void load(); }, [load]);

  const create = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      await platformApi.createRecord(id, values, companyId);
      toast.success(`${def?.label} added.`);
      setCreating(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, 'Failed to save.'));
    } finally {
      setSaving(false);
    }
  };

  const update = async (values: Record<string, unknown>) => {
    if (!editing) return;
    setSaving(true);
    try {
      await platformApi.updateRecord(editing.id, values);
      toast.success('Updated.');
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(apiError(err, 'Failed to update.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (rec: CustomRecord) => {
    try {
      await platformApi.deleteRecord(rec.id);
      toast.success('Deleted.');
      await load();
    } catch (err) {
      toast.error(apiError(err, 'Failed to delete.'));
    }
  };

  return (
    <AppShell>
      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : error ? (
        <Alert kind="error">{error}</Alert>
      ) : !def ? (
        <Alert kind="error">Sub-module not found.</Alert>
      ) : (
        <>
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[26px] font-bold tracking-tight text-frost">{def.pluralLabel}</h1>
              {def.description && <p className="mt-1 text-sm text-frost-dim">{def.description}</p>}
            </div>
            <Button onClick={() => setCreating(true)}><IconPlus size={18} stroke={1.5} /> Add {def.label}</Button>
          </div>

          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-dim">
                    {def.fields.map((f) => <th key={f.key} className="px-4 py-3 font-semibold">{f.label}</th>)}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 ? (
                    <tr><td colSpan={def.fields.length + 1} className="px-4 py-10 text-center text-frost-dim">
                      No records yet. Click “Add {def.label}”.
                    </td></tr>
                  ) : records.map((rec) => (
                    <tr key={rec.id} className="border-b border-border/60 last:border-0 hover:bg-hover/60">
                      {def.fields.map((f) => (
                        <td key={f.key} className="px-4 py-3 text-frost-dim">{renderCell(f, rec.data[f.key])}</td>
                      ))}
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button type="button" aria-label="Edit" className="rounded p-1 text-dim hover:text-frost"
                            onClick={() => setEditing(rec)}><IconPencil size={16} stroke={1.6} /></button>
                          <button type="button" aria-label="Delete" className="rounded p-1 text-dim hover:text-danger"
                            onClick={() => void remove(rec)}><IconTrash size={16} stroke={1.6} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {creating && (
            <Modal open title={`Add ${def.label}`} onClose={() => setCreating(false)} size="xl">
              <DynamicForm fields={def.fields} submitLabel="Save" loading={saving}
                onSubmit={create} onCancel={() => setCreating(false)} />
            </Modal>
          )}
          {editing && (
            <Modal open title={`Edit ${def.label}`} onClose={() => setEditing(null)} size="xl">
              <DynamicForm fields={def.fields} initial={editing.data} submitLabel="Update" loading={saving}
                onSubmit={update} onCancel={() => setEditing(null)} />
            </Modal>
          )}
        </>
      )}
    </AppShell>
  );
}
