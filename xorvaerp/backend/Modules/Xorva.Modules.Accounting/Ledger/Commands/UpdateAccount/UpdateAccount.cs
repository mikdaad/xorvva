using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Ledger.Commands.UpdateAccount;

/// <summary>
/// Edits an account's name/description/parent and active flag. Codes and types are
/// immutable once created (keeps the ledger stable). A system account may be renamed
/// but never deactivated — the auto-journal engine posts to it.
/// </summary>
public record UpdateAccountCommand : IRequest<ApiResponse<AccountDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public Guid? ParentAccountId { get; init; }
    public bool IsActive { get; init; } = true;
}

public class UpdateAccountValidator : AbstractValidator<UpdateAccountCommand>
{
    public UpdateAccountValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Account name is required.").MaximumLength(150);
        RuleFor(x => x.Description).MaximumLength(500);
    }
}

public class UpdateAccountHandler : IRequestHandler<UpdateAccountCommand, ApiResponse<AccountDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public UpdateAccountHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<AccountDto>> Handle(UpdateAccountCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var account = await _db.Set<Account>()
            .FirstOrDefaultAsync(a => a.Id == request.Id && a.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Account", request.Id);

        if (account.IsSystemAccount && !request.IsActive)
            throw new BadRequestException("A system account cannot be deactivated — it is a posting target for auto-journals.");

        if (request.ParentAccountId is Guid parentId && parentId != account.ParentAccountId)
        {
            if (parentId == account.Id)
                throw new BadRequestException("An account cannot be its own parent.");
            var parentExists = await _db.Set<Account>().AnyAsync(a => a.CompanyId == companyId && a.Id == parentId, ct);
            if (!parentExists)
                throw new NotFoundException("Parent account", parentId);
        }

        account.Name = request.Name.Trim();
        account.Description = request.Description?.Trim();
        account.ParentAccountId = request.ParentAccountId;
        account.IsActive = request.IsActive;

        await _db.SaveChangesAsync(ct);
        return ApiResponse<AccountDto>.Ok(account.ToDto(), "Account updated.");
    }
}
