using System.Text.Json;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Commands.EmployeeTabs;

// ═══════════════════════════════════════════════════════════════════════
//  CREATE TAB  —  Admin designs a new section on the employee record
// ═══════════════════════════════════════════════════════════════════════

/// <summary>A field to add to a new employee tab. Its machine key is derived from the label.</summary>
public sealed record EmployeeTabFieldInput(
    string Label,
    HrFieldType Type = HrFieldType.Text,
    bool IsRequired = false,
    List<string>? Options = null,
    bool ShowInList = false,
    bool IsFilterable = false);

/// <summary>Defines a new employee-record tab (section) with its fields. CompanyAdmin / SuperAdmin only.</summary>
public sealed record CreateEmployeeTabCommand : IRequest<ApiResponse<EmployeeTabDto>>
{
    public Guid? CompanyId { get; init; }
    public string Label { get; init; } = string.Empty;
    /// <summary>false = single form (one set of fields per employee); true = list table (many rows).</summary>
    public bool IsList { get; init; }
    public string? Icon { get; init; }
    public List<EmployeeTabFieldInput> Fields { get; init; } = [];
}

public sealed class CreateEmployeeTabValidator : AbstractValidator<CreateEmployeeTabCommand>
{
    public CreateEmployeeTabValidator()
    {
        RuleFor(x => x.Label).NotEmpty().MaximumLength(80).WithMessage("Give the tab a name.");
        RuleFor(x => x.Fields).NotEmpty().WithMessage("Add at least one field.");
        RuleForEach(x => x.Fields).ChildRules(f =>
            f.RuleFor(i => i.Label).NotEmpty().MaximumLength(80).WithMessage("Every field needs a label."));
    }
}

public sealed class CreateEmployeeTabHandler : IRequestHandler<CreateEmployeeTabCommand, ApiResponse<EmployeeTabDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    public CreateEmployeeTabHandler(IXorvaDbContext db, ICurrentTenantService tenant) { _db = db; _tenant = tenant; }

    public async Task<ApiResponse<EmployeeTabDto>> Handle(CreateEmployeeTabCommand request, CancellationToken ct)
    {
        var companyId = HrGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await HrGuard.EnsureHrActiveAsync(_db, companyId, ct);
        await HrGuard.EnsureCanDesignTabsAsync(_db, _tenant, ct);

        var label = request.Label.Trim();
        var baseKey = EmployeeTabSupport.Slugify(label);

        var existing = await _db.Set<EmployeeTab>()
            .Where(t => t.CompanyId == companyId && t.Key.StartsWith(baseKey))
            .Select(t => t.Key).ToListAsync(ct);
        var key = baseKey;
        for (var n = 2; existing.Contains(key); n++) key = $"{baseKey}_{n}";

        var nextOrder = await _db.Set<EmployeeTab>().Where(t => t.CompanyId == companyId)
            .Select(t => (int?)t.SortOrder).MaxAsync(ct) ?? -1;

        var tab = new EmployeeTab
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Key = key,
            Label = label,
            IsList = request.IsList,
            Icon = string.IsNullOrWhiteSpace(request.Icon) ? null : request.Icon.Trim(),
            SortOrder = nextOrder + 1,
            IsActive = true,
        };

        var order = 0;
        var usedKeys = new HashSet<string>();
        foreach (var fi in request.Fields)
        {
            var fk = EmployeeTabSupport.Slugify(fi.Label);
            for (var n = 2; !usedKeys.Add(fk); n++) fk = $"{EmployeeTabSupport.Slugify(fi.Label)}_{n}";

            tab.Fields.Add(new EmployeeTabField
            {
                TenantId = _tenant.TenantId,
                CompanyId = companyId,
                Key = fk,
                Label = fi.Label.Trim(),
                Type = fi.Type,
                IsRequired = fi.IsRequired,
                SortOrder = order++,
                Options = fi.Options is { Count: > 0 } ? JsonSerializer.Serialize(fi.Options) : null,
                ShowInList = fi.ShowInList,
                IsFilterable = fi.IsFilterable,
            });
        }

        _db.Set<EmployeeTab>().Add(tab);
        await _db.SaveChangesAsync(ct);
        return ApiResponse<EmployeeTabDto>.Ok(EmployeeTabDto.From(tab), $"Added the '{tab.Label}' tab.");
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  UPDATE TAB  —  rename + reconcile fields (add / edit / remove)
// ═══════════════════════════════════════════════════════════════════════

