using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Modules.Accounting.Assets.Commands.CreateFixedAsset;
using Xorva.Modules.Accounting.Assets.Commands.RunDepreciation;
using Xorva.Modules.Accounting.Assets.Queries.ListFixedAssets;

namespace Xorva.API.Controllers;

/// <summary>Fixed asset register + monthly depreciation. Accounting access.</summary>
[ApiController]
[Route("api/accounting/fixed-assets")]
[Authorize]
public class FixedAssetsController : ControllerBase
{
    private readonly IMediator _mediator;
    public FixedAssetsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireAccountingAccess]
    public async Task<IActionResult> List([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListFixedAssetsQuery { CompanyId = companyId }));

    [HttpPost]
    [RequireAccountingAccess]
    public async Task<IActionResult> Create([FromBody] CreateFixedAssetCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    /// <summary>Post one month of straight-line depreciation for all active assets.</summary>
    [HttpPost("run-depreciation")]
    [RequireAccountingAccess]
    public async Task<IActionResult> RunDepreciation([FromBody] RunDepreciationCommand command)
        => Ok(await _mediator.Send(command));
}
