import { useState } from 'react';
import { IconX } from '@tabler/icons-react';
import { Button, Field, SelectField } from './ui';
import { AttachmentView } from './AttachmentView';

/** Uploads a file and returns its reference URL + name. Provided by the module that owns storage. */
export type UploadFile = (file: File) => Promise<{ url: string; fileName: string }>;

/**
 * The shape this engine needs to render a field — deliberately minimal so any module
 * (Platform sub-modules, HR employee tabs, …) can drive it without a cross-module dependency.
 */
export type DynFieldType =
  | 'Text' | 'TextArea' | 'Number' | 'Currency' | 'Date' | 'Boolean' | 'Select' | 'Email' | 'Phone' | 'Attachment';

export interface DynField {
  key: string;
  label: string;
  type: DynFieldType;
  isRequired: boolean;
  options?: string[] | null;
  placeholder?: string | null;
}

/** Formats a stored record value for display in a list cell. */
export function renderCell(field: DynField, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field.type === 'Boolean') return value ? 'Yes' : 'No';
  if (field.type === 'Attachment') return 'Attached'; // interactive view is rendered separately
  if (field.type === 'Currency' && typeof value === 'number')
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return String(value);
}

/** One input rendered from a field definition. */
function DynamicInput({
  field,
  value,
  onChange,
  uploadFile,
}: {
  field: DynField;
  value: unknown;
  onChange: (v: unknown) => void;
  uploadFile?: UploadFile;
}) {
  const label = field.isRequired ? `${field.label} *` : field.label;
  const str = value === null || value === undefined ? '' : String(value);
  const [uploading, setUploading] = useState(false);

  switch (field.type) {
    case 'Attachment': {
      const current = typeof value === 'string' ? value : '';
      return (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-frost-dim">{label}</span>
          <div className="flex flex-wrap items-center gap-3">
            <input type="file" disabled={!uploadFile || uploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !uploadFile) return;
                setUploading(true);
                try { const r = await uploadFile(file); onChange(r.url); } finally { setUploading(false); }
              }}
              className="max-w-full text-sm text-frost-dim file:mr-3 file:rounded-lg file:border-0 file:bg-brand-weak file:px-3 file:py-1.5 file:text-glow hover:file:bg-primary/25" />
            {uploading && <span className="text-xs text-dim">Uploading…</span>}
            {current && !uploading && <AttachmentView url={current} label="View current" />}
            {current && !uploading && (
              <button type="button" onClick={() => onChange('')} aria-label="Remove file"
                className="text-dim hover:text-danger"><IconX size={16} stroke={1.6} /></button>
            )}
          </div>
        </div>
      );
    }
    case 'Boolean':
      return (
        <label className="flex items-center gap-2 py-1 text-sm text-frost-dim">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary" />
          {label}
        </label>
      );
    case 'TextArea':
      return (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-frost-dim">{label}</span>
          <textarea rows={3} value={str} placeholder={field.placeholder ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-frost placeholder:text-dim focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary" />
        </div>
      );
    case 'Select':
      return (
        <SelectField label={label} value={str} onChange={(e) => onChange(e.target.value)}
          options={[{ value: '', label: '— Select —' }, ...(field.options ?? []).map((o) => ({ value: o, label: o }))]} />
      );
    case 'Number':
    case 'Currency':
      return <Field label={label} type="number" step="any" value={str} placeholder={field.placeholder ?? ''}
        onChange={(e) => onChange(e.target.value)} />;
    case 'Date':
      return <Field label={label} type="date" value={str} onChange={(e) => onChange(e.target.value)} />;
    case 'Email':
      return <Field label={label} type="email" value={str} placeholder={field.placeholder ?? ''}
        onChange={(e) => onChange(e.target.value)} />;
    default: // Text, Phone
      return <Field label={label} value={str} placeholder={field.placeholder ?? ''}
        onChange={(e) => onChange(e.target.value)} />;
  }
}

/**
 * Just the inputs for a set of fields (no buttons) — embed anywhere (forms, wizard tabs, list rows).
 * `columns` lays the fields out in a responsive grid so long forms fit on screen without scrolling
 * (1 = single column; 2 or 3 = grid, with long-text fields spanning the full width).
 */
export function DynamicFields({
  fields, values, set, columns = 1, uploadFile,
}: {
  fields: DynField[];
  values: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
  columns?: 1 | 2 | 3;
  uploadFile?: UploadFile;
}) {
  const container =
    columns >= 3 ? 'grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3'
    : columns === 2 ? 'grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2'
    : 'flex flex-col gap-4';

  const spanFull = (f: DynField) =>
    columns > 1 && f.type === 'TextArea'
      ? (columns >= 3 ? 'sm:col-span-2 lg:col-span-3' : 'sm:col-span-2')
      : '';

  return (
    <div className={container}>
      {fields.map((f) => (
        <div key={f.key} className={spanFull(f)}>
          <DynamicInput field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} uploadFile={uploadFile} />
        </div>
      ))}
    </div>
  );
}

/** A data-entry form generated from a sub-module's field definitions. */
export function DynamicForm({
  fields,
  initial,
  submitLabel,
  loading,
  columns = 1,
  uploadFile,
  onSubmit,
  onCancel,
}: {
  fields: DynField[];
  initial?: Record<string, unknown>;
  submitLabel: string;
  loading?: boolean;
  columns?: 1 | 2 | 3;
  uploadFile?: UploadFile;
  onSubmit: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...(initial ?? {}) }));
  const set = (k: string, v: unknown) => setValues((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="flex flex-col gap-4">
      <DynamicFields fields={fields} values={values} set={set} columns={columns} uploadFile={uploadFile} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button loading={loading} onClick={() => onSubmit(values)}>{submitLabel}</Button>
      </div>
    </div>
  );
}
