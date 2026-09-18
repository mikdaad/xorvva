using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Common;
using Xorva.Modules.Accounting.Documents.Commands.ExtractDocument;
using Xorva.Modules.Accounting.Documents.Commands.ReviewDocument;
using Xorva.Modules.Accounting.Documents.Commands.UploadDocument;
using Xorva.Modules.Accounting.Documents.Queries.GetDocument;
using Xorva.Modules.Accounting.Documents.Queries.ListDocuments;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.API.Controllers;

/// <summary>
/// AI document inbox — upload supplier/customer invoices (PDF/image), extract with Gemini, review field-by-field,
/// then accept into a voucher. Extraction never posts anything on its own.
/// </summary>
[ApiController]
[Route("api/accounting/documents")]
[Authorize]
[RequireAccountingAccess]
public class DocumentInboxController : ControllerBase
{
    private const long MaxUpload = 20 * 1024 * 1024;
    private readonly IMediator _mediator;
    public DocumentInboxController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid? companyId = null, [FromQuery] InboxDocumentStatus? status = null,
        [FromQuery] DocumentKind? kind = null, [FromQuery] string? search = null, [FromQuery] int limit = 50, [FromQuery] int offset = 0)
        => Ok(await _mediator.Send(new ListDocumentsQuery { CompanyId = companyId, Status = status, Kind = kind, Search = search, Limit = limit, Offset = offset }));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetDocumentQuery { Id = id, CompanyId = companyId }));

    /// <summary>Original file for the preview pane.</summary>
    [HttpGet("{id:guid}/file")]
    public async Task<IActionResult> GetFile(Guid id, [FromQuery] Guid? companyId = null)
    {
        var f = await _mediator.Send(new GetDocumentFileQuery(id, companyId));
        return File(f.Data, f.ContentType, f.FileName);
    }

    /// <summary>Multipart upload: file, optional documentKind (PurchaseInvoice|SalesInvoice|Receipt|Other), tags (comma-separated), extractNow (default true).</summary>
    [HttpPost]
    [RequestSizeLimit(MaxUpload)]
    public async Task<IActionResult> Upload([FromForm] IFormFile file, [FromForm] Guid? companyId = null,
        [FromForm] DocumentKind documentKind = DocumentKind.PurchaseInvoice, [FromForm] string? tags = null, [FromForm] bool extractNow = true)
    {
        if (file is null || file.Length == 0) return BadRequest(ApiResponse.Fail("No file provided."));
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        var result = await _mediator.Send(new UploadDocumentCommand
        {
            CompanyId = companyId, FileName = file.FileName, ContentType = file.ContentType, Data = ms.ToArray(),
            DocumentKind = documentKind, ExtractNow = extractNow,
            Tags = string.IsNullOrWhiteSpace(tags) ? null : [.. tags.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)],
        });
        return StatusCode(StatusCodes.Status201Created, result);
    }

    /// <summary>Run or re-run AI extraction.</summary>
    [HttpPost("{id:guid}/extract")]
    public async Task<IActionResult> Extract(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ExtractDocumentCommand { Id = id, CompanyId = companyId }));

    [HttpPut("{id:guid}/fields")]
    public async Task<IActionResult> OverrideField(Guid id, [FromBody] OverrideDocumentFieldCommand command)
        => Ok(await _mediator.Send(command with { DocumentId = id }));

    [HttpPost("{id:guid}/accept")]
    public async Task<IActionResult> Accept(Guid id, [FromBody] AcceptDocumentExtractionCommand command)
        => Ok(await _mediator.Send(command with { DocumentId = id }));

    [HttpPost("{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] RejectDocumentCommand? command = null)
        => Ok(await _mediator.Send((command ?? new RejectDocumentCommand()) with { DocumentId = id }));
}
