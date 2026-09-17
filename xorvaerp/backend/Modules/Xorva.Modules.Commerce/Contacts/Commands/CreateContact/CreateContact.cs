using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Contacts.Commands.CreateContact;

public record CreateContactCommand : IRequest<ApiResponse<ContactDto>>
{
    public Guid? CompanyId { get; init; }
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public ContactType ContactType { get; init; }
    public string? TaxNumber { get; init; }
    public string? Email { get; init; }
    public string? Phone { get; init; }
    public int PaymentTermDays { get; init; } = 30;
}

public class CreateContactValidator : AbstractValidator<CreateContactCommand>
{
    public CreateContactValidator()
    {
        RuleFor(x => x.Code).NotEmpty().WithMessage("Contact code is required.").MaximumLength(20);
        RuleFor(x => x.Name).NotEmpty().WithMessage("Contact name is required.").MaximumLength(150);
        RuleFor(x => x.TaxNumber).MaximumLength(30);
        RuleFor(x => x.Email).MaximumLength(150);
        RuleFor(x => x.PaymentTermDays).InclusiveBetween(0, 365);
    }
}

public class CreateContactHandler : IRequestHandler<CreateContactCommand, ApiResponse<ContactDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public CreateContactHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<ContactDto>> Handle(CreateContactCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureSalesActiveAsync(_db, companyId, ct);

        var code = request.Code.Trim();
        var clash = await _db.Set<Contact>().AnyAsync(c => c.CompanyId == companyId && c.Code == code, ct);
        if (clash)
            throw new ConflictException($"A contact with code '{code}' already exists.");

        var contact = new Contact
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Code = code,
            Name = request.Name.Trim(),
            ContactType = request.ContactType,
            TaxNumber = request.TaxNumber?.Trim(),
            Email = request.Email?.Trim(),
            Phone = request.Phone?.Trim(),
            PaymentTermDays = request.PaymentTermDays,
            IsActive = true,
        };

        _db.Set<Contact>().Add(contact);
        await _db.SaveChangesAsync(ct);
        return ApiResponse<ContactDto>.Ok(contact.ToDto(), "Contact created.");
    }
}
