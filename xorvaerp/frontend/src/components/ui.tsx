import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { IconChevronDown, IconX, IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';

/* ═══════════════════════════════════════════════════════════════
   Xorva UI primitives — no component library, pure Tailwind.
   Quiet-violet, minimalist: hairline borders, tonal depth, one
   accent used only for primary actions / focus / active states.
   Same exported API as before so every page keeps working.
   ═══════════════════════════════════════════════════════════════ */

// ─── Button ─────────────────────────────────────────────────────

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  const variants: Record<string, string> = {
    primary:
      'bg-primary text-white shadow-soft-sm hover:bg-glow active:translate-y-px ' +
      'dark:shadow-[inset_0_1px_0_rgba(255,255,255,.08)]',
    secondary:
      'bg-abyss text-frost border border-border shadow-soft-sm hover:border-border-strong hover:bg-hover active:translate-y-px',
    ghost: 'bg-transparent text-frost-dim hover:bg-hover hover:text-frost',
    danger: 'bg-danger text-white shadow-soft-sm hover:brightness-95 active:translate-y-px',
  };
  const sizes = size === 'sm' ? 'h-8 px-3 text-[13px] gap-1.5' : 'h-10 px-4 text-sm gap-2';

  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex select-none items-center justify-center whitespace-nowrap rounded-lg font-semibold
        transition-[background-color,border-color,color,transform,box-shadow] duration-150
        disabled:pointer-events-none disabled:opacity-50
        ${sizes} ${variants[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

// ─── Shared control styling ─────────────────────────────────────

const control =
  'w-full rounded-lg border bg-abyss text-sm text-frost shadow-soft-sm ' +
  'transition-[border-color,box-shadow,background-color] duration-150 ' +
  'hover:border-border-strong focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 ' +
  'disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70';

function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="text-[12.5px] font-semibold text-frost-dim">
      {children}
      {required && <span className="ml-0.5 text-danger">*</span>}
    </label>
  );
}

// ─── Form field (label + input + error) ─────────────────────────

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
  hint?: string;
}

export function Field({ label, error, icon, hint, className = '', required, ...rest }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label required={required}>{label}</Label>}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim">{icon}</span>
        )}
        <input
          required={required}
          aria-invalid={!!error || undefined}
          className={`${control} h-10 px-3 ${error ? 'border-danger focus:border-danger focus:ring-danger/15' : 'border-border'} ${icon ? 'pl-9' : ''} ${className}`}
          {...rest}
        />
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-dim">{hint}</p> : null}
    </div>
  );
}

// ─── Select field ───────────────────────────────────────────────

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string | number; label: string }[];
}

export function SelectField({ label, error, options, className = '', required, ...rest }: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label required={required}>{label}</Label>}
      <div className="relative">
        <select
          required={required}
          aria-invalid={!!error || undefined}
          className={`${control} h-10 appearance-none px-3 pr-9 ${error ? 'border-danger' : 'border-border'} ${className}`}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-abyss text-frost">
              {opt.label}
            </option>
          ))}
        </select>
        <IconChevronDown size={15} stroke={2} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-dim" />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

// ─── Alert ──────────────────────────────────────────────────────

export function Alert({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  const styles =
    kind === 'error'
      ? 'border-danger/25 bg-[var(--c-bad-weak)] text-danger'
      : 'border-success/25 bg-[var(--c-ok-weak)] text-success';
  const Icon = kind === 'error' ? IconAlertCircle : IconCircleCheck;
  return (
    <div role="alert" className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${styles}`}>
      <Icon size={16} stroke={2} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 text-frost [&_b]:font-semibold">{children}</div>
    </div>
  );
}

// ─── Card ───────────────────────────────────────────────────────

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-abyss p-5 shadow-soft-sm ${className}`}>
      {children}
    </div>
  );
}

// ─── Modal ──────────────────────────────────────────────────────

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Max width of the dialog. Default 'lg'. Use '3xl' for line-item editors (invoices/bills). */
  size?: 'lg' | 'xl' | '2xl' | '3xl';
}

const MODAL_WIDTHS: Record<NonNullable<ModalProps['size']>, string> = {
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
};

export function Modal({ open, title, onClose, children, size = 'lg' }: ModalProps) {
  // Esc closes; body scroll locks while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-[rgba(10,10,20,.45)] p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-pop flex max-h-[92vh] w-full ${MODAL_WIDTHS[size]} flex-col rounded-t-2xl border border-border bg-abyss shadow-soft-lg sm:rounded-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <h2 className="text-[15px] font-bold text-frost">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 rounded-md p-1.5 text-dim transition-colors hover:bg-hover hover:text-frost"
          >
            <IconX size={17} stroke={2} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Spinner ────────────────────────────────────────────────────

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-4 w-4 border-2', md: 'h-7 w-7 border-2', lg: 'h-10 w-10 border-[3px]' };
  return (
    <span
      className={`inline-block animate-spin rounded-full border-border-strong border-t-primary ${sizes[size]}`}
      aria-label="Loading"
    />
  );
}

// ─── Full-page loading state ────────────────────────────────────

export function FullPageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-void">
      <Spinner size="lg" />
    </div>
  );
}

// ─── Xorva logo mark ────────────────────────────────────────────

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-11 w-11 rounded-xl' : 'h-8 w-8 rounded-[9px]';
  const glyph = size === 'lg' ? 26 : 19;
  const text = size === 'lg' ? 'text-2xl' : 'text-[17px]';
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex items-center justify-center bg-primary text-white shadow-soft-sm ${box}`}>
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 5l12 14M18 5L6 19" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </span>
      <span className={`font-bold tracking-tight text-frost ${text}`}>Xorva</span>
    </div>
  );
}