/// <summary>A field in an update: existing fields carry their Id (key preserved); new ones have none.</summary>
public sealed record UpdateEmployeeTabFieldInput(
    Guid? Id,
    string Label,
    HrFieldType Type = HrFieldType.Text,
    bool IsRequired = false,
    List<string>? Options = null,
    bool ShowInList = false,
    bool IsFilterable = false);

/// <summary>Rename a tab and reconcile its fields. Admins &amp; HR managers. (Cardinality — single/list — is fixed.)</summary>
public sealed record UpdateEmployeeTabCommand : IRequest<ApiResponse<EmployeeTabDto>>
{
    public Guid Id { get; init; }
    public string Label { get; init; } = string.Empty;
    public List<UpdateEmployeeTabFieldInput> Fields { get; init; } = [];
}

public sealed class UpdateEmployeeTabValidator : AbstractValidator<UpdateEmployeeTabCommand>
{
    public UpdateEmployeeTabValidator()
    {
        RuleFor(x => x.Label).NotEmpty().MaximumLength(80).WithMessage("Give the tab a name.");
        RuleFor(x => x.Fields).NotEmpty().WithMessage("Add at least one field.");
        RuleForEach(x => x.Fields).ChildRules(f =>
            f.RuleFor(i => i.Label).NotEmpty().MaximumLength(80).WithMessage("Every field needs a label."));
    }
}

