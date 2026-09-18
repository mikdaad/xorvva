using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Approvals;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.CostCentres.Entities;
using Xorva.Modules.Accounting.Currency.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Tax.Entities;
using Xorva.Modules.Accounting.Vouchers.Common;
using Xorva.Modules.Accounting.Vouchers.Entities;
using Xorva.Modules.Accounting.Vouchers.Queries.GetVoucher;

namespace Xorva.Modules.Accounting.Vouchers.Commands.SaveAndPostVoucher;

/// <summary>
/// Tally-style F4–F9 entry: save the voucher and post it to the ledger in one call
/// (port of TrueLedge <c>saveAndPostVoucher</c>). Steps, in order:
///   1. validate party/lines; load tax rates + control accounts from the DB (client rates are never trusted);
///   2. <see cref="VoucherEngine"/> computes totals, persisted lines and base-currency ledger lines,
///      rejecting unbalanced/zero entries BEFORE anything is written;
///   3. an existing <see cref="VoucherId"/> draft is updated in place (header + lines replaced);
///      otherwise <c>accounting.generate_voucher_number</c> issues the next PREFIX-YEAR-NNNNN and a Draft row is inserted;
///   4. <c>accounting.post_voucher_atomic</c> writes JournalEntries/JournalLines, checks the period, flips the voucher to Posted.
/// The RPC runs on the DbContext's connection right after SaveChanges. If posting is rejected
/// (closed period, DB-side balance check…) a voucher that was created by this call is deleted again
/// so no orphan draft consumes a number silently; an existing draft is left as it was — exactly
/// TrueLedge's compensation logic.
/// Approval rules may intercept it (amount = grand total in base currency).
/// </summary>
public record SaveAndPostVoucherCommand : IRequest<ApiResponse<VoucherDto>>, IAmountApprovableAction
{
    public Guid? CompanyId { get; init; }
    /// <summary>Existing Draft to update-and-post; null to create.</summary>
    public Guid? VoucherId { get; init; }
    public VoucherType VoucherType { get; init; }
    public DateOnly VoucherDate { get; init; }
    public DateOnly? DueDate { get; init; }
    public DateOnly? SupplyDate { get; init; }
    public Guid? ContactId { get; init; }
    /// <summary>ISO 4217; defaults to the company base currency.</summary>
    public string? Currency { get; init; }
    /// <summary>Optional explicit base-per-unit rate for foreign-currency vouchers; otherwise the latest stored rate.</summary>
    public decimal? ExchangeRate { get; init; }
    public string? Reference { get; init; }
    public string? Narration { get; init; }
    public string? PlaceOfSupply { get; init; }
    public List<VoucherEntryLine> Lines { get; init; } = [];
    /// <summary>Save as Draft only (no ledger posting) — the entry screen's Ctrl+S.</summary>
    public bool SaveAsDraft { get; init; }

    // ─── IApprovableAction ───
    public const string ActionKey = "Accounting.PostVoucher";
    public string ApprovalActionKey => ActionKey;
    public string ApprovalSummary => $"{VoucherTypes.For(VoucherType).Label} voucher dated {VoucherDate:yyyy-MM-dd}" + (string.IsNullOrWhiteSpace(Narration) ? "" : $" — {Narration}");
    public Guid? ApprovalCompanyId => CompanyId;

    public Task<decimal> ResolveApprovalAmountAsync(IXorvaDbContext db, CancellationToken ct)
    {
        var mode = VoucherTypes.For(VoucherType).Mode;
        var rate = ExchangeRate is > 0m ? ExchangeRate.Value : 1m;
        decimal total = mode == VoucherMode.Invoice
            ? Lines.Sum(l => l.Quantity * l.UnitPrice * (1 - l.DiscountPct / 100m))
            : Lines.Where(l => VoucherEngine.IsDebit(l.DrCr)).Sum(l => Math.Abs(l.Amount));
        return Task.FromResult(VoucherEngine.Money(total * rate));
    }
}

