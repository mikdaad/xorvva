using FluentValidation;
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
using Xorva.Modules.Accounting.Tax.Entities;

namespace Xorva.Modules.Accounting.Purchases.Commands.CreateDebitNote;

public record DebitNoteLineInput
{
    public string Description { get; init; } = string.Empty;
    public decimal Quantity { get; init; } = 1;
    public decimal UnitPrice { get; init; }
    public Guid? AccountId { get; init; }
    public Guid? TaxRateId { get; init; }
}

/// <summary>Creates and posts a purchase debit note (reverse-of-purchase journal), reducing the supplier balance.</summary>
public record CreateDebitNoteCommand : IRequest<ApiResponse<DebitNoteDto>>
{
    public Guid? CompanyId { get; init; }
    public Guid ContactId { get; init; }
    public Guid? BillId { get; init; }
    public DateTime Date { get; init; }
    public string? Reason { get; init; }
    public List<DebitNoteLineInput> Lines { get; init; } = [];
}

public class CreateDebitNoteValidator : AbstractValidator<CreateDebitNoteCommand>
{
    public CreateDebitNoteValidator()
    {
        RuleFor(x => x.ContactId).NotEmpty().WithMessage("Choose a supplier.");
        RuleFor(x => x.Date).NotEmpty();
        RuleFor(x => x.Lines).NotEmpty().WithMessage("Add at least one line.");
        RuleForEach(x => x.Lines).ChildRules(l =>
        {
            l.RuleFor(x => x.Description).NotEmpty().MaximumLength(300);
            l.RuleFor(x => x.Quantity).GreaterThan(0);
            l.RuleFor(x => x.UnitPrice).GreaterThanOrEqualTo(0);
        });
    }
}

public class CreateDebitNoteHandler : IRequestHandler<CreateDebitNoteCommand, ApiResponse<DebitNoteDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IJournalPoster _poster;

    public CreateDebitNoteHandler(IXorvaDbContext db, ICurrentTenantService tenant, IJournalPoster poster)
    {
        _db = db;
        _tenant = tenant;
        _poster = poster;
    }

    public async Task<ApiResponse<DebitNoteDto>> Handle(CreateDebitNoteCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureSalesActiveAsync(_db, companyId, ct);

        var contact = await _db.Set<Contact>().FirstOrDefaultAsync(c => c.Id == request.ContactId && c.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Contact", request.ContactId);
        var settings = await _db.Set<AccountingSettings>().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct)
            ?? throw new BadRequestException("Accounting is not set up for this company.");
        var taxRates = await _db.Set<TaxRate>().Where(t => t.CompanyId == companyId).ToDictionaryAsync(t => t.Id, ct);

        var date = DateTime.SpecifyKind(request.Date.Date, DateTimeKind.Utc);
        var count = await _db.Set<DebitNote>().CountAsync(d => d.CompanyId == companyId, ct);

        var note = new DebitNote
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Number = $"DN-{date.Year}-{count + 1:D4}",
            ContactId = contact.Id,
            BillId = request.BillId,
            Date = date,
            Status = DocumentStatus.Posted,
            Currency = settings.BaseCurrency,
            Reason = request.Reason?.Trim(),
        };

        foreach (var input in request.Lines)
        {
            var taxPercent = input.TaxRateId is { } trid && taxRates.TryGetValue(trid, out var tr) ? tr.Rate : 0m;
            var lineAmount = Math.Round(input.Quantity * input.UnitPrice, 2);
            note.Lines.Add(new DebitNoteLine
            {
                TenantId = _tenant.TenantId,
                CompanyId = companyId,
                DebitNoteId = note.Id,
                Description = input.Description.Trim(),
                Quantity = input.Quantity,
                UnitPrice = Math.Round(input.UnitPrice, 2),
                AccountId = input.AccountId ?? settings.PurchaseAccountId,
                TaxRateId = input.TaxRateId,
                TaxRatePercent = taxPercent,
                LineAmount = lineAmount,
                LineTax = Math.Round(lineAmount * taxPercent / 100m, 2),
            });
        }

        note.SubTotal = Math.Round(note.Lines.Sum(l => l.LineAmount), 2);
        note.TaxTotal = Math.Round(note.Lines.Sum(l => l.LineTax), 2);
        note.Total = note.SubTotal + note.TaxTotal;

        // Reverse of a purchase: DR Payable · CR Expense per line · CR VAT-Input.
        var lines = new List<JournalLineDraft>
        {
            new() { AccountId = settings.PayableAccountId, Debit = note.Total, ContactId = contact.Id },
        };
        foreach (var l in note.Lines)
            lines.Add(new JournalLineDraft { AccountId = l.AccountId, Credit = l.LineAmount, Description = l.Description });
        if (note.TaxTotal > 0m)
            lines.Add(new JournalLineDraft { AccountId = settings.VatInputAccountId, Credit = note.TaxTotal });

        var journalId = await _poster.PostAsync(new JournalDraft
        {
            CompanyId = companyId,
            Date = date,
            Description = $"Debit note {note.Number}",
            SourceType = JournalSourceType.DebitNote,
            SourceId = note.Id,
            Lines = lines,
        }, ct);

        note.JournalEntryId = journalId;
        contact.OutstandingBalance = Math.Round(contact.OutstandingBalance - note.Total, 2);

        _db.Set<DebitNote>().Add(note);
        await _db.SaveChangesAsync(ct);

        return ApiResponse<DebitNoteDto>.Ok(note.ToDto(contact.Name), "Debit note posted.");
    }
}