public sealed class UpdateEmployeeTabHandler : IRequestHandler<UpdateEmployeeTabCommand, ApiResponse<EmployeeTabDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    public UpdateEmployeeTabHandler(IXorvaDbContext db, ICurrentTenantService tenant) { _db = db; _tenant = tenant; }

    public async Task<ApiResponse<EmployeeTabDto>> Handle(UpdateEmployeeTabCommand request, CancellationToken ct)
    {
        await HrGuard.EnsureCanDesignTabsAsync(_db, _tenant, ct);

        var tab = await _db.Set<EmployeeTab>().Include(t => t.Fields)
            .FirstOrDefaultAsync(t => t.Id == request.Id, ct)
            ?? throw new NotFoundException("EmployeeTab", request.Id);

        tab.Label = request.Label.Trim();

        // Remove fields the admin dropped (their record data stays under the old key, harmlessly).
        var keepIds = request.Fields.Where(f => f.Id.HasValue).Select(f => f.Id!.Value).ToHashSet();
        var toRemove = tab.Fields.Where(f => !keepIds.Contains(f.Id)).ToList();
        if (toRemove.Count > 0) _db.Set<EmployeeTabField>().RemoveRange(toRemove);

        var usedKeys = tab.Fields.Where(f => keepIds.Contains(f.Id)).Select(f => f.Key).ToHashSet();
        var order = 0;
        foreach (var fi in request.Fields)
        {
            var options = fi.Options is { Count: > 0 } ? JsonSerializer.Serialize(fi.Options) : null;
            var existing = fi.Id.HasValue ? tab.Fields.FirstOrDefault(f => f.Id == fi.Id.Value) : null;
            if (existing is not null)
            {
                existing.Label = fi.Label.Trim();       // key preserved → existing data stays visible
                existing.Type = fi.Type;
                existing.IsRequired = fi.IsRequired;
                existing.Options = options;
                existing.ShowInList = fi.ShowInList;
                existing.IsFilterable = fi.IsFilterable;
                existing.SortOrder = order++;
            }
            else
            {
                var baseKey = EmployeeTabSupport.Slugify(fi.Label);
                var fk = baseKey;
                for (var n = 2; !usedKeys.Add(fk); n++) fk = $"{baseKey}_{n}";
                tab.Fields.Add(new EmployeeTabField
                {
                    TenantId = tab.TenantId,
                    CompanyId = tab.CompanyId,
                    Key = fk,
                    Label = fi.Label.Trim(),
                    Type = fi.Type,
                    IsRequired = fi.IsRequired,
                    SortOrder = order++,
                    Options = options,
                    ShowInList = fi.ShowInList,
                    IsFilterable = fi.IsFilterable,
                });
            }
        }

        await _db.SaveChangesAsync(ct);
        return ApiResponse<EmployeeTabDto>.Ok(EmployeeTabDto.From(tab), $"Updated the '{tab.Label}' tab.");
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  DELETE TAB  —  removes the section, its fields, and all its data
// ═══════════════════════════════════════════════════════════════════════

public sealed record DeleteEmployeeTabCommand(Guid Id) : IRequest<ApiResponse<bool>>;

public sealed class DeleteEmployeeTabHandler : IRequestHandler<DeleteEmployeeTabCommand, ApiResponse<bool>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    public DeleteEmployeeTabHandler(IXorvaDbContext db, ICurrentTenantService tenant) { _db = db; _tenant = tenant; }

    public async Task<ApiResponse<bool>> Handle(DeleteEmployeeTabCommand request, CancellationToken ct)
    {
        await HrGuard.EnsureCanDesignTabsAsync(_db, _tenant, ct);
        var tab = await _db.Set<EmployeeTab>().FirstOrDefaultAsync(t => t.Id == request.Id, ct)
            ?? throw new NotFoundException("EmployeeTab", request.Id);

        var records = await _db.Set<EmployeeTabRecord>().Where(r => r.EmployeeTabId == tab.Id).ToListAsync(ct);
        _db.Set<EmployeeTabRecord>().RemoveRange(records);
        _db.Set<EmployeeTab>().Remove(tab); // fields cascade
        await _db.SaveChangesAsync(ct);
        return ApiResponse<bool>.Ok(true, $"Removed the '{tab.Label}' tab.");
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  SAVE RECORD  —  fill / update an employee's data under a tab
// ═══════════════════════════════════════════════════════════════════════

public sealed record SaveEmployeeTabRecordCommand : IRequest<ApiResponse<EmployeeTabRecordDto>>
{
    public Guid EmployeeTabId { get; init; }
    public Guid EmployeeId { get; init; }
    /// <summary>When set, updates that specific row (list tabs). Ignored for single-form tabs.</summary>
    public Guid? RecordId { get; init; }
    public Dictionary<string, JsonElement> Values { get; init; } = [];
}

public sealed class SaveEmployeeTabRecordValidator : AbstractValidator<SaveEmployeeTabRecordCommand>
{
    public SaveEmployeeTabRecordValidator()
    {
        RuleFor(x => x.EmployeeTabId).NotEmpty();
        RuleFor(x => x.EmployeeId).NotEmpty();
    }
}

public sealed class SaveEmployeeTabRecordHandler
    : IRequestHandler<SaveEmployeeTabRecordCommand, ApiResponse<EmployeeTabRecordDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    public SaveEmployeeTabRecordHandler(IXorvaDbContext db, ICurrentTenantService tenant) { _db = db; _tenant = tenant; }

    public async Task<ApiResponse<EmployeeTabRecordDto>> Handle(
        SaveEmployeeTabRecordCommand request, CancellationToken ct)
    {
        var tab = await _db.Set<EmployeeTab>().Include(t => t.Fields)
            .FirstOrDefaultAsync(t => t.Id == request.EmployeeTabId, ct)
            ?? throw new NotFoundException("EmployeeTab", request.EmployeeTabId);

        var employee = await _db.Set<Employee>().FirstOrDefaultAsync(e => e.Id == request.EmployeeId, ct)
            ?? throw new NotFoundException("Employee", request.EmployeeId);
        await HrGuard.EnsureCanManageEmployeeAsync(_db, _tenant, employee, ct);

        var json = EmployeeTabSupport.BuildRecordJson(tab.Fields.ToList(), request.Values);

        // A single-form tab keeps exactly one row per employee; find the existing one to update.
        EmployeeTabRecord? record = null;
        if (request.RecordId is { } rid)
            record = await _db.Set<EmployeeTabRecord>().FirstOrDefaultAsync(r => r.Id == rid, ct);
        else if (!tab.IsList)
            record = await _db.Set<EmployeeTabRecord>()
                .FirstOrDefaultAsync(r => r.EmployeeTabId == tab.Id && r.EmployeeId == employee.Id, ct);

        if (record is null)
        {
            record = new EmployeeTabRecord
            {
                TenantId = employee.TenantId,
                CompanyId = employee.CompanyId,
                EmployeeTabId = tab.Id,
                EmployeeId = employee.Id,
                Data = json,
            };
            _db.Set<EmployeeTabRecord>().Add(record);
        }
        else
        {
            record.Data = json;
            record.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(ct);
        return ApiResponse<EmployeeTabRecordDto>.Ok(EmployeeTabRecordDto.From(record), "Saved.");
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  SEED DEFAULTS  —  create the standard employee-record tabs (idempotent)
// ═══════════════════════════════════════════════════════════════════════

/// <summary>
/// Creates the standard employee-record tabs (Passport &amp; Visa, Security, Training,
/// Reviews, Career Path) for a company. Skips any that already exist, so it is safe to
/// run repeatedly. The tabs remain fully editable / deletable afterwards. CompanyAdmin+.
/// </summary>
public sealed record SeedEmployeeTabsCommand : IRequest<ApiResponse<IReadOnlyList<EmployeeTabDto>>>
{
    public Guid? CompanyId { get; init; }
}

public sealed class SeedEmployeeTabsHandler
    : IRequestHandler<SeedEmployeeTabsCommand, ApiResponse<IReadOnlyList<EmployeeTabDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    public SeedEmployeeTabsHandler(IXorvaDbContext db, ICurrentTenantService tenant) { _db = db; _tenant = tenant; }

    private sealed record SeedField(
        string Label, HrFieldType Type, string[]? Options = null,
        bool ShowInList = false, bool Filterable = false);
    private sealed record SeedTab(string Label, bool IsList, SeedField[] Fields);

    // The UAE-shaped default tabs. "Basic" (name/dept/status/base salary) and salary history
    // are the built-in fixed spine, so only these dynamic sections are seeded.
    private static readonly SeedTab[] Defaults =
    [
        new("Profile", false,
        [
            new("Full Name (Arabic)", HrFieldType.Text),
            new("Emirates ID No", HrFieldType.Text, ShowInList: true, Filterable: true),
            new("Emirates ID Expiry", HrFieldType.Date, ShowInList: true, Filterable: true),
            new("Passport No", HrFieldType.Text, ShowInList: true, Filterable: true),
            new("Passport Expiry", HrFieldType.Date, Filterable: true),
            new("Visa / Residence No", HrFieldType.Text),
            new("Visa Type", HrFieldType.Select, ["Employment", "Investor", "Family", "Golden", "Visit"]),
            new("Visa Expiry", HrFieldType.Date, ShowInList: true, Filterable: true),
            new("Labour Card No", HrFieldType.Text),
            new("Labour Card Expiry", HrFieldType.Date, Filterable: true),
            new("UAE Address", HrFieldType.TextArea),
        ]),
        new("Contract", false,
        [
            new("MOHRE Contract No", HrFieldType.Text, Filterable: true),
            new("Contract Type", HrFieldType.Select, ["Full-time", "Part-time", "Temporary", "Flexible"], ShowInList: true, Filterable: true),
            new("Contract Start", HrFieldType.Date, ShowInList: true, Filterable: true),
            new("Contract End", HrFieldType.Date, ShowInList: true, Filterable: true),
            new("Probation End", HrFieldType.Date, Filterable: true),
            new("Basic Salary", HrFieldType.Currency, ShowInList: true),
            new("Housing Allowance", HrFieldType.Currency),
            new("Transport Allowance", HrFieldType.Currency),
            new("Other Allowances", HrFieldType.Currency),
            new("Gross Salary", HrFieldType.Currency, ShowInList: true),
            new("Bank Name", HrFieldType.Text),
            new("IBAN (WPS)", HrFieldType.Text, Filterable: true),
            new("Annual Leave (days)", HrFieldType.Number),
            new("Air Ticket", HrFieldType.Select, ["Yes", "No"]),
            new("Notice Period (days)", HrFieldType.Number),
        ]),
        new("Training & Certificates", true,
        [
            new("Certificate / Course", HrFieldType.Text, ShowInList: true),
            new("Issuing Body", HrFieldType.Text, ShowInList: true),
            new("Issue Date", HrFieldType.Date, ShowInList: true),
            new("Expiry Date", HrFieldType.Date, ShowInList: true, Filterable: true),
            new("Reference No", HrFieldType.Text),
        ]),
        new("Career Path", true,
        [
            new("Effective Date", HrFieldType.Date, ShowInList: true),
            new("Current Role", HrFieldType.Text, ShowInList: true),
            new("Target Role", HrFieldType.Text, ShowInList: true),
            new("Location / Move", HrFieldType.Text, ShowInList: true, Filterable: true),
            new("Plan / Notes", HrFieldType.TextArea),
        ]),
    ];

    public async Task<ApiResponse<IReadOnlyList<EmployeeTabDto>>> Handle(
        SeedEmployeeTabsCommand request, CancellationToken ct)
    {
        var companyId = HrGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await HrGuard.EnsureHrActiveAsync(_db, companyId, ct);
        await HrGuard.EnsureCanDesignTabsAsync(_db, _tenant, ct);

        var existingTabs = await _db.Set<EmployeeTab>().Include(t => t.Fields)
            .Where(t => t.CompanyId == companyId).ToListAsync(ct);
        var byKey = existingTabs.ToDictionary(t => t.Key);
        var nextOrder = existingTabs.Select(t => (int?)t.SortOrder).DefaultIfEmpty(-1).Max() ?? -1;

        var created = 0;
        foreach (var def in Defaults)
        {
            var key = EmployeeTabSupport.Slugify(def.Label);

            if (byKey.TryGetValue(key, out var tab))
            {
                // Existing standard tab — add any missing default fields and sync their display flags,
                // so newly-added defaults (e.g. Passport No shown) appear without touching custom fields/data.
                var maxFieldOrder = tab.Fields.Select(f => (int?)f.SortOrder).DefaultIfEmpty(-1).Max() ?? -1;
                foreach (var f in def.Fields)
                {
                    var fk = EmployeeTabSupport.Slugify(f.Label);
                    var field = tab.Fields.FirstOrDefault(x => x.Key == fk);
                    if (field is null)
                    {
                        tab.Fields.Add(new EmployeeTabField
                        {
                            TenantId = _tenant.TenantId, CompanyId = companyId, Key = fk, Label = f.Label,
                            Type = f.Type, IsRequired = false, SortOrder = ++maxFieldOrder,
                            Options = f.Options is { Length: > 0 } ? JsonSerializer.Serialize(f.Options) : null,
                            ShowInList = f.ShowInList, IsFilterable = f.Filterable,
                        });
                    }
                    else
                    {
                        field.ShowInList = f.ShowInList;
                        field.IsFilterable = f.Filterable;
                    }
                }
                continue;
            }

            var newTab = new EmployeeTab
            {
                TenantId = _tenant.TenantId,
                CompanyId = companyId,
                Key = key,
                Label = def.Label,
                IsList = def.IsList,
                SortOrder = ++nextOrder,
                IsActive = true,
            };

            var order = 0;
            foreach (var f in def.Fields)
            {
                newTab.Fields.Add(new EmployeeTabField
                {
                    TenantId = _tenant.TenantId,
                    CompanyId = companyId,
                    Key = EmployeeTabSupport.Slugify(f.Label),
                    Label = f.Label,
                    Type = f.Type,
                    IsRequired = false,
                    SortOrder = order++,
                    Options = f.Options is { Length: > 0 } ? JsonSerializer.Serialize(f.Options) : null,
                    ShowInList = f.ShowInList,
                    IsFilterable = f.Filterable,
                });
            }

            _db.Set<EmployeeTab>().Add(newTab);
            created++;
        }

        await _db.SaveChangesAsync(ct);

        var all = await _db.Set<EmployeeTab>().Include(t => t.Fields)
            .Where(t => t.IsActive && t.CompanyId == companyId)
            .OrderBy(t => t.SortOrder).ThenBy(t => t.Label)
            .ToListAsync(ct);

        IReadOnlyList<EmployeeTabDto> dtos = all.Select(EmployeeTabDto.From).ToList();
        return ApiResponse<IReadOnlyList<EmployeeTabDto>>.Ok(dtos,
            created > 0 ? $"Added {created} standard tab{(created == 1 ? "" : "s")}." : "Standard tabs updated.");
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  DELETE RECORD  —  remove one row from a list tab
// ═══════════════════════════════════════════════════════════════════════

public sealed record DeleteEmployeeTabRecordCommand(Guid Id) : IRequest<ApiResponse<bool>>;

public sealed class DeleteEmployeeTabRecordHandler : IRequestHandler<DeleteEmployeeTabRecordCommand, ApiResponse<bool>>
{
    private readonly IXorvaDbContext _db;
    public DeleteEmployeeTabRecordHandler(IXorvaDbContext db) => _db = db;

    public async Task<ApiResponse<bool>> Handle(DeleteEmployeeTabRecordCommand request, CancellationToken ct)
    {
        var record = await _db.Set<EmployeeTabRecord>().FirstOrDefaultAsync(r => r.Id == request.Id, ct)
            ?? throw new NotFoundException("EmployeeTabRecord", request.Id);
        _db.Set<EmployeeTabRecord>().Remove(record);
        await _db.SaveChangesAsync(ct);
        return ApiResponse<bool>.Ok(true, "Removed.");
    }
}
