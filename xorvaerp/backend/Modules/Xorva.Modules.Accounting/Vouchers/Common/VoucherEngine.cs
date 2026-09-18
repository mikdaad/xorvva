using Xorva.Core.Exceptions;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Vouchers.Entities;

namespace Xorva.Modules.Accounting.Vouchers.Common;

/// <summary>
/// One input row from the F4–F9 entry grid (ported from TrueLedge <c>EntryLine</c>).
/// Settlement/journal rows use <see cref="DrCr"/> + <see cref="Amount"/>; invoice rows use
/// quantity × price − discount and a tax rate.
/// </summary>
public sealed record VoucherEntryLine
{
    public Guid AccountId { get; init; }
    public Guid? ProductId { get; init; }
    public string? Description { get; init; }
    /// <summary>"DR" or "CR" (case-insensitive). Ignored in invoice mode.</summary>
    public string DrCr { get; init; } = "DR";
    /// <summary>Settlement/journal amount (transaction currency).</summary>
    public decimal Amount { get; init; }
    public decimal Quantity { get; init; } = 1m;
    public decimal UnitPrice { get; init; }
    public decimal DiscountPct { get; init; }
    public Guid? TaxRateId { get; init; }
    public Guid? CostCentreId { get; init; }
}

/// <summary>Everything the engine needs to know about the company that is NOT on the request.</summary>
public sealed record VoucherContext
{
    public required string BaseCurrency { get; init; }
    /// <summary>Base-per-transaction-currency rate (1 for base-currency vouchers).</summary>
    public decimal ExchangeRate { get; init; } = 1m;
    /// <summary>Tax rates loaded from the database — never trusted from the client (TrueLedge rule).</summary>
    public required IReadOnlyDictionary<Guid, TaxRateInfo> TaxRates { get; init; }
    /// <summary>The AR (sales) or AP (purchase) control account for the party, already resolved.</summary>
    public Guid? PartyControlAccountId { get; init; }
    public Guid? ContactId { get; init; }
    /// <summary>
    /// Accounts that carry a party sub-ledger (AR/AP + any <c>IsControl</c> ledgers). In settlement/journal
    /// mode the chosen contact is stamped only on lines hitting these accounts, so the customer/supplier
    /// statement shows the receipt/payment without polluting bank or expense lines. Null → stamp every line.
    /// </summary>
    public IReadOnlySet<Guid>? ControlAccountIds { get; init; }
}

public sealed record TaxRateInfo(Guid Id, decimal RatePercent, Guid? OutputAccountId, Guid? InputAccountId);

/// <summary>Computed voucher: header totals, persisted lines, and the ledger lines for post_voucher_atomic.</summary>
public sealed record VoucherComputation(
    decimal SubTotal, decimal DiscountTotal, decimal TaxTotal, decimal TotalAmount,
    decimal BaseSubTotal, decimal BaseDiscount, decimal BaseTaxTotal, decimal BaseTotalAmount,
    IReadOnlyList<VoucherLine> Lines,
    IReadOnlyList<RpcLedgerLine> LedgerLines);

/// <summary>
/// Pure, provider-independent port of TrueLedge's voucher maths
/// (voucher-entry.ts computed lines + voucher.ts generateJournalLines). No I/O — the
/// handler loads masters, calls <see cref="Compute"/>, persists the draft, then hands
/// <see cref="VoucherComputation.LedgerLines"/> to <c>accounting.post_voucher_atomic</c>.
///
/// Money is rounded to 2 dp at every step (Xorva's ledger precision; TrueLedge used 4 dp).
/// Foreign-currency vouchers keep transaction amounts on the voucher and post base amounts
/// converted at <see cref="VoucherContext.ExchangeRate"/>, rounded per line, with any
/// rounding residue absorbed on the balancing line so the entry always balances in base.
/// </summary>
public static class VoucherEngine
{
    public static VoucherComputation Compute(VoucherType type, IReadOnlyList<VoucherEntryLine> input, VoucherContext ctx)
    {
        var config = VoucherTypes.For(type);
        var active = input.Where(l => l.AccountId != Guid.Empty).ToList();
        if (active.Count == 0)
            throw new BadRequestException("Add at least one ledger line.");

        if (config.RequiresParty && ctx.ContactId is null)
            throw new BadRequestException(config.Direction == TradeDirection.Outward ? "Select a customer." : "Select a supplier.");

        return config.Mode == VoucherMode.Invoice
            ? ComputeInvoice(config, active, ctx)
            : ComputeDrCr(config, active, ctx);
    }

    // ── Settlement (F4/F5/F6) and Journal (F7) ────────────────────────────────

