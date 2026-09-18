using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Vouchers.Commands.CancelVoucher;
using Xorva.Modules.Accounting.Vouchers.Commands.ReverseVoucher;
using Xorva.Modules.Accounting.Vouchers.Commands.SaveAndPostVoucher;
using Xorva.Modules.Accounting.Vouchers.Queries.GetVoucher;
using Xorva.Modules.Accounting.Vouchers.Queries.GetVoucherTypes;
using Xorva.Modules.Accounting.Vouchers.Queries.ListVouchers;

namespace Xorva.API.Controllers;

/// <summary>
/// Tally-style voucher entry (F4 Contra · F5 Payment · F6 Receipt · F7 Journal · F8 Sales · F9 Purchase)
/// and the transaction register. Ported from TrueLedge; posts through <c>accounting.post_voucher_atomic</c>.
/// </summary>
[ApiController]
[Route("api/accounting/vouchers")]
[Authorize]
[RequireAccountingAccess]
public class VouchersController : ControllerBase
{
    private readonly IMediator _mediator;
    public VouchersController(IMediator mediator) => _mediator = mediator;

    /// <summary>F4–F9 catalogue for the entry screen's type switcher.</summary>
    [HttpGet("types")]
    public async Task<IActionResult> Types() => Ok(await _mediator.Send(new GetVoucherTypesQuery()));

    /// <summary>Transaction register (day book) with paging + filters.</summary>
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] Guid? companyId = null, [FromQuery] DateOnly? from = null, [FromQuery] DateOnly? to = null,
        [FromQuery] VoucherType? type = null, [FromQuery] VoucherStatus? status = null, [FromQuery] Guid? contactId = null,
        [FromQuery] string? search = null, [FromQuery] int limit = 50, [FromQuery] int offset = 0)
        => Ok(await _mediator.Send(new ListVouchersQuery
        {
            CompanyId = companyId, From = from, To = to, VoucherType = type, Status = status,
            ContactId = contactId, Search = search, Limit = limit, Offset = offset,
        }));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetVoucherQuery { Id = id, CompanyId = companyId }));

    /// <summary>Save + post in one call (or SaveAsDraft = true to park it). Pass VoucherId to update-and-post an existing draft.</summary>
    [HttpPost]
    public async Task<IActionResult> SaveAndPost([FromBody] SaveAndPostVoucherCommand command)
    {
        var result = await _mediator.Send(command);
        return command.VoucherId is null && !result.PendingApproval
            ? StatusCode(StatusCodes.Status201Created, result)
            : Ok(result);
    }

    /// <summary>Update-and-post an existing draft (same body as POST; the route id wins).</summary>
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateAndPost(Guid id, [FromBody] SaveAndPostVoucherCommand command)
        => Ok(await _mediator.Send(command with { VoucherId = id }));

    [HttpPost("{id:guid}/reverse")]
    public async Task<IActionResult> Reverse(Guid id, [FromBody] ReverseVoucherCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelVoucherCommand? command = null)
        => Ok(await _mediator.Send((command ?? new CancelVoucherCommand()) with { Id = id }));
}
