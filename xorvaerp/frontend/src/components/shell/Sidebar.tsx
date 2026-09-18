import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IconChevronRight, IconX, IconPlus, IconStack2, IconSearch } from '@tabler/icons-react';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { usePlatform } from '../../stores/PlatformContext';
import { accountingApi } from '../../api/accounting.api';
import type { EntityDefinition } from '../../api/platform.api';
import { Logo } from '../ui';
import { DASHBOARD, NAV_GROUPS, type NavGroup, type RoleName } from './navConfig';

export const SIDEBAR_WIDTH = 'w-[248px]';

export function Sidebar({ open, onClose, onSearch }: { open: boolean; onClose: () => void; onSearch?: () => void }) {
  const { user } = useAuth();
  const { activeCompany, activeCompanyId } = useCompany();
  const { definitions, openBuilder } = usePlatform();
  const location = useLocation();

  const role = (user?.role ?? 'Employee') as RoleName;
  const isFinanceAdmin = role === 'SystemAdmin' || role === 'SuperAdmin' || role === 'CompanyAdmin';
  const isAdmin = role === 'SuperAdmin' || role === 'CompanyAdmin';

  // Department-function access model: admins always have accounting; a Manager only if they
  // head an Accounting-function department (authoritative check server-side). Mirror it here
  // for nav visibility. Refreshes when the active company changes (CEO switching companies).
  const [acctAccess, setAcctAccess] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user) return;
    if (isFinanceAdmin) { setAcctAccess(true); return; }
    let active = true;
    accountingApi.getMyAccess()
      .then((r) => { if (active) setAcctAccess(r.data.data?.hasAccountingAccess ?? false); })
      .catch(() => { if (active) setAcctAccess(false); });
    return () => { active = false; };
  }, [user, isFinanceAdmin, activeCompanyId]);

  const hasAccountingAccess = acctAccess ?? isFinanceAdmin;

  const hasModule = (m?: string) =>
    !m || (activeCompany ? activeCompany.activeModules.includes(m) : true);

  const groups = NAV_GROUPS
    .filter((g) => hasModule(g.module))
    .map((g) => {
      if (g.functionGate === 'Accounting')
        return { ...g, items: hasAccountingAccess ? g.items : [] };
      return { ...g, items: g.items.filter((i) => i.roles.includes(role)) };
    })
    .filter((g) => g.items.length > 0);

  // Accordion: one group open at a time, following the route.
  const activeKey = groups.find((g) =>
    g.items.some((i) => location.pathname === i.to || location.pathname.startsWith(i.to + '/')))?.key ?? null;
  const [openKey, setOpenKey] = useState<string | null>(activeKey ?? groups[0]?.key ?? null);
  useEffect(() => { if (activeKey) setOpenKey(activeKey); }, [activeKey]);

  if (!user) return null;

  const subModulesFor = (moduleKey?: string): EntityDefinition[] =>
    moduleKey ? definitions.filter((d) => d.moduleKey === moduleKey && d.isActive) : [];

  const dashActive = location.pathname === DASHBOARD.to;

  return (
    <>
      {open && <div className="animate-fade fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px] md:hidden" onClick={onClose} />}

      <aside
        className={`panel-strong fixed inset-y-0 left-0 z-40 flex ${SIDEBAR_WIDTH} flex-col border-r border-border
          transition-transform duration-200 md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Brand */}
        <div className="flex h-14 items-center justify-between px-4">
          <Link to="/dashboard" onClick={onClose} className="rounded-lg"><Logo /></Link>
          <button className="rounded-md p-1.5 text-frost-dim hover:bg-hover md:hidden" onClick={onClose} aria-label="Close menu">
            <IconX size={18} />
          </button>
        </div>

        {/* Search trigger */}
        {onSearch && (
          <div className="px-3 pb-2">
            <button
              type="button"
              onClick={() => { onSearch(); onClose(); }}
              className="btn-3d-soft flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-abyss/60 px-2.5 text-[13px] text-dim hover:border-border-strong hover:text-frost-dim"
            >
              <IconSearch size={15} stroke={2} />
              <span className="flex-1 text-left">Search…</span>
              <kbd className="hidden md:inline">⌘K</kbd>
            </button>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
          <NavLink to={DASHBOARD.to} active={dashActive} icon={<DASHBOARD.icon size={17} stroke={1.75} />} onClick={onClose}>
            {DASHBOARD.label}
          </NavLink>

          <div className="mt-4 space-y-1">
            {groups.map((g) => (
              <ModuleGroup
                key={g.key}
                group={g}
                subModules={subModulesFor(g.module)}
                canAdd={isAdmin && !!g.module}
                onAdd={() => { openBuilder(g.module); onClose(); }}
                expanded={openKey === g.key}
                onToggle={() => setOpenKey((k) => (k === g.key ? null : g.key))}
                onOpen={() => setOpenKey(g.key)}
                pathname={location.pathname}
                onNavigate={onClose}
              />
            ))}
          </div>
        </nav>

        {/* Footer: active company */}
        {activeCompany && (
          <div className="border-t border-border px-4 py-3">
            <p className="label-mono text-dim">Company</p>
            <p className="mt-0.5 flex items-center gap-2 truncate text-[13px] font-medium text-frost" title={activeCompany.name}>
              <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
              <span className="truncate">{activeCompany.name}</span>
            </p>
          </div>
        )}
      </aside>
    </>
  );
}

function NavLink({ to, active, icon, children, onClick, nested }: {
  to: string; active: boolean; icon: ReactNode; children: ReactNode; onClick: () => void; nested?: boolean;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center gap-2.5 rounded-lg py-[7px] text-[13.5px] transition-colors duration-100
        ${nested ? 'pl-3 pr-2.5' : 'px-2.5'}
        ${active ? 'bg-brand-weak font-medium text-glow shadow-[inset_0_1px_0_var(--c-glass-hi)]' : 'font-medium text-frost-dim hover:bg-hover hover:text-frost'}`}
    >
      {active && <span aria-hidden className="absolute -left-[9px] top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-primary" />}
      <span className={`shrink-0 transition-colors ${active ? 'text-glow' : 'text-dim group-hover:text-frost-dim'}`}>{icon}</span>
      <span className="truncate">{children}</span>
    </Link>
  );
}

