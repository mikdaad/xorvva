namespace Xorva.Core.Constants;

/// <summary>
/// The catalog of ERP modules a company can activate.
/// Keys are stored in Company.ActiveModules and validated on write.
///
/// NOTE: this is the SUBSCRIPTION catalog (which modules a company pays for /
/// uses). It is distinct from the Approval Engine's dynamic action registry
/// (Day 3), where modules register their approvable ACTIONS at startup.
/// </summary>
public static class ModuleCatalog
{
    public const string HR = "HR";
    public const string Accounting = "Accounting";
    public const string Sales = "Sales";
    public const string Purchasing = "Purchasing";
    public const string Inventory = "Inventory";
    public const string Payroll = "Payroll";
    public const string Pos = "POS";
    public const string Reports = "Reports";

    public static readonly IReadOnlyList<string> All =
        [HR, Accounting, Sales, Purchasing, Inventory, Payroll, Pos, Reports];

    public static bool IsValid(string moduleKey) => All.Contains(moduleKey);
}
