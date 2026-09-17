using Xorva.Modules.Accounting.Enums;
using AT = Xorva.Modules.Accounting.Enums.AccountType;
using AST = Xorva.Modules.Accounting.Enums.AccountSubType;

namespace Xorva.Modules.Accounting.Common;

/// <summary>One account in a seed template.</summary>
public record AccountSeed(string Code, string Name, AccountType Type, AccountSubType SubType, bool IsSystem = false);

/// <summary>
/// Industry Chart-of-Accounts templates. Every template shares the same <see cref="Base"/>
/// set — which includes the <b>system accounts</b> (AR, AP, Bank, VAT, Retained Earnings,
/// Sales, COGS, Salaries) the auto-journal engine posts to — then adds industry-specific
/// accounts on top. Templates are pure seed data: the journal engine, statements and VAT
/// are universal and work off whatever accounts exist.
/// </summary>
public static class ChartTemplates
{
    public static readonly IReadOnlyList<string> Industries =
        ["General", "Trading", "Construction", "Staffing", "Software"];

    /// <summary>Fixed codes of the system posting accounts — identical across every template.</summary>
    public static class Codes
    {
        public const string Cash = "1000";
        public const string Bank = "1010";
        public const string AccountsReceivable = "1100";
        public const string VatInput = "1300";
        public const string AccountsPayable = "2000";
        public const string VatOutput = "2100";
        public const string SalaryPayable = "2200";
        public const string RetainedEarnings = "3100";
        public const string Sales = "4000";
        public const string ForexGainLoss = "4150";
        public const string UnrealizedForexGainLoss = "4160";
        public const string Cogs = "5000";
        public const string SalaryExpense = "6000";
        public const string Rounding = "6600";
    }

    /// <summary>Base ledger shared by all industries (~27 accounts, system accounts flagged).</summary>
    private static IReadOnlyList<AccountSeed> Base() =>
    [
        // ── Assets (1000–1999) ──
        new(Codes.Cash,               "Cash on Hand",                AT.Asset, AST.Cash,               IsSystem: true),
        new(Codes.Bank,               "Bank Account",                AT.Asset, AST.Bank,               IsSystem: true),
        new(Codes.AccountsReceivable, "Accounts Receivable",         AT.Asset, AST.AccountsReceivable, IsSystem: true),
        new("1200",                   "Inventory",                   AT.Asset, AST.Inventory),
        new(Codes.VatInput,           "VAT Input (Recoverable)",     AT.Asset, AST.TaxReceivable,      IsSystem: true),
        new("1400",                   "Prepaid Expenses",            AT.Asset, AST.OtherCurrentAsset),
        new("1500",                   "Property, Plant & Equipment", AT.Asset, AST.FixedAsset),
        new("1510",                   "Accumulated Depreciation",    AT.Asset, AST.FixedAsset),

        // ── Liabilities (2000–2999) ──
        new(Codes.AccountsPayable,    "Accounts Payable",            AT.Liability, AST.AccountsPayable,       IsSystem: true),
        new(Codes.VatOutput,          "VAT Output (Payable)",        AT.Liability, AST.TaxPayable,            IsSystem: true),
        new(Codes.SalaryPayable,      "Salaries Payable",            AT.Liability, AST.OtherCurrentLiability, IsSystem: true),
        new("2300",                   "Accrued Expenses",            AT.Liability, AST.OtherCurrentLiability),
        new("2400",                   "Loans Payable",               AT.Liability, AST.LongTermLiability),

        // ── Equity (3000–3999) ──
        new("3000",                   "Share Capital",               AT.Equity, AST.Equity),
        new(Codes.RetainedEarnings,   "Retained Earnings",           AT.Equity, AST.RetainedEarnings, IsSystem: true),
        new("3200",                   "Owner's Drawings",            AT.Equity, AST.Equity),

        // ── Revenue (4000–4999) ──
        new(Codes.Sales,              "Sales Revenue",               AT.Revenue, AST.Revenue, IsSystem: true),
        new("4100",                   "Other Income",                AT.Revenue, AST.OtherIncome),
        new(Codes.ForexGainLoss,      "Foreign Exchange Gain/Loss",  AT.Revenue, AST.OtherIncome, IsSystem: true),
        new(Codes.UnrealizedForexGainLoss, "Unrealized Foreign Exchange Gain/Loss", AT.Revenue, AST.OtherIncome, IsSystem: true),

        // ── Expense (5000–6999) ──
        new(Codes.Cogs,               "Cost of Goods Sold",          AT.Expense, AST.CostOfGoodsSold, IsSystem: true),
        new(Codes.SalaryExpense,      "Salaries & Wages",            AT.Expense, AST.OperatingExpense, IsSystem: true),
        new("6100",                   "Rent",                        AT.Expense, AST.OperatingExpense),
        new("6200",                   "Utilities",                   AT.Expense, AST.OperatingExpense),
        new("6300",                   "Office Supplies",             AT.Expense, AST.OperatingExpense),
        new("6400",                   "Depreciation Expense",        AT.Expense, AST.OperatingExpense),
        new("6500",                   "Bank Charges",                AT.Expense, AST.OperatingExpense),
        new(Codes.Rounding,           "Rounding Difference",         AT.Expense, AST.OtherExpense, IsSystem: true),
        new("6900",                   "Miscellaneous Expense",       AT.Expense, AST.OtherExpense),
    ];

