/**
 * Option shapes shared by the voucher entry screen, its comboboxes, and the
 * inline-create server actions.
 *
 * These live outside the client component so `"use server"` action files can
 * describe what they return without importing a client module.
 */

export interface AccountOption {
  id: string;
  name: string;
  code: string | null;
  account_type: string;
  is_bank: boolean;
  parent_id: string | null;
}

export interface PartyOption {
  id: string;
  name: string;
  party_type: string;
  trn: string | null;
  /**
   * The party's default ledger — "Sundry Debtors" for a customer, "Sundry
   * Creditors" for a supplier. Named `control_account_id` to match the column.
   */
  control_account_id: string | null;
}

export interface TaxCodeOption {
  id: string;
  code: string;
  name: string;
  rate: number;
}

export interface ItemOption {
  id: string;
  name: string;
  code: string;
  item_type: string;
  unit_of_measure: string | null;
  /** Income ledger, used when the item sits on an outward (sales) voucher. */
  sales_account_id: string | null;
  /** Expense ledger, used when the item sits on an inward (purchase) voucher. */
  purchase_account_id: string | null;
  tax_code_id: string | null;
  default_price: number | null;
}

/**
 * The ledger an item should post to depends on which way the trade runs, so the
 * grid resolves it per voucher rather than storing one "default" account.
 */
export function itemLedgerFor(
  item: ItemOption,
  direction: "outward" | "inward" | undefined
): string | null {
  return direction === "inward"
    ? item.purchase_account_id ?? item.sales_account_id
    : item.sales_account_id ?? item.purchase_account_id;
}
