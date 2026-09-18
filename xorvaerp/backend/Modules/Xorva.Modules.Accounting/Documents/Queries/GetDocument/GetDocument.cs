using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Documents.Entities;
using Xorva.Modules.Accounting.Documents.Services;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Vouchers.Entities;

namespace Xorva.Modules.Accounting.Documents.Queries.GetDocument;

/// <summary>Document + its latest extraction with per-field suggestions — the review screen's payload.</summary>
public record GetDocumentQuery : IRequest<ApiResponse<InboxDocumentDetailDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
}

public class GetDocumentHandler : IRequestHandler<GetDocumentQuery, ApiResponse<InboxDocumentDetailDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IDocumentExtractor _extractor;

    public GetDocumentHandler(IXorvaDbContext db, ICurrentTenantService tenant, IDocumentExtractor extractor)
    {
        _db = db;
        _tenant = tenant;
        _extractor = extractor;
    }

    public async Task<ApiResponse<InboxDocumentDetailDto>> Handle(GetDocumentQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        return ApiResponse<InboxDocumentDetailDto>.Ok(await DocumentReader.LoadAsync(_db, request.Id, companyId, _extractor.IsConfigured, ct));
    }
}

/// <summary>Shared loader so upload/extract/review commands return the same detail shape.</summary>
public static class DocumentReader
{
    public static async Task<InboxDocumentDetailDto> LoadAsync(IXorvaDbContext _db, Guid id, Guid companyId, bool extractionAvailable, CancellationToken ct)
    {
        var doc = await _db.Set<AccountingDocument>().AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == id && d.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Document", id);

        var extraction = await _db.Set<DocumentExtraction>().AsNoTracking()
            .Where(e => e.DocumentId == doc.Id).OrderByDescending(e => e.CreatedAt).FirstOrDefaultAsync(ct);
        var fields = extraction is null ? []
            : await _db.Set<DocumentFieldSuggestion>().AsNoTracking().Where(f => f.ExtractionId == extraction.Id).ToListAsync(ct);
        var voucherNumber = doc.CreatedVoucherId is { } vid
            ? await _db.Set<Voucher>().AsNoTracking().Where(v => v.Id == vid).Select(v => v.VoucherNumber).FirstOrDefaultAsync(ct)
            : null;

        return new InboxDocumentDetailDto
        {
            Document = doc.ToDto(extraction, voucherNumber),
            Extraction = extraction?.ToDto(fields),
            ExtractionAvailable = extractionAvailable,
        };
    }
}

/// <summary>Streams the original file (PDF/image) for the review screen's preview pane.</summary>
public record GetDocumentFileQuery(Guid Id, Guid? CompanyId) : IRequest<DocumentFileResult>;

public record DocumentFileResult(byte[] Data, string ContentType, string FileName);

public class GetDocumentFileHandler : IRequestHandler<GetDocumentFileQuery, DocumentFileResult>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetDocumentFileHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<DocumentFileResult> Handle(GetDocumentFileQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var doc = await _db.Set<AccountingDocument>().AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == request.Id && d.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Document", request.Id);
        var file = await _db.Set<AccountingDocumentFile>().AsNoTracking().FirstOrDefaultAsync(f => f.Id == doc.FileId, ct)
            ?? throw new NotFoundException("Document file", doc.FileId);
        return new DocumentFileResult(file.Data, file.ContentType, file.FileName);
    }
}
