using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.HR.Commands.ChangeEmployeeSalary;
using Xorva.Modules.HR.Commands.ChangeEmployeeStatus;
using Xorva.Modules.HR.Commands.CreateEmployee;
using Xorva.Modules.HR.Commands.DeleteEmployee;
using Xorva.Modules.HR.Commands.SeedDemoEmployees;
using Xorva.Modules.HR.Commands.UpdateEmployee;
using Xorva.Modules.HR.Enums;
using Xorva.Modules.HR.Queries.GetEmployee;
using Xorva.Modules.HR.Queries.EmployeeTabs;
using Xorva.Modules.HR.Queries.GetEmployeeHistory;
using Xorva.Modules.HR.Queries.GetMyProfile;
using Xorva.Modules.HR.Queries.ListEmployees;

namespace Xorva.API.Controllers;

[ApiController]
[Route("api/employees")]
[Authorize]
public class EmployeesController : ControllerBase
{
    private readonly IMediator _mediator;
    public EmployeesController(IMediator mediator) => _mediator = mediator;

    /// <summary>Paginated, filtered list. Manager confined to own department.</summary>
    [HttpGet]
    [RequireRole(SystemRole.Manager)]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] string? search = null,
        [FromQuery] Guid? departmentId = null, [FromQuery] Guid? designationId = null,
        [FromQuery] EmploymentStatus? status = null, [FromQuery] EmploymentType? employmentType = null,
        [FromQuery] bool includeInactive = false,
        [FromQuery] string? sortBy = null, [FromQuery] string? sortDir = null)
        => Ok(await _mediator.Send(new ListEmployeesQuery
        {
            Page = page, PageSize = pageSize, Search = search,
            DepartmentId = departmentId, DesignationId = designationId,
            Status = status, EmploymentType = employmentType,
            IncludeInactive = includeInactive, SortBy = sortBy, SortDir = sortDir
        }));

    /// <summary>The caller's own employee profile.</summary>
    [HttpGet("me")]
    [RequireRole(SystemRole.Employee)]
    public async Task<IActionResult> Me() => Ok(await _mediator.Send(new GetMyProfileQuery()));

    /// <summary>Change history (salary, status, …) for one employee. Manager confined to own dept.</summary>
    [HttpGet("{id:guid}/history")]
    [RequireRole(SystemRole.Manager)]
    public async Task<IActionResult> History(Guid id)
        => Ok(await _mediator.Send(new GetEmployeeHistoryQuery(id)));

    [HttpGet("{id:guid}")]
    [RequireRole(SystemRole.Manager)]
    public async Task<IActionResult> Get(Guid id) => Ok(await _mediator.Send(new GetEmployeeQuery(id)));

    /// <summary>Download the employee's full record (Basic + all tabs) as a PDF. Manager+.</summary>
    [HttpGet("{id:guid}/pdf")]
    [RequireRole(SystemRole.Manager)]
    public async Task<IActionResult> Pdf(Guid id)
    {
        var bytes = await _mediator.Send(new GetEmployeePdfQuery(id));
        return File(bytes, "application/pdf", $"employee-{id}.pdf");
    }

    /// <summary>Create employee (approvable: New Hire). CompanyAdmin+.</summary>
    [HttpPost]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Create([FromBody] CreateEmployeeCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    /// <summary>Seed demo UAE staff (each with a login) for the company. Idempotent. CompanyAdmin+.</summary>
    [HttpPost("seed-demo")]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> SeedDemo([FromBody] SeedDemoEmployeesCommand command)
        => Ok(await _mediator.Send(command));

    /// <summary>Update profile/employment (not salary). Manager: own department only.</summary>
    [HttpPut("{id:guid}")]
    [RequireRole(SystemRole.Manager)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateEmployeeCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));

    /// <summary>Change salary (approvable: Salary Change). CompanyAdmin+.</summary>
    [HttpPut("{id:guid}/salary")]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> ChangeSalary(Guid id, [FromBody] ChangeEmployeeSalaryCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));

    /// <summary>Change status (approvable: Termination). CompanyAdmin+.</summary>
    [HttpPut("{id:guid}/status")]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> ChangeStatus(Guid id, [FromBody] ChangeEmployeeStatusCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));

    /// <summary>Permanently delete an employee (+ their HR data &amp; login). CompanyAdmin+.</summary>
    [HttpDelete("{id:guid}")]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Delete(Guid id)
        => Ok(await _mediator.Send(new DeleteEmployeeCommand(id)));
}
