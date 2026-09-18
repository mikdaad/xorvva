import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  IconBuilding, IconUsers, IconInbox, IconBeach, IconBuildingCommunity,
  IconArrowRight, IconUserPlus, IconChecklist, IconId, IconChartBar,
  IconUserCheck, IconCalendarStats, IconRocket, IconApps, IconUsersGroup,
  IconReportMoney, IconFileInvoice, IconPlus, type Icon,
} from '@tabler/icons-react';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { dashboardApi, type AdminOverview, type Dashboard } from '../../api/dashboard.api';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Spinner } from '../../components/ui';
import { Tilt } from '../../components/Tilt';
import {
  Avatar, BarList, EmptyHint, PageHeader, Pill, SectionCard, StatRing, StatTile,
} from '../../components/dashboard-ui';

const ROLE_SUBTITLE: Record<string, string> = {
  SuperAdmin: 'Your group at a glance — companies, people and approvals.',
  CompanyAdmin: "Run your company — people, structure and what needs a decision.",
  Manager: 'Your team today — headcount, leave and approvals.',
  Employee: 'Your space — profile, leave balance and requests.',
  SystemAdmin: 'Platform overview across all tenants.',
};

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '•';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [admin, setAdmin] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const isSystemAdmin = user?.role === 'SystemAdmin';

  useEffect(() => {
    const load = isSystemAdmin
      ? dashboardApi.adminOverview().then((r) => setAdmin(r.data.data ?? null))
      : dashboardApi.get().then((r) => setData(r.data.data ?? null));
    load.catch(() => {}).finally(() => setLoading(false));
  }, [isSystemAdmin]);

  if (!user) return null;

  return (
    <AppShell>
      <PageHeader
        title={`Welcome back, ${user.firstName}`}
        subtitle={ROLE_SUBTITLE[user.role] ?? "Here's what's happening today."}
      />
      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : isSystemAdmin ? (
        <SystemAdminView admin={admin} />
      ) : data ? (
        <RoleView data={data} />
      ) : (
        <Card className="py-14 text-center text-frost-dim">Could not load your dashboard.</Card>
      )}
    </AppShell>
  );
}

function PendingCard({ data }: { data: Dashboard }) {
  return (
    <SectionCard
      title="Pending your approval"
      icon={<IconInbox size={16} stroke={1.6} />}
      action={<Link to="/approvals/pending" className="text-xs font-semibold text-glow hover:underline">View all</Link>}
    >
      {data.pendingApprovals && data.pendingApprovals.length > 0 ? (
        <div className="flex flex-col divide-y divide-border">
          {data.pendingApprovals.map((a) => (
            <Link key={a.id} to="/approvals/pending" className="flex items-center gap-3 py-2.5 text-sm transition-opacity hover:opacity-80">
              <Avatar initials={initials(a.requesterEmail)} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-frost">{a.title}</div>
                <div className="truncate text-xs text-dim">{a.requesterEmail}</div>
              </div>
              <IconArrowRight size={16} className="shrink-0 text-dim" />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyHint>Nothing awaiting your approval.</EmptyHint>
      )}
    </SectionCard>
  );
}

function QuickActions({ actions }: { actions: { to: string; label: string; icon: React.ReactNode }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Link key={a.to} to={a.to}>
          <Button variant="ghost">{a.icon} {a.label}</Button>
        </Link>
      ))}
    </div>
  );
}

// Business modules → how they appear on the home screen (icon, blurb, entry route).
const MODULE_META: Record<string, { label: string; desc: string; to: string; icon: Icon }> = {
  HR: { label: 'HR', desc: 'Employees, departments, leave & payroll', to: '/hr/employees', icon: IconUsersGroup },
  Accounting: { label: 'Accounting', desc: 'Ledger, statements, VAT & assets', to: '/accounting', icon: IconReportMoney },
  Sales: { label: 'CRM & Sales', desc: 'Customers, invoices, bills & payments', to: '/accounting/invoices', icon: IconFileInvoice },
};

