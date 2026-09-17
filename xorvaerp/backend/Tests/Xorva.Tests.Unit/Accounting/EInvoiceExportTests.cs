using System.Xml.Linq;
using FluentAssertions;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Commands.CreateContact;
using Xorva.Modules.Accounting.EInvoicing.Common;
using Xorva.Modules.Accounting.EInvoicing.Commands.UpdateEInvoicingSettings;
using Xorva.Modules.Accounting.EInvoicing.Queries.GetInvoiceEInvoice;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Sales.Commands.CreateInvoice;
using Xorva.Modules.Accounting.Sales.Commands.PostInvoice;
using Xorva.Modules.Accounting.Tax.Commands.SeedTaxRates;
using Xorva.Modules.Accounting.Tax.Entities;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

/// <summary>E8 — the UBL 2.1 / PINT AE e-invoice export for a posted sales invoice.</summary>
public class EInvoiceExportTests : AuthHandlerTestBase
{
    private static readonly XNamespace Cbc = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
    private static readonly XNamespace Cac = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";
    private static readonly DateTime When = new(2026, 5, 1);

    private readonly Company _company;

    public EInvoiceExportTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "RightSource Trading LLC");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("ein@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
        new SeedChartOfAccountsHandler(Db, TenantService)
            .Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None).GetAwaiter().GetResult();
        new SeedTaxRatesHandler(Db, TenantService)
            .Handle(new SeedTaxRatesCommand(), CancellationToken.None).GetAwaiter().GetResult();
    }

    private JournalPoster Poster => new(Db, TenantService);

    private async Task<Guid> PostedInvoice(decimal unitPrice, string? buyerTrn)
    {
        var vat5 = Db.Set<TaxRate>().First(t => t.Rate == 5m).Id;
        var contact = await new CreateContactHandler(Db, TenantService).Handle(new CreateContactCommand
        {
            Code = "CUST-1", Name = "Blue Sky LLC", ContactType = ContactType.Customer, TaxNumber = buyerTrn,
        }, CancellationToken.None);
        var created = await new CreateInvoiceHandler(Db, TenantService).Handle(new CreateInvoiceCommand
        {
            ContactId = contact.Data!.Id, Date = When,
            Lines = [new() { Description = "Consulting", Quantity = 1, UnitPrice = unitPrice, TaxRateId = vat5 }],
        }, CancellationToken.None);
        await new PostInvoiceHandler(Db, TenantService, Poster)
            .Handle(new PostInvoiceCommand { Id = created.Data!.Id }, CancellationToken.None);
        return created.Data.Id;
    }

    private Task SetSeller(string? trn) =>
        new UpdateEInvoicingSettingsHandler(Db, TenantService).Handle(new UpdateEInvoicingSettingsCommand
        {
            LegalName = "RightSource Trading LLC", TaxRegistrationNumber = trn,
            AddressLine = "Sheikh Zayed Rd", City = "Dubai", CountryCode = "AE",
        }, CancellationToken.None);

    [Fact]
    public async Task Export_ProducesValidUbl_WithPintAeAndCorrectTotals()
    {
        var invId = await PostedInvoice(unitPrice: 10000m, buyerTrn: "100200300400003");
        await SetSeller("100999888777003");

        var res = await new GetInvoiceEInvoiceHandler(Db, TenantService)
            .Handle(new GetInvoiceEInvoiceQuery { Id = invId }, CancellationToken.None);

        res.Data!.FileName.Should().EndWith(".xml");
        var doc = XDocument.Parse(res.Data.Xml);   // well-formed

        doc.Root!.Name.LocalName.Should().Be("Invoice");
        doc.Descendants(Cbc + "CustomizationID").First().Value.Should().Be(UblInvoiceBuilder.CustomizationId);
        doc.Descendants(Cbc + "ProfileID").First().Value.Should().Be(UblInvoiceBuilder.ProfileId);
        doc.Descendants(Cbc + "InvoiceTypeCode").First().Value.Should().Be("380");
        doc.Descendants(Cbc + "DocumentCurrencyCode").First().Value.Should().Be("AED");

        // VAT: 10,000 @ 5% → 500 tax, 10,500 payable.
        doc.Descendants(Cac + "TaxTotal").First().Elements(Cbc + "TaxAmount").First().Value.Should().Be("500.00");
        doc.Descendants(Cbc + "PayableAmount").First().Value.Should().Be("10500.00");

        var cat = doc.Descendants(Cac + "ClassifiedTaxCategory").First();
        cat.Element(Cbc + "ID")!.Value.Should().Be("S");
        cat.Element(Cbc + "Percent")!.Value.Should().Be("5.00");

        // Both TRNs present (seller + buyer CompanyID).
        var companyIds = doc.Descendants(Cbc + "CompanyID").Select(e => e.Value).ToList();
        companyIds.Should().Contain("100999888777003");
        companyIds.Should().Contain("100200300400003");

        res.Data.Warnings.Should().NotContain(w => w.Contains("Seller TRN"));
    }

    [Fact]
    public async Task Export_WarnsWhenTrnsMissing()
    {
        var invId = await PostedInvoice(unitPrice: 500m, buyerTrn: null); // no buyer TRN, seller not set

        var res = await new GetInvoiceEInvoiceHandler(Db, TenantService)
            .Handle(new GetInvoiceEInvoiceQuery { Id = invId }, CancellationToken.None);

        res.Data!.Warnings.Should().Contain(w => w.Contains("Seller TRN"));
        res.Data.Warnings.Should().Contain(w => w.Contains("no TRN"));
    }

    [Fact]
    public async Task Export_RejectsDraftInvoice()
    {
        var vat5 = Db.Set<TaxRate>().First(t => t.Rate == 5m).Id;
        var contact = await new CreateContactHandler(Db, TenantService).Handle(new CreateContactCommand
        {
            Code = "CUST-2", Name = "Draft Co", ContactType = ContactType.Customer,
        }, CancellationToken.None);
        var created = await new CreateInvoiceHandler(Db, TenantService).Handle(new CreateInvoiceCommand
        {
            ContactId = contact.Data!.Id, Date = When,
            Lines = [new() { Description = "X", Quantity = 1, UnitPrice = 100, TaxRateId = vat5 }],
        }, CancellationToken.None);

        var act = () => new GetInvoiceEInvoiceHandler(Db, TenantService)
            .Handle(new GetInvoiceEInvoiceQuery { Id = created.Data!.Id }, CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>();
    }
}
