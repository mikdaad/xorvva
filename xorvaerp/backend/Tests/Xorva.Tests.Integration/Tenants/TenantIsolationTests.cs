using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;

namespace Xorva.Tests.Integration.Tenants;

/// <summary>
/// THE Phase-1 promise, proven end-to-end over real HTTP:
/// two tenants sign up, and neither can see or touch the other's data —
/// through the full pipeline (JWT auth → tenant resolver → EF query filters).
/// </summary>
public class TenantIsolationTests : IClassFixture<XorvaApiFactory>
{
    private readonly HttpClient _client;

    public TenantIsolationTests(XorvaApiFactory factory)
    {
        factory.EnsureDatabaseCreated();
        _client = factory.CreateClient();
    }

    private async Task<JsonElement> ReadData(HttpResponseMessage response)
    {
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        return json.GetProperty("data");
    }

    private async Task<(string Token, Guid CompanyId)> SignupAndLogin(
        string tenantName, string companyName, string email)
    {
        var signup = await _client.PostAsJsonAsync("/api/tenants/register", new
        {
            tenantName,
            companyName,
            email,
            password = "Password@123",
            firstName = "Test",
            lastName = "Ceo"
        });
        signup.StatusCode.Should().Be(HttpStatusCode.Created);
        var companyId = (await ReadData(signup)).GetProperty("companyId").GetGuid();

        var login = await _client.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password = "Password@123"
        });
        login.StatusCode.Should().Be(HttpStatusCode.OK);
        var token = (await ReadData(login)).GetProperty("accessToken").GetString()!;

        return (token, companyId);
    }

    private HttpRequestMessage Authed(HttpMethod method, string url, string token, object? body = null)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body is not null)
            request.Content = JsonContent.Create(body);
        return request;
    }

    [Fact]
    public async Task TwoTenants_CanNeverSeeOrTouchEachOthersData()
    {
        // ─── Two corporations sign up ───────────────────────────
        var (tokenA, companyA) = await SignupAndLogin("Acme Group", "Acme Trading", "ceo@acme.test");
        var (tokenB, companyB) = await SignupAndLogin("Globex Corp", "Globex LLC", "ceo@globex.test");

        // ─── Company lists are strictly disjoint ────────────────
        var listA = await _client.SendAsync(Authed(HttpMethod.Get, "/api/companies", tokenA));
        var companiesA = (await ReadData(listA)).EnumerateArray().ToList();
        companiesA.Should().HaveCount(1);
        companiesA[0].GetProperty("name").GetString().Should().Be("Acme Trading");

        var listB = await _client.SendAsync(Authed(HttpMethod.Get, "/api/companies", tokenB));
        var companiesB = (await ReadData(listB)).EnumerateArray().ToList();
        companiesB.Should().HaveCount(1);
        companiesB[0].GetProperty("id").GetGuid().Should().NotBe(companyA);

        // ─── A creates a branch; B's branch list stays empty ────
        var createBranch = await _client.SendAsync(Authed(HttpMethod.Post, "/api/branches", tokenA,
            new { companyId = companyA, name = "Dubai HQ", city = "Dubai", country = "UAE" }));
        createBranch.StatusCode.Should().Be(HttpStatusCode.Created);

        var branchesA = await _client.SendAsync(Authed(HttpMethod.Get, "/api/branches", tokenA));
        (await ReadData(branchesA)).EnumerateArray().Should().HaveCount(1);

        var branchesB = await _client.SendAsync(Authed(HttpMethod.Get, "/api/branches", tokenB));
        (await ReadData(branchesB)).EnumerateArray().Should().BeEmpty();

        // ─── B attacks A's company id directly → 404, not 403 ───
        // The foreign company must be INVISIBLE (404). A 403 would leak that
        // the id exists — information disclosure.
        var attack = await _client.SendAsync(Authed(HttpMethod.Post, "/api/branches", tokenB,
            new { companyId = companyA, name = "Hostile Branch" }));
        attack.StatusCode.Should().Be(HttpStatusCode.NotFound);

        // ─── Tenant endpoint returns each caller's own tenant ───
        var tenantA = await _client.SendAsync(Authed(HttpMethod.Get, "/api/tenants/current", tokenA));
        (await ReadData(tenantA)).GetProperty("name").GetString().Should().Be("Acme Group");

        var tenantB = await _client.SendAsync(Authed(HttpMethod.Get, "/api/tenants/current", tokenB));
        (await ReadData(tenantB)).GetProperty("name").GetString().Should().Be("Globex Corp");
    }

    [Fact]
    public async Task DuplicateEmailAcrossTenants_IsRejected()
    {
        await SignupAndLogin("First Org", "First Co", "shared@email.test");

        var second = await _client.PostAsJsonAsync("/api/tenants/register", new
        {
            tenantName = "Second Org",
            companyName = "Second Co",
            email = "shared@email.test", // platform-wide unique
            password = "Password@123",
            firstName = "Bob",
            lastName = "Ceo"
        });

        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }
}
