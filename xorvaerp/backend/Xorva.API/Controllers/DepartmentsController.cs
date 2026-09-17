using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Modules.HR.Commands.CreateDepartment;
using Xorva.Modules.HR.Commands.DeleteDepartment;
using Xorva.Modules.HR.Commands.UpdateDepartment;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Queries.ListDepartments;

namespace Xorva.API.Controllers;

[ApiController]
[Route("api/departments")]
[Authorize]
public class DepartmentsController : ControllerBase
{
    private readonly IMediator _mediator;
    public DepartmentsController(IMediator mediator) => _mediator = mediator;

    /// <summary>List departments (all HR roles, company-scoped).</summary>
    [HttpGet]
    [RequireRole(SystemRole.Employee)]
    public async Task<IActionResult> List([FromQuery] bool includeInactive = false, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListDepartmentsQuery { IncludeInactive = includeInactive, CompanyId = companyId }));

    [HttpPost]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Create([FromBody] CreateDepartmentCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    [HttpPut("{id:guid}")]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateDepartmentCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));

    [HttpDelete("{id:guid}")]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Delete(Guid id)
        => Ok(await _mediator.Send(new DeleteDepartmentCommand(id)));
}
