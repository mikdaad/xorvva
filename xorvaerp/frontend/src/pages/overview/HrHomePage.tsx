import { useCallback, useEffect, useState } from 'react';
import { IconUsers, IconBuildingCommunity, IconId, IconBeach, IconInbox } from '@tabler/icons-react';
import { hrApi, type HrOverview } from '../../api/hr.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { AppShell } from '../../components/AppShell';
import { Spinner } from '../../components/ui';
import { PageHeader, StatTile } from '../../components/dashboard-ui';

export default function HrHomePage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [d, setD] = useState<HrOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await hrApi.overview(companyId); setD(r.data.data ?? null); }
    catch { setD(null); }
    finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell>
      <PageHeader title="HR" subtitle="Your people — employees, departments, leave and payroll." />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Employees" value={d?.employeeCount ?? 0} icon={<IconUsers size={17} stroke={1.7} />} tone="primary" />
          <StatTile label="Departments" value={d?.departmentCount ?? 0} icon={<IconBuildingCommunity size={17} stroke={1.7} />} />
          <StatTile label="Designations" value={d?.designationCount ?? 0} icon={<IconId size={17} stroke={1.7} />} />
          <StatTile label="On leave today" value={d?.onLeaveToday ?? 0} icon={<IconBeach size={17} stroke={1.7} />} tone="success" />
          <StatTile label="Pending leave" value={d?.pendingLeaveCount ?? 0} hint="awaiting approval" icon={<IconInbox size={17} stroke={1.7} />} tone={d && d.pendingLeaveCount > 0 ? 'warning' : 'default'} />
        </div>
      )}
    </AppShell>
  );
}
