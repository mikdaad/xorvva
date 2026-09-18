using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Banking.Entities;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Banking.Queries.ListBankStatements;

public record ListBankStatementsQuery : IRequest<ApiResponse<List<BankStatementDto>>>
{
    public Guid? CompanyId { get; init; }
    public Guid? BankAccountId { get; init; }
}

public class ListBankStatementsHandler : IRequestHandler<ListBankStatementsQuery, ApiResponse<List<BankStatementDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListBankStatementsHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<BankStatementDto>>> Handle(ListBankStatementsQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var q = _db.Set<BankStatement>().AsNoTracking().Where(s => s.CompanyId == companyId);
        if (request.BankAccountId is { } b) q = q.Where(s => s.BankAccountId == b);
        var statements = await q.OrderByDescending(s => s.PeriodTo).ThenByDescending(s => s.ImportedAt).ToListAsync(ct);

        var ids = statements.Select(s => s.Id).ToList();
        var counts = await _db.Set<BankStatementLine>().AsNoTracking()
            .Where(l => ids.Contains(l.StatementId))
            .GroupBy(l => new { l.StatementId, l.MatchStatus })
            .Select(g => new { g.Key.StatementId, g.Key.MatchStatus, Count = g.Count() })
            .ToListAsync(ct);
        var banks = await _db.Set<BankAccount>().AsNoTracking().Where(b => b.CompanyId == companyId).ToDictionaryAsync(b => b.Id, b => b.Name, ct);

        int C(Guid id, BankMatchStatus s) => counts.Where(c => c.StatementId == id && c.MatchStatus == s).Sum(c => c.Count);
        return ApiResponse<List<BankStatementDto>>.Ok([.. statements.Select(s => s.ToDto(banks.GetValueOrDefault(s.BankAccountId),
            C(s.Id, BankMatchStatus.Matched), C(s.Id, BankMatchStatus.Suggested), C(s.Id, BankMatchStatus.Unmatched), C(s.Id, BankMatchStatus.Ignored)))]);
    }
}