    private static VoucherComputation ComputeDrCr(VoucherTypeConfig config, List<VoucherEntryLine> active, VoucherContext ctx)
    {
        var lines = new List<VoucherLine>();
        var ledger = new List<RpcLedgerLine>();
        decimal debit = 0, credit = 0, baseDebit = 0, baseCredit = 0;

        for (var i = 0; i < active.Count; i++)
        {
            var l = active[i];
            var isDebit = IsDebit(l.DrCr);
            var amount = Money(Math.Abs(l.Amount));
            if (amount == 0m)
                throw new BadRequestException($"Line {i + 1}: amount must be greater than zero.");

            var baseAmount = Money(amount * ctx.ExchangeRate);
            if (isDebit) { debit += amount; baseDebit += baseAmount; } else { credit += amount; baseCredit += baseAmount; }

            lines.Add(new VoucherLine
            {
                LineNumber = i + 1,
                SortOrder = i + 1,
                AccountId = l.AccountId,
                Description = Trim(l.Description),
                DrCr = isDebit ? "DR" : "CR",
                Quantity = 1m,
                UnitPrice = amount,
                DiscountPct = 0m,
                LineAmount = amount,
                TaxRatePercent = 0m,
                TaxAmount = 0m,
                LineTotal = amount,
                BaseLineAmount = baseAmount,
                BaseTaxAmount = 0m,
                BaseLineTotal = baseAmount,
                CostCentreId = l.CostCentreId,
            });
            var lineContact = ctx.ControlAccountIds is null || ctx.ControlAccountIds.Contains(l.AccountId) ? ctx.ContactId : null;
            ledger.Add(new RpcLedgerLine(l.AccountId, isDebit ? baseAmount : 0m, isDebit ? 0m : baseAmount,
                lineContact, null, l.CostCentreId, Trim(l.Description)));
        }

        // Balance check in transaction currency BEFORE anything is written (TrueLedge rule).
        if (Money(debit) != Money(credit))
            throw new BadRequestException($"Entry is not balanced — debits {debit:0.00} vs credits {credit:0.00}.");
        if (debit == 0m)
            throw new BadRequestException("Voucher total cannot be zero.");

        if (config.Mode == VoucherMode.Settlement && active.Count < 2)
            throw new BadRequestException($"A {config.Label.ToLowerInvariant()} voucher needs a paying ledger and a receiving ledger.");

        // Base-currency rounding residue → last credit line, so post_voucher_atomic never rejects.
        FixBaseResidue(ledger, baseDebit - baseCredit);

        var total = Money(debit);
        var baseTotal = Money(ledger.Sum(x => x.BaseDebit));
        return new VoucherComputation(total, 0m, 0m, total, baseTotal, 0m, 0m, baseTotal, lines, ledger);
    }

    // ── Invoice (F8 Sales / F9 Purchase, Credit/Debit notes) ─────────────────

