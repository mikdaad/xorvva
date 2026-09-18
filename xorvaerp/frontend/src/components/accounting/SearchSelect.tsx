import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { IconChevronDown, IconX } from '@tabler/icons-react';

export interface SearchSelectOption {
  value: string;
  label: string;
  hint?: string;
  /** Extra text matched by the filter but not displayed (e.g. account code). */
  keywords?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  required?: boolean;
  clearable?: boolean;
  /** Compact (grid cell) or regular (form field) sizing. */
  size?: 'sm' | 'md';
  className?: string;
  emptyMessage?: string;
  'aria-label'?: string;
}

/**
 * Keyboard-first combobox used by the Tally-style voucher grid.
 * Type to filter, ↑/↓ to move, Enter to pick, Esc to close. Enter on a
 * closed picker bubbles up so the grid can advance to the next cell.
 */
export function SearchSelect({
  value, onChange, options, placeholder = 'Search…', label, disabled, required, clearable = true,
  size = 'md', className = '', emptyMessage = 'No matches', ...aria
}: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 200);
    return options
      .filter((o) => `${o.label} ${o.hint ?? ''} ${o.keywords ?? ''}`.toLowerCase().includes(q))
      .slice(0, 200);
  }, [options, query]);

  useEffect(() => { setActive(0); }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (opt: SearchSelectOption) => {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true); else setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && filtered[active]) {
        e.preventDefault();
        e.stopPropagation();
        pick(filtered[active]);
      }
      // closed → let the parent grid handle "Enter = next field"
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setQuery(''); }
    } else if (e.key === 'Backspace' && !query && selected && clearable) {
      onChange('');
    }
  };

  const pad = size === 'sm' ? 'px-2 py-1.5 text-sm' : 'px-3 py-2.5 text-sm';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} ref={wrapRef}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-frost-dim">
          {label}{required && <span className="text-danger"> *</span>}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-label={aria['aria-label'] ?? label}
          autoComplete="off"
          disabled={disabled}
          value={open ? query : (selected?.label ?? '')}
          placeholder={selected ? selected.label : placeholder}
          onClick={() => { if (!disabled) setOpen(true); }}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onKeyDown={onKeyDown}
          className={`w-full rounded-lg border border-border bg-surface ${pad} pr-8 text-frost placeholder:text-dim
            transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25
            disabled:cursor-not-allowed disabled:opacity-60`}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-dim">
          {selected && clearable && !disabled ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Clear"
              className="pointer-events-auto rounded p-0.5 hover:bg-hover hover:text-frost"
              onMouseDown={(e) => { e.preventDefault(); onChange(''); setQuery(''); }}
            >
              <IconX size={14} />
            </button>
          ) : <IconChevronDown size={14} />}
        </span>

        {open && (
          <ul
            id={`${id}-list`}
            ref={listRef}
            role="listbox"
            className="absolute left-0 z-40 mt-1 max-h-64 w-full min-w-[16rem] overflow-auto rounded-lg border border-border bg-abyss py-1 shadow-soft"
          >
            {filtered.length === 0 && <li className="px-3 py-2 text-xs text-dim">{emptyMessage}</li>}
            {filtered.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-sm
                  ${i === active ? 'bg-brand-weak text-frost' : 'text-frost-dim'} ${o.value === value ? 'font-semibold' : ''}`}
              >
                <span className="truncate">{o.label}</span>
                {o.hint && <span className="shrink-0 font-mono text-[11px] text-dim">{o.hint}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
