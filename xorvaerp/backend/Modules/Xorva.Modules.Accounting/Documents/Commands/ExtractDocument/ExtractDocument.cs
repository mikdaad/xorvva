using System.Text.Json;
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
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Documents.Commands.ExtractDocument;

/// <summary>
/// Runs (or re-runs) AI extraction on an inbox document: begin → Gemini with the company's masters →
/// <c>complete_document_extraction</c> (stores JSON + per-field suggestions) or <c>fail_document_extraction</c>.
/// Never creates a voucher — that is the explicit Accept step.
/// </summary>
public record ExtractDocumentCommand : IRequest<ApiResponse<InboxDocumentDetailDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
}

public class ExtractDocumentHandler : IRequestHandler<ExtractDocumentCommand, ApiResponse<InboxDocumentDetailDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IAccountingRpc _rpc;
    private readonly IDocumentExtractor _extractor;
    private readonly IPartyDirectory _parties;

    public ExtractDocumentHandler(IXorvaDbContext db, ICurrentTenantService tenant, IAccountingRpc rpc, IDocumentExtractor extractor, IPartyDirectory parties)
    {
        _db = db;
        _tenant = tenant;
        _rpc = rpc;
        _extractor = extractor;
        _parties = parties;
    }

    public async Task<ApiResponse<InboxDocumentDetailDto>> Handle(ExtractDocumentCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var document = await _db.Set<AccountingDocument>().AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == request.Id && d.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Document", request.Id);
        if (document.Status is InboxDocumentStatus.Accepted)
            throw new ConflictException("This document has already been accepted into a voucher.");

        if (!_extractor.IsConfigured)
        {
            var stored = await DocumentReader.LoadAsync(_db, document.Id, companyId, false, ct);
            return ApiResponse<InboxDocumentDetailDto>.Ok(stored, "Document stored. AI extraction is not configured (set Gemini:ApiKey) — enter the voucher manually.");
        }

        var file = await _db.Set<AccountingDocumentFile>().AsNoTracking()
            .Where(f => f.Id == document.FileId).Select(f => new { f.Data, f.ContentType }).FirstAsync(ct);

        var masters = await LoadMastersAsync(companyId, document.DocumentKind, ct);

        await _rpc.BeginDocumentExtractionAsync(document.Id, ct);
        var result = await _extractor.ExtractInvoiceAsync(file.Data, file.ContentType, masters, ct);

        string message;
        if (result.Success && result.ExtractedJson is { } json)
        {
            await _rpc.CompleteDocumentExtractionAsync(document.Id, json.GetRawText(), result.RawResponseJson,
                result.ModelUsed, result.ModelVersion, result.ProcessingTimeMs, ct);
            var conf = json.TryGetProperty("overall_confidence", out var c) && c.ValueKind == JsonValueKind.Number ? c.GetDecimal() : 0m;
            message = DocumentInboxMappers.ConfidenceLevel(conf) switch
            {
                "high" => "Extracted with high confidence — review and accept.",
                "medium" => "Extracted — review recommended before accepting.",
                _ => "Extracted with low confidence — manual entry may be faster.",
            };
        }
        else
        {
            await _rpc.FailDocumentExtractionAsync(document.Id, result.Error ?? "Extraction failed.", ct);
            message = result.Error ?? "Extraction failed.";
        }

        var detail = await DocumentReader.LoadAsync(_db, document.Id, companyId, true, ct);
        return ApiResponse<InboxDocumentDetailDto>.Ok(detail, message);
    }

    /// <summary>Parties/items/expense accounts the model may match against (capped to keep the prompt small).</summary>
    private async Task<ExtractionMasters> LoadMastersAsync(Guid companyId, DocumentKind kind, CancellationToken ct)
    {
        var partyType = kind == DocumentKind.SalesInvoice ? ContactType.Customer : ContactType.Supplier;
        var parties = (await _parties.ListPartiesAsync(companyId, partyType, 300, ct))
            .Select(c => new ExtractionMasterParty(c.Id, c.Name, c.TaxNumber)).ToList();
        var items = (await _parties.ListItemsAsync(companyId, 300, ct))
            .Select(p => new ExtractionMasterItem(p.Id, p.Name, p.PurchaseAccountId ?? p.SalesAccountId, p.PurchaseTaxRateId ?? p.TaxRateId)).ToList();
        var accountTypes = kind == DocumentKind.SalesInvoice ? new[] { AccountType.Revenue } : new[] { AccountType.Expense, AccountType.Asset };
        var accounts = await _db.Set<Account>().AsNoTracking()
            .Where(a => a.CompanyId == companyId && a.IsActive && !a.IsGroup && accountTypes.Contains(a.AccountType))
            .OrderBy(a => a.Code).Take(300)
            .Select(a => new ExtractionMasterAccount(a.Id, a.Code + " " + a.Name)).ToListAsync(ct);
        return new ExtractionMasters(parties, items, accounts);
    }
}
