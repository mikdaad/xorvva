import type { VoucherType, VoucherStatus } from "@/types/database.types";

/**
 * Presentation helpers shared by the transactions register (server action),
 * the on-screen table, and the XLSX/PDF generators — kept in a plain module (no
 * `"use server"`) so both client and server code can import them.
 */

export const VOUCHER_TYPE_LABELS: Record<VoucherType, string> = {
  sales_invoice: "Sales Invoice",
  purchase_bill: "Purchase Bill",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
  receipt_voucher: "Receipt",
  payment_voucher: "Payment",
  journal_voucher: "Journal",
  contra: "Contra",
  opening_balance: "Opening Balance",
};

export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  posted: "Posted",
  reversed: "Reversed",
  cancelled: "Cancelled",
};

export function voucherTypeLabel(type: VoucherType): string {
  return VOUCHER_TYPE_LABELS[type] ?? type;
}

export function voucherStatusLabel(status: VoucherStatus): string {
  return VOUCHER_STATUS_LABELS[status] ?? status;
}

/** Filter dropdown options (with an "all" sentinel first). */
export const VOUCHER_TYPE_OPTIONS = (
  Object.keys(VOUCHER_TYPE_LABELS) as VoucherType[]
).map((value) => ({ value, label: VOUCHER_TYPE_LABELS[value] }));

export const VOUCHER_STATUS_OPTIONS = (
  Object.keys(VOUCHER_STATUS_LABELS) as VoucherStatus[]
).map((value) => ({ value, label: VOUCHER_STATUS_LABELS[value] }));

/** Currency formatter matching the rest of the platform (en-AE, 2 dp). */
export function formatMoney(amount: number, currency: string = "AED"): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Plain number with thousands separators and 2 dp (no currency symbol). */
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** DD MMM YYYY — matches the transactions table's date rendering. */
export function formatReportDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-AE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
