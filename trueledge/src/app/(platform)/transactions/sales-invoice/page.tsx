import { redirect } from "next/navigation";

/**
 * Superseded by the unified keyboard-first voucher screen.
 *
 * Sales invoicing now lives at /transactions/new?type=sales_invoice (F8), which
 * handles all six Tally voucher types through one posting path. The previous
 * screen on this route posted through `createVoucher` + `postVoucher`, which
 * never set `period_id` and so could not post at all.
 *
 * Kept as a redirect so existing links and bookmarks continue to work.
 */
export default function SalesInvoiceRedirect() {
  redirect("/transactions/new?type=sales_invoice");
}