function ModuleCard({ to, label, desc, icon: Ico, accent = false }: {
  to: string; label: string; desc: string; icon: Icon; accent?: boolean;
}) {
  return (
    <Tilt as={Link} to={to} max={5} glare
      className="panel group flex items-start gap-3 rounded-xl p-4 hover:border-border-strong">
      <span className={`tilt-z flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
        accent ? 'bg-surface text-frost-dim' : 'chip-3d'}`}>
        <Ico size={20} stroke={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-heading font-semibold text-frost">{label}</span>
          <IconArrowRight size={16} className="shrink-0 text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-glow" />
        </div>
        <p className="mt-0.5 text-xs text-frost-dim">{desc}</p>
      </div>
    </Tilt>
  );
}

/** "Your workspace" — the active company's modules as quick-access cards + Studio. */
function WorkspaceModules({ canManageModules }: { canManageModules: boolean }) {
  const { activeCompany } = useCompany();
  const active = (activeCompany?.activeModules ?? []).filter((m) => MODULE_META[m]);

  return (
    <SectionCard
      title="Your workspace"
      icon={<IconApps size={16} stroke={1.6} />}
      action={canManageModules
        ? <Link to="/modules" className="text-xs font-semibold text-glow hover:underline">Manage modules</Link>
        : undefined}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((m) => (
          <ModuleCard key={m} to={MODULE_META[m].to} label={MODULE_META[m].label}
            desc={MODULE_META[m].desc} icon={MODULE_META[m].icon} />
        ))}
        {canManageModules && (
          <ModuleCard to="/modules" label="Add modules" desc="Browse & subscribe in the marketplace" icon={IconPlus} accent />
        )}
      </div>
    </SectionCard>
  );
}

function RoleView({ data }: { data: Dashboard }) {
  const role = data.role;

  if (role === 'SuperAdmin') {
    const setupNeeded = (data.totalEmployees ?? 0) === 0;
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile label="Companies" value={data.companyCount ?? 0} icon={<IconBuilding size={18} stroke={1.6} />} tone="primary" />
          <StatTile label="Total headcount" value={data.totalEmployees ?? 0} icon={<IconUsers size={18} stroke={1.6} />} tone="success" />
          <StatTile label="Pending approvals" value={data.pendingApprovalCount ?? 0} icon={<IconInbox size={18} stroke={1.6} />} tone="warning" />
        </div>

        <WorkspaceModules canManageModules />

        {setupNeeded && <GettingStarted />}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SectionCard title="Headcount by company" icon={<IconChartBar size={16} stroke={1.6} />}>
            {data.companies && data.companies.length > 0 ? (
              <BarList items={data.companies.map((c) => ({ label: c.name, value: c.employeeCount }))} />
            ) : <EmptyHint>No companies yet.</EmptyHint>}
          </SectionCard>
          <PendingCard data={data} />
        </div>

        <QuickActions actions={[
          { to: '/companies', label: 'New Company', icon: <IconBuilding size={18} stroke={1.6} /> },
          { to: '/users/new', label: 'Add User', icon: <IconUserPlus size={18} stroke={1.6} /> },
          { to: '/approvals/rules', label: 'Approval Rules', icon: <IconChecklist size={18} stroke={1.6} /> },
        ]} />
      </div>
    );
  }

  if (role === 'CompanyAdmin') {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Employees" value={data.employeeCount ?? 0} icon={<IconUsers size={18} stroke={1.6} />} tone="primary" />
          <StatTile label="Departments" value={data.departmentCount ?? 0} icon={<IconBuildingCommunity size={18} stroke={1.6} />} />
          <StatTile label="Pending approvals" value={data.pendingApprovalCount ?? 0} icon={<IconInbox size={18} stroke={1.6} />} tone="warning" />
          <StatTile label="On leave today" value={data.onLeaveToday ?? 0} icon={<IconBeach size={18} stroke={1.6} />} tone="success" />
        </div>
        <WorkspaceModules canManageModules={false} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SectionCard title="Recent hires" icon={<IconUserCheck size={16} stroke={1.6} />}>
            {data.recentHires && data.recentHires.length > 0 ? (
              <div className="flex flex-col divide-y divide-border">
                {data.recentHires.map((h, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 text-sm">
                    <Avatar initials={initials(h.fullName)} size="sm" />
                    <span className="flex-1 font-medium text-frost">{h.fullName}</span>
                    <Pill tone="brand">{h.departmentName}</Pill>
                  </div>
                ))}
              </div>
            ) : <EmptyHint>No employees yet.</EmptyHint>}
          </SectionCard>
          <PendingCard data={data} />
        </div>
        <QuickActions actions={[
          { to: '/hr/employees', label: 'Add Employee', icon: <IconUserPlus size={18} stroke={1.6} /> },
          { to: '/hr/departments', label: 'Departments', icon: <IconBuildingCommunity size={18} stroke={1.6} /> },
          { to: '/approvals/rules', label: 'Rules', icon: <IconChecklist size={18} stroke={1.6} /> },
        ]} />
      </div>
    );
  }

  if (role === 'Manager') {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile label="My team" value={data.teamSize ?? 0} icon={<IconUsers size={18} stroke={1.6} />} tone="primary" />
          <StatTile label="Team on leave" value={data.teamOnLeave ?? 0} icon={<IconBeach size={18} stroke={1.6} />} tone="success" />
          <StatTile label="Pending approvals" value={data.pendingApprovalCount ?? 0} icon={<IconInbox size={18} stroke={1.6} />} tone="warning" />
        </div>
        <PendingCard data={data} />
        <QuickActions actions={[
          { to: '/approvals/pending', label: 'Review approvals', icon: <IconInbox size={18} stroke={1.6} /> },
          { to: '/hr/employees', label: 'View team', icon: <IconUsers size={18} stroke={1.6} /> },
        ]} />
      </div>
    );
  }

  // Employee
  const balances = data.leaveBalance ?? [];
  return (
    <div className="flex flex-col gap-6">
      {data.profile && (
        <Card className="flex flex-wrap items-center gap-4">
          <Avatar initials={initials(data.profile.fullName)} size="lg" gradient />
          <div className="flex-1">
            <div className="font-heading text-lg font-semibold text-frost">{data.profile.fullName}</div>
            <div className="text-sm text-frost-dim">
              {data.profile.designationTitle} · {data.profile.departmentName}
            </div>
          </div>
          <Pill tone="ok">Active</Pill>
        </Card>
      )}

      <SectionCard title="My leave balance" icon={<IconCalendarStats size={16} stroke={1.6} />}>
        {balances.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {balances.map((b) => (
              <StatRing key={b.leaveTypeName} label={b.leaveTypeName}
                used={Math.max(0, b.totalDays - b.remainingDays)} total={b.totalDays} caption="days left" />
            ))}
          </div>
        ) : (
          <EmptyHint>No leave types configured yet.</EmptyHint>
        )}
      </SectionCard>

      <QuickActions actions={[
        { to: '/hr/leave', label: 'Apply for Leave', icon: <IconBeach size={18} stroke={1.6} /> },
      ]} />
    </div>
  );
}

