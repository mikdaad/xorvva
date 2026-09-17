import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconBell, IconCheck, IconChevronDown, IconLogout, IconMenu2, IconMoon, IconSun } from '@tabler/icons-react';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useTheme } from '../../stores/ThemeContext';
import { approvalsApi } from '../../api/approvals.api';
import { ROLE_LABELS } from '../../utils/roles';

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

export function Header({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const { companies, activeCompany, setActiveCompanyId, canSwitch } = useCompany();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [companyOpen, setCompanyOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [pending, setPending] = useState(0);

  const companyRef = useClickOutside<HTMLDivElement>(() => setCompanyOpen(false));
  const userRef = useClickOutside<HTMLDivElement>(() => setUserOpen(false));

  // Role-appropriate chrome: only approvers have an inbox; only self-service roles take leave.
  const isApprover = ['SuperAdmin', 'CompanyAdmin', 'Manager'].includes(user?.role ?? '');
  const isSelfService = ['Manager', 'Employee'].includes(user?.role ?? '');

  useEffect(() => {
    if (!isApprover) return;
    approvalsApi.pending().then((r) => setPending(r.data.data?.length ?? 0)).catch(() => {});
  }, [isApprover]);

  if (!user) return null;
  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-primary/15 bg-abyss/80 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-3">
        <button className="text-frost-dim md:hidden" onClick={onMenu} aria-label="Open menu">
          <IconMenu2 size={22} />
        </button>

        {/* Company switcher */}
        {canSwitch ? (
          <div className="relative" ref={companyRef}>
            <button
              onClick={() => setCompanyOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg border border-primary/20 bg-surface px-3 py-1.5 text-sm text-frost hover:border-primary/50"
            >
              <span className="max-w-[10rem] truncate font-medium">{activeCompany?.name ?? 'Select company'}</span>
              <IconChevronDown size={16} className="text-dim" />
            </button>
            {companyOpen && (
              <div className="absolute left-0 mt-2 w-60 rounded-xl border border-primary/20 bg-abyss p-1.5 shadow-2xl">
                <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-dim">Switch company</div>
                {companies.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setActiveCompanyId(c.id); setCompanyOpen(false); }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm text-frost-dim hover:bg-surface hover:text-frost"
                  >
                    <span className="truncate">{c.name}</span>
                    {c.id === activeCompany?.id && <IconCheck size={16} className="text-glow" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          activeCompany && (
            <span className="hidden rounded-lg border border-primary/15 bg-surface px-3 py-1.5 text-sm font-medium text-frost-dim sm:block">
              {activeCompany.name}
            </span>
          )
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-frost-dim transition-colors hover:bg-surface hover:text-frost"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <IconSun size={20} stroke={1.6} /> : <IconMoon size={20} stroke={1.6} />}
        </button>

        {/* Notifications — approvers only */}
        {isApprover && (
          <Link
            to="/approvals/pending"
            className="relative rounded-lg p-2 text-frost-dim transition-colors hover:bg-surface hover:text-frost"
            aria-label="Pending approvals"
          >
            <IconBell size={20} stroke={1.6} />
            {pending > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                {pending > 9 ? '9+' : pending}
              </span>
            )}
          </Link>
        )}

        {/* User menu */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserOpen((o) => !o)}
            className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 hover:bg-surface"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              {initials || 'U'}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight text-frost">{user.fullName}</span>
              <span className="block text-xs leading-tight text-dim">{ROLE_LABELS[user.role] ?? user.role}</span>
            </span>
            <IconChevronDown size={16} className="hidden text-dim sm:block" />
          </button>
          {userOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-primary/20 bg-abyss p-1.5 shadow-2xl">
              <div className="border-b border-primary/10 px-3 py-2">
                <div className="text-sm font-medium text-frost">{user.fullName}</div>
                <div className="truncate text-xs text-dim">{user.email}</div>
              </div>
              {isSelfService && (
                <button
                  onClick={() => { setUserOpen(false); navigate('/hr/leave'); }}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-frost-dim hover:bg-surface hover:text-frost"
                >
                  My Leave
                </button>
              )}
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10"
              >
                <IconLogout size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
