using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Banking.Entities;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Banking.Commands.CreateBankAccount;

public record CreateBankAccountCommand : IRequest<ApiResponse<BankAccountDto>>
{
    public Guid? CompanyId { get; init; }
    public string Name { get; init; } = string.Empty;
    public Guid AccountId { get; init; }
    public string? BankName { get; init; }
    public string? AccountNumber { get; init; }
    public string? Iban { get; init; }
}

public class CreateBankAccountValidator : AbstractValidator<CreateBankAccountCommand>
{
    public CreateBankAccountValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Bank account name is required.").MaximumLength(120);
        RuleFor(x => x.AccountId).NotEmpty().WithMessage("Link a ledger account.");
        RuleFor(x => x.Iban).MaximumLength(40);
    }
}

public class CreateBankAccountHandler : IRequestHandler<CreateBankAccountCommand, ApiResponse<BankAccountDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public CreateBankAccountHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<BankAccountDto>> Handle(CreateBankAccountCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureAccountingActiveAsync(_db, companyId, ct);

        var ledger = await _db.Set<Account>()
            .FirstOrDefaultAsync(a => a.Id == request.AccountId && a.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Ledger account", request.AccountId);

        if (ledger.AccountSubType is not (AccountSubType.Bank or AccountSubType.Cash))
            throw new BadRequestException("A bank account must link to a Bank or Cash ledger account.");

        var bank = new BankAccount
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Name = request.Name.Trim(),
            AccountId = request.AccountId,
            BankName = request.BankName?.Trim(),
            AccountNumber = request.AccountNumber?.Trim(),
            Iban = request.Iban?.Trim(),
            IsActive = true,
        };

        _db.Set<BankAccount>().Add(bank);
        await _db.SaveChangesAsync(ct);
        return ApiResponse<BankAccountDto>.Ok(bank.ToDto(), "Bank account created.");
    }
}
