using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Modules.Accounting.Sales.Commands.VoidInvoice;

/// <summary>Voids a posted invoice: reverses its journal, marks it Voided, backs out the balance.</summary>
public record VoidInvoiceCommand : IRequest<ApiResponse<InvoiceDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
    public string? Reason { get; init; }
}

public class VoidInvoiceHandler : IRequestHandler<VoidInvoiceCommand, ApiResponse<InvoiceDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IJournalPoster _poster;

    public VoidInvoiceHandler(IXorvaDbContext db, ICurrentTenantService tenant, IJournalPoster poster)
    {
        _db = db;
        _tenant = tenant;
        _poster = poster;
    }

    public async Task<ApiResponse<InvoiceDto>> Handle(VoidInvoiceCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var invoice = await _db.Set<Invoice>().Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == request.Id && i.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Invoice", request.Id);

        if (invoice.Status == DocumentStatus.Voided)
            throw new BadRequestException("This invoice is already voided.");
        if (invoice.Status != DocumentStatus.Posted)
            throw new BadRequestException("Only a posted invoice can be voided.");
        if (invoice.AmountPaid > 0m)
            throw new BadRequestException("This invoice has payments — issue a credit note instead of voiding.");

        // Reverse the original journal.
        if (invoice.JournalEntryId is { } jid)
        {
            var original = await _db.Set<JournalEntry>().Include(e => e.Lines)
                .FirstOrDefaultAsync(e => e.Id == jid && e.CompanyId == companyId, ct);
            if (original is { Status: JournalStatus.Posted })
            {
                var reason = string.IsNullOrWhiteSpace(request.Reason) ? "" : $" — {request.Reason.Trim()}";
                await _poster.PostAsync(new JournalDraft
                {
                    CompanyId = companyId,
                    Date = original.Date,
                    Description = $"Reversal of {original.EntryNumber} (void invoice {invoice.Number}){reason}",
                    SourceType = JournalSourceType.Reversal,
                    SourceId = original.Id,
                    Lines = [.. original.Lines.Select(l => new JournalLineDraft
                    {
                        AccountId = l.AccountId, Debit = l.Credit, Credit = l.Debit,
                        ContactId = l.ContactId, TaxRateId = l.TaxRateId, Description = l.Description,
                    })],
                }, ct);
                original.Status = JournalStatus.Voided;
            }
        }

        invoice.Status = DocumentStatus.Voided;
        var contact = await _db.Set<Contact>().FirstAsync(c => c.Id == invoice.ContactId, ct);
        // Outstanding is tracked in base currency; void is only allowed with no payments,
        // so the whole base value is still outstanding (BaseTotal == BalanceDue×rate).
        contact.OutstandingBalance -= invoice.BaseTotal;
        invoice.BalanceDue = 0m;

        await _db.SaveChangesAsync(ct);
        return ApiResponse<InvoiceDto>.Ok(invoice.ToDto(contact.Name), "Invoice voided (journal reversed).");
    }
}
