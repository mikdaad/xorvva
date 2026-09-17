namespace Xorva.Modules.HR.Enums;

public enum Gender
{
    Male = 0,
    Female = 1,
    Other = 2
}

public enum MaritalStatus
{
    Single = 0,
    Married = 1,
    Divorced = 2,
    Widowed = 3
}

public enum EmploymentType
{
    FullTime = 0,
    PartTime = 1,
    Contract = 2,
    Intern = 3
}

public enum EmploymentStatus
{
    Active = 0,
    OnProbation = 1,
    OnLeave = 2,
    Resigned = 3,
    Terminated = 4
}

public enum LeaveStatus
{
    Draft = 0,
    Pending = 1,
    Approved = 2,
    Rejected = 3,
    Cancelled = 4
}

/// <summary>
/// The business function a department performs. Drives function-based module access:
/// the Manager who heads a department gets access to that function's module (e.g. an
/// Accounting-function department's head is the accountant).
/// </summary>
public enum DepartmentFunction
{
    General = 0,
    HR = 1,
    Accounting = 2,
    Sales = 3,
    Operations = 4,
    Procurement = 5
}

/// <summary>Lifecycle of a payroll run. Posting accrues the salary journal (immutable).</summary>
public enum PayRunStatus
{
    Draft = 0,
    Posted = 1
}
