using System.Text.Json;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Commands.EmployeeTabs;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Commands.SeedDemoEmployees;

public sealed record SeedDemoResultDto(int Created, int Skipped, int Removed, string Password, IReadOnlyList<string> Logins);

/// <summary>
/// Creates a set of demo UAE employees for a company — each with a login (so they can sign in
/// and see their own dashboard), the standard UAE tabs, and Profile + Contract data (incl. a few
/// soon-to-expire documents to show the "expiring" filter). Idempotent: skips existing emails.
/// When <see cref="Reset"/> is true, ALL existing employees in the company are permanently
/// removed first (clean slate).
/// </summary>
public sealed record SeedDemoEmployeesCommand : IRequest<ApiResponse<SeedDemoResultDto>>
{
    public Guid? CompanyId { get; init; }
    public bool Reset { get; init; }
}

public sealed class SeedDemoEmployeesHandler : IRequestHandler<SeedDemoEmployeesCommand, ApiResponse<SeedDemoResultDto>>
{
    private const string DemoPassword = "Employee@123";

    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IUserProvisioningService _provisioning;
    private readonly IMediator _mediator;

    public SeedDemoEmployeesHandler(
        IXorvaDbContext db, ICurrentTenantService tenant, IUserProvisioningService provisioning, IMediator mediator)
    {
        _db = db; _tenant = tenant; _provisioning = provisioning; _mediator = mediator;
    }

    private sealed record Person(string First, string Last, Gender Gender, string Nationality, decimal Salary,
        int VisaExpiresInDays, int EidExpiresInDays);

    private static readonly Person[] People =
    [
        new("Khalid", "Al Mansoori", Gender.Male, "Emirati", 12000, 500, 700),
        new("Fatima", "Al Zaabi", Gender.Female, "Emirati", 9000, 18, 640),   // visa expiring soon
        new("Rahul", "Sharma", Gender.Male, "Indian", 4500, 420, 12),          // EID expiring soon
        new("Ayesha", "Khan", Gender.Female, "Pakistani", 8000, 610, 720),
        new("Mohammed", "Iqbal", Gender.Male, "Pakistani", 4000, 25, 500),     // visa expiring soon
        new("Sana", "Malik", Gender.Female, "Pakistani", 7000, 800, 900),
        new("James", "Peterson", Gender.Male, "British", 15000, 300, 365),
        new("Maria", "Santos", Gender.Female, "Filipino", 5000, 540, 640),
    ];

    public async Task<ApiResponse<SeedDemoResultDto>> Handle(SeedDemoEmployeesCommand request, CancellationToken ct)
    {
        var companyId = HrGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await HrGuard.EnsureHrActiveAsync(_db, companyId, ct);

        // Clean slate — permanently remove all existing employees in this company first.
        var removed = 0;
        if (request.Reset)
        {
            var existing = await _db.Set<Employee>().Where(e => e.CompanyId == companyId).ToListAsync(ct);
            foreach (var e in existing) await EmployeeDeletion.HardDeleteAsync(_db, e, ct);
            if (existing.Count > 0) await _db.SaveChangesAsync(ct);
            removed = existing.Count;
        }

        // Make sure the standard UAE tabs exist for this company (idempotent).
        await _mediator.Send(new SeedEmployeeTabsCommand { CompanyId = companyId }, ct);

        var (departments, designations) = await EnsureOrgAsync(companyId, ct);

        // The Profile / Contract tabs (for seeding tab data).
        var tabs = await _db.Set<EmployeeTab>().Include(t => t.Fields)
            .Where(t => t.CompanyId == companyId && (t.Key == "profile" || t.Key == "contract"))
            .ToListAsync(ct);
        var profileTab = tabs.FirstOrDefault(t => t.Key == "profile");
        var contractTab = tabs.FirstOrDefault(t => t.Key == "contract");

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var created = 0; var skipped = 0; var logins = new List<string>();

        for (var i = 0; i < People.Length; i++)
        {
            var p = People[i];
            var email = $"{p.First}.{p.Last}".Replace(" ", "").ToLowerInvariant() + "@demo.ae";

            if (await _db.Set<ApplicationUser>().IgnoreQueryFilters().AnyAsync(u => u.Email == email, ct))
            {
                skipped++;
                continue;
            }

            var dept = departments[i % departments.Count];
            var desig = designations[i % designations.Count];
            var joinDate = today.AddDays(-(200 + i * 120));

            var login = await _provisioning.ProvisionAsync(new ProvisionLoginRequest
            {
                Email = email, Password = DemoPassword,
                FirstName = p.First, LastName = p.Last,
                Role = SystemRole.Employee, TenantId = _tenant.TenantId,
                CompanyId = companyId, DepartmentId = dept.Id,
            }, ct);

            var employee = new Employee
            {
                TenantId = _tenant.TenantId,
                CompanyId = companyId,
                EmployeeCode = await EmployeeMapper.NextEmployeeCodeAsync(_db, companyId, ct),
                FirstName = p.First,
                LastName = p.Last,
                Email = email,
                Gender = p.Gender,
                Nationality = p.Nationality,
                DepartmentId = dept.Id,
                DesignationId = desig.Id,
                JoinDate = joinDate,
                EmploymentType = EmploymentType.FullTime,
                EmploymentStatus = EmploymentStatus.Active,
                BasicSalary = p.Salary,
                Currency = "AED",
                UserId = login.Id,
                IsActive = true,
            };
            _db.Set<Employee>().Add(employee);

            if (profileTab is not null)
                AddRecord(profileTab, employee, new Dictionary<string, object?>
                {
                    ["Emirates ID No"] = $"784-198{i}-{1000000 + i * 137:D7}-{i % 10}",
                    ["Emirates ID Expiry"] = today.AddDays(p.EidExpiresInDays),
                    ["Passport No"] = $"P{4200000 + i * 311:D7}",
                    ["Passport Expiry"] = today.AddDays(900 + i * 30),
                    ["Visa / Residence No"] = $"201/{2024}/{500000 + i:D6}",
                    ["Visa Type"] = "Employment",
                    ["Visa Expiry"] = today.AddDays(p.VisaExpiresInDays),
                    ["Labour Card No"] = $"{60000000 + i * 71:D8}",
                    ["Labour Card Expiry"] = today.AddDays(p.VisaExpiresInDays + 5),
                });

            if (contractTab is not null)
            {
                var housing = Math.Round(p.Salary * 0.4m);
                var transport = 500m;
                AddRecord(contractTab, employee, new Dictionary<string, object?>
                {
                    ["MOHRE Contract No"] = $"MB{20240000 + i * 17:D8}",
                    ["Contract Type"] = "Full-time",
                    ["Contract Start"] = joinDate,
                    ["Contract End"] = joinDate.AddYears(2),
                    ["Probation End"] = joinDate.AddMonths(6),
                    ["Basic Salary"] = p.Salary,
                    ["Housing Allowance"] = housing,
                    ["Transport Allowance"] = transport,
                    ["Gross Salary"] = p.Salary + housing + transport,
                    ["Bank Name"] = "Emirates NBD",
                    ["IBAN (WPS)"] = $"AE07033{1234567890 + i:D10}",
                    ["Annual Leave (days)"] = 30,
                    ["Air Ticket"] = "Yes",
                    ["Notice Period (days)"] = 30,
                });
            }

            await _db.SaveChangesAsync(ct);
            created++;
            logins.Add(email);
        }

        var prefix = removed > 0 ? $"Cleared {removed} old employee(s). " : "";
        var msg = created > 0
            ? $"{prefix}Added {created} demo staff (password: {DemoPassword}). Sign in as any to see the employee dashboard."
            : $"{prefix}Demo staff already present.";
        return ApiResponse<SeedDemoResultDto>.Ok(new SeedDemoResultDto(created, skipped, removed, DemoPassword, logins), msg);
    }

