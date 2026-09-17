using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Sales.Commands.CreateProduct;
using Xorva.Modules.Accounting.Sales.Queries.ListProducts;

namespace Xorva.API.Controllers;

/// <summary>Sellable items / services used on invoice lines. Company Admin &amp; above.</summary>
[ApiController]
[Route("api/accounting/products")]
[Authorize]
public class ProductsController : ControllerBase
{
    private readonly IMediator _mediator;
    public ProductsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireAccountingAccess]
    public async Task<IActionResult> List([FromQuery] bool includeInactive = false, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListProductsQuery { IncludeInactive = includeInactive, CompanyId = companyId }));

    [HttpPost]
    [RequireAccountingAccess]
    public async Task<IActionResult> Create([FromBody] CreateProductCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));
}
