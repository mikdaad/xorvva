import { z } from "zod";

/**
 * UAE Tax Registration Number validation.
 *
 * The FTA specifies a TRN as 15 digits beginning with `100`. Those two rules
 * are documented and are enforced here.
 *
 * Deliberately NOT enforced: an arithmetic check digit. The FTA has never
 * published a checksum algorithm for the TRN, and the mod-11/Luhn variants
 * circulating online are reverse-engineered guesses that reject legitimate
 * numbers. Hard-failing on an invented checksum would block real businesses
 * from onboarding — a far worse outcome than accepting a mistyped TRN, which
 * is caught downstream when the number is used on a filed return.
 *
 * If the FTA publishes a specification, add the check digit here and this is
 * the only place that needs to change.
 */
const UAE_TRN_LENGTH = 15;
const UAE_TRN_PREFIX = "100";

export function isValidUaeTrn(value: string | null | undefined): boolean {
  if (!value) return false;
  const trn = value.replace(/[\s-]/g, "");
  if (trn.length !== UAE_TRN_LENGTH) return false;
  if (!/^\d+$/.test(trn)) return false;
  return trn.startsWith(UAE_TRN_PREFIX);
}

/** Normalises a TRN for storage: strips spaces and dashes. */
export function normaliseTrn(value: string | null | undefined): string | null {
  if (!value) return null;
  const trn = value.replace(/[\s-]/g, "");
  return trn.length > 0 ? trn : null;
}

const TRN_MESSAGE = "TRN must be 15 digits beginning with 100";

/** Reusable optional-TRN field. */
const optionalTrn = z
  .string()
  .optional()
  .refine((val) => !val || isValidUaeTrn(val), { message: TRN_MESSAGE });


export const EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah",
] as const;

export const ENTITY_TYPES = [
  { value: "company", label: "Company (LLC, PJSC)" },
  { value: "sole_establishment", label: "Sole Establishment" },
  { value: "free_zone", label: "Free Zone Entity" },
  { value: "branch", label: "Branch Office" },
  { value: "partnership", label: "Partnership" },
] as const;

export const TAX_TREATMENTS = [
  { value: "registered", label: "VAT Registered" },
  { value: "unregistered", label: "Not VAT Registered" },
  { value: "designated_zone", label: "Designated Zone" },
  { value: "exempt", label: "VAT Exempt" },
] as const;

export const COA_TEMPLATES = [
  {
    value: "trading",
    name: "Trading & Retail",
    description: "Includes Inventory, Sales, Cost of Goods Sold, AR/AP, and UAE VAT accounts.",
  },
  {
    value: "contracting",
    name: "Contracting & Construction",
    description: "Includes WIP, Progress Billing, Retention, Subcontractor Costs, and Plant/Equipment.",
  },
  {
    value: "real_estate",
    name: "Real Estate & Property",
    description: "Includes Property Assets, Rental Income, Tenant Deposits, Maintenance, and Management Fees.",
  },
  {
    value: "services",
    name: "Professional Services",
    description: "Includes Service Revenue, Billable Expenses, Payroll, Software & Office Overhead.",
  },
] as const;

export type CoaTemplateKey = typeof COA_TEMPLATES[number]["value"];

export const onboardingSchema = z.object({
  // Step 1: Organisation Profile
  org_name: z.string().min(2, "Organisation name must be at least 2 characters"),
  subscription_tier: z.string().default("trial"),

  // Step 2: Entity Setup (Tally Prime fields)
  trade_name: z.string().min(2, "Company name is required"),
  mailing_name: z.string().optional(),
  legal_name: z.string().optional(),
  trn: optionalTrn,
  corporate_tax_trn: z.string().optional(),
  entity_type: z.enum(["company", "sole_establishment", "free_zone", "branch", "partnership"]).default("company"),
  tax_treatment: z.enum(["registered", "unregistered", "designated_zone", "exempt", "reverse_charge"]).default("registered"),
  address_line1: z.string().optional(),
  city: z.string().default("Dubai"),
  emirate: z.enum(EMIRATES).default("Dubai"),
  is_free_zone: z.boolean().default(false),
  free_zone_name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),

  // Step 3: Books & COA
  fiscal_year_start: z.string().min(1, "Financial year beginning date is required"),
  books_begin_date: z.string().optional(),
  base_currency: z.string().default("AED"),
  decimal_places: z.coerce.number().refine((v) => v === 2 || v === 4, {
    message: "Decimal places must be 2 or 4",
  }).default(2),
  coa_template: z.enum(["trading", "contracting", "real_estate", "services"]).default("trading"),
});

export const entitySchema = z.object({
  trade_name: z.string().min(2, "Company name is required"),
  mailing_name: z.string().optional(),
  legal_name: z.string().optional(),
  trn: optionalTrn,
  corporate_tax_trn: z.string().optional(),
  entity_type: z.enum(["company", "sole_establishment", "free_zone", "branch", "partnership"]).default("company"),
  tax_treatment: z.enum(["registered", "unregistered", "designated_zone", "exempt", "reverse_charge"]).default("registered"),
  address_line1: z.string().optional(),
  city: z.string().default("Dubai"),
  emirate: z.enum(EMIRATES).default("Dubai"),
  is_free_zone: z.boolean().default(false),
  free_zone_name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
});

export const accountingSettingsSchema = z.object({
  fiscal_year_start: z.string().min(1, "Financial year beginning date is required"),
  books_begin_date: z.string().optional(),
  base_currency: z.string().default("AED"),
  decimal_places: z.coerce.number().refine((v) => v === 2 || v === 4, {
    message: "Decimal places must be 2 or 4",
  }).default(2),
  coa_template: z.enum(["trading", "contracting", "real_estate", "services"]).default("trading"),
});


export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type EntityInput = z.infer<typeof entitySchema>;
export type AccountingSettingsInput = z.infer<typeof accountingSettingsSchema>;
