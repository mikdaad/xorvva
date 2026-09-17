using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Ledger.Commands.CreateAccount;

/// <summary>Adds a custom account to the chart (non-system).</summary>
public record CreateAccountCommand : IRequest<ApiResponse<AccountDto>>
{
    public Guid? CompanyId { get; init; }
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public AccountType AccountType { get; init; }
    public AccountSubType AccountSubType { get; init; }
    public Guid? ParentAccountId { get; init; }
    public string? Description { get; init; }
}

public class CreateAccountValidator : AbstractValidator<CreateAccountCommand>
{
    public CreateAccountValidator()
    {
        RuleFor(x => x.Code).NotEmpty().WithMessage("Account code is required.").MaximumLength(20);
        RuleFor(x => x.Name).NotEmpty().WithMessage("Account name is required.").MaximumLength(150);
        RuleFor(x => x.Description).MaximumLength(500);
    }
}

public class CreateAccountHandler : IRequestHandler<CreateAccountCommand, ApiResponse<AccountDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public CreateAccountHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<AccountDto>> Handle(CreateAccountCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureAccountingActiveAsync(_db, companyId, ct);

        var code = request.Code.Trim();
        var name = request.Name.Trim();

        var clash = await _db.Set<Account>().AnyAsync(a => a.CompanyId == companyId && a.Code == code, ct);
        if (clash)
            throw new ConflictException($"An account with code '{code}' already exists.");

        if (request.ParentAccountId is Guid parentId)
        {
            var parentExists = await _db.Set<Account>().AnyAsync(a => a.CompanyId == companyId && a.Id == parentId, ct);
            if (!parentExists)
                throw new NotFoundException("Parent account", parentId);
        }

        var account = new Account
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Code = code,
            Name = name,
            AccountType = request.AccountType,
            AccountSubType = request.AccountSubType,
            NormalBalance = AccountingRules.NormalBalanceFor(request.AccountType),
            ParentAccountId = request.ParentAccountId,
            Description = request.Description?.Trim(),
            IsSystemAccount = false,
            IsActive = true
        };

        _db.Set<Account>().Add(account);
        await _db.SaveChangesAsync(ct);

        return ApiResponse<AccountDto>.Ok(account.ToDto(), "Account created.");
    }
}
