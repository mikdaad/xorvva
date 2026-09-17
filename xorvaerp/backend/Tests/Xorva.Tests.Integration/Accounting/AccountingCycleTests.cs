using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;

namespace Xorva.Tests.Integration.Accounting;

/// <summary>
/// PART 4 of the build guide, proven over the real HTTP pipeline:
///  1. the full accounting cycle — activate → seed → invoice → post → pay → P&L reflects it,
///  2. posting is approval-gated (202 → approve → journal created),
///  3. multi-company: a CEO consolidated report sums companies, and never crosses the tenant.
/// </summary>
public class AccountingCycleTests : IClassFixture<XorvaApiFactory>
{
    private readonly HttpClient _client;

    public AccountingCycleTests(XorvaApiFactory factory)
    {
        factory.EnsureDatabaseCreated();
        _client = factory.CreateClient();
    }

    // ─── helpers ────────────────────────────────────────────────
    private static async Task<JsonElement> Data(HttpResponseMessage r) =>
        (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("data");

    private HttpRequestMessage Req(HttpMethod m, string url, string token, object? body = null)
    {
        var req = new HttpRequestMessage(m, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body is not null) req.Content = JsonContent.Create(body);
        return req;
    }

    private async Task<string> Login(string email, string pwd)
    {
        var r = await _client.PostAsJsonAsync("/api/auth/login", new { email, password = pwd });
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await Data(r)).GetProperty("accessToken").GetString()!;
    }

    private async Task<(string Ceo, Guid CompanyId)> Signup(string slug)
    {
        var signup = await _client.PostAsJsonAsync("/api/tenants/register", new
        {
            tenantName = $"{slug} Group",
            companyName = $"{slug} Co",
            email = $"ceo.{slug}@x.test",
            password = "Password@123",
            firstName = "Cee", lastName = "Oh"
        });
        signup.StatusCode.Should().Be(HttpStatusCode.Created);
        var companyId = (await Data(signup)).GetProperty("companyId").GetGuid();
        return (await Login($"ceo.{slug}@x.test", "Password@123"), companyId);
    }

    /// <summary>Turns Accounting on for a company and seeds its chart of accounts.</summary>
    private async Task ActivateAccounting(string ceo, Guid companyId)
    {
        var mods = await _client.SendAsync(Req(HttpMethod.Put, $"/api/companies/{companyId}/modules", ceo,
            new { companyId, modules = new[] { "HR", "Accounting", "Sales" } }));
        mods.IsSuccessStatusCode.Should().BeTrue();

        var seed = await _client.SendAsync(Req(HttpMethod.Post, "/api/accounting/accounts/seed", ceo,
            new { companyId, industry = "General" }));
        seed.IsSuccessStatusCode.Should().BeTrue();
    }

