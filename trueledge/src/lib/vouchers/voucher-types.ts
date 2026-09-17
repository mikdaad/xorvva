import type { VoucherType } from "@/types/database.types";

/**
 * Voucher type registry — the single source of truth for the Tally-style
 * function-key shortcuts and the posting shape of each voucher type.
 *
 * `mode` drives both the entry UI and the double-entry generation in
 * `src/lib/actions/voucher.ts`:
 *
 *   - "settlement"  Two-sided cash movement (Contra, Payment, Receipt). One
 *                   ledger is paid from, the other paid to. No tax, no items.
 *   - "journal"     Free-form Dr/Cr grid. The accountant states both sides, so
 *                   every line carries an explicit debit or credit.
 *   - "invoice"     Commercial document (Sales, Purchase). Line items with
 *                   quantity/rate/tax; the party control account is the
 *                   balancing side and VAT posts to the tax code's account.
 */
export type VoucherMode = "settlement" | "journal" | "invoice";

/** Direction of the trade for invoice-mode vouchers. */
export type TradeDirection = "outward" | "inward";

export interface VoucherTypeConfig {
  type: VoucherType;
  /** Tally function key, e.g. "F5". */
  shortcut: string;
  label: string;
  /** Short hint shown under the tab. */
  hint: string;
  mode: VoucherMode;
  /**
   * For settlement vouchers: which side the "from" ledger sits on.
   * Payment credits the bank (money leaves); Receipt debits it (money arrives).
   */
  direction?: TradeDirection;
  /** Whether the voucher requires a party (customer/supplier). */
  requiresParty: boolean;
  /** Whether line items carry tax. */
  hasTax: boolean;
}

export const VOUCHER_TYPES: readonly VoucherTypeConfig[] = [
  {
    type: "contra",
    shortcut: "F4",
    label: "Contra",
    hint: "Bank ↔ Cash transfer",
    mode: "settlement",
    requiresParty: false,
    hasTax: false,
  },
  {
    type: "payment_voucher",
    shortcut: "F5",
    label: "Payment",
    hint: "Pay supplier or expense",
    mode: "settlement",
    direction: "outward",
    requiresParty: false,
    hasTax: false,
  },
  {
    type: "receipt_voucher",
    shortcut: "F6",
    label: "Receipt",
    hint: "Receive from customer",
    mode: "settlement",
    direction: "inward",
    requiresParty: false,
    hasTax: false,
  },
  {
    type: "journal_voucher",
    shortcut: "F7",
    label: "Journal",
    hint: "Manual Dr/Cr adjustment",
    mode: "journal",
    requiresParty: false,
    hasTax: false,
  },
  {
    type: "sales_invoice",
    shortcut: "F8",
    label: "Sales",
    hint: "Tax invoice to customer",
    mode: "invoice",
    direction: "outward",
    requiresParty: true,
    hasTax: true,
  },
  {
    type: "purchase_bill",
    shortcut: "F9",
    label: "Purchase",
    hint: "Supplier bill",
    mode: "invoice",
    direction: "inward",
    requiresParty: true,
    hasTax: true,
  },
] as const;

const BY_TYPE = new Map(VOUCHER_TYPES.map((v) => [v.type, v]));
const BY_SHORTCUT = new Map(VOUCHER_TYPES.map((v) => [v.shortcut, v]));

export function getVoucherConfig(type: VoucherType): VoucherTypeConfig | undefined {
  return BY_TYPE.get(type);
}

export function getVoucherConfigByShortcut(key: string): VoucherTypeConfig | undefined {
  return BY_SHORTCUT.get(key.toUpperCase());
}

/** Voucher types reachable from the unified entry screen. */
export function isEntryVoucherType(type: string): type is VoucherType {
  return BY_TYPE.has(type as VoucherType);
}
