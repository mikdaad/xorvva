import { Link, useLocation } from 'react-router-dom';
import { IconPlus, IconStack2 } from '@tabler/icons-react';
import { useAuth } from '../../stores/AuthContext';
import { usePlatform } from '../../stores/PlatformContext';
import { NAV_GROUPS, type NavGroup, type RoleName } from './navConfig';
import type { EntityDefinition } from '../../api/platform.api';

/** The nav group that owns the current route (or the custom sub-module's parent module). */
function activeGroup(pathname: string, definitions: EntityDefinition[]): NavGroup | undefined {
  const byItem = NAV_GROUPS.find((g) =>
    g.items.some((i) => pathname === i.to || pathname.startsWith(i.to + '/')));
  if (byItem) return byItem;

  // A custom sub-module page (/m/:id) belongs to its parent module.
  if (pathname.startsWith('/m/')) {
    const id = pathname.split('/')[2];
    const def = definitions.find((d) => d.id === id);
    if (def) return NAV_GROUPS.find((g) => g.module === def.moduleKey);
  }
  return undefined;
}

/**
 * Horizontal sub-navigation for the current module — its pages + tenant-defined custom
 * sub-modules as tab buttons, plus an "Add sub-module" button. Renders on every page inside
 * a business module (context-aware), mirroring the sidebar. Hidden outside modules.
 */
export function ModuleTabs() {
  const { user } = useAuth();
  const { definitions, openBuilder } = usePlatform();
  const { pathname } = useLocation();

  const role = (user?.role ?? 'Employee') as RoleName;
  const isAdmin = role === 'SuperAdmin' || role === 'CompanyAdmin';

  const group = activeGroup(pathname, definitions);
  if (!group || !group.module) return null; // only for business modules (HR, CRM & Sales, Accounting)

  const items = group.items.filter((i) => i.roles.includes(role));
  const subs = definitions.filter((d) => d.moduleKey === group.module && d.isActive);
  if (items.length === 0 && subs.length === 0) return null;

  // Mark the single most-specific match active (so Overview isn't "active" on a sub-page).
  const candidates = [...items.map((i) => i.to), ...subs.map((d) => `/m/${d.id}`)];
  const activeTo = candidates
    .filter((to) => pathname === to || pathname.startsWith(to + '/'))
    .sort((a, b) => b.length - a.length)[0];

  const Icon = group.icon;
  const tab = (active: boolean) =>
    `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-primary/15 text-glow' : 'text-frost-dim hover:bg-surface hover:text-frost'
    }`;

  return (
    <div className="sticky top-16 z-10 border-b border-border bg-void/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2 md:px-8">
        <span className="mr-2 flex shrink-0 items-center gap-2 pr-2 text-sm font-bold text-frost">
          <Icon size={17} stroke={1.7} className="text-glow" />
          {group.heading}
        </span>

        {items.map((i) => {
          const ItemIcon = i.icon;
          return (
            <Link key={i.to} to={i.to} className={tab(i.to === activeTo)}>
              <ItemIcon size={15} stroke={1.7} />
              {i.label}
            </Link>
          );
        })}

        {subs.map((d) => {
          const to = `/m/${d.id}`;
          return (
            <Link key={d.id} to={to} className={tab(to === activeTo)}>
              <IconStack2 size={15} stroke={1.7} />
              {d.pluralLabel}
            </Link>
          );
        })}

        {isAdmin && (
          <button
            type="button"
            onClick={() => openBuilder(group.module)}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-dim transition-colors hover:bg-surface hover:text-glow"
          >
            <IconPlus size={15} stroke={1.8} /> Add
          </button>
        )}
      </div>
    </div>
  );
}
