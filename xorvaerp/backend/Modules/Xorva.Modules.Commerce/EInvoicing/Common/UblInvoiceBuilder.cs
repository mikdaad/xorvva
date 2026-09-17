using System.Globalization;
using System.Text;
using System.Xml.Linq;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Sales.Entities;
using Xorva.Modules.Accounting.Tax.Entities;

namespace Xorva.Modules.Accounting.EInvoicing.Common;

/// <summary>
/// Generates a UBL 2.1 sales invoice aligned to the Peppol PINT AE (UAE) billing
/// specification: the parties with their TRNs, a VAT breakdown by category
/// (S standard / Z zero-rated / E exempt), the legal monetary totals, and the lines.
///
/// The output is the invoice DOCUMENT — the payload a certified Access Point would
/// transmit over the Peppol network. It deliberately does not fabricate network
/// routing identifiers; <see cref="Build"/> reports any missing compliance data as
/// non-blocking warnings instead.
/// </summary>
public static class UblInvoiceBuilder
{
    // PINT AE billing identifiers (Peppol International model, UAE-aligned).
    public const string CustomizationId = "urn:peppol:pint:billing-1@ae-1";
    public const string ProfileId = "urn:peppol:bis:billing";
    private const string VatSchemeId = "VAT";
    private const string InvoiceTypeCode = "380";     // commercial invoice
    private const string UnitCode = "C62";            // UN/ECE Rec 20: "one / piece"

    private static readonly XNamespace Inv = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
    private static readonly XNamespace Cac = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";
    private static readonly XNamespace Cbc = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";

    public static (string Xml, List<string> Warnings) Build(
        Invoice invoice,
        Contact buyer,
        AccountingSettings seller,
        string companyName,
        IReadOnlyDictionary<Guid, TaxRate> taxRates)
    {
        var currency = string.IsNullOrWhiteSpace(invoice.Currency) ? seller.BaseCurrency : invoice.Currency;
        var sellerName = string.IsNullOrWhiteSpace(seller.LegalName) ? companyName : seller.LegalName!;

        XElement Amt(XName name, decimal v) =>
            new(name, new XAttribute("currencyID", currency), Num(v));

        // ── Tax breakdown, grouped by (category, percent) ──
        var grouped = invoice.Lines
            .Select(l =>
            {
                taxRates.TryGetValue(l.TaxRateId ?? Guid.Empty, out var rate);
                var cat = Category(rate, l.TaxRatePercent);
                return (l, cat.Code, cat.Percent, cat.Reason);
            })
            .GroupBy(x => new { x.Code, x.Percent })
            .Select(g => new
            {
                g.Key.Code,
                g.Key.Percent,
                Reason = g.Select(x => x.Reason).FirstOrDefault(r => r is not null),
                Taxable = g.Sum(x => x.l.LineAmount),
                Tax = g.Sum(x => x.l.LineTax),
            })
            .ToList();

        var taxTotal = new XElement(Cac + "TaxTotal", Amt(Cbc + "TaxAmount", invoice.TaxTotal));
        foreach (var g in grouped)
        {
            var category = new XElement(Cac + "TaxCategory",
                new XElement(Cbc + "ID", g.Code),
                new XElement(Cbc + "Percent", Num(g.Percent)));
            if (g.Code == "E" && g.Reason is not null)
                category.Add(new XElement(Cbc + "TaxExemptionReason", g.Reason));
            category.Add(new XElement(Cac + "TaxScheme", new XElement(Cbc + "ID", VatSchemeId)));

            taxTotal.Add(new XElement(Cac + "TaxSubtotal",
                Amt(Cbc + "TaxableAmount", g.Taxable),
                Amt(Cbc + "TaxAmount", g.Tax),
                category));
        }

        // ── Legal monetary total ──
        var payable = invoice.Total - invoice.AmountPaid;
        var monetary = new XElement(Cac + "LegalMonetaryTotal",
            Amt(Cbc + "LineExtensionAmount", invoice.SubTotal),
            Amt(Cbc + "TaxExclusiveAmount", invoice.SubTotal),
            Amt(Cbc + "TaxInclusiveAmount", invoice.Total));
        if (invoice.AmountPaid > 0m) monetary.Add(Amt(Cbc + "PrepaidAmount", invoice.AmountPaid));
        monetary.Add(Amt(Cbc + "PayableAmount", payable));

        // ── Document ──
        var root = new XElement(Inv + "Invoice",
            new XAttribute(XNamespace.Xmlns + "cac", Cac.NamespaceName),
            new XAttribute(XNamespace.Xmlns + "cbc", Cbc.NamespaceName),
            new XElement(Cbc + "CustomizationID", CustomizationId),
            new XElement(Cbc + "ProfileID", ProfileId),
            new XElement(Cbc + "ID", invoice.Number),
            new XElement(Cbc + "IssueDate", Date(invoice.Date)),
            new XElement(Cbc + "DueDate", Date(invoice.DueDate)),
            new XElement(Cbc + "InvoiceTypeCode", InvoiceTypeCode),
            new XElement(Cbc + "DocumentCurrencyCode", currency));

        if (!string.IsNullOrWhiteSpace(invoice.Notes))
            root.Add(new XElement(Cbc + "Note", invoice.Notes));

        root.Add(new XElement(Cac + "AccountingSupplierParty",
            Party(sellerName, seller.TaxRegistrationNumber, seller.AddressLine, seller.City, seller.CountryCode)));
        root.Add(new XElement(Cac + "AccountingCustomerParty",
            Party(buyer.Name, buyer.TaxNumber, null, null, "AE")));
        root.Add(taxTotal);
        root.Add(monetary);

        var index = 1;
        foreach (var l in invoice.Lines)
        {
            taxRates.TryGetValue(l.TaxRateId ?? Guid.Empty, out var rate);
            var cat = Category(rate, l.TaxRatePercent);
            root.Add(new XElement(Cac + "InvoiceLine",
                new XElement(Cbc + "ID", index++),
                new XElement(Cbc + "InvoicedQuantity", new XAttribute("unitCode", UnitCode), Num(l.Quantity)),
                Amt(Cbc + "LineExtensionAmount", l.LineAmount),
                new XElement(Cac + "Item",
                    new XElement(Cbc + "Name", string.IsNullOrWhiteSpace(l.Description) ? "Item" : l.Description),
                    new XElement(Cac + "ClassifiedTaxCategory",
                        new XElement(Cbc + "ID", cat.Code),
                        new XElement(Cbc + "Percent", Num(cat.Percent)),
                        new XElement(Cac + "TaxScheme", new XElement(Cbc + "ID", VatSchemeId)))),
                new XElement(Cac + "Price", Amt(Cbc + "PriceAmount", l.UnitPrice))));
        }

        return (Serialize(root), Validate(seller, buyer));
    }