    private async Task<Guid> CreateCustomer(string ceo, Guid companyId, string code)
    {
        var r = await _client.SendAsync(Req(HttpMethod.Post, "/api/accounting/contacts", ceo,
            new { companyId, code, name = "Blue Sky LLC", contactType = "Customer", taxNumber = "100000000000003" }));
        r.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await Data(r)).GetProperty("id").GetGuid();
    }

    private async Task<Guid> CreateInvoiceDraft(string token, Guid? companyId, Guid contactId, decimal amount)
    {
        var r = await _client.SendAsync(Req(HttpMethod.Post, "/api/accounting/invoices", token, new
        {
            companyId, contactId, date = "2026-06-01",
            lines = new[] { new { description = "Consulting", quantity = 1, unitPrice = amount } },
        }));
        r.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await Data(r)).GetProperty("id").GetGuid();
    }

    private async Task<Guid> BankCoaAccountId(string ceo, Guid companyId)
    {
        var r = await _client.SendAsync(Req(HttpMethod.Get, $"/api/accounting/accounts?companyId={companyId}", ceo));
        return (await Data(r)).EnumerateArray().First(a => a.GetProperty("code").GetString() == "1010").GetProperty("id").GetGuid();
    }

    private async Task<decimal> PnlRevenue(string token, Guid? companyId)
    {
        var url = "/api/accounting/reports/profit-and-loss?from=2026-01-01&to=2026-12-31"
                + (companyId is { } c ? $"&companyId={c}" : "");
        var r = await _client.SendAsync(Req(HttpMethod.Get, url, token));
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await Data(r)).GetProperty("totalRevenue").GetDecimal();
    }

    // ─── 1. full cycle ──────────────────────────────────────────
    [Fact]
    public async Task FullCycle_ActivateSeedInvoicePostPay_PnlReflectsRevenue()
    {
        var (ceo, companyId) = await Signup("cycle");
        await ActivateAccounting(ceo, companyId);
        var contactId = await CreateCustomer(ceo, companyId, "CUST-1");

        var invoiceId = await CreateInvoiceDraft(ceo, companyId, contactId, 10000m);

        // Post → auto-journal; the invoice becomes Posted with a journal id.
        var post = await _client.SendAsync(Req(HttpMethod.Post, $"/api/accounting/invoices/{invoiceId}/post?companyId={companyId}", ceo));
        post.StatusCode.Should().Be(HttpStatusCode.OK);
        var posted = await Data(post);
        posted.GetProperty("status").GetString().Should().Be("Posted");
        posted.GetProperty("journalEntryId").GetGuid().Should().NotBeEmpty();

        // Receive payment into a bank account → settles the invoice.
        var bankCoa = await BankCoaAccountId(ceo, companyId);
        var bank = await _client.SendAsync(Req(HttpMethod.Post, "/api/accounting/bank-accounts", ceo,
            new { companyId, name = "Main", accountId = bankCoa }));
        bank.StatusCode.Should().Be(HttpStatusCode.Created);
        var bankId = (await Data(bank)).GetProperty("id").GetGuid();

        var pay = await _client.SendAsync(Req(HttpMethod.Post, "/api/accounting/payments", ceo, new
        {
            companyId, contactId, date = "2026-06-05", bankAccountId = bankId, method = "Bank",
            allocations = new[] { new { invoiceId, amount = 10000m } },
        }));
        pay.StatusCode.Should().Be(HttpStatusCode.Created);

        // P&L reflects the revenue.
        (await PnlRevenue(ceo, companyId)).Should().Be(10000m);
    }

    // ─── 2. approval-gated posting ──────────────────────────────
    [Fact]
    public async Task PostingInvoice_IsApprovalGated_ThenExecutesOnApprove()
    {
        var (ceo, companyId) = await Signup("appr");
        await ActivateAccounting(ceo, companyId);
        var contactId = await CreateCustomer(ceo, companyId, "CUST-1");

        // A CompanyAdmin who will submit the posting.
        var mk = await _client.SendAsync(Req(HttpMethod.Post, "/api/auth/register", ceo, new
        {
            email = "gm.appr@x.test", password = "Password@123",
            firstName = "Gee", lastName = "Em", role = "CompanyAdmin", companyId
        }));
        mk.StatusCode.Should().Be(HttpStatusCode.Created);
        var admin = await Login("gm.appr@x.test", "Password@123");

        // CEO requires CEO approval for invoice posting.
        var rule = await _client.SendAsync(Req(HttpMethod.Post, "/api/approval-rules", ceo, new
        {
            companyId, name = "Post Invoice", actionKey = "Accounting.PostInvoice",
            approverRoles = new[] { "SuperAdmin" }, isActive = true
        }));
        rule.StatusCode.Should().Be(HttpStatusCode.Created);

        var invoiceId = await CreateInvoiceDraft(ceo, companyId, contactId, 5000m);

        // CompanyAdmin posts → intercepted (202), invoice stays Draft.
        var submit = await _client.SendAsync(Req(HttpMethod.Post, $"/api/accounting/invoices/{invoiceId}/post", admin));
        submit.StatusCode.Should().Be(HttpStatusCode.Accepted);
        var body = await submit.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("pendingApproval").GetBoolean().Should().BeTrue();
        var requestId = body.GetProperty("approvalRequestId").GetGuid();

        var before = await _client.SendAsync(Req(HttpMethod.Get, $"/api/accounting/invoices/{invoiceId}?companyId={companyId}", ceo));
        (await Data(before)).GetProperty("status").GetString().Should().Be("Draft");

        // CEO approves → the post executes on replay → journal created, invoice Posted.
        var approve = await _client.SendAsync(Req(HttpMethod.Post, $"/api/approvals/{requestId}/approve", ceo, new { }));
        (await Data(approve)).GetProperty("status").GetString().Should().Be("Approved");

        var after = await _client.SendAsync(Req(HttpMethod.Get, $"/api/accounting/invoices/{invoiceId}?companyId={companyId}", ceo));
        var afterData = await Data(after);
        afterData.GetProperty("status").GetString().Should().Be("Posted");
        afterData.GetProperty("journalEntryId").GetGuid().Should().NotBeEmpty();
    }

    // ─── 3. consolidation + isolation ───────────────────────────
    [Fact]
    public async Task CeoConsolidation_SumsCompanies_AndNeverCrossesTenant()
    {
        var (ceo, companyA) = await Signup("group");
        await ActivateAccounting(ceo, companyA);

        // Second company in the SAME tenant, accounting on from creation.
        var makeB = await _client.SendAsync(Req(HttpMethod.Post, "/api/companies", ceo,
            new { name = "Second Co", activeModules = new[] { "Accounting", "Sales" } }));
        makeB.StatusCode.Should().Be(HttpStatusCode.Created);
        var companyB = (await Data(makeB)).GetProperty("id").GetGuid();
        var seedB = await _client.SendAsync(Req(HttpMethod.Post, "/api/accounting/accounts/seed", ceo,
            new { companyId = companyB, industry = "General" }));
        seedB.IsSuccessStatusCode.Should().BeTrue();

        // Post revenue in each company: A = 10,000, B = 5,000.
        var custA = await CreateCustomer(ceo, companyA, "CUST-A");
        var invA = await CreateInvoiceDraft(ceo, companyA, custA, 10000m);
        (await _client.SendAsync(Req(HttpMethod.Post, $"/api/accounting/invoices/{invA}/post?companyId={companyA}", ceo)))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        var custB = await CreateCustomer(ceo, companyB, "CUST-B");
        var invB = await CreateInvoiceDraft(ceo, companyB, custB, 5000m);
        (await _client.SendAsync(Req(HttpMethod.Post, $"/api/accounting/invoices/{invB}/post?companyId={companyB}", ceo)))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        // Per-company P&L is scoped; the CEO's consolidated P&L (no companyId) sums both.
        (await PnlRevenue(ceo, companyA)).Should().Be(10000m);
        (await PnlRevenue(ceo, companyB)).Should().Be(5000m);
        (await PnlRevenue(ceo, null)).Should().Be(15000m);

        // A different tenant's CEO consolidated view sees NONE of it (tenant isolation).
        var (otherCeo, _) = await Signup("outsider");
        await ActivateAccounting(otherCeo, (await OwnCompanyId(otherCeo)));
        (await PnlRevenue(otherCeo, null)).Should().Be(0m);
    }

    private async Task<Guid> OwnCompanyId(string token)
    {
        var r = await _client.SendAsync(Req(HttpMethod.Get, "/api/companies", token));
        return (await Data(r)).EnumerateArray().First().GetProperty("id").GetGuid();
    }
}