public class SaveAndPostVoucherValidator : AbstractValidator<SaveAndPostVoucherCommand>
{
    public SaveAndPostVoucherValidator()
    {
        RuleFor(x => x.VoucherType).IsInEnum();
        RuleFor(x => x.VoucherDate).NotEmpty();
        RuleFor(x => x.Lines).NotEmpty().WithMessage("Add at least one ledger line.");
        RuleFor(x => x.Reference).MaximumLength(100);
        RuleFor(x => x.Narration).MaximumLength(500);
        RuleFor(x => x.PlaceOfSupply).MaximumLength(50);
        RuleFor(x => x.Currency).Length(3).When(x => !string.IsNullOrWhiteSpace(x.Currency));
        RuleFor(x => x.ExchangeRate).GreaterThan(0m).When(x => x.ExchangeRate.HasValue);
        RuleForEach(x => x.Lines).ChildRules(l =>
        {
            l.RuleFor(x => x.Description).MaximumLength(500);
            l.RuleFor(x => x.DrCr).Must(v => v is null || v.Trim().ToUpperInvariant() is "DR" or "CR").WithMessage("DrCr must be DR or CR.");
        });
    }
}

public class SaveAndPostVoucherHandler : IRequestHandler<SaveAndPostVoucherCommand, ApiResponse<VoucherDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IAccountingRpc _rpc;
    private readonly IPartyDirectory _parties;

    public SaveAndPostVoucherHandler(IXorvaDbContext db, ICurrentTenantService tenant, IAccountingRpc rpc, IPartyDirectory parties)
    {
        _db = db;
        _tenant = tenant;
        _rpc = rpc;
        _parties = parties;
    }

    public async Task<ApiResponse<VoucherDto>> Handle(SaveAndPostVoucherCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureAccountingActiveAsync(_db, companyId, ct);
        var config = VoucherTypes.For(request.VoucherType);

        var settings = await _db.Set<AccountingSettings>().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct)
            ?? throw new BadRequestException("Accounting is not set up for this company — create the chart of accounts first.");

        // ── party ────────────────────────────────────────────────────────────
        PartyInfo? contact = null;
        if (request.ContactId is { } contactId)
        {
            contact = await _parties.FindPartyAsync(companyId, contactId, ct)
                ?? throw new NotFoundException("Contact", contactId);
            if (!contact.IsActive) throw new BadRequestException($"Contact '{contact.Name}' is inactive.");
            if (config.Direction == TradeDirection.Outward && config.RequiresParty && contact.ContactType == ContactType.Supplier)
                throw new BadRequestException($"'{contact.Name}' is a supplier — a sales invoice needs a customer.");
            if (config.Direction == TradeDirection.Inward && config.RequiresParty && contact.ContactType == ContactType.Customer)
                throw new BadRequestException($"'{contact.Name}' is a customer — a purchase bill needs a supplier.");
        }
        else if (config.RequiresParty)
        {
            throw new BadRequestException(config.Direction == TradeDirection.Outward ? "Select a customer." : "Select a supplier.");
        }

        // ── masters from the DB (never trust client-side rates/accounts) ─────
        var accountIds = request.Lines.Where(l => l.AccountId != Guid.Empty).Select(l => l.AccountId).Distinct().ToList();
        var accounts = await _db.Set<Account>()
            .Where(a => a.CompanyId == companyId && accountIds.Contains(a.Id))
            .Select(a => new { a.Id, a.Name, a.IsActive, a.IsGroup, a.IsControl })
            .ToListAsync(ct);
        foreach (var id in accountIds)
        {
            var a = accounts.FirstOrDefault(x => x.Id == id) ?? throw new BadRequestException("One or more ledgers do not exist in this company's chart of accounts.");
            if (!a.IsActive) throw new BadRequestException($"Ledger '{a.Name}' is inactive.");
            if (a.IsGroup) throw new BadRequestException($"Ledger '{a.Name}' is a group and cannot be posted to. Select a ledger under it.");
        }

        var taxRateIds = request.Lines.Where(l => l.TaxRateId.HasValue).Select(l => l.TaxRateId!.Value).Distinct().ToList();
        var taxRates = taxRateIds.Count == 0
            ? new Dictionary<Guid, TaxRateInfo>()
            : await _db.Set<TaxRate>()
                .Where(t => t.CompanyId == companyId && t.IsActive && taxRateIds.Contains(t.Id))
                .ToDictionaryAsync(t => t.Id, t => new TaxRateInfo(t.Id, t.Rate,
                    t.OutputAccountId ?? settings.VatOutputAccountId,
                    t.InputAccountId ?? settings.VatInputAccountId), ct);

        var productIds = request.Lines.Where(l => l.ProductId.HasValue).Select(l => l.ProductId!.Value).Distinct().ToList();
        if (productIds.Count > 0)
        {
            var known = await _parties.FindItemsAsync(companyId, productIds, ct);
            if (known.Count != productIds.Count) throw new BadRequestException("One or more items do not exist in this company.");
        }

        var costCentreIds = request.Lines.Where(l => l.CostCentreId.HasValue).Select(l => l.CostCentreId!.Value).Distinct().ToList();
        if (costCentreIds.Count > 0)
        {
            var ccs = await _db.Set<CostCentre>()
                .Where(c => c.CompanyId == companyId && costCentreIds.Contains(c.Id))
                .Select(c => new { c.Id, c.Name, c.IsGroup, c.IsActive }).ToListAsync(ct);
            foreach (var id in costCentreIds)
            {
                var c = ccs.FirstOrDefault(x => x.Id == id) ?? throw new BadRequestException("One or more cost centres do not exist in this company.");
                if (c.IsGroup) throw new BadRequestException($"Cost centre '{c.Name}' is a group — allocate to a leaf cost centre.");
                if (!c.IsActive) throw new BadRequestException($"Cost centre '{c.Name}' is inactive.");
            }
        }

        // ── currency ─────────────────────────────────────────────────────────
        var currency = ExchangeRateResolver.Normalize(request.Currency, settings.BaseCurrency);
        var voucherDateTime = request.VoucherDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var rate = await ExchangeRateResolver.ResolveAsync(_db, companyId, currency, settings.BaseCurrency, voucherDateTime, request.ExchangeRate, ct);

        // ── control account for the balancing party line ─────────────────────
        Guid? partyControl = null;
        if (config.Mode == VoucherMode.Invoice)
        {
            partyControl = contact?.ControlAccountId
                ?? (config.Type is VoucherType.SalesInvoice or VoucherType.CreditNote ? settings.ReceivableAccountId : settings.PayableAccountId);
            if (partyControl == Guid.Empty) partyControl = null;
        }
        var controlAccounts = new HashSet<Guid>(accounts.Where(a => a.IsControl).Select(a => a.Id))
        {
            settings.ReceivableAccountId, settings.PayableAccountId,
        };
        if (contact?.ControlAccountId is { } cca) controlAccounts.Add(cca);

        var computed = VoucherEngine.Compute(request.VoucherType, request.Lines, new VoucherContext
        {
            BaseCurrency = settings.BaseCurrency,
            ExchangeRate = rate,
            TaxRates = taxRates,
            PartyControlAccountId = partyControl,
            ContactId = contact?.Id,
            ControlAccountIds = controlAccounts,
        });

        // Fail fast on a closed period (the post_voucher_atomic trigger checks again inside the DB).
        if (!request.SaveAsDraft)
            await PeriodGuard.EnsureOpenAsync(_db, companyId, voucherDateTime, ct, _tenant.Role);

        // ── persist draft (update in place or create) ────────────────────────
        Voucher voucher;
        if (request.VoucherId is { } existingId)
        {
            voucher = await _db.Set<Voucher>().Include(v => v.Lines)
                .FirstOrDefaultAsync(v => v.Id == existingId && v.CompanyId == companyId, ct)
                ?? throw new NotFoundException("Voucher", existingId);
            if (voucher.Status is not (VoucherStatus.Draft or VoucherStatus.Submitted))
                throw new ConflictException($"Voucher {voucher.VoucherNumber} is {voucher.Status} and cannot be edited. Use reversal to correct.");
            if (voucher.VoucherType != request.VoucherType)
                throw new BadRequestException("A voucher's type cannot be changed — cancel it and enter a new one.");
            _db.Set<VoucherLine>().RemoveRange(voucher.Lines);
            voucher.Lines.Clear();
        }
        else
        {
            var number = await _rpc.GenerateVoucherNumberAsync(companyId, request.VoucherType, request.VoucherDate.Year, ct);
            voucher = new Voucher
            {
                TenantId = _tenant.TenantId,
                CompanyId = companyId,
                VoucherType = request.VoucherType,
                VoucherNumber = number,
                Status = VoucherStatus.Draft,
            };
            _db.Set<Voucher>().Add(voucher);
        }

        voucher.ContactId = contact?.Id;
        voucher.VoucherDate = request.VoucherDate;
        voucher.DueDate = request.DueDate ?? (config.Mode == VoucherMode.Invoice && contact is not null
            ? request.VoucherDate.AddDays(contact.PaymentTermDays) : null);
        voucher.SupplyDate = request.SupplyDate ?? (config.Mode == VoucherMode.Invoice ? request.VoucherDate : null);
        voucher.Currency = currency;
        voucher.ExchangeRate = rate;
        voucher.SubTotal = computed.SubTotal;
        voucher.DiscountTotal = computed.DiscountTotal;
        voucher.TaxTotal = computed.TaxTotal;
        voucher.TotalAmount = computed.TotalAmount;
        voucher.BaseSubTotal = computed.BaseSubTotal;
        voucher.BaseDiscount = computed.BaseDiscount;
        voucher.BaseTaxTotal = computed.BaseTaxTotal;
        voucher.BaseTotalAmount = computed.BaseTotalAmount;
        voucher.Reference = Clean(request.Reference);
        voucher.Narration = Clean(request.Narration);
        voucher.PlaceOfSupply = Clean(request.PlaceOfSupply) ?? (config.Mode == VoucherMode.Invoice ? "AE" : null);
        if (config.Mode == VoucherMode.Invoice)
        {
            var outward = config.Direction == TradeDirection.Outward;
            voucher.SellerTrn = outward ? settings.TaxRegistrationNumber : contact?.TaxNumber;
            voucher.BuyerTrn = outward ? contact?.TaxNumber : settings.TaxRegistrationNumber;
        }

        foreach (var line in computed.Lines)
        {
            line.TenantId = _tenant.TenantId;
            line.CompanyId = companyId;
            line.VoucherId = voucher.Id;
            voucher.Lines.Add(line);
        }

        await _db.SaveChangesAsync(ct);

        if (request.SaveAsDraft)
        {
            return ApiResponse<VoucherDto>.Ok(await VoucherReader.LoadAsync(_db, _parties, voucher.Id, companyId, ct), $"Draft {voucher.VoucherNumber} saved.");
        }

        // ── post atomically (same connection as the EF writes above) ─────────
        var isNew = request.VoucherId is null;
        try
        {
            await _rpc.PostVoucherAsync(voucher.Id, computed.LedgerLines, ct);
        }
        catch when (isNew)
        {
            // Compensate: remove the draft this call created (trigger permits deleting Draft rows), then surface the real error.
            _db.Set<Voucher>().Remove(voucher);
            await _db.SaveChangesAsync(CancellationToken.None);
            throw;
        }

        return ApiResponse<VoucherDto>.Ok(await VoucherReader.LoadAsync(_db, _parties, voucher.Id, companyId, ct), $"{config.Label} {voucher.VoucherNumber} posted.");
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}
