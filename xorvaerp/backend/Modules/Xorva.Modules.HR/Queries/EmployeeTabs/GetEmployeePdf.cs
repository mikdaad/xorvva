using System.Globalization;
using System.Text.Json;
using MediatR;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Queries.EmployeeTabs;

/// <summary>Renders one employee's full record (Basic + every tab) as a printable PDF document.</summary>
public sealed record GetEmployeePdfQuery(Guid Id) : IRequest<byte[]>;

public sealed class GetEmployeePdfHandler : IRequestHandler<GetEmployeePdfQuery, byte[]>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    static GetEmployeePdfHandler() => QuestPDF.Settings.License = LicenseType.Community;

    public GetEmployeePdfHandler(IXorvaDbContext db, ICurrentTenantService tenant) { _db = db; _tenant = tenant; }

    public async Task<byte[]> Handle(GetEmployeePdfQuery request, CancellationToken ct)
    {
        var employee = await _db.Set<Employee>().FirstOrDefaultAsync(e => e.Id == request.Id, ct)
            ?? throw new NotFoundException("Employee", request.Id);
        await HrGuard.EnsureCanManageEmployeeAsync(_db, _tenant, employee, ct);

        var dto = await employee.ToDtoAsync(_db, _tenant, ct);

        var tabs = await _db.Set<EmployeeTab>().Include(t => t.Fields)
            .Where(t => t.IsActive && t.CompanyId == employee.CompanyId)
            .OrderBy(t => t.SortOrder).ThenBy(t => t.Label).ToListAsync(ct);
        var records = await _db.Set<EmployeeTabRecord>()
            .Where(r => r.EmployeeId == employee.Id).OrderBy(r => r.CreatedAt).ToListAsync(ct);
        var recsByTab = records.GroupBy(r => r.EmployeeTabId).ToDictionary(g => g.Key, g => g.ToList());

        var basic = new List<(string, string?)>
        {
            ("Employee Code", dto.EmployeeCode),
            ("Status", dto.EmploymentStatus.ToString()),
            ("Department", dto.DepartmentName),
            ("Designation", dto.DesignationTitle),
            ("Employment Type", dto.EmploymentType.ToString()),
            ("Join Date", dto.JoinDate.ToString("dd MMM yyyy", CultureInfo.InvariantCulture)),
            ("Email", dto.Email),
            ("Phone", dto.Phone),
            ("Nationality", dto.Nationality),
            ("Gender", dto.Gender.ToString()),
            ("Date of Birth", dto.DateOfBirth?.ToString("dd MMM yyyy", CultureInfo.InvariantCulture)),
        };
        if (dto.BasicSalary is decimal sal)
            basic.Add(("Basic Salary", $"{sal.ToString("N2", CultureInfo.InvariantCulture)} {dto.Currency}"));

        var bytes = Document.Create(doc =>
        {
            doc.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(32);
                page.DefaultTextStyle(x => x.FontSize(10).FontColor("#1f2430"));

                page.Header().PaddingBottom(10).BorderBottom(1).BorderColor("#7c5cff").Column(h =>
                {
                    h.Item().Text(dto.FullName).FontSize(20).SemiBold().FontColor("#4b2fd6");
                    h.Item().Text($"{dto.DesignationTitle} · {dto.DepartmentName} · {dto.EmployeeCode}")
                        .FontSize(9).FontColor("#6b7280");
                });

                page.Content().PaddingVertical(12).Column(col =>
                {
                    col.Spacing(16);
                    KeyValueSection(col, "Basic", basic);

                    foreach (var tab in tabs)
                    {
                        recsByTab.TryGetValue(tab.Id, out var recs);
                        var fields = tab.Fields.OrderBy(f => f.SortOrder).ToList();
                        if (tab.IsList) ListSection(col, tab.Label, fields, recs ?? []);
                        else SingleSection(col, tab.Label, fields, recs?.FirstOrDefault());
                    }
                });

                page.Footer().AlignRight().Text(t =>
                {
                    t.Span($"Generated {DateTime.UtcNow:dd MMM yyyy}  ·  ").FontSize(8).FontColor("#9ca3af");
                    t.CurrentPageNumber().FontSize(8).FontColor("#9ca3af");
                    t.Span(" / ").FontSize(8).FontColor("#9ca3af");
                    t.TotalPages().FontSize(8).FontColor("#9ca3af");
                });
            });
        }).GeneratePdf();

        return bytes;
    }

    private static void SectionTitle(ColumnDescriptor col, string title) =>
        col.Item().Text(title).FontSize(12).SemiBold().FontColor("#4b2fd6");

    private static void KeyValueSection(ColumnDescriptor col, string title, List<(string Label, string? Value)> rows)
    {
        SectionTitle(col, title);
        col.Item().Table(table =>
        {
            table.ColumnsDefinition(c => { c.ConstantColumn(150); c.RelativeColumn(); });
            foreach (var (label, value) in rows)
            {
                table.Cell().PaddingVertical(3).Text(label).FontColor("#6b7280");
                table.Cell().PaddingVertical(3).Text(string.IsNullOrWhiteSpace(value) ? "—" : value);
            }
        });
    }

    private static void SingleSection(ColumnDescriptor col, string title, List<EmployeeTabField> fields, EmployeeTabRecord? rec)
    {
        var data = Parse(rec?.Data);
        var rows = fields.Select(f => (f.Label, (string?)Format(f, data))).ToList();
        KeyValueSection(col, title, rows);
    }

    private static void ListSection(ColumnDescriptor col, string title, List<EmployeeTabField> fields, List<EmployeeTabRecord> recs)
    {
        SectionTitle(col, title);
        if (recs.Count == 0) { col.Item().Text("No records.").FontColor("#9ca3af").Italic(); return; }

        col.Item().Table(table =>
        {
            table.ColumnsDefinition(c => { foreach (var _ in fields) c.RelativeColumn(); });
            table.Header(header =>
            {
                foreach (var f in fields)
                    header.Cell().Background("#f3f0ff").Padding(4).Text(f.Label).FontSize(9).SemiBold();
            });
            foreach (var r in recs)
            {
                var data = Parse(r.Data);
                foreach (var f in fields)
                    table.Cell().BorderBottom(1).BorderColor("#eceaf5").Padding(4).Text(Format(f, data)).FontSize(9);
            }
        });
    }

    private static Dictionary<string, JsonElement> Parse(string? json)
    {
        var d = new Dictionary<string, JsonElement>();
        if (string.IsNullOrWhiteSpace(json)) return d;
        var el = JsonSerializer.Deserialize<JsonElement>(json);
        if (el.ValueKind == JsonValueKind.Object)
            foreach (var p in el.EnumerateObject()) d[p.Name] = p.Value;
        return d;
    }

    private static string Format(EmployeeTabField f, Dictionary<string, JsonElement> data)
    {
        if (!data.TryGetValue(f.Key, out var v) || v.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            return "—";

        return f.Type switch
        {
            HrFieldType.Boolean => (v.ValueKind == JsonValueKind.True) ? "Yes"
                : (v.ValueKind == JsonValueKind.False) ? "No"
                : v.ToString(),
            HrFieldType.Currency or HrFieldType.Number when v.ValueKind == JsonValueKind.Number =>
                v.TryGetDecimal(out var n) ? n.ToString("N2", CultureInfo.InvariantCulture) : v.ToString(),
            HrFieldType.Attachment => "Attached (see file)",
            _ => v.ValueKind == JsonValueKind.String ? (v.GetString() ?? "—") : v.ToString(),
        };
    }
}
