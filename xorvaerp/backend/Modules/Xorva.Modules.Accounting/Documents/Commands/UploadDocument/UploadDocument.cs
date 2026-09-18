using FluentValidation;
using MediatR;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Documents.Commands.ExtractDocument;
using Xorva.Modules.Accounting.Documents.Queries.GetDocument;
using Xorva.Modules.Accounting.Documents.Services;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Documents.Commands.UploadDocument;

/// <summary>
/// Drop a PDF/image into the AI inbox (<c>accounting.upload_document</c> stores file + document row, de-duplicating
/// by SHA-256). With <see cref="ExtractNow"/> the Gemini extraction runs immediately in the same request.
/// </summary>
public record UploadDocumentCommand : IRequest<ApiResponse<InboxDocumentDetailDto>>
{
    public Guid? CompanyId { get; init; }
    public string FileName { get; init; } = string.Empty;
    public string ContentType { get; init; } = string.Empty;
    public byte[] Data { get; init; } = [];
    public DocumentKind DocumentKind { get; init; } = DocumentKind.PurchaseInvoice;
    public List<string>? Tags { get; init; }
    public bool ExtractNow { get; init; } = true;
}

public class UploadDocumentValidator : AbstractValidator<UploadDocumentCommand>
{
    public const int MaxBytes = 20 * 1024 * 1024;
    private static readonly HashSet<string> Allowed = new(StringComparer.OrdinalIgnoreCase)
        { "application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif" };

    public UploadDocumentValidator()
    {
        RuleFor(x => x.FileName).NotEmpty().MaximumLength(255);
        RuleFor(x => x.ContentType).NotEmpty().Must(ct => Allowed.Contains(ct))
            .WithMessage("Upload a PDF or an image (JPEG, PNG, WEBP, HEIC).");
        RuleFor(x => x.Data).NotEmpty().WithMessage("The file is empty.")
            .Must(d => d.Length <= MaxBytes).WithMessage("Files up to 20 MB are supported.");
        RuleFor(x => x.DocumentKind).IsInEnum();
        RuleForEach(x => x.Tags).NotEmpty().MaximumLength(50);
    }
}

public class UploadDocumentHandler : IRequestHandler<UploadDocumentCommand, ApiResponse<InboxDocumentDetailDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IAccountingRpc _rpc;
    private readonly IDocumentExtractor _extractor;
    private readonly IMediator _mediator;

    public UploadDocumentHandler(IXorvaDbContext db, ICurrentTenantService tenant, IAccountingRpc rpc, IDocumentExtractor extractor, IMediator mediator)
    {
        _db = db;
        _tenant = tenant;
        _rpc = rpc;
        _extractor = extractor;
        _mediator = mediator;
    }

    public async Task<ApiResponse<InboxDocumentDetailDto>> Handle(UploadDocumentCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureAccountingActiveAsync(_db, companyId, ct);

        var tags = request.Tags?.Select(t => t.Trim()).Where(t => t.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var documentId = await _rpc.UploadDocumentAsync(companyId, request.FileName, request.ContentType, request.Data, request.DocumentKind, tags, ct);

        if (request.ExtractNow)
            return await _mediator.Send(new ExtractDocumentCommand { Id = documentId, CompanyId = companyId }, ct);

        return ApiResponse<InboxDocumentDetailDto>.Ok(await DocumentReader.LoadAsync(_db, documentId, companyId, _extractor.IsConfigured, ct), "Document uploaded.");
    }
}
