import { useEffect, useId, useState, type ReactNode } from 'react';

/* ═══════════════════════════════════════════════════════════════
   Dashboard building blocks — the refined-violet, soft-flat kit.
   dataviz method: numbers wear ink tokens (not the accent);
   magnitude-across-a-few-items is a horizontal bar list (one hue);
   part-to-whole is a donut ring. Charts are hand-built, theme-aware.
   ═══════════════════════════════════════════════════════════════ */

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-frost md:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-frost-dim">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = 'default' | 'primary' | 'warning' | 'success' | 'danger';
const ICON_TONE: Record<Tone, string> = {
  default: 'bg-surface text-frost-dim',
  primary: 'bg-primary/15 text-glow',
  warning: 'bg-warning/15 text-warning',
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
};

export function StatTile({
  label, value, hint, delta, icon, tone = 'primary',
}: {
  label: string; value: ReactNode; hint?: string; delta?: string; icon?: ReactNode; tone?: Tone;
}) {
  return (
    <div className="rounded-2xl border border-border bg-abyss p-[18px] shadow-soft-sm">
      <div className="flex items-center gap-2.5">
        {icon && <span className={`flex h-[30px] w-[30px] items-center justify-center rounded-lg ${ICON_TONE[tone]}`}>{icon}</span>}
        <span className="text-[11px] font-bold uppercase tracking-wider text-dim">{label}</span>
      </div>
      <div className="mt-3 text-[30px] font-extrabold leading-none tracking-tight text-frost tabular-nums">{value}</div>
      {(hint || delta) && (
        <div className="mt-1.5 text-xs text-frost-dim">
          {delta && <span className="font-bold text-success">{delta} </span>}{hint}
        </div>
      )}
    </div>
  );
}

export function SectionCard({ title, icon, action, children, className = '' }: {
  title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-border bg-abyss shadow-soft ${className}`}>
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
        {icon && <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface text-frost-dim">{icon}</span>}
        <h3 className="text-sm font-bold text-frost">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/** Horizontal magnitude bars — the honest form for "value across a few named items". */
export function BarList({ items }: { items: { label: string; value: number; hint?: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const [grown, setGrown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setGrown(true), 40); return () => clearTimeout(t); }, []);
  return (
    <div className="flex flex-col gap-3">
      {items.map((i) => (
        <div key={i.label} className="grid grid-cols-[92px_1fr_38px] items-center gap-3">
          <span className="truncate text-[12.5px] text-frost-dim">{i.label}</span>
          <div className="h-2 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-linear-to-r from-brand-2 to-primary transition-[width] duration-700 ease-out"
              style={{ width: grown ? `${Math.max(4, (i.value / max) * 100)}%` : '4%' }}
            />
          </div>
          <span className="text-right text-[12.5px] font-bold tabular-nums text-frost">
            {i.value}{i.hint ? <span className="text-dim"> {i.hint}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Donut ring for part-to-whole (e.g. leave used vs remaining). Center shows what's left. */
export function StatRing({ label, used, total, caption = 'left' }: {
  label: string; used: number; total: number; caption?: string;
}) {
  const R = 34, C = 2 * Math.PI * R;
  const pct = total > 0 ? Math.min(1, used / total) : 0;
  const left = Math.max(0, total - used);
  const [offset, setOffset] = useState(C);
  useEffect(() => { const t = setTimeout(() => setOffset(C * (1 - pct)), 60); return () => clearTimeout(t); }, [C, pct]);
  return (
    <div className="flex flex-col items-center gap-2 py-1.5">
      <div className="relative h-[88px] w-[88px]">
        <svg viewBox="0 0 88 88" className="h-[88px] w-[88px] -rotate-90">
          <circle cx="44" cy="44" r={R} fill="none" strokeWidth="8" style={{ stroke: 'var(--c-inset)' }} />
          <circle
            cx="44" cy="44" r={R} fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={C}
            style={{ stroke: 'var(--c-brand)', strokeDashoffset: offset, transition: 'stroke-dashoffset .9s cubic-bezier(.4,0,.2,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-extrabold tabular-nums text-frost">{left}</span>
          <span className="text-[10px] font-semibold text-dim">{caption}</span>
        </div>
      </div>
      <div className="text-center text-[11.5px] font-semibold text-frost-dim">
        {label} · <span className="tabular-nums text-dim">{used}/{total}</span>
      </div>
    </div>
  );
}

/** Area sparkline for a real time-series (endpoint emphasised). Only render with real data. */
export function Sparkline({ data, height = 46 }: { data: number[]; height?: number }) {
  const id = useId();
  const W = 180, H = height, pad = 4;
  if (data.length < 2) return null;
  const mn = Math.min(...data), mx = Math.max(...data);
  const pts = data.map((v, i) => {
    const x = pad + (i * (W - 2 * pad)) / (data.length - 1);
    const y = H - pad - ((v - mn) / (mx - mn || 1)) * (H - 2 * pad);
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-2 block h-[46px] w-full">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--c-brand)', stopOpacity: 0.28 }} />
          <stop offset="1" style={{ stopColor: 'var(--c-brand)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--c-brand)' }} />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="3" strokeWidth="2" style={{ fill: 'var(--c-brand)', stroke: 'var(--c-surface)' }} />
    </svg>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'ok' | 'warn' | 'bad' }) {
  const cls: Record<string, string> = {
    neutral: 'bg-surface text-frost-dim',
    brand: 'bg-primary/15 text-glow',
    ok: 'bg-success/15 text-success',
    warn: 'bg-warning/15 text-warning',
    bad: 'bg-danger/15 text-danger',
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${cls[tone]}`}>{children}</span>;
}

export function Avatar({ initials, size = 'md', gradient = false }: {
  initials: string; size?: 'sm' | 'md' | 'lg'; gradient?: boolean;
}) {
  const s = size === 'lg' ? 'h-12 w-12 text-base' : size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-9 w-9 text-[13px]';
  const skin = gradient ? 'bg-linear-to-br from-brand-2 to-primary text-white' : 'bg-primary/15 text-glow';
  return <span className={`flex ${s} items-center justify-center rounded-full font-bold ${skin}`}>{initials}</span>;
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <div className="py-6 text-center text-sm text-dim">{children}</div>;
}
