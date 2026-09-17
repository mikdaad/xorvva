using FluentAssertions;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Modules.Accounting.Contacts.Commands.CreateContact;
using Xorva.Modules.Accounting.Contacts.Queries.ListContacts;
using Xorva.Modules.Accounting.Enums;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

public class ContactsTests : AuthHandlerTestBase
{
    private readonly Company _company;

    public ContactsTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "Sales Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("sales@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
    }

    private CreateContactHandler Create => new(Db, TenantService);

    [Fact]
    public async Task Create_Customer_PersistsTrn()
    {
        var res = await Create.Handle(new CreateContactCommand
        {
            Code = "CUST-001",
            Name = "Emirates Trading LLC",
            ContactType = ContactType.Customer,
            TaxNumber = "100123456700003",
        }, CancellationToken.None);

        res.Success.Should().BeTrue();
        res.Data!.TaxNumber.Should().Be("100123456700003");
        res.Data.ContactType.Should().Be(ContactType.Customer);
    }

    [Fact]
    public async Task Create_DuplicateCode_ThrowsConflict()
    {
        await Create.Handle(new CreateContactCommand { Code = "C1", Name = "A", ContactType = ContactType.Customer }, CancellationToken.None);
        var act = () => Create.Handle(new CreateContactCommand { Code = "C1", Name = "B", ContactType = ContactType.Supplier }, CancellationToken.None);
        await act.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task List_RoleCustomer_ReturnsCustomersAndBoth_NotSuppliers()
    {
        await Create.Handle(new CreateContactCommand { Code = "CU", Name = "Cust", ContactType = ContactType.Customer }, CancellationToken.None);
        await Create.Handle(new CreateContactCommand { Code = "SU", Name = "Supp", ContactType = ContactType.Supplier }, CancellationToken.None);
        await Create.Handle(new CreateContactCommand { Code = "BO", Name = "Both", ContactType = ContactType.Both }, CancellationToken.None);

        var res = await new ListContactsHandler(Db, TenantService)
            .Handle(new ListContactsQuery { Role = ContactType.Customer }, CancellationToken.None);

        res.Data!.Select(c => c.Code).Should().BeEquivalentTo(["CU", "BO"]);
    }
}
