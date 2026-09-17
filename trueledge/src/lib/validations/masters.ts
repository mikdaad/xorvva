import { z } from "zod";

// ===========================================================================
// Party Validation
// ===========================================================================

export const PARTY_TYPES = [
  { value: "customer", label: "Customer" },
  { value: "supplier", label: "Supplier" },
  { value: "both", label: "Customer & Supplier" },
  { value: "employee", label: "Employee" },
] as const;

export const TAX_TREATMENTS = [
  { value: "registered", label: "VAT Registered (Standard)" },
  { value: "unregistered", label: "Unregistered / Consumer" },
  { value: "designated_zone", label: "Designated Zone (Free Zone)" },
  { value: "exempt", label: "Exempt" },
  { value: "reverse_charge", label: "Reverse Charge (Import)" },
] as const;

export const partySchema = z.object({
  entity_id: z.string().uuid("Invalid entity ID"),
  party_type: z.enum(["customer", "supplier", "both", "employee"]),
  code: z.string().trim().optional(),
  name: z.string().trim().min(1, "Party name is required"),
  name_ar: z.string().trim().optional(),
  trn: z
    .string()
    .trim()
    .refine((val) => !val || /^[0-9]{15}$/.test(val), "TRN must be exactly 15 digits")
    .optional(),
  tax_treatment: z.enum(["registered", "unregistered", "designated_zone", "exempt", "reverse_charge"]),
  control_account_id: z.string().uuid().nullable().optional(),
  default_tax_code_id: z.string().uuid().nullable().optional(),
  credit_limit: z.coerce.number().min(0, "Credit limit cannot be negative").optional(),
  payment_terms_days: z.coerce.number().int().min(0, "Payment terms days cannot be negative").optional(),
  contact_person: z.string().trim().optional(),
  email: z.string().trim().email("Invalid email address").or(z.literal("")).optional(),
  phone: z.string().trim().optional(),
  address_line1: z.string().trim().optional(),
  address_line2: z.string().trim().optional(),
  city: z.string().trim().optional(),
  country: z.string().trim().optional(),
});

export type PartyInput = z.infer<typeof partySchema>;

/**
 * Cut-down party payload for creating a master mid-voucher.
 *
 * Only the fields an accountant cannot proceed without: everything else keeps
 * its column default and is filled in later from /masters/parties. The default
 * ledger is required here because the whole point of inline creation is that
 * the voucher line can auto-fill from it.
 */
export const inlinePartySchema = z.object({
  entity_id: z.string().uuid("Invalid entity ID"),
  name: z.string().trim().min(1, "Party name is required").max(200, "Party name is too long"),
  party_type: z.enum(["customer", "supplier", "both"]),
  control_account_id: z.string().uuid("Select a default ledger"),
  trn: z
    .string()
    .trim()
    .refine((val) => !val || /^[0-9]{15}$/.test(val), "TRN must be exactly 15 digits")
    .optional(),
});

export type InlinePartyInput = z.infer<typeof inlinePartySchema>;

// ===========================================================================
// Item Validation
// ===========================================================================

export const ITEM_TYPES = [
  { value: "inventory", label: "Inventory Item" },
  { value: "service", label: "Service" },
  { value: "expense", label: "Expense Item" },
  { value: "fixed_asset", label: "Fixed Asset" },
] as const;

export const itemSchema = z.object({
  entity_id: z.string().uuid("Invalid entity ID"),
  item_type: z.enum(["inventory", "service", "expense", "fixed_asset"]),
  code: z.string().trim().min(1, "Item code is required"),
  name: z.string().trim().min(1, "Item name is required"),
  name_ar: z.string().trim().optional(),
  description: z.string().trim().optional(),
  unit_of_measure: z.string().trim().optional(),
  purchase_account_id: z.string().uuid().nullable().optional(),
  sales_account_id: z.string().uuid().nullable().optional(),
  tax_code_id: z.string().uuid().nullable().optional(),
  default_price: z.coerce.number().min(0, "Price cannot be negative").optional(),
  hsn_code: z.string().trim().optional(),
});

export type ItemInput = z.infer<typeof itemSchema>;

/**
 * Units of measure. Kept separate from `item_type`: "Service" describes what
 * the item *is* and drives ledger mapping, while "Hours" describes how it is
 * counted on a line. A service billed in hours needs both.
 */
