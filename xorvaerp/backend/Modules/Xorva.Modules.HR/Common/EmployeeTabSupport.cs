using System.Globalization;
using System.Text;
using System.Text.Json;
using Xorva.Core.Exceptions;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Common;

/// <summary>
/// Helpers for the admin-defined employee-tabs engine (HR-owned, independent of Platform).
/// Turns labels into stable keys and validates a submitted record against its tab's fields.
/// </summary>
public static class EmployeeTabSupport
{
    /// <summary>Turns a human label into a stable machine key ("Passport No" → "passport_no").</summary>
    public static string Slugify(string label)
    {
        var sb = new StringBuilder(label.Length);
        var lastUnderscore = false;
        foreach (var ch in label.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(ch)) { sb.Append(ch); lastUnderscore = false; }
            else if (!lastUnderscore && sb.Length > 0) { sb.Append('_'); lastUnderscore = true; }
        }
        return sb.ToString().Trim('_') is { Length: > 0 } s ? s : "field";
    }

    /// <summary>
    /// Validates a submitted record's values against its tab's field definitions and returns the
    /// canonical JSON to persist (only known field keys). Throws <see cref="BadRequestException"/>
    /// listing every problem when validation fails.
    /// </summary>
    public static string BuildRecordJson(
        IReadOnlyList<EmployeeTabField> fields, IReadOnlyDictionary<string, JsonElement> input)
    {
        var errors = new List<string>();
        var clean = new Dictionary<string, object?>();

        foreach (var f in fields.OrderBy(f => f.SortOrder))
        {
            input.TryGetValue(f.Key, out var raw);
            var hasValue = input.ContainsKey(f.Key) && !IsBlank(raw);

            if (!hasValue)
            {
                if (f.IsRequired) errors.Add($"{f.Label} is required.");
                continue;
            }

            if (TryCoerce(f, raw, out var value, out var error)) clean[f.Key] = value;
            else errors.Add(error!);
        }

        if (errors.Count > 0) throw new BadRequestException(string.Join(" ", errors));
        return JsonSerializer.Serialize(clean);
    }

    private static bool IsBlank(JsonElement e) =>
        e.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined ||
        (e.ValueKind == JsonValueKind.String && string.IsNullOrWhiteSpace(e.GetString()));

    private static bool TryCoerce(EmployeeTabField f, JsonElement raw, out object? value, out string? error)
    {
        value = null; error = null;
        var text = raw.ValueKind == JsonValueKind.String ? raw.GetString() : raw.GetRawText();

        switch (f.Type)
        {
            case HrFieldType.Number:
            case HrFieldType.Currency:
                if (double.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out var num)) { value = num; return true; }
                error = $"{f.Label} must be a number."; return false;

            case HrFieldType.Boolean:
                if (raw.ValueKind is JsonValueKind.True or JsonValueKind.False) { value = raw.GetBoolean(); return true; }
                if (bool.TryParse(text, out var b)) { value = b; return true; }
                error = $"{f.Label} must be true or false."; return false;

            case HrFieldType.Date:
                if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var d))
                { value = d.ToString("yyyy-MM-dd"); return true; }
                error = $"{f.Label} must be a valid date."; return false;

            case HrFieldType.Email:
                if (text!.Contains('@') && text.Contains('.')) { value = text; return true; }
                error = $"{f.Label} must be a valid email."; return false;

            case HrFieldType.Select:
                var options = string.IsNullOrWhiteSpace(f.Options)
                    ? [] : JsonSerializer.Deserialize<List<string>>(f.Options!) ?? [];
                if (options.Count == 0 || options.Contains(text!)) { value = text; return true; }
                error = $"{f.Label} must be one of: {string.Join(", ", options)}."; return false;

            default: // Text, TextArea, Phone
                value = text; return true;
        }
    }
}
