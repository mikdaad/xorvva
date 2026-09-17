import type { AccountType, AccountSubType } from "@/types/database.types";
import type { CoaTemplateKey } from "@/lib/validations/onboarding";

/**
 * An industry-specific ledger appended to the Tally chart seeded by the
 * `create_entity_with_defaults` RPC.
 *
 * Ledgers are identified by name and parented onto a seeded Tally group via
 * `under`, matching Tally's own model where a ledger always sits "Under" a
 * group. The RPC resolves `under` case-insensitively and skips anything whose
 * parent group does not exist, so a typo degrades to a missing ledger rather
 * than a failed company creation.
 */
export interface ExtraLedger {
  name: string;
  name_ar?: string;
  /** Name of the Tally group this ledger sits under. */
  under: TallyGroup;
  type: AccountType;
  sub_type: AccountSubType;
  is_bank?: boolean;
}

/**
 * The group names seeded by `create_entity_with_defaults`. Kept as a union so
 * a template referencing a non-existent group fails at compile time rather
 * than silently dropping the ledger at runtime.
 */
export type TallyGroup =
  | "Bank Accounts"
  | "Cash-in-hand"
  | "Sundry Debtors"
  | "Stock-in-hand"
  | "Loans & Advances"
  | "Fixed Assets"
  | "Sundry Creditors"
  | "Duties & Taxes"
  | "Provisions"
  | "Capital Account"
  | "Reserves & Surplus"
  | "Sales Accounts"
  | "Indirect Incomes"
  | "Purchase Accounts"
  | "Indirect Expenses";

// ---------------------------------------------------------------------------
// Ledgers common to every industry template.
//
// The Tally group skeleton and the three mandatory default ledgers (Cash,
// Profit & Loss Account, VAT Suspense Account) are seeded in SQL by the RPC —
// they are deliberately absent here so there is exactly one source of truth
// for them.
// ---------------------------------------------------------------------------
const BASE_LEDGERS: ExtraLedger[] = [
  { name: "Main Bank Account - AED", name_ar: "الحساب المصرفي الرئيسي", under: "Bank Accounts", type: "asset", sub_type: "current_asset", is_bank: true },
  { name: "Petty Cash", name_ar: "النقدية الصغيرة", under: "Cash-in-hand", type: "asset", sub_type: "current_asset" },
  { name: "Prepayments & Security Deposits", name_ar: "مدفوعات مقدمة وتأمينات", under: "Loans & Advances", type: "asset", sub_type: "current_asset" },
  { name: "Office Furniture & Equipment", name_ar: "الأثاث والمعدات المكتبية", under: "Fixed Assets", type: "asset", sub_type: "fixed_asset" },
  { name: "Computer Hardware & Software", name_ar: "أجهزة الحاسوب والبرامج", under: "Fixed Assets", type: "asset", sub_type: "fixed_asset" },
  { name: "Accumulated Depreciation", name_ar: "مجمع الاهتلاك", under: "Fixed Assets", type: "asset", sub_type: "fixed_asset" },
  { name: "Corporate Tax Payable", name_ar: "ضريبة الشركات المستحقة", under: "Duties & Taxes", type: "liability", sub_type: "current_liability" },
  { name: "Accrued Expenses & Salaries", name_ar: "مصاريف ورواتب مستحقة", under: "Provisions", type: "liability", sub_type: "current_liability" },
  { name: "Share Capital", name_ar: "رأس المال", under: "Capital Account", type: "equity", sub_type: "equity_capital" },
  { name: "Owner's Drawings / Dividends", name_ar: "مسحوبات المالك / التوزيعات", under: "Capital Account", type: "equity", sub_type: "equity_capital" },
  { name: "Salaries & Wages", name_ar: "الرواتب والأجور", under: "Indirect Expenses", type: "expense", sub_type: "operating_expense" },
  { name: "Rent & Facilities", name_ar: "الإيجار والمرافق", under: "Indirect Expenses", type: "expense", sub_type: "operating_expense" },
  { name: "Utilities (DEWA/FEWA/SEWA)", name_ar: "الكهرباء والمياه", under: "Indirect Expenses", type: "expense", sub_type: "operating_expense" },
  { name: "Trade License & Government Fees", name_ar: "الرخصة التجارية والرسوم الحكومية", under: "Indirect Expenses", type: "expense", sub_type: "operating_expense" },
  { name: "Audit & Professional Fees", name_ar: "أتعاب التدقيق والاستشارات", under: "Indirect Expenses", type: "expense", sub_type: "operating_expense" },
  { name: "Bank Charges & Commission", name_ar: "عمولات ورسوم مصاريف البنك", under: "Indirect Expenses", type: "expense", sub_type: "operating_expense" },
];

