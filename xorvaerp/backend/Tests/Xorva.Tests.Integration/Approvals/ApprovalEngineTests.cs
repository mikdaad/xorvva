using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;

namespace Xorva.Tests.Integration.Approvals;

/// <summary>
/// End-to-end proof of the Approval Engine over the real HTTP pipeline:
/// interception → 202 pending → deferred execution on approval, plus reject and
/// the auto-skip fast path. Each scenario uses its own tenant for isolation.
/// </summary>
public class ApprovalEngineTests : IClassFixture<XorvaApiFactory>
{
    private readonly HttpClient _client;

    public ApprovalEngineTests(XorvaApiFactory factory)
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

    private async Task<string> Login(string email, string password)
    {
        var r = await _client.PostAsJsonAsync("/api/auth/login", new { email, password });
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await Data(r)).GetProperty("accessToken").GetString()!;
    }

    /// <summary>Signs up a tenant and returns (ceoToken, companyId).</summary>
    private async Task<(string CeoToken, Guid CompanyId)> SignupTenant(string slug)
    {
        var signup = await _client.PostAsJsonAsync("/api/tenants/register", new
        {
            tenantName = $"{slug} Group",
            companyName = $"{slug} Co",
            email = $"ceo.{slug}@x.test",
            password = "Password@123",
            firstName = "Cee",
            lastName = "Oh"
        });
        signup.StatusCode.Should().Be(HttpStatusCode.Created);
        var companyId = (await Data(signup)).GetProperty("companyId").GetGuid();
        var token = await Login($"ceo.{slug}@x.test", "Password@123");
        return (token, companyId);
    }

    private async Task<string> CreateCompanyAdmin(string ceoToken, Guid companyId, string slug)
    {
        var create = await _client.SendAsync(Req(HttpMethod.Post, "/api/auth/register", ceoToken, new
        {
            email = $"admin.{slug}@x.test",
            password = "Password@123",
            firstName = "Ad",
            lastName = "Min",
            role = "CompanyAdmin",
            companyId
        }));
        create.StatusCode.Should().Be(HttpStatusCode.Created);
        return await Login($"admin.{slug}@x.test", "Password@123");
    }

    private async Task CreateRule(string ceoToken, Guid companyId, string actionKey, params string[] roles)
    {
        var r = await _client.SendAsync(Req(HttpMethod.Post, "/api/approval-rules", ceoToken, new
        {
            companyId,
            name = $"Rule for {actionKey}",
            actionKey,
            approverRoles = roles,
            isActive = true
        }));
        r.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    // ─── the loop ───────────────────────────────────────────────

    [Fact]
    public async Task Submit_IsQueued_ThenApproval_ExecutesTheAction()
    {
        var (ceo, companyId) = await SignupTenant("loop");
        var adminToken = await CreateCompanyAdmin(ceo, companyId, "loop");

        // CEO requires CEO-approval for branch creation.
        await CreateRule(ceo, companyId, "Tenants.CreateBranch", "SuperAdmin");

        // CompanyAdmin submits → intercepted → 202, not executed.
        var submit = await _client.SendAsync(Req(HttpMethod.Post, "/api/branches", adminToken,
            new { companyId, name = "Pending Branch", city = "Dubai" }));
        submit.StatusCode.Should().Be(HttpStatusCode.Accepted); // 202
        var submitBody = await submit.Content.ReadFromJsonAsync<JsonElement>();
        submitBody.GetProperty("pendingApproval").GetBoolean().Should().BeTrue();
        var requestId = submitBody.GetProperty("approvalRequestId").GetGuid();

        // Branch does NOT exist yet.
        var before = await _client.SendAsync(Req(HttpMethod.Get, "/api/branches", adminToken));
        (await Data(before)).EnumerateArray().Should().BeEmpty();

        // CEO sees it in the inbox and can act.
        var pending = await _client.SendAsync(Req(HttpMethod.Get, "/api/approvals/pending", ceo));
        var inbox = (await Data(pending)).EnumerateArray().ToList();
        inbox.Should().ContainSingle();
        inbox[0].GetProperty("canAct").GetBoolean().Should().BeTrue();

        // CEO approves → action executes.
        var approve = await _client.SendAsync(Req(HttpMethod.Post, $"/api/approvals/{requestId}/approve", ceo,
            new { comment = "Looks good" }));
        approve.StatusCode.Should().Be(HttpStatusCode.OK);
        (await Data(approve)).GetProperty("status").GetString().Should().Be("Approved");

        // Branch now EXISTS.
        var after = await _client.SendAsync(Req(HttpMethod.Get, "/api/branches", adminToken));
        var branches = (await Data(after)).EnumerateArray().ToList();
        branches.Should().ContainSingle();
        branches[0].GetProperty("name").GetString().Should().Be("Pending Branch");
    }

    [Fact]
    public async Task Reject_TerminatesRequest_AndDoesNotExecute()
    {
        var (ceo, companyId) = await SignupTenant("reject");
        var adminToken = await CreateCompanyAdmin(ceo, companyId, "reject");
        await CreateRule(ceo, companyId, "Tenants.CreateBranch", "SuperAdmin");

        var submit = await _client.SendAsync(Req(HttpMethod.Post, "/api/branches", adminToken,
            new { companyId, name = "Doomed Branch" }));
        var requestId = (await submit.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("approvalRequestId").GetGuid();

        var reject = await _client.SendAsync(Req(HttpMethod.Post, $"/api/approvals/{requestId}/reject", ceo,
            new { reason = "Not needed" }));
        reject.StatusCode.Should().Be(HttpStatusCode.OK);
        (await Data(reject)).GetProperty("status").GetString().Should().Be("Rejected");

        // Never created.
        var after = await _client.SendAsync(Req(HttpMethod.Get, "/api/branches", adminToken));
        (await Data(after)).EnumerateArray().Should().BeEmpty();
    }

    [Fact]
    public async Task RequesterOutranksApprover_AutoSkips_AndExecutesImmediately()
    {
        var (ceo, companyId) = await SignupTenant("skip");

        // Rule requires only Manager approval — but the CEO (who outranks Manager)
        // submits, so every step auto-skips and the branch is created immediately.
        await CreateRule(ceo, companyId, "Tenants.CreateBranch", "Manager");

        var submit = await _client.SendAsync(Req(HttpMethod.Post, "/api/branches", ceo,
            new { companyId, name = "Instant Branch" }));
        submit.StatusCode.Should().Be(HttpStatusCode.Created); // 201, executed inline

        var after = await _client.SendAsync(Req(HttpMethod.Get, "/api/branches", ceo));
        (await Data(after)).EnumerateArray().Should().ContainSingle();
    }

    [Fact]
    public async Task ApprovedButExecutionFails_IsRecorded_NotSilentlyLost()
    {
        var (ceo, companyId) = await SignupTenant("fail");
        var adminToken = await CreateCompanyAdmin(ceo, companyId, "fail");
        await CreateRule(ceo, companyId, "Tenants.CreateBranch", "SuperAdmin");

        // CompanyAdmin queues branch "Clash".
        var submit = await _client.SendAsync(Req(HttpMethod.Post, "/api/branches", adminToken,
            new { companyId, name = "Clash" }));
        var requestId = (await submit.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("approvalRequestId").GetGuid();

        // Meanwhile the CEO creates a branch with the SAME name directly (CEO outranks
        // the rule's approver → auto-skips → executes immediately).
        var direct = await _client.SendAsync(Req(HttpMethod.Post, "/api/branches", ceo,
            new { companyId, name = "Clash" }));
        direct.StatusCode.Should().Be(HttpStatusCode.Created);

        // Approving the queued one now fails on replay (duplicate branch name) →
        // terminal ApprovedButFailed, with the reason recorded (never silently lost).
        var approve = await _client.SendAsync(Req(HttpMethod.Post, $"/api/approvals/{requestId}/approve", ceo,
            new { }));
        approve.StatusCode.Should().Be(HttpStatusCode.OK);
        var data = await Data(approve);
        data.GetProperty("status").GetString().Should().Be("ApprovedButFailed");
        data.GetProperty("outcome").GetString().Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task DuplicateActiveRule_IsForbidden()
    {
        var (ceo, companyId) = await SignupTenant("dup");
        await CreateRule(ceo, companyId, "Tenants.CreateBranch", "SuperAdmin");

        var second = await _client.SendAsync(Req(HttpMethod.Post, "/api/approval-rules", ceo, new
        {
            companyId,
            name = "Second rule",
            actionKey = "Tenants.CreateBranch",
            approverRoles = new[] { "CompanyAdmin" },
            isActive = true
        }));
        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }
}
