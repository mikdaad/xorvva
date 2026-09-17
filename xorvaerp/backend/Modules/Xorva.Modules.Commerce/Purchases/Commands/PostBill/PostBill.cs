using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Approvals;
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

namespace Xorva.Modules.Accounting.Purchases.Commands.PostBill;

/// <summary>Posts a draft bill → DR Expense per line / DR VAT-Input / CR Payable.</summary>
public record PostBillCommand : IRequest<ApiResponse<BillDto>>, IAmountApprovableAction
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }

    public const string ActionKey = "Accounting.PostBill";
    public string ApprovalActionKey => ActionKey;
    public string ApprovalSummary => "Post supplier bill";
    public Guid? ApprovalCompanyId => CompanyId;

    // The gross bill total decides whether an amount-threshold rule applies.
    public async Task<decimal> ResolveApprovalAmountAsync(IXorvaDbContext db, CancellationToken ct) =>
        await db.Set<Bill>().Where(b => b.Id == Id).Select(b => b.Total).FirstOrDefaultAsync(ct);
}

public class PostBillHandler : IRequestHandler<PostBillCommand, ApiResponse<BillDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IJournalPoster _poster;

    public PostBillHandler(IXorvaDbContext db, ICurrentTenantService tenant, IJournalPoster poster)
    {
        _db = db;
        _tenant = tenant;
        _poster = poster;
    }

    public async Task<ApiResponse<BillDto>> Handle(PostBillCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var bill = await _db.Set<Bill>().Include(b => b.Lines)
            .FirstOrDefaultAsync(b => b.Id == request.Id && b.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Bill", request.Id);

        if (bill.Status != DocumentStatus.Draft)
            throw new BadRequestException($"Only a draft bill can be posted (this one is {bill.Status}).");

        var settings = await _db.Set<AccountingSettings>().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct)
            ?? throw new BadRequestException("Accounting is not set up for this company.");

        // Ledger stays in base currency: convert at the bill's rate. AP is the sum of the
        // converted components so debits == credits exactly (rate == 1 → identical to plain).
        var rate = bill.ExchangeRate;
        var lines = new List<JournalLineDraft>();
        decimal baseExpense = 0m;
        foreach (var l in bill.Lines)
        {
            var baseLine = Math.Round(l.LineAmount * rate, 2);
            baseExpense += baseLine;
            lines.Add(new JournalLineDraft { AccountId = l.AccountId, Debit = baseLine, Description = l.Description });
        }
        var baseTax = Math.Round(bill.TaxTotal * rate, 2);
        if (baseTax > 0m)
            lines.Add(new JournalLineDraft { AccountId = settings.VatInputAccountId, Debit = baseTax });
        var baseTotal = baseExpense + baseTax;
        lines.Add(new JournalLineDraft { AccountId = settings.PayableAccountId, Credit = baseTotal, ContactId = bill.ContactId });

        var journalId = await _poster.PostAsync(new JournalDraft
        {
            CompanyId = companyId,
            Date = bill.Date,
            Description = rate == 1m ? $"Bill {bill.Number}" : $"Bill {bill.Number} ({bill.Currency} @ {rate})",
            SourceType = JournalSourceType.Bill,
            SourceId = bill.Id,
            Lines = lines,
        }, ct);

        bill.Status = DocumentStatus.Posted;
        bill.JournalEntryId = journalId;
        bill.AmountPaid = 0m;
        bill.BalanceDue = bill.Total;
        bill.BaseTotal = baseTotal;

        var contact = await _db.Set<Contact>().FirstAsync(c => c.Id == bill.ContactId, ct);
        contact.OutstandingBalance += baseTotal;

        await _db.SaveChangesAsync(ct);
        return ApiResponse<BillDto>.Ok(bill.ToDto(contact.Name), "Bill posted.");
    }
}
