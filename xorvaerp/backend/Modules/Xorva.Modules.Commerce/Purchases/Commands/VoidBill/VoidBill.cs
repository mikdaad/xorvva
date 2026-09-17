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
using Xorva.Modules.Accounting.Purchases.Entities;

namespace Xorva.Modules.Accounting.Purchases.Commands.VoidBill;

/// <summary>Voids a posted bill: reverses its journal, marks it Voided, backs out the balance.</summary>
public record VoidBillCommand : IRequest<ApiResponse<BillDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
    public string? Reason { get; init; }
}

public class VoidBillHandler : IRequestHandler<VoidBillCommand, ApiResponse<BillDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IJournalPoster _poster;

    public VoidBillHandler(IXorvaDbContext db, ICurrentTenantService tenant, IJournalPoster poster)
    {
        _db = db;
        _tenant = tenant;
        _poster = poster;
    }

    public async Task<ApiResponse<BillDto>> Handle(VoidBillCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var bill = await _db.Set<Bill>().Include(b => b.Lines)
            .FirstOrDefaultAsync(b => b.Id == request.Id && b.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Bill", request.Id);

        if (bill.Status == DocumentStatus.Voided)
            throw new BadRequestException("This bill is already voided.");
        if (bill.Status != DocumentStatus.Posted)
            throw new BadRequestException("Only a posted bill can be voided.");
        if (bill.AmountPaid > 0m)
            throw new BadRequestException("This bill has payments — reverse them or use a debit note instead.");

        if (bill.JournalEntryId is { } jid)
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
                    Description = $"Reversal of {original.EntryNumber} (void bill {bill.Number}){reason}",
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

        bill.Status = DocumentStatus.Voided;
        var contact = await _db.Set<Contact>().FirstAsync(c => c.Id == bill.ContactId, ct);
        // Outstanding is in base currency; void requires no payments, so the full base value remains.
        contact.OutstandingBalance -= bill.BaseTotal;
        bill.BalanceDue = 0m;

        await _db.SaveChangesAsync(ct);
        return ApiResponse<BillDto>.Ok(bill.ToDto(contact.Name), "Bill voided (journal reversed).");
    }
}