export const UOM_OPTIONS = [
  { value: "Nos", label: "Nos (count)" },
  { value: "Hours", label: "Hours" },
  { value: "Days", label: "Days" },
  { value: "Kgs", label: "Kgs" },
  { value: "Litres", label: "Litres" },
  { value: "Metres", label: "Metres" },
  { value: "Box", label: "Box" },
  { value: "Set", label: "Set" },
  { value: "Lot", label: "Lot" },
] as const;

/**
 * Cut-down item payload for creating a master mid-voucher.
 *
 * `code` is optional here even though the column is NOT NULL — the action
 * derives one from the name so the accountant is not asked to invent a code
 * mid-entry. At least one ledger must be mapped, otherwise the new item cannot
 * populate the row it was created from.
 */
export const inlineItemSchema = z
  .object({
    entity_id: z.string().uuid("Invalid entity ID"),
    name: z.string().trim().min(1, "Item name is required").max(200, "Item name is too long"),
    code: z.string().trim().max(50, "Item code is too long").optional(),
    item_type: z.enum(["inventory", "service", "expense", "fixed_asset"]),
    unit_of_measure: z.string().trim().min(1, "Select a unit of measure"),
    sales_account_id: z.string().uuid().nullable().optional(),
    purchase_account_id: z.string().uuid().nullable().optional(),
    tax_code_id: z.string().uuid().nullable().optional(),
    default_price: z.coerce.number().min(0, "Price cannot be negative").optional(),
  })
  .refine((data) => Boolean(data.sales_account_id || data.purchase_account_id), {
    message: "Map at least one ledger — sales or purchase.",
    path: ["sales_account_id"],
  });

export type InlineItemInput = z.infer<typeof inlineItemSchema>;

// ===========================================================================
// Cost Centre Validation
// ===========================================================================

export const DIMENSION_TYPES = [
  { value: "department", label: "Department" },
  { value: "project", label: "Project" },
  { value: "location", label: "Location / Branch" },
  { value: "activity", label: "Activity" },
  { value: "segment", label: "Business Segment" },
  { value: "custom", label: "Custom Dimension" },
] as const;

export const costCentreDimensionSchema = z.object({
  entity_id: z.string().uuid("Invalid entity ID"),
  dimension_type: z.enum(["project", "department", "location", "activity", "segment", "custom"]),
  name: z.string().trim().min(1, "Dimension name is required"),
  code: z.string().trim().min(1, "Dimension code is required"),
  description: z.string().trim().optional(),
  is_mandatory: z.boolean().default(false),
  sort_order: z.coerce.number().int().default(0),
});

export type CostCentreDimensionInput = z.infer<typeof costCentreDimensionSchema>;

export const costCentreSchema = z.object({
  entity_id: z.string().uuid("Invalid entity ID"),
  dimension_id: z.string().uuid("Invalid dimension ID"),
  code: z.string().trim().min(1, "Cost centre code is required"),
  name: z.string().trim().min(1, "Cost centre name is required"),
  parent_id: z.string().uuid().nullable().optional(),
  is_group: z.boolean().default(false),
  budget: z.coerce.number().min(0, "Budget cannot be negative").nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
});

export type CostCentreInput = z.infer<typeof costCentreSchema>;

// ===========================================================================
// Tax Code Validation
// ===========================================================================

export const TAX_SCOPES = [
  { value: "vat", label: "VAT" },
  { value: "corporate_tax", label: "Corporate Tax" },
  { value: "excise", label: "Excise Tax" },
  { value: "withholding", label: "Withholding Tax" },
] as const;

export const taxCodeSchema = z.object({
  entity_id: z.string().uuid("Invalid entity ID"),
  code: z.string().trim().min(1, "Tax code is required"),
  name: z.string().trim().min(1, "Tax name is required"),
  rate: z.coerce.number().min(0, "Tax rate cannot be negative").max(100, "Tax rate cannot exceed 100%"),
  tax_scope: z.enum(["vat", "corporate_tax", "excise", "withholding"]).default("vat"),
  fta_code: z.string().trim().optional(),
  account_id: z.string().uuid().nullable().optional(),
  output_account_id: z.string().uuid().nullable().optional(),
  input_account_id: z.string().uuid().nullable().optional(),
  is_default: z.boolean().default(false),
});

export type TaxCodeInput = z.infer<typeof taxCodeSchema>;
