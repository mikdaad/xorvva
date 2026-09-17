using System.Globalization;
using System.Text.Json;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Queries.EmployeeTabs;

/// <summary>One row of a per-tab employee view: the employee it belongs to + that tab's values.</summary>
public sealed record EmployeeTabRowDto(
    Guid EmployeeId,
    string EmployeeName,
    string EmployeeCode,
    string EmploymentStatus,
    Guid? RecordId,
    JsonElement Values);

/// <summary>
/// The employees-by-tab table: the tab's list columns + filters, plus one row per employee
/// (single-form tab) or per record (list tab), with search / filter / expiring-soon applied.
/// </summary>
public sealed record EmployeeTabViewDto(
    Guid TabId,
    string TabKey,
    string TabLabel,
    bool IsList,
    IReadOnlyList<EmployeeTabFieldDto> Columns,
    IReadOnlyList<EmployeeTabFieldDto> Filters,
    IReadOnlyList<EmployeeTabRowDto> Rows,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

public sealed record GetEmployeeTabViewQuery : IRequest<ApiResponse<EmployeeTabViewDto>>
{
    public Guid TabId { get; init; }
    public Guid? CompanyId { get; init; }
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 10;
    public string? Search { get; init; }
    /// <summary>fieldKey → value equality/contains filters (from the tab's filterable fields).</summary>
    public Dictionary<string, string>? Filters { get; init; }
    /// <summary>When set, keep only rows whose any filterable Date field is expired or within N days.</summary>
    public int? ExpiringDays { get; init; }
}

public sealed class GetEmployeeTabViewHandler
    : IRequestHandler<GetEmployeeTabViewQuery, ApiResponse<EmployeeTabViewDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    public GetEmployeeTabViewHandler(IXorvaDbContext db, ICurrentTenantService tenant) { _db = db; _tenant = tenant; }

    private sealed record EmpRow(Guid Id, string Name, string Code, string Status, Guid DepartmentId);

    public async Task<ApiResponse<EmployeeTabViewDto>> Handle(GetEmployeeTabViewQuery request, CancellationToken ct)
    {
        var tab = await _db.Set<EmployeeTab>().Include(t => t.Fields)
            .FirstOrDefaultAsync(t => t.Id == request.TabId, ct)
            ?? throw new NotFoundException("EmployeeTab", request.TabId);

        Guid? scope = _tenant.HasCrossCompanyAccess ? request.CompanyId : _tenant.CompanyId;

        // Employees in scope (company + a Manager's own department).
        var empQuery = _db.Set<Employee>().Where(e => e.IsActive);
        if (scope != null) empQuery = empQuery.Where(e => e.CompanyId == scope);
        if (_tenant.Role == SystemRole.Manager)
        {
            var deptId = await HrGuard.GetCallerDepartmentIdAsync(_db, _tenant, ct);
            empQuery = empQuery.Where(e => deptId != null && e.DepartmentId == deptId);
        }
        var employees = await empQuery
            .Select(e => new EmpRow(e.Id, e.FirstName + " " + e.LastName, e.EmployeeCode,
                e.EmploymentStatus.ToString(), e.DepartmentId))
            .ToListAsync(ct);
        var empById = employees.ToDictionary(e => e.Id);

        var records = await _db.Set<EmployeeTabRecord>()
            .Where(r => r.EmployeeTabId == tab.Id && (scope == null || r.CompanyId == scope))
            .Select(r => new { r.Id, r.EmployeeId, r.Data, r.CreatedAt })
            .ToListAsync(ct);

        // Build the candidate rows (employee identity + parsed values).
        var fields = tab.Fields.OrderBy(f => f.SortOrder).ToList();
        var rows = new List<(EmpRow Emp, Guid? RecordId, JsonElement Values, Dictionary<string, string> Flat, DateTime Order)>();

        if (tab.IsList)
        {
            foreach (var r in records.OrderBy(r => r.CreatedAt))
            {
                if (!empById.TryGetValue(r.EmployeeId, out var emp)) continue; // out of scope
                var el = Parse(r.Data);
                rows.Add((emp, r.Id, el, Flatten(el), r.CreatedAt));
            }
        }
        else
        {
            var byEmp = records.GroupBy(r => r.EmployeeId).ToDictionary(g => g.Key, g => g.First());
            foreach (var emp in employees.OrderBy(e => e.Name))
            {
                byEmp.TryGetValue(emp.Id, out var rec);
                var el = rec is null ? Parse("{}") : Parse(rec.Data);
                rows.Add((emp, rec?.Id, el, Flatten(el), rec?.CreatedAt ?? DateTime.MinValue));
            }
        }

        // ── Filters ──
        var search = request.Search?.Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(search))
            rows = rows.Where(r =>
                r.Emp.Name.ToLowerInvariant().Contains(search) ||
                r.Emp.Code.ToLowerInvariant().Contains(search) ||
                r.Flat.Values.Any(v => v.ToLowerInvariant().Contains(search))).ToList();

        if (request.Filters is { Count: > 0 })
        {
            foreach (var (key, val) in request.Filters)
            {
                if (string.IsNullOrWhiteSpace(val)) continue;
                var field = fields.FirstOrDefault(f => f.Key == key);
                if (field is null) continue;
                var needle = val.Trim().ToLowerInvariant();
                rows = rows.Where(r =>
                {
                    if (!r.Flat.TryGetValue(key, out var have)) return false;
                    have = have.ToLowerInvariant();
                    return field.Type == HrFieldType.Select ? have == needle : have.Contains(needle);
                }).ToList();
            }
        }

        if (request.ExpiringDays is int days)
        {
            var limit = DateTime.UtcNow.Date.AddDays(days);
            var dateKeys = fields.Where(f => f.Type == HrFieldType.Date).Select(f => f.Key).ToList();
            rows = rows.Where(r => dateKeys.Any(k =>
                r.Flat.TryGetValue(k, out var s) &&
                DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var d) &&
                d.Date <= limit)).ToList();
        }

        // ── Sort by nearest expiry first ──
        // Profile is driven specifically by Visa Expiry; other tabs use the soonest of their
        // expiry/end date fields (fallback: any date field). Rows with no date go last.
        List<string> sortKeys;
        if (tab.Key == "profile" && fields.Any(f => f.Key == "visa_expiry"))
        {
            sortKeys = ["visa_expiry"];
        }
        else
        {
            sortKeys = fields
                .Where(f => f.Type == HrFieldType.Date && (f.Key.Contains("expir") || f.Key.EndsWith("end")))
                .Select(f => f.Key).ToList();
            if (sortKeys.Count == 0)
                sortKeys = fields.Where(f => f.Type == HrFieldType.Date).Select(f => f.Key).ToList();
        }
        if (tab.IsList)
        {
            // Keep an employee's records together (feels like one employee with many entries),
            // ordering the employees by their soonest expiry, then each employee's rows by expiry.
            var groupSoonest = rows.GroupBy(r => r.Emp.Id)
                .ToDictionary(g => g.Key, g => sortKeys.Count > 0 ? g.Min(x => Soonest(x.Flat, sortKeys)) : DateTime.MaxValue);
            rows = rows
                .OrderBy(r => groupSoonest[r.Emp.Id])
                .ThenBy(r => r.Emp.Name)
                .ThenBy(r => r.Emp.Id)
                .ThenBy(r => sortKeys.Count > 0 ? Soonest(r.Flat, sortKeys) : r.Order)
                .ToList();
        }
        else if (sortKeys.Count > 0)
        {
            rows = rows.OrderBy(r => Soonest(r.Flat, sortKeys)).ToList();
        }

        // ── Paginate ──
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 500);
        var total = rows.Count;
        var pageRows = rows.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(r => new EmployeeTabRowDto(r.Emp.Id, r.Emp.Name, r.Emp.Code, r.Emp.Status, r.RecordId, r.Values))
            .ToList();

        var columns = fields.Where(f => f.ShowInList).Select(EmployeeTabFieldDto.From).ToList();
        var filters = fields.Where(f => f.IsFilterable).Select(EmployeeTabFieldDto.From).ToList();

        var dto = new EmployeeTabViewDto(
            tab.Id, tab.Key, tab.Label, tab.IsList, columns, filters, pageRows,
            page, pageSize, total, (int)Math.Ceiling(total / (double)pageSize));

        return ApiResponse<EmployeeTabViewDto>.Ok(dto);
    }

    /// <summary>The earliest date across the given keys (nearest expiry); MaxValue when none set.</summary>
    private static DateTime Soonest(Dictionary<string, string> flat, List<string> keys)
    {
        var best = DateTime.MaxValue;
        foreach (var k in keys)
            if (flat.TryGetValue(k, out var s) &&
                DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var d) &&
                d < best)
                best = d;
        return best;
    }

    private static JsonElement Parse(string json) =>
        JsonSerializer.Deserialize<JsonElement>(string.IsNullOrWhiteSpace(json) ? "{}" : json);

    /// <summary>Flatten a record's values to string form for search/filter matching.</summary>
    private static Dictionary<string, string> Flatten(JsonElement el)
    {
        var d = new Dictionary<string, string>();
        if (el.ValueKind != JsonValueKind.Object) return d;
        foreach (var p in el.EnumerateObject())
            d[p.Name] = p.Value.ValueKind == JsonValueKind.String ? (p.Value.GetString() ?? "") : p.Value.ToString();
        return d;
    }
}
