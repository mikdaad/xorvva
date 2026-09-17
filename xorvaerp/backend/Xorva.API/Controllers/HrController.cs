using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Modules.HR.Commands.EmployeeTabs;
using Xorva.Modules.HR.Commands.Files;
using Xorva.Modules.HR.Queries.EmployeeTabs;
using Xorva.Modules.HR.Queries.GetHrOverview;

namespace Xorva.API.Controllers;

/// <summary>HR module dashboard/overview and the admin-designed employee-record tabs. Manager &amp; above.</summary>
[ApiController]
[Route("api/hr")]
[Authorize]
public class HrController : ControllerBase
{
    private readonly IMediator _mediator;
    public HrController(IMediator mediator) => _mediator = mediator;

    /// <summary>Headline HR figures for the module Overview.</summary>
    [HttpGet("overview")]
    [RequireRole(SystemRole.Manager)]
    public async Task<IActionResult> Overview([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetHrOverviewQuery { CompanyId = companyId }));

    // ─── Employee-record tabs (admin-designed sections) ─────────────────

    /// <summary>The employee-record tabs designed for a company.</summary>
    [HttpGet("employee-tabs")]
    [RequireRole(SystemRole.Manager)]
    public async Task<IActionResult> ListTabs([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListEmployeeTabsQuery { CompanyId = companyId }));

    /// <summary>Design a new employee-record tab with its fields. Admins &amp; HR managers.</summary>
    [HttpPost("employee-tabs")]
    [RequireRole(SystemRole.Manager)]
    public async Task<IActionResult> CreateTab([FromBody] CreateEmployeeTabCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    /// <summary>Create the standard UAE employee tabs (idempotent). Admins &amp; HR managers.</summary>
    [HttpPost("employee-tabs/seed-defaults")]
    [RequireRole(SystemRole.Manager)]
    public async Task<IActionResult> SeedTabs([FromBody] SeedEmployeeTabsCommand command)
        => Ok(await _mediator.Send(command));

    /// <summary>Rename a tab and reconcile its fields (add / edit / remove). Admins &amp; HR managers.</summary>
    [HttpPut("employee-tabs/{id:guid}")]
    [RequireRole(SystemRole.Manager)]
    public async Task<IActionResult> UpdateTab(Guid id, [FromBody] UpdateEmployeeTabCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));

    /// <summary>Remove a tab, its fields and all its data. Admins &amp; HR managers.</summary>
    [HttpDelete("employee-tabs/{id:guid}")]
    [RequireRole(SystemRole.Manager)]
    public async Task<IActionResult> DeleteTab(Guid id)
        => Ok(await _mediator.Send(new DeleteEmployeeTabCommand(id)));

    /// <summary>One employee's rows under a tab (a single form has one row; a list has many).</summary>
    [HttpGet("employee-tabs/{tabId:guid}/records")]
    [RequireRole(SystemRole.Manager)]
    public async Task<IActionResult> ListTabRecords(Guid tabId, [FromQuery] Guid employeeId)
        => Ok(await _mediator.Send(new ListEmployeeTabRecordsQuery(employeeId, tabId)));

    /// <summary>Employees-by-tab table: the tab's columns/filters + a row per employee/record.</summary>
    [HttpGet("employee-tabs/{tabId:guid}/view")]
    [RequireRole(SystemRole.Manager)]
    public async Task<IActionResult> TabView(
        Guid tabId, [FromQuery] Guid? companyId = null, [FromQuery] int page = 1, [FromQuery] int pageSize = 10,
        [FromQuery] string? search = null, [FromQuery] string? filters = null, [FromQuery] int? expiringDays = null)
    {
        Dictionary<string, string>? filterMap = null;
        if (!string.IsNullOrWhiteSpace(filters))
        {
            try { filterMap = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(filters); }
            catch { filterMap = null; }
        }
        return Ok(await _mediator.Send(new GetEmployeeTabViewQuery
        {
            TabId = tabId, CompanyId = companyId, Page = page, PageSize = pageSize,
            Search = search, Filters = filterMap, ExpiringDays = expiringDays,
        }));
    }

    /// <summary>Fill / update an employee's data under a tab. Manager: own department only.</summary>
    [HttpPost("employee-tabs/records")]
    [RequireRole(SystemRole.Manager)]
    public async Task<IActionResult> SaveTabRecord([FromBody] SaveEmployeeTabRecordCommand command)
        => Ok(await _mediator.Send(command));

    /// <summary>Delete one row from a list tab. Manager: own department only.</summary>
    [HttpDelete("employee-tabs/records/{id:guid}")]
    [RequireRole(SystemRole.Manager)]
    public async Task<IActionResult> DeleteTabRecord(Guid id)
        => Ok(await _mediator.Send(new DeleteEmployeeTabRecordCommand(id)));

    // ─── Attachment files (passport/visa/certificate scans, photos) ─────

    /// <summary>Upload a file for an Attachment field; returns its reference URL. Manager+.</summary>
    [HttpPost("files")]
    [RequireRole(SystemRole.Manager)]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> UploadFile([FromForm] IFormFile file, [FromForm] Guid? companyId = null)
    {
        if (file is null || file.Length == 0) return BadRequest(ApiResponse.Fail("No file provided."));
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        return Ok(await _mediator.Send(new UploadHrFileCommand
        {
            CompanyId = companyId,
            FileName = file.FileName,
            ContentType = file.ContentType,
            Data = ms.ToArray(),
        }));
    }

    /// <summary>Stream a stored file (scoped to the caller's tenant/company). Any authenticated user.</summary>
    [HttpGet("files/{id:guid}")]
    [RequireRole(SystemRole.Employee)]
    public async Task<IActionResult> GetFile(Guid id)
    {
        var f = await _mediator.Send(new GetHrFileQuery(id));
        return File(f.Data, f.ContentType, f.FileName);
    }
}
