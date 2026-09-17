import { useCallback, useEffect, useState } from 'react';
import { IconUsers, IconTruck, IconFileInvoice, IconAlertTriangle, IconReceipt2, IconTrendingUp } from '@tabler/icons-react';
import { accountingApi, type SalesOverview } from '../../api/accounting.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { AppShell } from '../../components/AppShell';
import { Spinner } from '../../components/ui';
import { PageHeader, StatTile } from '../../components/dashboard-ui';

const money = (n: number) => `AED ${n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CrmHomePage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [d, setD] = useState<SalesOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await accountingApi.getSalesOverview(companyId); setD(r.data.data ?? null); }
    catch { setD(null); }
    finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell>
      <PageHeader title="CRM & Sales" subtitle="Customers & suppliers, invoicing, bills and payments." />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatTile label="Customers" value={d?.customerCount ?? 0} icon={<IconUsers size={17} stroke={1.7} />} tone="primary" />
          <StatTile label="Suppliers" value={d?.supplierCount ?? 0} icon={<IconTruck size={17} stroke={1.7} />} />
          <StatTile label="Sales this month" value={money(d?.salesThisMonth ?? 0)} icon={<IconTrendingUp size={17} stroke={1.7} />} tone="success" />
          <StatTile label="Receivables" value={money(d?.receivables ?? 0)} hint={`${d?.openInvoicesCount ?? 0} open invoices`} icon={<IconFileInvoice size={17} stroke={1.7} />} />
          <StatTile label="Overdue" value={money(d?.overdueAmount ?? 0)} hint={`${d?.overdueInvoicesCount ?? 0} past due`} icon={<IconAlertTriangle size={17} stroke={1.7} />} tone={d && d.overdueInvoicesCount > 0 ? 'danger' : 'default'} />
          <StatTile label="Payables" value={money(d?.payables ?? 0)} hint={`${d?.openBillsCount ?? 0} open bills`} icon={<IconReceipt2 size={17} stroke={1.7} />} tone="warning" />
        </div>
      )}
    </AppShell>
  );
}
