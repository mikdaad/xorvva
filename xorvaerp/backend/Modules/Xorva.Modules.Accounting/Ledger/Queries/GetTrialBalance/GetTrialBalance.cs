using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Ledger.Queries.GetTrialBalance;

public record TrialBalanceRowDto
{
    public Guid AccountId { get; init; }
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string AccountType { get; init; } = string.Empty;
    public decimal Debit { get; init; }
    public decimal Credit { get; init; }
}

public record TrialBalanceDto
{
    public DateTime AsOf { get; init; }
    public List<TrialBalanceRowDto> Rows { get; init; } = [];
    public decimal TotalDebit { get; init; }
    public decimal TotalCredit { get; init; }
    public bool IsBalanced { get; init; }
}

/// <summary>
/// Trial Balance — every account's net movement placed in the debit or credit column,
/// computed straight from posted <see cref="JournalLine"/> rows (the source of truth).
/// Total debits must equal total credits.
/// </summary>
public record GetTrialBalanceQuery : IRequest<ApiResponse<TrialBalanceDto>>
{
    public Guid? CompanyId { get; init; }
}

public class GetTrialBalanceHandler : IRequestHandler<GetTrialBalanceQuery, ApiResponse<TrialBalanceDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetTrialBalanceHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<TrialBalanceDto>> Handle(GetTrialBalanceQuery request, CancellationToken ct)
    {
        // Null scope = CEO consolidated (all companies in the tenant); else a single company.
        var scope = AccountingGuard.ResolveReportScope(_tenant, request.CompanyId);

        var accounts = await _db.Set<Account>()
            .Where(a => scope == null || a.CompanyId == scope)
            .ToListAsync(ct);

        var totals = await _db.Set<JournalLine>()
            .Where(l => scope == null || l.CompanyId == scope)
            .GroupBy(l => l.AccountId)
            .Select(g => new { AccountId = g.Key, Debit = g.Sum(x => x.Debit), Credit = g.Sum(x => x.Credit) })
            .ToListAsync(ct);

        var byAccount = totals.ToDictionary(t => t.AccountId);

        // Net per account, then merge by code so a consolidated run collapses each account across
        // companies (a no-op for a single company, where codes are already unique).
        var perAccount = accounts
            .Where(a => byAccount.ContainsKey(a.Id))
            .Select(a => new { a.Code, a.Name, Type = a.AccountType.ToString(), a.Id, Net = Math.Round(byAccount[a.Id].Debit - byAccount[a.Id].Credit, 2) });

        var rows = perAccount
            .GroupBy(x => x.Code)
            .Select(g =>
            {
                var net = Math.Round(g.Sum(x => x.Net), 2);
                var first = g.First();
                return new TrialBalanceRowDto
                {
                    AccountId = scope == null ? Guid.Empty : first.Id,
                    Code = g.Key,
                    Name = first.Name,
                    AccountType = first.Type,
                    Debit = net > 0 ? net : 0m,
                    Credit = net < 0 ? -net : 0m,
                };
            })
            .Where(r => r.Debit != 0m || r.Credit != 0m)
            .OrderBy(r => r.Code)
            .ToList();

        var totalDebit = rows.Sum(r => r.Debit);
        var totalCredit = rows.Sum(r => r.Credit);

        return ApiResponse<TrialBalanceDto>.Ok(new TrialBalanceDto
        {
            AsOf = DateTime.UtcNow,
            Rows = rows,
            TotalDebit = totalDebit,
            TotalCredit = totalCredit,
            IsBalanced = totalDebit == totalCredit,
        });
    }
}