    /// <summary>Maps a tax rate to its UAE VAT category: S (standard), Z (zero-rated) or E (exempt).</summary>
    private static (string Code, decimal Percent, string? Reason) Category(TaxRate? rate, decimal linePercent)
    {
        if (rate is not null)
        {
            if (rate.Rate > 0m) return ("S", rate.Rate, null);
            if (rate.Name.Contains("exempt", StringComparison.OrdinalIgnoreCase)) return ("E", 0m, "Exempt supply");
            return ("Z", 0m, null);
        }
        return linePercent > 0m ? ("S", linePercent, null) : ("Z", 0m, null);
    }

    private static XElement Party(string name, string? trn, string? address, string? city, string country)
    {
        var party = new XElement(Cac + "Party",
            new XElement(Cac + "PartyName", new XElement(Cbc + "Name", name)));

        var postal = new XElement(Cac + "PostalAddress");
        if (!string.IsNullOrWhiteSpace(address)) postal.Add(new XElement(Cbc + "StreetName", address));
        if (!string.IsNullOrWhiteSpace(city)) postal.Add(new XElement(Cbc + "CityName", city));
        postal.Add(new XElement(Cac + "Country",
            new XElement(Cbc + "IdentificationCode", string.IsNullOrWhiteSpace(country) ? "AE" : country)));
        party.Add(postal);

        if (!string.IsNullOrWhiteSpace(trn))
            party.Add(new XElement(Cac + "PartyTaxScheme",
                new XElement(Cbc + "CompanyID", trn),
                new XElement(Cac + "TaxScheme", new XElement(Cbc + "ID", VatSchemeId))));

        party.Add(new XElement(Cac + "PartyLegalEntity",
            new XElement(Cbc + "RegistrationName", name)));
        return party;
    }

    private static List<string> Validate(AccountingSettings seller, Contact buyer)
    {
        var warnings = new List<string>();
        if (string.IsNullOrWhiteSpace(seller.TaxRegistrationNumber))
            warnings.Add("Seller TRN is not set — add it under E-Invoicing settings before filing.");
        if (string.IsNullOrWhiteSpace(seller.AddressLine) && string.IsNullOrWhiteSpace(seller.City))
            warnings.Add("Seller address is incomplete.");
        if (string.IsNullOrWhiteSpace(buyer.TaxNumber))
            warnings.Add($"Buyer \"{buyer.Name}\" has no TRN — required if the customer is VAT-registered.");
        return warnings;
    }

    private static string Num(decimal v) => v.ToString("0.00", CultureInfo.InvariantCulture);
    private static string Date(DateTime d) => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string Serialize(XElement root)
    {
        var doc = new XDocument(new XDeclaration("1.0", "UTF-8", null), root);
        using var writer = new Utf8StringWriter();
        doc.Save(writer);
        return writer.ToString();
    }

    private sealed class Utf8StringWriter : StringWriter
    {
        public override Encoding Encoding => Encoding.UTF8;
    }
}