    private static IReadOnlyList<AccountSeed> ExtrasFor(string industry) => industry switch
    {
        "Trading" =>
        [
            new("4010", "Sales — Wholesale",             AT.Revenue, AST.Revenue),
            new("4020", "Sales — Retail",                AT.Revenue, AST.Revenue),
            new("5010", "Purchases — Goods for Resale",  AT.Expense, AST.CostOfGoodsSold),
            new("5020", "Freight Inward",                AT.Expense, AST.CostOfGoodsSold),
            new("5030", "Import Duty & Clearing",        AT.Expense, AST.CostOfGoodsSold),
            new("1210", "Goods in Transit",              AT.Asset,   AST.Inventory),
        ],

        "Construction" =>
        [
            new("1600", "Work in Progress (WIP)",        AT.Asset,     AST.OtherCurrentAsset),
            new("1310", "Retention Receivable",          AT.Asset,     AST.OtherCurrentAsset),
            new("2500", "Retention Payable",             AT.Liability, AST.OtherCurrentLiability),
            new("4200", "Contract Revenue",              AT.Revenue,   AST.Revenue),
            new("5100", "Subcontractor Costs",           AT.Expense,   AST.CostOfGoodsSold),
            new("5110", "Materials & Supplies",          AT.Expense,   AST.CostOfGoodsSold),
            new("5120", "Site Labour",                   AT.Expense,   AST.CostOfGoodsSold),
            new("5130", "Equipment Hire",                AT.Expense,   AST.CostOfGoodsSold),
        ],

        "Staffing" =>
        [
            new("4300", "Contract Staffing Revenue",     AT.Revenue,   AST.Revenue),
            new("4310", "Permanent Placement Fees",      AT.Revenue,   AST.Revenue),
            new("5200", "Contractor Wages",              AT.Expense,   AST.CostOfGoodsSold),
            new("5210", "Visa & Immigration Costs",      AT.Expense,   AST.OperatingExpense),
            new("5220", "End-of-Service / Gratuity",     AT.Expense,   AST.OperatingExpense),
            new("2600", "Gratuity Provision",            AT.Liability, AST.OtherCurrentLiability),
        ],

        "Software" =>
        [
            new("4400", "Subscription (SaaS) Revenue",   AT.Revenue,   AST.Revenue),
            new("4410", "License Revenue",               AT.Revenue,   AST.Revenue),
            new("4420", "Professional Services Revenue", AT.Revenue,   AST.Revenue),
            new("2700", "Deferred Revenue",              AT.Liability, AST.OtherCurrentLiability),
            new("5300", "Cloud Hosting & Infrastructure", AT.Expense,  AST.CostOfGoodsSold),
            new("5310", "Software & Developer Tools",    AT.Expense,   AST.OperatingExpense),
            new("5320", "Third-party APIs & Services",   AT.Expense,   AST.CostOfGoodsSold),
        ],

        // "General" and anything else → base only, plus a couple of service lines.
        _ =>
        [
            new("4050", "Service Revenue",               AT.Revenue,   AST.Revenue),
            new("6050", "Professional Fees",             AT.Expense,   AST.OperatingExpense),
            new("6060", "Marketing & Advertising",       AT.Expense,   AST.OperatingExpense),
        ],
    };

    /// <summary>The full account set for an industry = shared base + industry extras.</summary>
    public static IReadOnlyList<AccountSeed> For(string industry) =>
        [.. Base(), .. ExtrasFor(industry)];
}
