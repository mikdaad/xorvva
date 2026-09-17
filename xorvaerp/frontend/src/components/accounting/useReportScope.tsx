import { useState } from 'react';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';

/**
 * Company scope for an accounting report.
 * - Non-CEO: `companyId` is undefined — the backend pins the report to their own company.
 * - CEO (SuperAdmin): reports the active company, or — when "All companies" is ticked —
 *   omits the company so the backend returns a consolidated, tenant-wide view.
 * Render `scopeControl` in the page header; it only appears for a CEO.
 */
export function useReportScope() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const isCeo = user?.role === 'SuperAdmin';
  const [consolidated, setConsolidated] = useState(false);

  const companyId = isCeo ? (consolidated ? undefined : activeCompanyId) : undefined;

  const scopeControl = isCeo ? (
    <label className="flex items-center gap-2 whitespace-nowrap text-sm text-frost-dim">
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={consolidated}
        onChange={(e) => setConsolidated(e.target.checked)}
      />
      All companies (consolidated)
    </label>
  ) : null;

  return { companyId, consolidated, scopeControl, isCeo };
}
