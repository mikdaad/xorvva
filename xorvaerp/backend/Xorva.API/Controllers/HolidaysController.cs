using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.HR.Commands.Holidays;

namespace Xorva.API.Controllers;

[ApiController]
[Route("api/holidays")]
[Authorize]
public class HolidaysController : ControllerBase
{
    private readonly IMediator _mediator;
    public HolidaysController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireRole(SystemRole.Employee)]
    public async Task<IActionResult> List([FromQuery] int? year = null)
        => Ok(await _mediator.Send(new ListHolidaysQuery(year)));

    [HttpPost]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Create([FromBody] CreateHolidayCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    [HttpDelete("{id:guid}")]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Delete(Guid id)
        => Ok(await _mediator.Send(new DeleteHolidayCommand(id)));
}
