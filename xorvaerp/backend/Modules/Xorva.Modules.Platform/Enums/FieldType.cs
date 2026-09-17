namespace Xorva.Modules.Platform.Enums;

/// <summary>
/// The input type of a dynamic <c>FieldDefinition</c>. Drives how the field is rendered
/// on the frontend (DynamicForm) and how its value is validated on the backend.
/// </summary>
public enum FieldType
{
    /// <summary>Single-line text.</summary>
    Text = 0,

    /// <summary>Multi-line text.</summary>
    TextArea = 1,

    /// <summary>Numeric value.</summary>
    Number = 2,

    /// <summary>Monetary amount.</summary>
    Currency = 3,

    /// <summary>Calendar date.</summary>
    Date = 4,

    /// <summary>Yes / no toggle.</summary>
    Boolean = 5,

    /// <summary>Single choice from <c>FieldDefinition.Options</c>.</summary>
    Select = 6,

    /// <summary>Email address (validated for shape).</summary>
    Email = 7,

    /// <summary>Phone number.</summary>
    Phone = 8
}
