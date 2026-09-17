import { useState } from 'react';
import { IconTrash } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { platformApi, FIELD_TYPES, type EntityDefinition, type FieldInput, type FieldType } from '../api/platform.api';
import type { ApiResponse } from '../api/auth.api';
import { useToast } from '../stores/ToastContext';
import { Alert, Button, Field, Modal, SelectField } from './ui';

const apiError = (err: unknown, fallback: string) => {
  const ax = err as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? fallback;
};

/** Parent modules a custom sub-module can live under (key → friendly label). */
export const PARENT_MODULES = [
  { value: 'Platform', label: 'General' },
  { value: 'HR', label: 'HR' },
  { value: 'Sales', label: 'CRM & Sales' },
  { value: 'Accounting', label: 'Accounting' },
];

export const parentLabel = (key: string) => PARENT_MODULES.find((p) => p.value === key)?.label ?? key;

interface FieldRow {
  label: string;
  type: FieldType;
  isRequired: boolean;
  optionsText: string;
}

/**
 * The no-code sub-module designer. When {@link moduleKey} is provided the sub-module is
 * fixed to that parent module (used by the per-module "Add" buttons); otherwise the user
 * picks where it appears (used by Studio).
 */
export function FormBuilderModal({
  moduleKey,
  attachTo,
  onClose,
  onCreated,
}: {
  moduleKey?: string;
  /** When set (e.g. "Employee"), the sub-module is created as a tab attached to that parent type. */
  attachTo?: string;
  onClose: () => void;
  onCreated: (def: EntityDefinition) => void;
}) {
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [parent, setParent] = useState(moduleKey ?? 'Platform');
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState<FieldRow[]>([{ label: '', type: 'Text', isRequired: false, optionsText: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const setRow = (i: number, patch: Partial<FieldRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    setError(null);
    if (!label.trim()) return setError('Give the sub-module a name.');
    const fields: FieldInput[] = rows
      .filter((r) => r.label.trim())
      .map((r) => ({
        label: r.label.trim(),
        type: r.type,
        isRequired: r.isRequired,
        options: r.type === 'Select' ? r.optionsText.split(',').map((o) => o.trim()).filter(Boolean) : null,
      }));
    if (fields.length === 0) return setError('Add at least one field.');

    setLoading(true);
    try {
      const res = await platformApi.createDefinition({
        label: label.trim(), moduleKey: parent, attachTo, description: description.trim() || undefined, fields,
      });
      toast.success(`Created “${label.trim()}”.`);
      if (res.data.data) onCreated(res.data.data);
    } catch (err) {
      setError(apiError(err, 'Failed to create sub-module.'));
      setLoading(false);
    }
  };

  const grid = 'grid grid-cols-[minmax(8rem,1fr)_9rem_5rem_2rem] items-center gap-2';

  return (
    <Modal open title="New sub-module" onClose={onClose} size="3xl">
      <div className="flex flex-col gap-4">
        {error && <Alert kind="error">{error}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" placeholder="e.g. Training Record" value={label} onChange={(e) => setLabel(e.target.value)} />
          {moduleKey ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-frost-dim">Appears under</span>
              <div className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-frost">{parentLabel(parent)}</div>
            </div>
          ) : (
            <SelectField label="Appears under" options={PARENT_MODULES} value={parent} onChange={(e) => setParent(e.target.value)} />
          )}
        </div>
        <Field label="Description (optional)" placeholder="What is this for?" value={description} onChange={(e) => setDescription(e.target.value)} />

        <div className="flex flex-col gap-2">
          <div className="text-sm font-semibold text-frost">Fields</div>
          <div className={`${grid} px-1 text-[11px] font-semibold uppercase tracking-wide text-dim`}>
            <span>Field label</span><span>Type</span><span>Required</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className={grid}>
              <Field value={r.label} placeholder="e.g. Course name" onChange={(e) => setRow(i, { label: e.target.value })} />
              <SelectField options={FIELD_TYPES} value={r.type} onChange={(e) => setRow(i, { type: e.target.value as FieldType })} />
              <label className="flex items-center justify-center">
                <input type="checkbox" checked={r.isRequired} onChange={(e) => setRow(i, { isRequired: e.target.checked })}
                  className="h-4 w-4 rounded border-border accent-primary" />
              </label>
              <button type="button" aria-label="Remove field"
                className="flex justify-center text-dim transition-colors hover:text-danger disabled:opacity-30"
                disabled={rows.length <= 1} onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
                <IconTrash size={16} stroke={1.6} />
              </button>
              {r.type === 'Select' && (
                <div className="col-span-4 -mt-1 pl-1">
                  <Field value={r.optionsText} placeholder="Options, comma-separated (e.g. Pass, Fail, Pending)"
                    onChange={(e) => setRow(i, { optionsText: e.target.value })} />
                </div>
              )}
            </div>
          ))}
          <button type="button" className="self-start text-sm font-medium text-primary hover:underline"
            onClick={() => setRows((rs) => [...rs, { label: '', type: 'Text', isRequired: false, optionsText: '' }])}>
            + Add field
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Create sub-module</Button>
        </div>
      </div>
    </Modal>
  );
}
