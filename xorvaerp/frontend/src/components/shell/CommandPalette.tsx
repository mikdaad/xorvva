import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconSearch, IconArrowRight, IconMoon, IconSun, IconLogout, IconBuilding } from '@tabler/icons-react';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useTheme } from '../../stores/ThemeContext';
import { DASHBOARD, NAV_GROUPS, type RoleName } from './navConfig';

interface Cmd {
  id: string;
  label: string;
  group: string;
  keywords?: string;
  icon: ComponentType<{ size?: number; stroke?: number; className?: string }>;
  run: () => void;
}

/**
 * ⌘K / Ctrl+K palette: jump to any screen the user may see, switch company, toggle theme.
 * Pure client-side — no API calls — so it's instant.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { companies, activeCompany, setActiveCompanyId, canSwitch } = useCompany();
  const { theme, toggleTheme } = useTheme();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const role = (user?.role ?? 'Employee') as RoleName;

  const commands = useMemo<Cmd[]>(() => {
    const go = (to: string) => () => { navigate(to); onClose(); };
    const nav: Cmd[] = [{ id: DASHBOARD.to, label: DASHBOARD.label, group: 'Go to', icon: DASHBOARD.icon, run: go(DASHBOARD.to) }];
    for (const g of NAV_GROUPS) {
      if (g.module && activeCompany && !activeCompany.activeModules.includes(g.module)) continue;
      for (const i of g.items) {
        if (!g.functionGate && !i.roles.includes(role)) continue;
        nav.push({ id: i.to, label: i.label, group: g.heading, keywords: g.heading, icon: i.icon, run: go(i.to) });
      }
    }
    const extra: Cmd[] = [];
    if (canSwitch) {
      for (const c of companies) {
        if (c.id === activeCompany?.id) continue;
        extra.push({ id: `co:${c.id}`, label: `Switch to ${c.name}`, group: 'Company', keywords: 'company switch', icon: IconBuilding, run: () => { setActiveCompanyId(c.id); onClose(); } });
      }
    }
    extra.push({ id: 'theme', label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', group: 'Preferences', keywords: 'theme dark light appearance', icon: theme === 'dark' ? IconSun : IconMoon, run: () => { toggleTheme(); onClose(); } });
    extra.push({ id: 'logout', label: 'Sign out', group: 'Account', keywords: 'logout', icon: IconLogout, run: () => { onClose(); logout(); } });
    return [...nav, ...extra];
  }, [navigate, onClose, role, activeCompany, canSwitch, companies, setActiveCompanyId, theme, toggleTheme, logout]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands.slice(0, 12);
    const tokens = s.split(/\s+/);
    return commands
      .map((c) => {
        const hay = `${c.label} ${c.group} ${c.keywords ?? ''}`.toLowerCase();
        if (!tokens.every((t) => hay.includes(t))) return null;
        const score = c.label.toLowerCase().startsWith(s) ? 0 : c.label.toLowerCase().includes(s) ? 1 : 2;
        return { c, score };
      })
      .filter((x): x is { c: Cmd; score: number } => !!x)
      .sort((a, b) => a.score - b.score)
      .slice(0, 14)
      .map((x) => x.c);
  }, [q, commands]);

  useEffect(() => { if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 10); } }, [open]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); results[active]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let lastGroup = '';

  return (
    <div className="animate-fade fixed inset-0 z-[60] flex items-start justify-center bg-[rgba(6,8,12,.5)] p-4 pt-[12vh] backdrop-blur-[3px]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Command palette"
        className="animate-pop panel-strong w-full max-w-xl overflow-hidden rounded-2xl border border-border shadow-soft-lg"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <IconSearch size={18} stroke={2} className="shrink-0 text-dim" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search pages, companies, actions…"
            className="h-12 flex-1 bg-transparent text-[15px] text-frost placeholder:text-dim focus:outline-none"
          />
          <kbd>esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 && <p className="px-3 py-8 text-center text-sm text-dim">No matches.</p>}
          {results.map((c, i) => {
            const showGroup = c.group !== lastGroup;
            lastGroup = c.group;
            const Icon = c.icon;
            return (
              <div key={c.id}>
                {showGroup && <p className="label-mono px-2.5 pb-1 pt-2.5 text-dim">{c.group}</p>}
                <button
                  type="button"
                  data-i={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={c.run}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors
                    ${i === active ? 'bg-brand-weak text-frost' : 'text-frost-dim'}`}
                >
                  <Icon size={16} stroke={1.75} className={i === active ? 'text-glow' : 'text-dim'} />
                  <span className="flex-1 truncate">{c.label}</span>
                  {i === active && <IconArrowRight size={14} className="text-dim" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 font-mono text-[10.5px] text-dim">
          <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
        </div>
      </div>
    </div>
  );
}
