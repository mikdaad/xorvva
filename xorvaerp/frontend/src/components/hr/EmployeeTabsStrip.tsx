import { useState } from 'react';
import {
  IconUser, IconCash, IconLayoutGrid, IconPlus, IconX, IconTrash, IconGripVertical, IconWand, IconPencil, IconSearch,
} from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { hrApi, type EmployeeTab, type EmployeeTabFieldInput } from '../../api/hr.api';
import type { ApiResponse } from '../../api/auth.api';
import type { DynFieldType } from '../dynamic';
import { useToast } from '../../stores/ToastContext';
import { Alert, Button, Field, Modal, SelectField } from '../ui';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

/** Built-in tabs, always present and not removable — the fixed spine backed by the Employee record. */
export const CORE_TABS = [
  { key: 'basic', label: 'Basic' },
  { key: 'compensation', label: 'Compensation' },
] as const;

const FIELD_TYPE_OPTIONS: { value: DynFieldType; label: string }[] = [
  { value: 'Text', label: 'Text' },
  { value: 'TextArea', label: 'Long text' },
  { value: 'Number', label: 'Number' },
  { value: 'Currency', label: 'Currency' },
  { value: 'Date', label: 'Date' },
  { value: 'Boolean', label: 'Yes / No' },
  { value: 'Select', label: 'Dropdown' },
  { value: 'Email', label: 'Email' },
  { value: 'Phone', label: 'Phone' },
  { value: 'Attachment', label: 'File / Photo' },
];

/**
 * The tab bar for the employee record. Shows the built-in Profile & Compensation tabs,
 * then every admin-designed tab, then (for admins) a "+ Add tab" designer and per-tab delete.
 * Used on both the Employees list page and the employee detail page.
 */
