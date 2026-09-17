namespace Xorva.Modules.HR.Enums;

/// <summary>Input type of an admin-defined employee-tab field (drives rendering + validation).</summary>
public enum HrFieldType
{
    Text = 0,
    TextArea = 1,
    Number = 2,
    Currency = 3,
    Date = 4,
    Boolean = 5,
    Select = 6,
    Email = 7,
    Phone = 8,
    Attachment = 9,
}
