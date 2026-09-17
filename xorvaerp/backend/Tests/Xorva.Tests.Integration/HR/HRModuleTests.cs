using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;

namespace Xorva.Tests.Integration.HR;

/// <summary>
/// HR module over the real HTTP pipeline: the person registry, the New-Hire approval
/// integration (the plan's headline test), and the leave apply → approve → balance loop.
/// </summary>
public class HRModuleTests : IClassFixture<XorvaApiFactory>
{
    private readonly HttpClient _client;

    public HRModuleTests(XorvaApiFactory factory)
    {
        factory.EnsureDatabaseCreated();
        _client = factory.CreateClient();
    }

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
        return (await Data(r)).GetProperty("accessToken").GetString()!;
    }

    /// <summary>Signs up a tenant whose first company has HR active; returns (ceoToken, companyId).</summary>
    private async Task<(string Ceo, Guid CompanyId)> SetupCompanyWithHr(string slug)
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
        var ceo = await Login($"ceo.{slug}@x.test", "Password@123");

        // The default signup company already has HR active (RegisterTenant seeds ["HR"]).
        return (ceo, companyId);
    }

    // The CEO is a SuperAdmin (no company context), so HR creates pass an explicit companyId.
    private async Task<(Guid DeptId, Guid DesigId)> SetupOrg(string ceo, Guid companyId)
    {
        var desig = await _client.SendAsync(Req(HttpMethod.Post, "/api/designations", ceo,
            new { companyId, title = "Engineer", code = "ENG", level = 5 }));
        desig.StatusCode.Should().Be(HttpStatusCode.Created);
        var desigId = (await Data(desig)).GetProperty("id").GetGuid();

        var dept = await _client.SendAsync(Req(HttpMethod.Post, "/api/departments", ceo,
            new { companyId, name = "Engineering", code = "ENGDPT" }));
        dept.StatusCode.Should().Be(HttpStatusCode.Created);
        var deptId = (await Data(dept)).GetProperty("id").GetGuid();

        return (deptId, desigId);
    }

    [Fact]
    public async Task PersonRegistry_CreatesEmployee_WithGeneratedCode()
    {
        var (ceo, companyId) = await SetupCompanyWithHr("reg");
        var (deptId, desigId) = await SetupOrg(ceo, companyId);

        var create = await _client.SendAsync(Req(HttpMethod.Post, "/api/employees", ceo, new
        {
            companyId,
            firstName = "Ahmed", lastName = "Ali", gender = "Male",
            departmentId = deptId, designationId = desigId,
            joinDate = "2026-07-18", employmentType = "FullTime", basicSalary = 15000
        }));
        create.StatusCode.Should().Be(HttpStatusCode.Created);
        var data = await Data(create);
        data.GetProperty("employeeCode").GetString().Should().Be("EMP-0001");
        data.GetProperty("departmentName").GetString().Should().Be("Engineering");
        data.GetProperty("basicSalary").GetDecimal().Should().Be(15000); // CEO can see salary
    }

    [Fact]
    public async Task CreateEmployee_TriggersApproval_WhenRuleExists()
    {
        var (ceo, companyId) = await SetupCompanyWithHr("hire");
        var (deptId, desigId) = await SetupOrg(ceo, companyId);

        // A CompanyAdmin who will submit the hire.
        var mk = await _client.SendAsync(Req(HttpMethod.Post, "/api/auth/register", ceo, new
        {
            email = "gm.hire@x.test", password = "Password@123",
            firstName = "Gee", lastName = "Em", role = "CompanyAdmin", companyId
        }));
        mk.StatusCode.Should().Be(HttpStatusCode.Created);
        var admin = await Login("gm.hire@x.test", "Password@123");

        // CEO requires CEO approval for new hires.
        var rule = await _client.SendAsync(Req(HttpMethod.Post, "/api/approval-rules", ceo, new
        {
            companyId, name = "New Hire", actionKey = "HR.CreateEmployee",
            approverRoles = new[] { "SuperAdmin" }, isActive = true
        }));
        rule.StatusCode.Should().Be(HttpStatusCode.Created);

        // CompanyAdmin submits → intercepted (202), NOT created.
        var submit = await _client.SendAsync(Req(HttpMethod.Post, "/api/employees", admin, new
        {
            firstName = "New", lastName = "Hire", gender = "Female",
            departmentId = deptId, designationId = desigId,
            joinDate = "2026-07-18", employmentType = "FullTime", basicSalary = 20000
        }));
        submit.StatusCode.Should().Be(HttpStatusCode.Accepted); // 202
        var body = await submit.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("pendingApproval").GetBoolean().Should().BeTrue();
        var requestId = body.GetProperty("approvalRequestId").GetGuid();

        var beforeList = await _client.SendAsync(Req(HttpMethod.Get, "/api/employees", ceo));
        (await Data(beforeList)).GetProperty("totalCount").GetInt32().Should().Be(0);

        // CEO approves → the employee is actually created (salary decrypted from payload).
        var approve = await _client.SendAsync(Req(HttpMethod.Post, $"/api/approvals/{requestId}/approve", ceo, new { }));
        (await Data(approve)).GetProperty("status").GetString().Should().Be("Approved");

        var afterList = await _client.SendAsync(Req(HttpMethod.Get, "/api/employees", ceo));
        (await Data(afterList)).GetProperty("totalCount").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task Leave_Apply_ConsumesBalance()
    {
        var (ceo, companyId) = await SetupCompanyWithHr("leave");
        var (deptId, desigId) = await SetupOrg(ceo, companyId);

        // An employee linked to a login account.
        var userRes = await _client.SendAsync(Req(HttpMethod.Post, "/api/auth/register", ceo, new
        {
            email = "emp.leave@x.test", password = "Password@123",
            firstName = "Emp", lastName = "Loyee", role = "Employee",
            companyId
        }));
        userRes.StatusCode.Should().Be(HttpStatusCode.Created);
        var userId = (await Data(userRes)).GetProperty("id").GetGuid();

        await _client.SendAsync(Req(HttpMethod.Post, "/api/employees", ceo, new
        {
            companyId,
            firstName = "Emp", lastName = "Loyee", gender = "Male",
            departmentId = deptId, designationId = desigId,
            joinDate = "2026-01-01", employmentType = "FullTime", basicSalary = 10000, userId
        }));

        // Seed leave types.
        var seed = await _client.SendAsync(Req(HttpMethod.Post, "/api/leave-types/seed-defaults", ceo, new { companyId }));
        seed.StatusCode.Should().Be(HttpStatusCode.OK);

        var emp = await Login("emp.leave@x.test", "Password@123");

        // Balance before: Annual Leave = 30.
        var balBefore = await _client.SendAsync(Req(HttpMethod.Get, "/api/leaves/balance", emp));
        var annualBefore = (await Data(balBefore)).EnumerateArray()
            .First(b => b.GetProperty("leaveTypeCode").GetString() == "AL");
        annualBefore.GetProperty("remainingDays").GetDecimal().Should().Be(30);
        var annualTypeId = annualBefore.GetProperty("leaveTypeId").GetGuid();

        // Apply for Mon–Fri (5 working days). No rule → recorded immediately.
        var apply = await _client.SendAsync(Req(HttpMethod.Post, "/api/leaves", emp, new
        {
            leaveTypeId = annualTypeId,
            fromDate = "2026-08-03", // Monday
            toDate = "2026-08-07",   // Friday
            reason = "Vacation"
        }));
        apply.StatusCode.Should().Be(HttpStatusCode.Created);
        (await Data(apply)).GetProperty("totalDays").GetDecimal().Should().Be(5);

        // Balance after: 25 remaining.
        var balAfter = await _client.SendAsync(Req(HttpMethod.Get, "/api/leaves/balance", emp));
        var annualAfter = (await Data(balAfter)).EnumerateArray()
            .First(b => b.GetProperty("leaveTypeCode").GetString() == "AL");
        annualAfter.GetProperty("usedDays").GetDecimal().Should().Be(5);
        annualAfter.GetProperty("remainingDays").GetDecimal().Should().Be(25);
    }
}
