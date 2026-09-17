using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Commands.Files;

/// <summary>Reference to a stored file, returned after upload and used as an Attachment field's value.</summary>
public sealed record HrFileDto(Guid Id, string Url, string FileName, string ContentType, long Size);

/// <summary>Stores an uploaded file (bytes read from the request) for the current company.</summary>
public sealed record UploadHrFileCommand : IRequest<ApiResponse<HrFileDto>>
{
    public Guid? CompanyId { get; init; }
    public string FileName { get; init; } = string.Empty;
    public string ContentType { get; init; } = "application/octet-stream";
    public byte[] Data { get; init; } = [];
}

public sealed class UploadHrFileHandler : IRequestHandler<UploadHrFileCommand, ApiResponse<HrFileDto>>
{
    private const long MaxBytes = 8 * 1024 * 1024; // 8 MB
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    public UploadHrFileHandler(IXorvaDbContext db, ICurrentTenantService tenant) { _db = db; _tenant = tenant; }

    public async Task<ApiResponse<HrFileDto>> Handle(UploadHrFileCommand request, CancellationToken ct)
    {
        if (request.Data.Length == 0) throw new BadRequestException("The file is empty.");
        if (request.Data.Length > MaxBytes) throw new BadRequestException("File is too large (max 8 MB).");

        var companyId = HrGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var file = new HrFile
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            FileName = string.IsNullOrWhiteSpace(request.FileName) ? "file" : request.FileName.Trim(),
            ContentType = string.IsNullOrWhiteSpace(request.ContentType) ? "application/octet-stream" : request.ContentType,
            Size = request.Data.Length,
            Data = request.Data,
        };
        _db.Set<HrFile>().Add(file);
        await _db.SaveChangesAsync(ct);

        // Client-relative (axios baseURL already includes /api); fetched with auth via the client.
        var dto = new HrFileDto(file.Id, $"/hr/files/{file.Id}", file.FileName, file.ContentType, file.Size);
        return ApiResponse<HrFileDto>.Ok(dto, "Uploaded.");
    }
}

/// <summary>Fetches a stored file's bytes for streaming back (company-scoped by the query filter).</summary>
public sealed record GetHrFileQuery(Guid Id) : IRequest<HrFile>;

public sealed class GetHrFileHandler : IRequestHandler<GetHrFileQuery, HrFile>
{
    private readonly IXorvaDbContext _db;
    public GetHrFileHandler(IXorvaDbContext db) => _db = db;

    public async Task<HrFile> Handle(GetHrFileQuery request, CancellationToken ct) =>
        await _db.Set<HrFile>().FirstOrDefaultAsync(f => f.Id == request.Id, ct)
        ?? throw new NotFoundException("File", request.Id);
}
