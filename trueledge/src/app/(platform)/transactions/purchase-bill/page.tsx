import { redirect } from "next/navigation";

/**
 * Superseded by the unified keyboard-first voucher screen.
 *
 * Purchase entry now lives at /transactions/new?type=purchase_bill (F9), which
 * handles all six Tally voucher types through one posting path. The previous
 * screen on this route posted through `createVoucher` + `postVoucher`, which
 * never set `period_id` and so could not post at all.
 *
 * Kept as a redirect so existing links and bookmarks continue to work.
 */
export default function PurchaseBillRedirect() {
  redirect("/transactions/new?type=purchase_bill");
}
