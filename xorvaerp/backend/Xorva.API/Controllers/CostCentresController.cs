using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Modules.Accounting.CostCentres.Commands.DeleteCostCentre;
using Xorva.Modules.Accounting.CostCentres.Commands.UpsertCostCentre;
using Xorva.Modules.Accounting.CostCentres.Commands.UpsertCostCentreDimension;
using Xorva.Modules.Accounting.CostCentres.Queries.GetCostCentreReport;
using Xorva.Modules.Accounting.CostCentres.Queries.ListCostCentres;

namespace Xorva.API.Controllers;

/// <summary>Cost-centre dimensions (Project / Department / Location …) and their trees, plus the cost-centre report.</summary>
[ApiController]
[Route("api/accounting/cost-centres")]
[Authorize]
[RequireAccountingAccess]
public class CostCentresController : ControllerBase
{
    private readonly IMediator _mediator;
    public CostCentresController(IMediator mediator) => _mediator = mediator;

    // ── dimensions ──
    [HttpGet("dimensions")]
    public async Task<IActionResult> ListDimensions([FromQuery] Guid? companyId = null, [FromQuery] bool includeInactive = false)
        => Ok(await _mediator.Send(new ListCostCentreDimensionsQuery { CompanyId = companyId, IncludeInactive = includeInactive }));

    [HttpPost("dimensions")]
    public async Task<IActionResult> CreateDimension([FromBody] UpsertCostCentreDimensionCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command with { Id = null }));

    [HttpPut("dimensions/{id:guid}")]
    public async Task<IActionResult> UpdateDimension(Guid id, [FromBody] UpsertCostCentreDimensionCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));

    // ── cost centres ──
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid? companyId = null, [FromQuery] Guid? dimensionId = null,
        [FromQuery] bool includeInactive = false, [FromQuery] bool leavesOnly = false)
        => Ok(await _mediator.Send(new ListCostCentresQuery { CompanyId = companyId, DimensionId = dimensionId, IncludeInactive = includeInactive, LeavesOnly = leavesOnly }));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertCostCentreCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command with { Id = null }));

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpsertCostCentreCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new DeleteCostCentreCommand { Id = id, CompanyId = companyId }));

    // ── report ──
    [HttpGet("report")]
    public async Task<IActionResult> Report([FromQuery] Guid? companyId = null, [FromQuery] Guid? dimensionId = null,
        [FromQuery] DateOnly? from = null, [FromQuery] DateOnly? to = null)
        => Ok(await _mediator.Send(new GetCostCentreReportQuery { CompanyId = companyId, DimensionId = dimensionId, From = from, To = to }));
}
