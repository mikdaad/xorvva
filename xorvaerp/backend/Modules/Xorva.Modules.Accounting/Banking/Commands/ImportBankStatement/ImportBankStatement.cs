using System.Text;
using System.Text.Json;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Banking.Entities;
using Xorva.Modules.Accounting.Banking.Import;
using Xorva.Modules.Accounting.Banking.Queries.GetBankStatement;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;

namespace Xorva.Modules.Accounting.Banking.Commands.ImportBankStatement;

/// <summary>Parse-only preview: returns detected bank, period, totals and a sample of rows. Nothing is stored.</summary>
public record PreviewBankStatementCommand : IRequest<ApiResponse<BankCsvPreviewDto>>
{
    public Guid? CompanyId { get; init; }
    public string FileName { get; init; } = string.Empty;
    public byte[] Content { get; init; } = [];
}

public class PreviewBankStatementHandler : IRequestHandler<PreviewBankStatementCommand, ApiResponse<BankCsvPreviewDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public PreviewBankStatementHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<BankCsvPreviewDto>> Handle(PreviewBankStatementCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureAccountingActiveAsync(_db, companyId, ct);
        var parsed = BankCsvParser.Parse(ImportBankStatementHandler.Decode(request.Content));
        return ApiResponse<BankCsvPreviewDto>.Ok(parsed.ToPreviewDto(), parsed.Success
            ? $"{parsed.Lines.Count} rows detected ({parsed.BankFormat.ToUpperInvariant()})."
            : parsed.Errors.FirstOrDefault());
    }
}

/// <summary>
/// Imports a UAE bank CSV for a bank account: parse → <c>accounting.import_bank_statement</c>
/// (header + lines + duplicate-fingerprint skip + auto-suggest, all in one DB call).
/// </summary>
public record ImportBankStatementCommand : IRequest<ApiResponse<BankStatementDetailDto>>
{
    public Guid? CompanyId { get; init; }
    public Guid BankAccountId { get; init; }
    public string FileName { get; init; } = string.Empty;
    public byte[] Content { get; init; } = [];
    public DateOnly? StatementDate { get; init; }
    public decimal? OpeningBalance { get; init; }
    public decimal? ClosingBalance { get; init; }
}

public class ImportBankStatementValidator : AbstractValidator<ImportBankStatementCommand>
{
    public const int MaxBytes = 10 * 1024 * 1024;
    public ImportBankStatementValidator()
    {
        RuleFor(x => x.BankAccountId).NotEmpty();
        RuleFor(x => x.FileName).NotEmpty().MaximumLength(255);
        RuleFor(x => x.Content).NotEmpty().WithMessage("The file is empty.")
            .Must(c => c.Length <= MaxBytes).WithMessage("CSV files up to 10 MB are supported.");
    }
}

public class ImportBankStatementHandler : IRequestHandler<ImportBankStatementCommand, ApiResponse<BankStatementDetailDto>>
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IAccountingRpc _rpc;

    public ImportBankStatementHandler(IXorvaDbContext db, ICurrentTenantService tenant, IAccountingRpc rpc)
    {
        _db = db;
        _tenant = tenant;
        _rpc = rpc;
    }

    public async Task<ApiResponse<BankStatementDetailDto>> Handle(ImportBankStatementCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureAccountingActiveAsync(_db, companyId, ct);

        var bank = await _db.Set<BankAccount>().AsNoTracking()
            .FirstOrDefaultAsync(b => b.Id == request.BankAccountId && b.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Bank account", request.BankAccountId);
        if (!bank.IsActive) throw new BadRequestException($"Bank account '{bank.Name}' is inactive.");

        var parsed = BankCsvParser.Parse(Decode(request.Content));
        if (!parsed.Success)
            throw new BadRequestException(parsed.Errors.Count > 0 ? parsed.Errors : ["The CSV could not be parsed."]);

        var linesJson = JsonSerializer.Serialize(parsed.Lines.Select(l => new
        {
            line_date = l.LineDate.ToString("yyyy-MM-dd"),
            value_date = l.ValueDate?.ToString("yyyy-MM-dd"),
            description = l.Description,
            reference = l.Reference,
            cheque_number = l.ChequeNumber,
            debit = l.Debit,
            credit = l.Credit,
            balance = l.Balance,
            raw_data = l.RawData,
        }), Json);

        var result = await _rpc.ImportBankStatementAsync(bank.Id, request.FileName, parsed.BankFormat, linesJson,
            request.StatementDate, request.OpeningBalance, request.ClosingBalance, ct);

        var detail = await BankStatementReader.LoadAsync(_db, result.StatementId, companyId, null, ct);
        var msg = $"Imported {result.LinesImported} line(s)" + (result.LinesSkipped > 0 ? $", skipped {result.LinesSkipped} duplicate(s)" : "") +
                  $" · {detail.Statement.SuggestedCount} auto-suggested.";
        return ApiResponse<BankStatementDetailDto>.Ok(detail, msg);
    }

    /// <summary>UTF-8 (BOM-tolerant), falling back to Windows-1252 for legacy bank exports.</summary>
    internal static string Decode(byte[] bytes)
    {
        try
        {
            return new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true).GetString(bytes).TrimStart('\uFEFF');
        }
        catch (DecoderFallbackException)
        {
            return Encoding.Latin1.GetString(bytes);
        }
    }
}
