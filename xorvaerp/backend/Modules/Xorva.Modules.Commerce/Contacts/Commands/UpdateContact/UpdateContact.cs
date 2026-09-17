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

namespace Xorva.Modules.Accounting.Contacts.Commands.UpdateContact;

public record UpdateContactCommand : IRequest<ApiResponse<ContactDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
    public string Name { get; init; } = string.Empty;
    public ContactType ContactType { get; init; }
    public string? TaxNumber { get; init; }
    public string? Email { get; init; }
    public string? Phone { get; init; }
    public int PaymentTermDays { get; init; } = 30;
    public bool IsActive { get; init; } = true;
}

public class UpdateContactValidator : AbstractValidator<UpdateContactCommand>
{
    public UpdateContactValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Contact name is required.").MaximumLength(150);
        RuleFor(x => x.TaxNumber).MaximumLength(30);
        RuleFor(x => x.Email).MaximumLength(150);
        RuleFor(x => x.PaymentTermDays).InclusiveBetween(0, 365);
    }
}

public class UpdateContactHandler : IRequestHandler<UpdateContactCommand, ApiResponse<ContactDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public UpdateContactHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<ContactDto>> Handle(UpdateContactCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var contact = await _db.Set<Contact>()
            .FirstOrDefaultAsync(c => c.Id == request.Id && c.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Contact", request.Id);

        contact.Name = request.Name.Trim();
        contact.ContactType = request.ContactType;
        contact.TaxNumber = request.TaxNumber?.Trim();
        contact.Email = request.Email?.Trim();
        contact.Phone = request.Phone?.Trim();
        contact.PaymentTermDays = request.PaymentTermDays;
        contact.IsActive = request.IsActive;

        await _db.SaveChangesAsync(ct);
        return ApiResponse<ContactDto>.Ok(contact.ToDto(), "Contact updated.");
    }
}
