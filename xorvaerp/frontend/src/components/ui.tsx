import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { IconChevronDown, IconX } from '@tabler/icons-react';

/* ═══════════════════════════════════════════════════════════════
   Xorva UI primitives — no component library, pure Tailwind.
   Refined-violet, soft-flat: neutral hairlines (border-border),
   soft theme-aware shadows, gradient brand fills for primary.
   ═══════════════════════════════════════════════════════════════ */

// ─── Button ─────────────────────────────────────────────────────

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  loading = false,
  block = false,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  const variants: Record<string, string> = {
    primary: 'bg-linear-to-br from-brand-2 to-primary text-white shadow-soft-sm hover:brightness-[1.08]',
    secondary: 'bg-abyss border border-border text-frost hover:bg-hover',
    ghost: 'bg-transparent hover:bg-surface text-frost-dim hover:text-frost',
    danger: 'bg-danger text-white hover:brightness-[1.08]',
  };

  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold
        transition-[filter,background-color,color] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40
        disabled:cursor-not-allowed disabled:opacity-60
        ${variants[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

// ─── Form field (label + input + error) ─────────────────────────

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export function Field({ label, error, icon, className = '', ...rest }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-frost-dim">{label}</label>}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim">
            {icon}
          </span>
        )}
        <input
          className={`w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-frost
            placeholder:text-dim transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-primary/25
            ${error ? 'border-danger' : 'border-border focus:border-primary'}
            ${icon ? 'pl-10' : ''} ${className}`}
          {...rest}
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

// ─── Select field ───────────────────────────────────────────────

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string | number; label: string }[];
}

export function SelectField({ label, error, options, className = '', ...rest }: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-frost-dim">{label}</label>}
      <div className="relative">
        <select
          className={`w-full appearance-none rounded-lg border bg-surface px-3 py-2.5 pr-10 text-sm text-frost
            transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary/25
            ${error ? 'border-danger' : 'border-border focus:border-primary'} ${className}`}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-abyss text-frost">
              {opt.label}
            </option>
          ))}
        </select>
        <IconChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-dim" />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

// ─── Alert ──────────────────────────────────────────────────────

export function Alert({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  const styles =
    kind === 'error'
      ? 'border-danger/40 bg-danger/10 text-danger'
      : 'border-success/40 bg-success/10 text-success';

  return (
    <div role="alert" className={`rounded-lg border px-3.5 py-2.5 text-sm ${styles}`}>
      {children}
    </div>
  );
}

// ─── Card ───────────────────────────────────────────────────────

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-abyss p-6 shadow-soft ${className}`}>
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
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${MODAL_WIDTHS[size]} rounded-2xl border border-border bg-abyss p-6 shadow-soft`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-frost">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-dim transition-colors hover:bg-surface hover:text-frost"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Spinner ────────────────────────────────────────────────────

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-4 w-4 border-2', md: 'h-8 w-8 border-2', lg: 'h-12 w-12 border-4' };
  return (
    <span
      className={`inline-block animate-spin rounded-full border-primary/25 border-t-glow ${sizes[size]}`}
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
  const box = size === 'lg' ? 'h-11 w-11 text-xl' : 'h-9 w-9 text-lg';
  const text = size === 'lg' ? 'text-2xl' : 'text-xl';
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`flex items-center justify-center rounded-xl bg-linear-to-br from-brand-2 to-primary font-extrabold text-white shadow-soft-sm ${box}`}
      >
        X
      </span>
      <span className={`font-extrabold tracking-tight text-frost ${text}`}>Xorva</span>
    </div>
  );
}
