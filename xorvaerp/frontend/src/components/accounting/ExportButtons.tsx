import { useState } from 'react';
import { IconFileTypePdf, IconFileSpreadsheet } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { ledgerApi, type ExportFormat, type ExportReportType, type VoucherStatus, type VoucherType } from '../../api/ledger.api';
import type { ApiResponse } from '../../api/auth.api';
import { useToast } from '../../stores/ToastContext';
import { Button } from '../ui';

interface Props {
  reportType: ExportReportType;
  companyId?: string;
  asOf?: string;
  accountId?: string;
  from?: string;
  to?: string;
  voucherType?: VoucherType | '';
  status?: VoucherStatus | '';
  contactId?: string;
  costCentreId?: string;
  search?: string;
  disabled?: boolean;
}

/** PDF / Excel download pair for the SQL-backed ledger reports (TrueLedge export port). */
export function ExportButtons({ disabled, ...params }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const run = async (format: ExportFormat) => {
    setBusy(format);
    try { await ledgerApi.exportReport({ ...params, format }); }
    catch (e) {
      const ax = e as AxiosError<ApiResponse<never>>;
      toast.error(ax.response?.data?.message ?? 'Export failed.');
    } finally { setBusy(null); }
  };
  return (
    <div className="flex gap-2">
      <Button variant="secondary" loading={busy === 'Pdf'} disabled={disabled || !!busy} onClick={() => void run('Pdf')} title="Download PDF">
        <IconFileTypePdf size={16} stroke={1.6} /> PDF
      </Button>
      <Button variant="secondary" loading={busy === 'Xlsx'} disabled={disabled || !!busy} onClick={() => void run('Xlsx')} title="Download Excel">
        <IconFileSpreadsheet size={16} stroke={1.6} /> Excel
      </Button>
    </div>
  );
}
