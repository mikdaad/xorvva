import { z } from "zod";
import { isValidUaeTrn } from "@/lib/validations/onboarding";

/**
 * Emirates used for Place of Supply on party ledgers. UAE VAT requires the
 * place of supply to determine the correct emirate box on the VAT return.
 */
export const PLACE_OF_SUPPLY = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah",
] as const;

export const ACCOUNT_TYPES = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "revenue", label: "Income" },
  { value: "expense", label: "Expense" },
] as const;

export const ACCOUNT_SUB_TYPES = [
  { value: "current_asset", label: "Current Asset", type: "asset" },
  { value: "fixed_asset", label: "Fixed Asset", type: "asset" },
  { value: "current_liability", label: "Current Liability", type: "liability" },
  { value: "long_term_liability", label: "Long-Term Liability", type: "liability" },
  { value: "equity_capital", label: "Capital", type: "equity" },
  { value: "retained_earnings", label: "Retained Earnings", type: "equity" },
  { value: "operating_revenue", label: "Operating Income", type: "revenue" },
  { value: "other_revenue", label: "Other Income", type: "revenue" },
  { value: "cost_of_sales", label: "Cost of Sales", type: "expense" },
  { value: "operating_expense", label: "Operating Expense", type: "expense" },
  { value: "other_expense", label: "Other Expense", type: "expense" },
] as const;

/**
 * Create/edit payload for a ledger or group.
 *
 * `party_trn` is only meaningful on party ledgers (those under Sundry Debtors
 * or Sundry Creditors). It is validated when present rather than being made
 * conditionally required, because the caller knows the parent group and the
 * schema does not.
 */
export const accountSchema = z
  .object({
    entity_id: z.string().uuid("A company must be selected"),
    name: z.string().trim().min(2, "Name must be at least 2 characters"),
    name_ar: z.string().trim().optional().or(z.literal("")),
    /** Optional numeric code. Ledgers are identified by name in the Tally model. */
    code: z.string().trim().max(20, "Code must be 20 characters or fewer").optional().or(z.literal("")),
    /** "Under" — the parent group. Null only for top-level primary groups. */
    parent_id: z.string().uuid("Select a parent group").nullable(),
    is_group: z.boolean().default(false),
    account_type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
    account_sub_type: z
      .enum([
        "current_asset",
        "fixed_asset",
        "current_liability",
        "long_term_liability",
        "equity_capital",
        "retained_earnings",
        "operating_revenue",
        "other_revenue",
        "cost_of_sales",
        "operating_expense",
        "other_expense",
      ])
      .nullable()
      .optional(),

    is_bank: z.boolean().default(false),

    // Tax details — relevant for party and tax ledgers.
    default_tax_code_id: z.string().uuid().nullable().optional(),
    place_of_supply: z.enum(PLACE_OF_SUPPLY).nullable().optional(),
    party_trn: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .refine((val) => !val || isValidUaeTrn(val), {
        message: "TRN must be 15 digits beginning with 100",
      }),

    // Opening balance
    opening_balance: z.coerce.number().min(0, "Opening balance cannot be negative").default(0),
    opening_balance_type: z.enum(["Dr", "Cr"]).nullable().optional(),

    description: z.string().trim().optional().or(z.literal("")),
  })
  .refine(
    (data) => data.opening_balance === 0 || !!data.opening_balance_type,
    {
      message: "Choose Dr or Cr for the opening balance",
      path: ["opening_balance_type"],
    }
  )
  .refine((data) => !(data.is_group && data.opening_balance > 0), {
    message: "Groups cannot carry an opening balance — set it on a ledger instead",
    path: ["opening_balance"],
  });

export type AccountInput = z.infer<typeof accountSchema>;

/**
 * The natural (normal) balance side for an account type.
 *
 * Assets and expenses increase on the debit side; liabilities, equity and
 * income increase on the credit side.
 */
export function normalBalance(accountType: string): "Dr" | "Cr" {
  return accountType === "asset" || accountType === "expense" ? "Dr" : "Cr";
}
