using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Documents.Entities;
using Xorva.Modules.Accounting.Documents.Queries.GetDocument;
using Xorva.Modules.Accounting.Documents.Services;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Vouchers.Entities;

namespace Xorva.Modules.Accounting.Documents.Commands.ReviewDocument;

/// <summary>User corrects one extracted field on the review screen (<c>override_document_field</c>; FinalValue is recomputed by trigger).</summary>
public record OverrideDocumentFieldCommand : IRequest<ApiResponse<InboxDocumentDetailDto>>
{
    public Guid DocumentId { get; init; }
    public Guid? CompanyId { get; init; }
    public string FieldName { get; init; } = string.Empty;
    /// <summary>Null clears the override and falls back to the extracted value.</summary>
    public string? Value { get; init; }
}

public class OverrideDocumentFieldValidator : AbstractValidator<OverrideDocumentFieldCommand>
{
    public OverrideDocumentFieldValidator()
    {
        RuleFor(x => x.DocumentId).NotEmpty();
        RuleFor(x => x.FieldName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Value).MaximumLength(1000);
    }
}

public class OverrideDocumentFieldHandler : IRequestHandler<OverrideDocumentFieldCommand, ApiResponse<InboxDocumentDetailDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IAccountingRpc _rpc;
    private readonly IDocumentExtractor _extractor;

    public OverrideDocumentFieldHandler(IXorvaDbContext db, ICurrentTenantService tenant, IAccountingRpc rpc, IDocumentExtractor extractor)
    {
        _db = db;
        _tenant = tenant;
        _rpc = rpc;
        _extractor = extractor;
    }

    public async Task<ApiResponse<InboxDocumentDetailDto>> Handle(OverrideDocumentFieldCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var extraction = await LatestExtractionAsync(_db, request.DocumentId, companyId, ct);
        if (extraction.IsAccepted) throw new ConflictException("This extraction was already accepted — corrections go on the voucher now.");

        await _rpc.OverrideDocumentFieldAsync(extraction.Id, request.FieldName.Trim(), string.IsNullOrWhiteSpace(request.Value) ? null : request.Value.Trim(), ct);

        var detail = await DocumentReader.LoadAsync(_db, request.DocumentId, companyId, _extractor.IsConfigured, ct);
        return ApiResponse<InboxDocumentDetailDto>.Ok(detail, "Field updated.");
    }

    internal static async Task<DocumentExtraction> LatestExtractionAsync(IXorvaDbContext db, Guid documentId, Guid companyId, CancellationToken ct)
    {
        var exists = await db.Set<AccountingDocument>().AnyAsync(d => d.Id == documentId && d.CompanyId == companyId, ct);
        if (!exists) throw new NotFoundException("Document", documentId);
        return await db.Set<DocumentExtraction>().AsNoTracking()
            .Where(e => e.DocumentId == documentId).OrderByDescending(e => e.CreatedAt).FirstOrDefaultAsync(ct)
            ?? throw new BadRequestException("This document has not been extracted yet.");
    }
}

/// <summary>
/// Human accepts the reviewed extraction and links it to the voucher they created from it
/// (the UI opens the F8/F9 entry screen pre-filled, posts or drafts it via /vouchers, then calls this with the id).
/// <c>accept_document_extraction</c> flips the document to Accepted.
/// </summary>
public record AcceptDocumentExtractionCommand : IRequest<ApiResponse<InboxDocumentDetailDto>>
{
    public Guid DocumentId { get; init; }
    public Guid? CompanyId { get; init; }
    public Guid VoucherId { get; init; }
}

public class AcceptDocumentExtractionValidator : AbstractValidator<AcceptDocumentExtractionCommand>
{
    public AcceptDocumentExtractionValidator()
    {
        RuleFor(x => x.DocumentId).NotEmpty();
        RuleFor(x => x.VoucherId).NotEmpty();
    }
}

public class AcceptDocumentExtractionHandler : IRequestHandler<AcceptDocumentExtractionCommand, ApiResponse<InboxDocumentDetailDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IAccountingRpc _rpc;
    private readonly IDocumentExtractor _extractor;

    public AcceptDocumentExtractionHandler(IXorvaDbContext db, ICurrentTenantService tenant, IAccountingRpc rpc, IDocumentExtractor extractor)
    {
        _db = db;
        _tenant = tenant;
        _rpc = rpc;
        _extractor = extractor;
    }

    public async Task<ApiResponse<InboxDocumentDetailDto>> Handle(AcceptDocumentExtractionCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var extraction = await OverrideDocumentFieldHandler.LatestExtractionAsync(_db, request.DocumentId, companyId, ct);
        if (extraction.IsAccepted) throw new ConflictException("This extraction was already accepted.");

        var voucher = await _db.Set<Voucher>().AsNoTracking()
            .FirstOrDefaultAsync(v => v.Id == request.VoucherId && v.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Voucher", request.VoucherId);
        if (voucher.Status is VoucherStatus.Cancelled or VoucherStatus.Reversed)
            throw new BadRequestException($"Voucher {voucher.VoucherNumber} is {voucher.Status} and cannot be linked.");
        if (await _db.Set<AccountingDocument>().AnyAsync(d => d.CreatedVoucherId == voucher.Id && d.Id != request.DocumentId, ct))
            throw new ConflictException($"Voucher {voucher.VoucherNumber} is already linked to another document.");

        await _rpc.AcceptDocumentExtractionAsync(extraction.Id, voucher.Id, ct);

        var detail = await DocumentReader.LoadAsync(_db, request.DocumentId, companyId, _extractor.IsConfigured, ct);
        return ApiResponse<InboxDocumentDetailDto>.Ok(detail, $"Linked to {voucher.VoucherNumber}.");
    }
}

/// <summary>Reject a document (not an invoice, duplicate, unreadable…). Kept for audit; never deleted.</summary>
public record RejectDocumentCommand : IRequest<ApiResponse<InboxDocumentDetailDto>>
{
    public Guid DocumentId { get; init; }
    public Guid? CompanyId { get; init; }
    public string? Reason { get; init; }
}

public class RejectDocumentHandler : IRequestHandler<RejectDocumentCommand, ApiResponse<InboxDocumentDetailDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IAccountingRpc _rpc;
    private readonly IDocumentExtractor _extractor;

    public RejectDocumentHandler(IXorvaDbContext db, ICurrentTenantService tenant, IAccountingRpc rpc, IDocumentExtractor extractor)
    {
        _db = db;
        _tenant = tenant;
        _rpc = rpc;
        _extractor = extractor;
    }

    public async Task<ApiResponse<InboxDocumentDetailDto>> Handle(RejectDocumentCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var doc = await _db.Set<AccountingDocument>().AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId && d.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Document", request.DocumentId);
        if (doc.Status == InboxDocumentStatus.Accepted) throw new ConflictException("An accepted document cannot be rejected — reverse the voucher instead.");

        await _rpc.RejectDocumentAsync(doc.Id, string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim(), ct);

        var detail = await DocumentReader.LoadAsync(_db, doc.Id, companyId, _extractor.IsConfigured, ct);
        return ApiResponse<InboxDocumentDetailDto>.Ok(detail, "Document rejected.");
    }
}
