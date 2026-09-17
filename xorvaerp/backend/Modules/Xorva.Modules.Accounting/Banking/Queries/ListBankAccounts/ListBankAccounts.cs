using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Banking.Entities;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;

namespace Xorva.Modules.Accounting.Banking.Queries.ListBankAccounts;

public record ListBankAccountsQuery : IRequest<ApiResponse<List<BankAccountDto>>>
{
    public Guid? CompanyId { get; init; }
    public bool IncludeInactive { get; init; }
}

public class ListBankAccountsHandler : IRequestHandler<ListBankAccountsQuery, ApiResponse<List<BankAccountDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListBankAccountsHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<BankAccountDto>>> Handle(ListBankAccountsQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var query = _db.Set<BankAccount>().Where(b => b.CompanyId == companyId);
        if (!request.IncludeInactive)
            query = query.Where(b => b.IsActive);

        var banks = await query.OrderBy(b => b.Name).ToListAsync(ct);
        return ApiResponse<List<BankAccountDto>>.Ok([.. banks.Select(b => b.ToDto())]);
    }
}
