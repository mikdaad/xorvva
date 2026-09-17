using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Contacts.Commands.CreateContact;
using Xorva.Modules.Accounting.Contacts.Commands.UpdateContact;
using Xorva.Modules.Accounting.Contacts.Queries.GetContact;
using Xorva.Modules.Accounting.Contacts.Queries.ListContacts;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.API.Controllers;

/// <summary>Customers &amp; suppliers. Company Admin &amp; above.</summary>
[ApiController]
[Route("api/accounting/contacts")]
[Authorize]
public class ContactsController : ControllerBase
{
    private readonly IMediator _mediator;
    public ContactsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireAccountingAccess]
    public async Task<IActionResult> List([FromQuery] ContactType? role = null,
        [FromQuery] bool includeInactive = false, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListContactsQuery { Role = role, IncludeInactive = includeInactive, CompanyId = companyId }));

    [HttpGet("{id:guid}")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Get(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetContactQuery { Id = id, CompanyId = companyId }));

    [HttpPost]
    [RequireAccountingAccess]
    public async Task<IActionResult> Create([FromBody] CreateContactCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    [HttpPut("{id:guid}")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateContactCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));
}
