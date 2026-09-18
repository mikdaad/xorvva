using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Documents.Entities;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Vouchers.Entities;

namespace Xorva.Modules.Accounting.Documents.Queries.ListDocuments;

public record ListDocumentsQuery : IRequest<ApiResponse<InboxListDto>>
{
    public Guid? CompanyId { get; init; }
    public InboxDocumentStatus? Status { get; init; }
    public DocumentKind? Kind { get; init; }
    public string? Search { get; init; }
    public int Limit { get; init; } = 50;
    public int Offset { get; init; }
}

public record InboxListDto
{
    public List<InboxDocumentDto> Rows { get; init; } = [];
    public int TotalCount { get; init; }
    public Dictionary<string, int> StatusCounts { get; init; } = [];
}

public class ListDocumentsValidator : AbstractValidator<ListDocumentsQuery>
{
    public ListDocumentsValidator()
    {
        RuleFor(x => x.Limit).InclusiveBetween(1, 200);
        RuleFor(x => x.Offset).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Search).MaximumLength(100);
    }
}

public class ListDocumentsHandler : IRequestHandler<ListDocumentsQuery, ApiResponse<InboxListDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListDocumentsHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<InboxListDto>> Handle(ListDocumentsQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var q = _db.Set<AccountingDocument>().AsNoTracking().Where(d => d.CompanyId == companyId);
        if (request.Status is { } s) q = q.Where(d => d.Status == s);
        if (request.Kind is { } k) q = q.Where(d => d.DocumentKind == k);
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim().ToLower();
            q = q.Where(d => d.FileName.ToLower().Contains(term));
        }

        var total = await q.CountAsync(ct);
        var docs = await q.OrderByDescending(d => d.UploadedAt).Skip(request.Offset).Take(request.Limit).ToListAsync(ct);

        var ids = docs.Select(d => d.Id).ToList();
        var latest = (await _db.Set<DocumentExtraction>().AsNoTracking()
                .Where(e => ids.Contains(e.DocumentId)).OrderByDescending(e => e.CreatedAt).ToListAsync(ct))
            .GroupBy(e => e.DocumentId).ToDictionary(g => g.Key, g => g.First());
        var voucherIds = docs.Where(d => d.CreatedVoucherId.HasValue).Select(d => d.CreatedVoucherId!.Value).ToList();
        var vouchers = voucherIds.Count == 0 ? new Dictionary<Guid, string>()
            : await _db.Set<Voucher>().AsNoTracking().Where(v => voucherIds.Contains(v.Id)).ToDictionaryAsync(v => v.Id, v => v.VoucherNumber, ct);

        var counts = await _db.Set<AccountingDocument>().AsNoTracking()
            .Where(d => d.CompanyId == companyId).GroupBy(d => d.Status)
            .Select(g => new { g.Key, Count = g.Count() }).ToListAsync(ct);

        return ApiResponse<InboxListDto>.Ok(new InboxListDto
        {
            Rows = [.. docs.Select(d => d.ToDto(latest.GetValueOrDefault(d.Id), d.CreatedVoucherId is { } v ? vouchers.GetValueOrDefault(v) : null))],
            TotalCount = total,
            StatusCounts = counts.ToDictionary(c => c.Key.ToString(), c => c.Count),
        });
    }
}
