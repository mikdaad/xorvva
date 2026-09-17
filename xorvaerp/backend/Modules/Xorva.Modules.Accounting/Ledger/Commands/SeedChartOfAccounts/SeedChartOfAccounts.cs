using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;

/// <summary>Seeds a company's Chart of Accounts from an industry template (one-time).</summary>
public record SeedChartOfAccountsCommand : IRequest<ApiResponse<int>>
{
    public Guid? CompanyId { get; init; }
    public string Industry { get; init; } = "General";
}

public class SeedChartOfAccountsValidator : AbstractValidator<SeedChartOfAccountsCommand>
{
    public SeedChartOfAccountsValidator()
    {
        RuleFor(x => x.Industry).NotEmpty().WithMessage("Choose an industry template.");
    }
}

public class SeedChartOfAccountsHandler : IRequestHandler<SeedChartOfAccountsCommand, ApiResponse<int>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public SeedChartOfAccountsHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<int>> Handle(SeedChartOfAccountsCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureAccountingActiveAsync(_db, companyId, ct);

        var industry = request.Industry.Trim();
        if (!ChartTemplates.Industries.Contains(industry))
            throw new BadRequestException(
                $"Unknown industry template '{industry}'. Choose one of: {string.Join(", ", ChartTemplates.Industries)}.");

        var alreadySeeded = await _db.Set<Account>().AnyAsync(a => a.CompanyId == companyId, ct);
        if (alreadySeeded)
            throw new ConflictException("A chart of accounts already exists for this company.");

        var seeds = ChartTemplates.For(industry);
        var created = new List<Account>(seeds.Count);
        var order = 0;
        foreach (var s in seeds)
        {
            var account = new Account
            {
                TenantId = _tenant.TenantId,
                CompanyId = companyId,
                Code = s.Code,
                Name = s.Name,
                AccountType = s.Type,
                AccountSubType = s.SubType,
                NormalBalance = AccountingRules.NormalBalanceFor(s.Type),
                IsSystemAccount = s.IsSystem,
                IsActive = true,
                SortOrder = order++
            };
            created.Add(account);
            _db.Set<Account>().Add(account);
        }

        // Build the posting map from the freshly-seeded accounts (Ids are assigned on
        // construction, so we can reference them before SaveChanges — one atomic write).
        var settingsExist = await _db.Set<AccountingSettings>().AnyAsync(x => x.CompanyId == companyId, ct);
        if (!settingsExist)
            _db.Set<AccountingSettings>().Add(AccountResolver.BuildSettings(_tenant.TenantId, companyId, created));

        await _db.SaveChangesAsync(ct);
        return ApiResponse<int>.Ok(seeds.Count, $"Seeded {seeds.Count} accounts from the {industry} template.");
    }
}
