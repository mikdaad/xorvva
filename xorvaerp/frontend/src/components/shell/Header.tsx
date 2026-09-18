import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { IconBell, IconCheck, IconChevronDown, IconLogout, IconMenu2, IconMoon, IconSun, IconSearch, IconSelector } from '@tabler/icons-react';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useTheme } from '../../stores/ThemeContext';
import { approvalsApi } from '../../api/approvals.api';
import { ROLE_LABELS } from '../../utils/roles';
import { DASHBOARD, NAV_GROUPS } from './navConfig';

function useClickOutside<T extends HTMLElement>(onOut: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onOut]);
  return ref;
}

/** Breadcrumb derived from navConfig: "Accounting / Voucher Register". */
function useCrumbs(pathname: string) {
  if (pathname === DASHBOARD.to) return [{ label: DASHBOARD.label, to: DASHBOARD.to }];
  for (const g of NAV_GROUPS) {
    const item = [...g.items].sort((a, b) => b.to.length - a.to.length)
      .find((i) => pathname === i.to || pathname.startsWith(i.to + '/'));
    if (item) {
      const crumbs = [{ label: g.heading, to: g.items[0]?.to ?? item.to }];
      if (item.to !== g.items[0]?.to) crumbs.push({ label: item.label, to: item.to });
      return crumbs;
    }
  }
  return [];
}

export function Header({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const { user, logout } = useAuth();
  const { companies, activeCompany, setActiveCompanyId, canSwitch } = useCompany();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const crumbs = useCrumbs(pathname);

  const [companyOpen, setCompanyOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [pending, setPending] = useState(0);

  const companyRef = useClickOutside<HTMLDivElement>(() => setCompanyOpen(false));
  const userRef = useClickOutside<HTMLDivElement>(() => setUserOpen(false));

  const isApprover = ['SuperAdmin', 'CompanyAdmin', 'Manager'].includes(user?.role ?? '');
  const isSelfService = ['Manager', 'Employee'].includes(user?.role ?? '');

  useEffect(() => {
    if (!isApprover) return;
    approvalsApi.pending().then((r) => setPending(r.data.data?.length ?? 0)).catch(() => {});
  }, [isApprover, pathname]);

  if (!user) return null;
  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();

  const iconBtn = 'flex h-9 w-9 items-center justify-center rounded-lg text-frost-dim transition-colors hover:bg-hover hover:text-frost';

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-void/80 px-4 backdrop-blur-md md:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <button className={`${iconBtn} -ml-2 md:hidden`} onClick={onMenu} aria-label="Open menu">
          <IconMenu2 size={20} />
        </button>

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[13px] sm:flex">
          {crumbs.map((c, i) => (
            <span key={c.to} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <span className="text-border-strong">/</span>}
              {i === crumbs.length - 1
                ? <span className="truncate font-semibold text-frost">{c.label}</span>
                : <Link to={c.to} className="truncate text-frost-dim hover:text-frost">{c.label}</Link>}
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-1">
        {/* Company switcher */}
        {canSwitch ? (
          <div className="relative mr-1" ref={companyRef}>
            <button
              onClick={() => setCompanyOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={companyOpen}
              className="flex h-9 items-center gap-2 rounded-lg border border-border bg-abyss px-2.5 text-[13px] font-medium text-frost shadow-soft-sm transition-colors hover:border-border-strong"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-weak text-[10px] font-bold text-glow">
                {(activeCompany?.name ?? '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden max-w-[11rem] truncate sm:block">{activeCompany?.name ?? 'Select company'}</span>
              <IconSelector size={14} className="text-dim" />
            </button>
            {companyOpen && (
              <div className="popover animate-menu absolute right-0 mt-1.5 w-64 p-1.5">
                <div className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-dim">Switch company</div>
                {companies.map((c) => (
                  <button
                    key={c.id}
                    role="option"
                    aria-selected={c.id === activeCompany?.id}
                    onClick={() => { setActiveCompanyId(c.id); setCompanyOpen(false); }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] text-frost-dim transition-colors hover:bg-hover hover:text-frost"
                  >
                    <span className="truncate">{c.name}</span>
                    {c.id === activeCompany?.id && <IconCheck size={15} stroke={2.2} className="text-glow" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <button onClick={onSearch} className={`${iconBtn} md:hidden`} aria-label="Search"><IconSearch size={19} stroke={1.75} /></button>

        <button
          onClick={toggleTheme}
          className={iconBtn}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <IconSun size={19} stroke={1.75} /> : <IconMoon size={19} stroke={1.75} />}
        </button>

        {isApprover && (
          <Link to="/approvals/pending" className={`${iconBtn} relative`} aria-label="Pending approvals">
            <IconBell size={19} stroke={1.75} />
            {pending > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-white ring-2 ring-void">
                {pending > 9 ? '9+' : pending}
              </span>
            )}
          </Link>
        )}

        {/* User menu */}
        <div className="relative ml-1" ref={userRef}>
          <button
            onClick={() => setUserOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={userOpen}
            className="flex h-9 items-center gap-2 rounded-lg pl-1 pr-1.5 transition-colors hover:bg-hover"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
              {initials || 'U'}
            </span>
            <IconChevronDown size={14} className="hidden text-dim sm:block" />
          </button>
          {userOpen && (
            <div className="popover animate-menu absolute right-0 mt-1.5 w-60 p-1.5" role="menu">
              <div className="px-2.5 py-2">
                <div className="truncate text-[13px] font-semibold text-frost">{user.fullName}</div>
                <div className="truncate text-xs text-dim">{user.email}</div>
                <span className="mt-1.5 inline-block rounded-md bg-surface px-1.5 py-0.5 text-[10.5px] font-semibold text-frost-dim">{ROLE_LABELS[user.role] ?? user.role}</span>
              </div>
              <div className="my-1 border-t border-border" />
              {isSelfService && (
                <button
                  role="menuitem"
                  onClick={() => { setUserOpen(false); navigate('/hr/leave'); }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-frost-dim transition-colors hover:bg-hover hover:text-frost"
                >
                  My Leave
                </button>
              )}
              <button
                role="menuitem"
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-danger transition-colors hover:bg-[var(--c-bad-weak)]"
              >
                <IconLogout size={15} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