    /// <summary>Ensure the company has at least a couple of departments + designations to place staff.</summary>
    private async Task<(List<Department> Depts, List<Designation> Desigs)> EnsureOrgAsync(Guid companyId, CancellationToken ct)
    {
        var added = false;
        var depts = await _db.Set<Department>().Where(d => d.CompanyId == companyId && d.IsActive).ToListAsync(ct);
        if (depts.Count == 0)
        {
            depts =
            [
                new Department { TenantId = _tenant.TenantId, CompanyId = companyId, Name = "Operations", Code = "OPS", Function = DepartmentFunction.Operations },
                new Department { TenantId = _tenant.TenantId, CompanyId = companyId, Name = "Administration", Code = "ADM", Function = DepartmentFunction.General },
            ];
            _db.Set<Department>().AddRange(depts);
            added = true;
        }

        var desigs = await _db.Set<Designation>().Where(d => d.CompanyId == companyId && d.IsActive).ToListAsync(ct);
        if (desigs.Count == 0)
        {
            desigs =
            [
                new Designation { TenantId = _tenant.TenantId, CompanyId = companyId, Title = "Supervisor", Category = "Management" },
                new Designation { TenantId = _tenant.TenantId, CompanyId = companyId, Title = "Officer", Category = "Support" },
                new Designation { TenantId = _tenant.TenantId, CompanyId = companyId, Title = "Technician", Category = "Technical" },
            ];
            _db.Set<Designation>().AddRange(desigs);
            added = true;
        }

        if (added) await _db.SaveChangesAsync(ct);
        return (depts, desigs);
    }

    /// <summary>Build a tab record for the employee, mapping values-by-label onto the tab's fields.</summary>
    private void AddRecord(EmployeeTab tab, Employee employee, Dictionary<string, object?> byLabel)
    {
        var clean = new Dictionary<string, object?>();
        foreach (var f in tab.Fields)
        {
            if (!byLabel.TryGetValue(f.Label, out var val) || val is null) continue;
            clean[f.Key] = f.Type switch
            {
                HrFieldType.Currency or HrFieldType.Number => Convert.ToDouble(val),
                HrFieldType.Date => val is DateOnly d ? d.ToString("yyyy-MM-dd") : val.ToString(),
                _ => val.ToString(),
            };
        }
        if (clean.Count == 0) return;

        _db.Set<EmployeeTabRecord>().Add(new EmployeeTabRecord
        {
            TenantId = employee.TenantId,
            CompanyId = employee.CompanyId,
            EmployeeTabId = tab.Id,
            EmployeeId = employee.Id,
            Data = JsonSerializer.Serialize(clean),
        });
    }
}