    private static VoucherComputation ComputeInvoice(VoucherTypeConfig config, List<VoucherEntryLine> active, VoucherContext ctx)
    {
        var controlAccount = ctx.PartyControlAccountId
            ?? throw new BadRequestException(config.Direction == TradeDirection.Outward
                ? "No receivable control account is configured — set it under Accounting Settings."
                : "No payable control account is configured — set it under Accounting Settings.");

        // Sales: Cr revenue, Cr VAT output, Dr A/R.  Purchase: Dr expense, Dr VAT input, Cr A/P.
        // Credit note = sales mirrored; debit note = purchase mirrored.
        var partyIsDebit = config.Type is VoucherType.SalesInvoice or VoucherType.DebitNote;

        var lines = new List<VoucherLine>();
        var ledger = new List<RpcLedgerLine>();
        decimal subTotal = 0, discountTotal = 0, taxTotal = 0;
        var baseByTaxAccount = new Dictionary<(Guid Account, Guid TaxRateId), decimal>();
        var baseTaxLines = new List<(Guid Account, Guid TaxRateId, decimal Base)>();

        for (var i = 0; i < active.Count; i++)
        {
            var l = active[i];
            if (l.Quantity <= 0m) throw new BadRequestException($"Line {i + 1}: quantity must be greater than zero.");
            if (l.UnitPrice < 0m) throw new BadRequestException($"Line {i + 1}: unit price cannot be negative.");
            if (l.DiscountPct is < 0m or > 100m) throw new BadRequestException($"Line {i + 1}: discount must be between 0 and 100%.");

            TaxRateInfo? tax = null;
            if (l.TaxRateId is { } trId)
            {
                if (!ctx.TaxRates.TryGetValue(trId, out tax))
                    throw new BadRequestException($"Line {i + 1}: the selected tax rate does not exist in this company.");
            }

            var gross = l.Quantity * l.UnitPrice;
            var net = Money(gross * (1 - l.DiscountPct / 100m));
            var discount = Money(gross - net);
            var rate = tax?.RatePercent ?? 0m;
            var taxAmt = Money(net * rate / 100m);
            var lineTotal = Money(net + taxAmt);

            var baseNet = Money(net * ctx.ExchangeRate);
            var baseTax = Money(taxAmt * ctx.ExchangeRate);

            subTotal += net; discountTotal += discount; taxTotal += taxAmt;

            lines.Add(new VoucherLine
            {
                LineNumber = i + 1,
                SortOrder = i + 1,
                AccountId = l.AccountId,
                ProductId = l.ProductId,
                Description = Trim(l.Description),
                DrCr = partyIsDebit ? "CR" : "DR",   // the item line sits opposite the party line
                Quantity = l.Quantity,
                UnitPrice = l.UnitPrice,
                DiscountPct = l.DiscountPct,
                LineAmount = net,
                TaxRateId = tax?.Id,
                TaxRatePercent = rate,
                TaxAmount = taxAmt,
                LineTotal = lineTotal,
                BaseLineAmount = baseNet,
                BaseTaxAmount = baseTax,
                BaseLineTotal = Money(baseNet + baseTax),
                CostCentreId = l.CostCentreId,
            });

            if (baseNet != 0m)
                ledger.Add(new RpcLedgerLine(l.AccountId, partyIsDebit ? 0m : baseNet, partyIsDebit ? baseNet : 0m,
                    null, tax?.Id, l.CostCentreId, Trim(l.Description)));

            if (tax is not null && baseTax != 0m)
            {
                // VAT goes to the rate's own output/input account (TrueLedge left this as a TODO; Xorva's TaxRate carries both).
                var taxAccount = (partyIsDebit ? tax.OutputAccountId : tax.InputAccountId)
                    ?? throw new BadRequestException(partyIsDebit
                        ? $"Tax rate '{rate:0.##}%' has no output VAT account configured."
                        : $"Tax rate '{rate:0.##}%' has no input VAT account configured.");
                baseTaxLines.Add((taxAccount, tax.Id, baseTax));
            }
        }

        if (subTotal <= 0m)
            throw new BadRequestException("Voucher total must be greater than zero.");

        // One VAT ledger line per (account, rate) — same as TrueLedge's grouped tax lines.
        foreach (var g in baseTaxLines.GroupBy(t => (t.Account, t.TaxRateId)))
        {
            var amt = Money(g.Sum(t => t.Base));
            ledger.Add(new RpcLedgerLine(g.Key.Account, partyIsDebit ? 0m : amt, partyIsDebit ? amt : 0m,
                null, g.Key.TaxRateId, null, partyIsDebit ? "Output VAT" : "Input VAT"));
        }

        var total = Money(subTotal + taxTotal);
        var baseTotal = Money(ledger.Sum(x => partyIsDebit ? x.BaseCredit : x.BaseDebit));

        // Balancing A/R or A/P line, tagged with the party so the sub-ledger and ageing work.
        ledger.Add(new RpcLedgerLine(controlAccount, partyIsDebit ? baseTotal : 0m, partyIsDebit ? 0m : baseTotal,
            ctx.ContactId, null, null, config.Label));

        return new VoucherComputation(
            Money(subTotal), Money(discountTotal), Money(taxTotal), total,
            Money(subTotal * ctx.ExchangeRate), Money(discountTotal * ctx.ExchangeRate), Money(taxTotal * ctx.ExchangeRate), baseTotal,
            lines, ledger);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    public static decimal Money(decimal v) => Math.Round(v, 2, MidpointRounding.AwayFromZero);

    public static bool IsDebit(string? drCr) => drCr is null || !drCr.Trim().Equals("CR", StringComparison.OrdinalIgnoreCase);

    private static string? Trim(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    /// <summary>Puts a ±0.01-per-line FX rounding residue on the last credit (or debit) line.</summary>
    private static void FixBaseResidue(List<RpcLedgerLine> ledger, decimal residue)
    {
        residue = Money(residue);
        if (residue == 0m) return;
        // residue > 0 → debits exceed credits → add to a credit line; else add to a debit line.
        var idx = residue > 0 ? ledger.FindLastIndex(x => x.BaseCredit > 0) : ledger.FindLastIndex(x => x.BaseDebit > 0);
        if (idx < 0) return;
        var l = ledger[idx];
        ledger[idx] = residue > 0
            ? l with { BaseCredit = Money(l.BaseCredit + residue) }
            : l with { BaseDebit = Money(l.BaseDebit - residue) };
    }
}