export function EmployeeTabsStrip({
  tabs, activeKey, onSelect, canManage, companyId, onChanged,
}: {
  tabs: EmployeeTab[];
  activeKey: string;
  onSelect: (key: string) => void;
  canManage: boolean;
  companyId?: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<EmployeeTab | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const iconFor = (key: string) =>
    key === 'basic' ? IconUser : key === 'compensation' ? IconCash : IconLayoutGrid;

  const [seeding, setSeeding] = useState(false);
  const seed = async () => {
    setSeeding(true);
    try {
      const res = await hrApi.seedEmployeeTabs(companyId);
      toast.success(res.data.message ?? 'Standard tabs added.');
      onChanged();
    } catch (e) { toast.error(err(e, 'Failed to add standard tabs.')); }
    finally { setSeeding(false); }
  };

  const remove = async (tab: EmployeeTab) => {
    if (!confirm(`Delete the "${tab.label}" tab and all its data? This cannot be undone.`)) return;
    setDeleting(tab.id);
    try {
      await hrApi.deleteEmployeeTab(tab.id);
      toast.success(`Removed the "${tab.label}" tab.`);
      if (activeKey === tab.key) onSelect('basic');
      onChanged();
    } catch (e) { toast.error(err(e, 'Failed to delete tab.')); }
    finally { setDeleting(null); }
  };

  const all = [...CORE_TABS.map((t) => ({ key: t.key, label: t.label, core: true, id: '' })),
    ...tabs.map((t) => ({ key: t.key, label: t.label, core: false, id: t.id }))];

  return (
    <>
      <div className="mb-5 flex items-center gap-1.5 overflow-x-auto border-b border-border pb-px">
        {all.map((t) => {
          const Icon = iconFor(t.key);
          const active = activeKey === t.key;
          return (
            <div key={t.key} className="group relative shrink-0">
              <button
                onClick={() => onSelect(t.key)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-t-lg border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-primary text-frost'
                    : 'border-transparent text-frost-dim hover:text-frost'
                }`}
              >
                <Icon size={16} stroke={1.6} />
                {t.label}
                {canManage && !t.core && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); const tab = tabs.find((x) => x.id === t.id); if (tab) setEditing(tab); }}
                    className="ml-0.5 hidden rounded p-0.5 text-dim hover:text-glow group-hover:inline-flex"
                    aria-label={`Edit ${t.label} tab`}
                  >
                    <IconPencil size={13} stroke={1.8} />
                  </span>
                )}
                {canManage && !t.core && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); const tab = tabs.find((x) => x.id === t.id); if (tab) void remove(tab); }}
                    className="hidden rounded p-0.5 text-dim hover:text-danger group-hover:inline-flex"
                    aria-label={`Delete ${t.label} tab`}
                  >
                    {deleting === t.id ? <IconGripVertical size={13} className="animate-pulse" /> : <IconX size={13} stroke={2} />}
                  </span>
                )}
              </button>
            </div>
          );
        })}
        {canManage && (
          <div className="ml-1 flex shrink-0 items-center gap-1.5">
            {tabs.length === 0 && (
              <button
                onClick={() => void seed()}
                disabled={seeding}
                title="Create the standard UAE tabs"
                className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-brand-weak px-3 py-1.5 text-sm font-medium text-glow transition-colors hover:bg-primary/20 disabled:opacity-60"
              >
                <IconWand size={15} stroke={1.8} /> {seeding ? 'Working…' : 'Standard tabs'}
              </button>
            )}
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-dashed border-border px-3 py-1.5 text-sm text-frost-dim transition-colors hover:border-primary hover:text-frost"
            >
              <IconPlus size={15} stroke={1.8} /> Add tab
            </button>
          </div>
        )}
      </div>

      {(adding || editing) && (
        <TabDesignerModal
          companyId={companyId}
          tab={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
          onDone={() => { setAdding(false); setEditing(null); onChanged(); }}
        />
      )}
    </>
  );
}

interface FieldDraft {
  id?: string; // present for existing fields (edit) — preserves the field's data key
  label: string; type: DynFieldType; isRequired: boolean; options: string;
  showInList: boolean; isFilterable: boolean;
}
const emptyField = (): FieldDraft => ({ label: '', type: 'Text', isRequired: false, options: '', showInList: false, isFilterable: false });

function TabDesignerModal({
  companyId, tab, onClose, onDone,
}: { companyId?: string; tab: EmployeeTab | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const isEdit = !!tab;
  const [label, setLabel] = useState(tab?.label ?? '');
  const [isList, setIsList] = useState(tab?.isList ?? false);
  const [fields, setFields] = useState<FieldDraft[]>(
    tab
      ? tab.fields.map((f) => ({
          id: f.id, label: f.label, type: f.type, isRequired: f.isRequired,
          options: (f.options ?? []).join(', '), showInList: f.showInList, isFilterable: f.isFilterable,
        }))
      : [emptyField()],
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const setField = (i: number, patch: Partial<FieldDraft>) =>
    setFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const addField = () => setFields((fs) => [...fs, emptyField()]);
  const removeField = (i: number) => setFields((fs) => fs.filter((_, idx) => idx !== i));

  const submit = async () => {
    setError(null);
    if (!label.trim()) return setError('Give the tab a name.');
    const clean = fields.filter((f) => f.label.trim());
    if (clean.length === 0) return setError('Add at least one field.');
    setLoading(true);
    try {
      const base = clean.map((f) => ({
        label: f.label.trim(),
        type: f.type,
        isRequired: f.isRequired,
        options: f.type === 'Select' ? f.options.split(',').map((o) => o.trim()).filter(Boolean) : null,
        showInList: f.showInList,
        isFilterable: f.isFilterable,
      }));
      if (isEdit) {
        await hrApi.updateEmployeeTab(tab!.id, { label: label.trim(), fields: clean.map((f, i) => ({ id: f.id, ...base[i] })) });
        toast.success(`Updated the "${label.trim()}" tab.`);
      } else {
        await hrApi.createEmployeeTab({ companyId, label: label.trim(), isList, icon: undefined, fields: base as EmployeeTabFieldInput[] });
        toast.success(`Added the "${label.trim()}" tab.`);
      }
      onDone();
    } catch (e) { setError(err(e, 'Failed to save tab.')); setLoading(false); }
  };

  const previewCols = fields.filter((f) => f.label.trim() && f.showInList);

  return (
    <Modal open title={isEdit ? `Edit tab — ${tab!.label}` : 'Design a new tab'} size="2xl" onClose={onClose}>
      <div className="flex max-h-[74vh] flex-col gap-4 overflow-y-auto pr-1">
        {error && <Alert kind="error">{error}</Alert>}

        <Field label="Tab name" placeholder="e.g. Passport & Visa, Security, Training"
          value={label} onChange={(e) => setLabel(e.target.value)} />

        {isEdit ? (
          <p className="text-xs text-dim">
            This tab holds <span className="font-medium text-frost-dim">{isList ? 'a list of many rows' : 'one record per employee'}</span> (fixed).
          </p>
        ) : (
          <div>
            <span className="mb-1.5 block text-sm font-medium text-frost-dim">This tab holds</span>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setIsList(false)}
                className={`rounded-xl border p-3 text-left transition-colors ${!isList ? 'border-primary bg-primary/5' : 'border-border hover:border-frost-dim'}`}>
                <span className="block text-sm font-semibold text-frost">One record per employee</span>
                <span className="mt-0.5 block text-xs text-dim">A single form — e.g. Passport, Security details.</span>
              </button>
              <button type="button" onClick={() => setIsList(true)}
                className={`rounded-xl border p-3 text-left transition-colors ${isList ? 'border-primary bg-primary/5' : 'border-border hover:border-frost-dim'}`}>
                <span className="block text-sm font-semibold text-frost">A list of many rows</span>
                <span className="mt-0.5 block text-xs text-dim">A table — e.g. Training records, Career path.</span>
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-dim">Fields</span>
          <Button variant="ghost" onClick={addField}><IconPlus size={15} stroke={1.8} /> Add field</Button>
        </div>

        <div className="flex flex-col gap-3">
          {fields.map((f, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start gap-3">
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field placeholder="Field label (e.g. Passport No)" value={f.label}
                    onChange={(e) => setField(i, { label: e.target.value })} />
                  <SelectField options={FIELD_TYPE_OPTIONS} value={f.type}
                    onChange={(e) => setField(i, { type: e.target.value as DynFieldType })} />
                </div>
                <button onClick={() => removeField(i)} aria-label="Remove field"
                  className="mt-2.5 shrink-0 text-dim hover:text-danger"><IconTrash size={16} stroke={1.6} /></button>
              </div>
              {f.type === 'Select' && (
                <div className="mt-3">
                  <Field placeholder="Choices, comma-separated (e.g. Low, Medium, High)" value={f.options}
                    onChange={(e) => setField(i, { options: e.target.value })} />
                </div>
              )}
              <div className="mt-2.5 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-frost-dim">
                  <input type="checkbox" className="h-4 w-4 rounded border-border accent-primary"
                    checked={f.isRequired} onChange={(e) => setField(i, { isRequired: e.target.checked })} />
                  Required
                </label>
                <label className="flex items-center gap-2 text-sm text-frost-dim" title="Show this field as a column in the tab's table">
                  <input type="checkbox" className="h-4 w-4 rounded border-border accent-primary"
                    checked={f.showInList} onChange={(e) => setField(i, { showInList: e.target.checked })} />
                  Show as column
                </label>
                <label className="flex items-center gap-2 text-sm text-frost-dim" title="Add a search box in this column's heading">
                  <input type="checkbox" className="h-4 w-4 rounded border-border accent-primary"
                    checked={f.isFilterable} onChange={(e) => setField(i, { isFilterable: e.target.checked })} />
                  Searchable
                </label>
              </div>
            </div>
          ))}
        </div>

        {/* Live preview of the resulting table */}
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-dim">Table preview</span>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border uppercase text-dim">
                <tr>
                  <th className="px-3 py-2"><span className="inline-flex items-center gap-1">Employee <IconSearch size={11} stroke={1.8} /></span></th>
                  {previewCols.map((f, i) => (
                    <th key={i} className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">{f.label}{f.isFilterable && <IconSearch size={11} stroke={1.8} />}</span>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2 text-dim" colSpan={previewCols.length + 2}>
                    {previewCols.length === 0 ? 'Tick "Show as column" on a field to add it here.' : 'Employee rows appear here.'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>{isEdit ? 'Save changes' : 'Create tab'}</Button>
        </div>
      </div>
    </Modal>
  );
}
