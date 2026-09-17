using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.HR.Commands.PostPayRun;
using Xorva.Modules.HR.Commands.RunPayroll;
using Xorva.Modules.HR.Queries.GetPayRun;
using Xorva.Modules.HR.Queries.ListPayRuns;

namespace Xorva.API.Controllers;

/// <summary>Payroll (HR). Running a pay run generates payslips; posting it accrues the salary journal.</summary>
[ApiController]
[Route("api/payroll")]
[Authorize]
public class PayrollController : ControllerBase
{
    private readonly IMediator _mediator;
    public PayrollController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> List([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListPayRunsQuery { CompanyId = companyId }));

    [HttpGet("{id:guid}")]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Get(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetPayRunQuery { Id = id, CompanyId = companyId }));

    [HttpPost]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Run([FromBody] RunPayrollCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    /// <summary>Post the pay run → salary journal (DR Salary Expense / CR Salary Payable).</summary>
    [HttpPost("{id:guid}/post")]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Post(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new PostPayRunCommand { Id = id, CompanyId = companyId }));
}
