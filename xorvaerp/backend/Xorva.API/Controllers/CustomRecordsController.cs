using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.Modules.Platform.Commands.CreateCustomRecord;
using Xorva.Modules.Platform.Commands.DeleteCustomRecord;
using Xorva.Modules.Platform.Commands.UpdateCustomRecord;
using Xorva.Modules.Platform.Queries.ListCustomRecords;

namespace Xorva.API.Controllers;

/// <summary>
/// The data side of the dynamic engine: create / read / update / delete rows of any
/// custom sub-module. One controller serves every EntityDefinition — the values are
/// validated server-side against that definition's fields.
/// </summary>
[ApiController]
[Route("api/platform/records")]
[Authorize]
public class CustomRecordsController : ControllerBase
{
    private readonly IMediator _mediator;
    public CustomRecordsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid entityDefinitionId, [FromQuery] Guid? companyId = null, [FromQuery] Guid? parentId = null)
        => Ok(await _mediator.Send(new ListCustomRecordsQuery(entityDefinitionId, companyId, parentId)));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCustomRecordCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCustomRecordCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
        => Ok(await _mediator.Send(new DeleteCustomRecordCommand(id)));
}
