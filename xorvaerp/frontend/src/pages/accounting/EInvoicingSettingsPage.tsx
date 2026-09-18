import { useEffect, useState } from 'react';
import { IconFileTypeXml } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi } from '../../api/accounting.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Field, Spinner } from '../../components/ui';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

export default function EInvoicingSettingsPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [trn, setTrn] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [countryCode, setCountryCode] = useState('AE');

  useEffect(() => {
    accountingApi.getEInvoicingSettings(companyId)
      .then((r) => {
        const s = r.data.data;
        if (!s) return;
        setCompanyName(s.companyName);
        setLegalName(s.legalName ?? '');
        setTrn(s.taxRegistrationNumber ?? '');
        setAddressLine(s.addressLine ?? '');
        setCity(s.city ?? '');
        setCountryCode(s.countryCode || 'AE');
      })
      .catch((e) => toast.error(err(e, 'Failed to load e-invoicing settings.')))
      .finally(() => setLoading(false));
  }, [companyId, toast]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        companyId,
        legalName: legalName.trim() || undefined,
        taxRegistrationNumber: trn.trim() || undefined,
        addressLine: addressLine.trim() || undefined,
        city: city.trim() || undefined,
        countryCode: (countryCode.trim() || 'AE').toUpperCase(),
      };
      const r = await accountingApi.updateEInvoicingSettings(payload);
      toast.success(r.data.message ?? 'E-invoicing settings saved.');
    } catch (e) {
      toast.error(err(e, 'Failed to save settings.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-heading text-[26px] font-semibold tracking-tight text-frost">E-Invoicing</h1>
        <p className="mt-1 text-sm text-frost-dim">
          Your tax identity is stamped on every generated e-invoice (UBL 2.1 · PINT AE). Complete it before filing.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : (
        <Card className="max-w-2xl">
          <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-frost">
            <IconFileTypeXml size={18} stroke={1.6} className="text-primary" /> Seller details
          </div>
          <div className="flex flex-col gap-4">
            <Field
              label="Legal name"
              placeholder={companyName || 'Registered company name'}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
            />
            <p className="-mt-2.5 text-xs text-dim">Leave blank to use the company name ({companyName || '—'}).</p>

            <Field
              label="Tax Registration Number (TRN)"
              placeholder="15-digit UAE TRN"
              value={trn}
              onChange={(e) => setTrn(e.target.value)}
            />

            <Field label="Address" placeholder="Street / building" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} />

            <div className="grid grid-cols-2 gap-4">
              <Field label="City" placeholder="Dubai" value={city} onChange={(e) => setCity(e.target.value)} />
              <Field label="Country code" placeholder="AE" maxLength={2} value={countryCode} onChange={(e) => setCountryCode(e.target.value)} />
            </div>

            <div className="flex justify-end pt-1">
              <Button loading={saving} onClick={() => void save()}>Save settings</Button>
            </div>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
