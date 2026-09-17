import { useState } from 'react';
import { IconSearch, IconX } from '@tabler/icons-react';

/**
 * A table header cell with in-header search: shows the label + a search icon; clicking the icon
 * opens an input (or dropdown for `options`) right inside the heading and filters by that column.
 * The icon highlights while a filter is active. Value/handling live in the parent table.
 */
export function SearchTh({
  label, value, onChange, options, align = 'left', className = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** When provided, the filter is a dropdown of these choices instead of a text input. */
  options?: string[] | null;
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const active = value.trim().length > 0;

  return (
    <th className={`px-4 py-3 align-top ${className}`}>
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        <span>{label}</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={`Search ${label}`}
          className={`rounded p-0.5 transition-colors ${active ? 'text-glow' : 'text-dim hover:text-frost'}`}
        >
          <IconSearch size={13} stroke={1.8} />
        </button>
      </div>

      {(open || active) && (
        <div className="mt-1.5 font-normal normal-case">
          {options && options.length > 0 ? (
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={() => { if (!value.trim()) setOpen(false); }}
              className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-frost focus:border-primary focus:outline-none"
            >
              <option value="">All</option>
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <div className="relative">
              <input
                value={value}
                autoFocus={open}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => { if (!value.trim()) setOpen(false); }}
                placeholder="Search…"
                className="w-full rounded border border-border bg-surface px-2 py-1 pr-5 text-xs text-frost placeholder:text-dim focus:border-primary focus:outline-none"
              />
              {active && (
                <button
                  type="button"
                  onClick={() => onChange('')}
                  aria-label="Clear"
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-dim hover:text-danger"
                >
                  <IconX size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </th>
  );
}