function ModuleGroup({
  group, subModules, canAdd, onAdd, expanded, onToggle, onOpen, pathname, onNavigate,
}: {
  group: NavGroup;
  subModules: EntityDefinition[];
  canAdd: boolean;
  onAdd: () => void;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  pathname: string;
  onNavigate: () => void;
}) {
  const Icon = group.icon;
  const overviewPath = group.items[0]?.to ?? '#';
  const groupActive = group.items.some((i) => pathname === i.to || pathname.startsWith(i.to + '/'))
    || subModules.some((d) => pathname === `/m/${d.id}`);

  return (
    <div>
      <div className={`flex items-center rounded-lg transition-colors ${groupActive && !expanded ? 'bg-hover' : ''}`}>
        <Link
          to={overviewPath}
          onClick={() => { onOpen(); onNavigate(); }}
          className="flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-[7px] font-heading text-[13.5px] font-semibold text-frost hover:bg-hover"
        >
          <Icon size={17} stroke={1.75} className={groupActive ? 'text-glow' : 'text-dim'} />
          <span>{group.heading}</span>
        </Link>
        <button
          onClick={onToggle}
          aria-label={`Toggle ${group.heading}`}
          aria-expanded={expanded}
          className="mr-0.5 rounded-md p-1.5 text-dim transition-colors hover:bg-hover hover:text-frost"
        >
          <IconChevronRight size={14} stroke={2} className={`transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className="animate-fade relative mb-2 ml-[19px] mt-0.5 flex flex-col gap-px border-l border-border pl-2">
          {group.items.map((item) => {
            const active = pathname === item.to;
            const ItemIcon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} active={active} nested onClick={onNavigate}
                icon={<ItemIcon size={15} stroke={1.75} />}>
                {item.label}
              </NavLink>
            );
          })}

          {subModules.map((d) => {
            const to = `/m/${d.id}`;
            return (
              <NavLink key={d.id} to={to} active={pathname === to} nested onClick={onNavigate}
                icon={<IconStack2 size={15} stroke={1.75} />}>
                {d.pluralLabel}
              </NavLink>
            );
          })}

          {canAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="flex items-center gap-2.5 rounded-lg py-[7px] pl-3 pr-2.5 text-[13px] font-medium text-dim transition-colors hover:bg-hover hover:text-glow"
            >
              <IconPlus size={15} stroke={1.75} /> Add sub-module
            </button>
          )}
        </div>
      )}
    </div>
  );
}
