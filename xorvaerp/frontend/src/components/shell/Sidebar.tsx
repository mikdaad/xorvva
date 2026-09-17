import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IconChevronRight, IconX, IconPlus, IconStack2 } from '@tabler/icons-react';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { usePlatform } from '../../stores/PlatformContext';
import { accountingApi } from '../../api/accounting.api';
import type { EntityDefinition } from '../../api/platform.api';
import { Logo } from '../ui';
import { DASHBOARD, NAV_GROUPS, type NavGroup, type RoleName } from './navConfig';

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
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

  // Module gate: show a business-module group only if the active company has it on.
  const hasModule = (m?: string) =>
    !m || (activeCompany ? activeCompany.activeModules.includes(m) : true);

  const groups = NAV_GROUPS
    .filter((g) => hasModule(g.module))
    .map((g) => {
      // Function-gated groups (Accounting) follow the department-function model, not item roles.
      if (g.functionGate === 'Accounting')
        return { ...g, items: hasAccountingAccess ? g.items : [] };
      return { ...g, items: g.items.filter((i) => i.roles.includes(role)) };
    })
    .filter((g) => g.items.length > 0);

  // Accordion: exactly one group open at a time. Opening the group that owns the current
  // route by default, and following navigation.
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
      {open && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={onClose} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-primary/15 bg-abyss
          transition-transform md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link to="/dashboard" onClick={onClose}><Logo /></Link>
          <button className="text-frost-dim md:hidden" onClick={onClose} aria-label="Close menu">
            <IconX size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-6">
          {/* Dashboard — standalone */}
          <Link
            to={DASHBOARD.to}
            onClick={onClose}
            className={`relative mb-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              dashActive ? 'bg-primary/15 text-glow' : 'text-frost-dim hover:bg-surface hover:text-frost'
            }`}
          >
            {dashActive && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />}
            <DASHBOARD.icon size={18} stroke={1.6} />
            {DASHBOARD.label}
          </Link>

          {/* Module groups — accordion (one open at a time) */}
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
        </nav>
      </aside>
    </>
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
  const overviewPath = group.items[0]?.to ?? '#'; // first item = module Overview / landing

  return (
    <div className="mb-1.5">
      <div className="flex w-full items-center rounded-lg text-frost-dim transition-colors hover:text-frost">
        {/* Clicking the module opens its Overview first (and expands the group). */}
        <Link
          to={overviewPath}
          onClick={() => { onOpen(); onNavigate(); }}
          className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2"
        >
          <Icon size={17} stroke={1.6} className="text-dim" />
          <span className="text-[11px] font-semibold uppercase tracking-wider">{group.heading}</span>
        </Link>
        <button onClick={onToggle} aria-label={`Toggle ${group.heading}`} className="rounded-lg px-2 py-2">
          <IconChevronRight size={15} className={`text-dim transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className="mb-3 ml-3 flex flex-col gap-0.5 border-l border-primary/10 pl-3">
          {group.items.map((item) => {
            const active = pathname === item.to;
            const ItemIcon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? 'bg-primary/15 text-glow' : 'text-frost-dim hover:bg-surface hover:text-frost'
                }`}
              >
                {active && <span className="absolute -left-3 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />}
                <ItemIcon size={17} stroke={1.6} />
                {item.label}
              </Link>
            );
          })}

          {/* Tenant-defined custom sub-modules for this module */}
          {subModules.map((d) => {
            const to = `/m/${d.id}`;
            const active = pathname === to;
            return (
              <Link
                key={d.id}
                to={to}
                onClick={onNavigate}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? 'bg-primary/15 text-glow' : 'text-frost-dim hover:bg-surface hover:text-frost'
                }`}
              >
                {active && <span className="absolute -left-3 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />}
                <IconStack2 size={17} stroke={1.6} />
                {d.pluralLabel}
              </Link>
            );
          })}

          {canAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-dim transition-colors hover:bg-surface hover:text-glow"
            >
              <IconPlus size={17} stroke={1.6} /> Add sub-module
            </button>
          )}
        </div>
      )}
    </div>
  );
}
