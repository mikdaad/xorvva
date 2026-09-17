import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { tenantsApi, type CompanyDto } from '../api/tenants.api';
import { useAuth } from './AuthContext';

/**
 * Holds the "active company" for the session. A CEO (SuperAdmin) spans all companies,
 * so HR/company writes need a chosen target; the header switcher sets it here and every
 * page reads `activeCompanyId`. CompanyAdmin and below have exactly one company, so the
 * switcher is hidden and the active company is simply theirs.
 */
interface CompanyContextType {
  companies: CompanyDto[];
  activeCompanyId?: string;
  activeCompany?: CompanyDto;
  setActiveCompanyId: (id: string) => void;
  canSwitch: boolean;
  reloadCompanies: () => Promise<void>;
  loading: boolean;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);
const STORAGE_KEY = 'xorva.activeCompany';

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [companies, setCompanies] = useState<CompanyDto[]>([]);
  const [activeCompanyId, setActive] = useState<string | undefined>(
    () => localStorage.getItem(STORAGE_KEY) ?? undefined
  );
  const [loading, setLoading] = useState(true);

  const reloadCompanies = useCallback(async () => {
    try {
      const res = await tenantsApi.listCompanies();
      setCompanies(res.data.data ?? []);
    } catch {
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void reloadCompanies();
    else {
      setCompanies([]);
      setLoading(false);
    }
  }, [isAuthenticated, reloadCompanies]);

  // Keep a valid active company: prefer stored, else the user's own, else the first.
  useEffect(() => {
    if (companies.length === 0) return;
    const stored = activeCompanyId && companies.some((c) => c.id === activeCompanyId) ? activeCompanyId : undefined;
    const own = user?.companyId && companies.some((c) => c.id === user.companyId) ? user.companyId : undefined;
    const next = stored ?? own ?? companies[0].id;
    if (next !== activeCompanyId) {
      setActive(next);
      localStorage.setItem(STORAGE_KEY, next);
    }
  }, [companies, user, activeCompanyId]);

  const setActiveCompanyId = (id: string) => {
    setActive(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const activeCompany = companies.find((c) => c.id === activeCompanyId);

  return (
    <CompanyContext.Provider
      value={{
        companies,
        activeCompanyId,
        activeCompany,
        setActiveCompanyId,
        canSwitch: companies.length > 1,
        reloadCompanies,
        loading,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
}