// ---------------------------------------------------------------------------
// Industry-specific ledgers
// ---------------------------------------------------------------------------
const TEMPLATE_LEDGERS: Record<CoaTemplateKey, ExtraLedger[]> = {
  trading: [
    { name: "Merchandise Inventory", name_ar: "البضائع بالمخزن", under: "Stock-in-hand", type: "asset", sub_type: "current_asset" },
    { name: "Sales Revenue (Goods)", name_ar: "إيرادات المبيعات (بضائع)", under: "Sales Accounts", type: "revenue", sub_type: "operating_revenue" },
    { name: "Sales Discounts & Returns", name_ar: "خصومات ومردودات المبيعات", under: "Sales Accounts", type: "revenue", sub_type: "operating_revenue" },
    { name: "Cost of Goods Sold (COGS)", name_ar: "تكلفة البضاعة المباعة", under: "Purchase Accounts", type: "expense", sub_type: "cost_of_sales" },
    { name: "Freight Inwards & Customs Duty", name_ar: "الشحن والرسوم الجمركية", under: "Purchase Accounts", type: "expense", sub_type: "cost_of_sales" },
  ],
  contracting: [
    { name: "Work in Progress (WIP)", name_ar: "الأعمال قيد التنفيذ", under: "Stock-in-hand", type: "asset", sub_type: "current_asset" },
    { name: "Retention Receivables", name_ar: "محتجزات ضمان مدينة", under: "Loans & Advances", type: "asset", sub_type: "current_asset" },
    { name: "Retention Payables (Subcontractors)", name_ar: "محتجزات ضمان دائنة", under: "Provisions", type: "liability", sub_type: "current_liability" },
    { name: "Contract & Progress Billing Income", name_ar: "إيرادات عقود المقاولات", under: "Sales Accounts", type: "revenue", sub_type: "operating_revenue" },
    { name: "Direct Construction Materials", name_ar: "مواد البناء المباشرة", under: "Purchase Accounts", type: "expense", sub_type: "cost_of_sales" },
    { name: "Subcontractor Expenses", name_ar: "مصاريف مقاولي الباطن", under: "Purchase Accounts", type: "expense", sub_type: "cost_of_sales" },
    { name: "Direct Site Labor & Hire Equipment", name_ar: "عمالة وتأجير معدات الموقع", under: "Purchase Accounts", type: "expense", sub_type: "cost_of_sales" },
  ],
  real_estate: [
    { name: "Investment Properties", name_ar: "العقارات الاستثمارية", under: "Fixed Assets", type: "asset", sub_type: "fixed_asset" },
    { name: "Tenant Security Deposits", name_ar: "تأمينات المستأجرين", under: "Provisions", type: "liability", sub_type: "current_liability" },
    { name: "Unearned / Prepaid Rent Received", name_ar: "إيجار مقبوض مقدماً", under: "Provisions", type: "liability", sub_type: "current_liability" },
    { name: "Rental Income", name_ar: "إيرادات الإيجارات", under: "Sales Accounts", type: "revenue", sub_type: "operating_revenue" },
    { name: "Property Management & Lease Fees", name_ar: "رسوم إدارة وعقود العقارات", under: "Sales Accounts", type: "revenue", sub_type: "operating_revenue" },
    { name: "Property Maintenance & Repairs", name_ar: "صيانة وتصليح العقارات", under: "Purchase Accounts", type: "expense", sub_type: "cost_of_sales" },
    { name: "Building Security & Cleaning Services", name_ar: "خدمات النظافة والأمن", under: "Purchase Accounts", type: "expense", sub_type: "cost_of_sales" },
  ],
  services: [
    { name: "Consulting & Professional Services Income", name_ar: "إيرادات الخدمات الاستشارية", under: "Sales Accounts", type: "revenue", sub_type: "operating_revenue" },
    { name: "Retainer & Project Fees", name_ar: "أتعاب المشاريع والعقود", under: "Sales Accounts", type: "revenue", sub_type: "operating_revenue" },
    { name: "Direct Subcontractor Costs", name_ar: "تكاليف المتعاقدين الفرعيين", under: "Purchase Accounts", type: "expense", sub_type: "cost_of_sales" },
    { name: "Software Subscriptions & Cloud Hosting", name_ar: "اشتراكات البرامج والخدمات السحابية", under: "Indirect Expenses", type: "expense", sub_type: "operating_expense" },
  ],
};

/**
 * Builds the `p_extra_ledgers` payload for `create_entity_with_defaults`.
 *
 * Returns the base ledgers plus the selected industry template's ledgers. The
 * RPC seeds these inside the same transaction as the entity itself, so there
 * is no partially-built chart of accounts to clean up if anything fails.
 */
export function buildExtraLedgers(template: CoaTemplateKey): ExtraLedger[] {
  return [...BASE_LEDGERS, ...(TEMPLATE_LEDGERS[template] ?? [])];
}