function GettingStarted() {
  const steps = [
    { to: '/hr/departments', label: 'Create departments', icon: <IconBuildingCommunity size={16} stroke={1.6} /> },
    { to: '/hr/designations', label: 'Add designations', icon: <IconId size={16} stroke={1.6} /> },
    { to: '/hr/employees', label: 'Add your first employee', icon: <IconUserPlus size={16} stroke={1.6} /> },
    { to: '/hr/leave-types', label: 'Set up leave types', icon: <IconBeach size={16} stroke={1.6} /> },
    { to: '/approvals/rules', label: 'Configure approval rules', icon: <IconChecklist size={16} stroke={1.6} /> },
  ];
  return (
    <SectionCard title="Getting started" icon={<IconRocket size={16} stroke={1.6} />}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <Link key={s.to} to={s.to}
            className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-frost-dim transition-colors hover:border-border-strong hover:text-frost">
            <span className="flex items-center gap-2.5">{s.icon}{s.label}</span>
            <IconArrowRight size={16} className="text-dim" />
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}

function SystemAdminView({ admin }: { admin: AdminOverview | null }) {
  if (!admin) return <Card className="py-14 text-center text-frost-dim">Could not load platform overview.</Card>;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Tenants" value={admin.tenantCount} icon={<IconBuilding size={18} stroke={1.6} />} tone="primary" />
        <StatTile label="Companies" value={admin.companyCount} icon={<IconBuildingCommunity size={18} stroke={1.6} />} />
        <StatTile label="Users" value={admin.userCount} icon={<IconUsers size={18} stroke={1.6} />} />
        <StatTile label="Employees" value={admin.employeeCount} icon={<IconId size={18} stroke={1.6} />} tone="success" />
      </div>
      <SectionCard title="Recent signups" icon={<IconRocket size={16} stroke={1.6} />}>
        {admin.recentSignups.length > 0 ? (
          <div className="flex flex-col divide-y divide-border">
            {admin.recentSignups.map((t, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 text-sm">
                <Avatar initials={initials(t.name)} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-frost">{t.name}</div>
                  <div className="truncate text-xs text-dim">{t.contactEmail}</div>
                </div>
                <div className="text-right text-xs text-dim">
                  <div>{t.companyCount} compan{t.companyCount === 1 ? 'y' : 'ies'}</div>
                  <div>{new Date(t.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        ) : <EmptyHint>No signups yet.</EmptyHint>}
      </SectionCard>
    </div>
  );
}
