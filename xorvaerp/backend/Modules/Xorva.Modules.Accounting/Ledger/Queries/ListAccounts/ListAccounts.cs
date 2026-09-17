using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Ledger.Queries.ListAccounts;

/// <summary>Returns the company's chart of accounts, ordered by code (FE groups by type).</summary>
public record ListAccountsQuery : IRequest<ApiResponse<List<AccountDto>>>
{
    public Guid? CompanyId { get; init; }
    public bool IncludeInactive { get; init; }
}

public class ListAccountsHandler : IRequestHandler<ListAccountsQuery, ApiResponse<List<AccountDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListAccountsHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<AccountDto>>> Handle(ListAccountsQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var query = _db.Set<Account>().Where(a => a.CompanyId == companyId);
        if (!request.IncludeInactive)
            query = query.Where(a => a.IsActive);

        var accounts = await query.OrderBy(a => a.Code).ToListAsync(ct);
        return ApiResponse<List<AccountDto>>.Ok(accounts.Select(a => a.ToDto()).ToList());
    }
}
