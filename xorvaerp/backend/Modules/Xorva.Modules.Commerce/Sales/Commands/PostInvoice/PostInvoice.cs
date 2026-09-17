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
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Modules.Accounting.Sales.Commands.PostInvoice;

/// <summary>
/// Posts a draft invoice → the auto-journal: DR Receivable (total) · CR Revenue per line ·
/// CR VAT-Output (tax). Locks the invoice and bumps the customer's outstanding balance.
/// </summary>
public record PostInvoiceCommand : IRequest<ApiResponse<InvoiceDto>>, IAmountApprovableAction
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }

    // ─── IApprovableAction (intercepted only when a rule exists for this key) ───
    public const string ActionKey = "Accounting.PostInvoice";
    public string ApprovalActionKey => ActionKey;
    public string ApprovalSummary => "Post sales invoice";
    public Guid? ApprovalCompanyId => CompanyId;

    // The gross invoice total decides whether an amount-threshold rule applies.
    public async Task<decimal> ResolveApprovalAmountAsync(IXorvaDbContext db, CancellationToken ct) =>
        await db.Set<Invoice>().Where(i => i.Id == Id).Select(i => i.Total).FirstOrDefaultAsync(ct);
}

public class PostInvoiceHandler : IRequestHandler<PostInvoiceCommand, ApiResponse<InvoiceDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IJournalPoster _poster;

    public PostInvoiceHandler(IXorvaDbContext db, ICurrentTenantService tenant, IJournalPoster poster)
    {
        _db = db;
        _tenant = tenant;
        _poster = poster;
    }

    public async Task<ApiResponse<InvoiceDto>> Handle(PostInvoiceCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var invoice = await _db.Set<Invoice>().Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == request.Id && i.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Invoice", request.Id);

        if (invoice.Status != DocumentStatus.Draft)
            throw new BadRequestException($"Only a draft invoice can be posted (this one is {invoice.Status}).");

        var settings = await _db.Set<AccountingSettings>().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct)
            ?? throw new BadRequestException("Accounting is not set up for this company.");

        // The ledger is kept in base currency: convert each transaction-currency amount at the
        // invoice's rate. AR is derived from the converted components so debits == credits exactly
        // (for a base-currency invoice rate == 1, so this is identical to the plain case).
        var rate = invoice.ExchangeRate;
        var lines = new List<JournalLineDraft>();
        decimal baseRevenue = 0m;
        foreach (var l in invoice.Lines)
        {
            var baseLine = Math.Round(l.LineAmount * rate, 2);
            baseRevenue += baseLine;
            lines.Add(new JournalLineDraft { AccountId = l.AccountId, Credit = baseLine, Description = l.Description });
        }
        var baseTax = Math.Round(invoice.TaxTotal * rate, 2);
        var baseTotal = baseRevenue + baseTax;

        lines.Insert(0, new JournalLineDraft { AccountId = settings.ReceivableAccountId, Debit = baseTotal, ContactId = invoice.ContactId });
        if (baseTax > 0m)
            lines.Add(new JournalLineDraft { AccountId = settings.VatOutputAccountId, Credit = baseTax });

        var journalId = await _poster.PostAsync(new JournalDraft
        {
            CompanyId = companyId,
            Date = invoice.Date,
            Description = rate == 1m ? $"Invoice {invoice.Number}" : $"Invoice {invoice.Number} ({invoice.Currency} @ {rate})",
            SourceType = JournalSourceType.Invoice,
            SourceId = invoice.Id,
            Lines = lines,
        }, ct);

        invoice.Status = DocumentStatus.Posted;
        invoice.JournalEntryId = journalId;
        invoice.AmountPaid = 0m;
        invoice.BalanceDue = invoice.Total;
        invoice.BaseTotal = baseTotal;

        var contact = await _db.Set<Contact>().FirstAsync(c => c.Id == invoice.ContactId, ct);
        contact.OutstandingBalance += baseTotal;

        await _db.SaveChangesAsync(ct);
        return ApiResponse<InvoiceDto>.Ok(invoice.ToDto(contact.Name), "Invoice posted.");
    }
}
