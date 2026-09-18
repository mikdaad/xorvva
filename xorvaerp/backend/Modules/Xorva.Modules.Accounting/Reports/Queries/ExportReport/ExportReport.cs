using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Entities;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Reports.Export;

namespace Xorva.Modules.Accounting.Reports.Queries.ExportReport;

public enum ExportReportType { BalanceSheet, Ledger, Transactions, TrialBalance }
public enum ExportFormat { Pdf, Xlsx }

public sealed record ExportedFile(string FileName, string ContentType, byte[] Content);

/// <summary>
/// Port of TrueLedge <c>POST /api/reports/export</c>: builds the report through the same RPCs the screens use and
/// renders it as PDF or XLSX. Returns the raw file (not an ApiResponse) — the controller streams it as an attachment.
/// </summary>
public record ExportReportQuery : IRequest<ExportedFile>
{
    public Guid? CompanyId { get; init; }
    public ExportReportType ReportType { get; init; }
    public ExportFormat Format { get; init; } = ExportFormat.Pdf;
    public DateOnly? AsOf { get; init; }
    public Guid? AccountId { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
    public VoucherType? VoucherType { get; init; }
    public VoucherStatus? Status { get; init; }
    public Guid? ContactId { get; init; }
    public Guid? CostCentreId { get; init; }
    public string? Search { get; init; }
}

public class ExportReportValidator : AbstractValidator<ExportReportQuery>
{
    public ExportReportValidator()
    {
        RuleFor(x => x.ReportType).IsInEnum();
        RuleFor(x => x.Format).IsInEnum();
        RuleFor(x => x.AccountId).NotEmpty().When(x => x.ReportType == ExportReportType.Ledger).WithMessage("accountId is required for a ledger export.");
        RuleFor(x => x).Must(x => x.From is null || x.To is null || x.To >= x.From).WithMessage("'to' must be on or after 'from'.");
    }
}

public class ExportReportHandler : IRequestHandler<ExportReportQuery, ExportedFile>
{
    private const int MaxRegisterRows = 10_000;

    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IAccountingRpc _rpc;

    public ExportReportHandler(IXorvaDbContext db, ICurrentTenantService tenant, IAccountingRpc rpc)
    {
        _db = db;
        _tenant = tenant;
        _rpc = rpc;
    }

    public async Task<ExportedFile> Handle(ExportReportQuery request, CancellationToken ct)
    {
        var scope = AccountingGuard.ResolveReportScope(_tenant, request.CompanyId);
        var (entityName, baseCurrency) = await EntityAsync(scope, ct);

        ReportTable table = request.ReportType switch
        {
            ExportReportType.BalanceSheet => ReportTableBuilders.BalanceSheet(
                await _rpc.GetBalanceSheetAsync(scope, request.AsOf ?? DateOnly.FromDateTime(DateTime.UtcNow), ct)),

            ExportReportType.Ledger => ReportTableBuilders.LedgerStatement(
                await _rpc.GetLedgerStatementAsync(await LedgerAccountAsync(request.AccountId!.Value, scope, ct), request.From, request.To, request.CostCentreId, ct)),

            ExportReportType.Transactions => ReportTableBuilders.TransactionRegister(entityName, baseCurrency,
                await _rpc.GetTransactionRegisterAsync(scope, request.From, request.To, request.VoucherType, request.Status, request.ContactId,
                    string.IsNullOrWhiteSpace(request.Search) ? null : request.Search.Trim(), MaxRegisterRows, 0, ct), request.From, request.To),

            ExportReportType.TrialBalance => ReportTableBuilders.TrialBalance(entityName, baseCurrency,
                await _rpc.GetTrialBalanceAsync(scope, request.From, request.To, ct), request.From, request.To),

            _ => throw new BadRequestException("Unknown report type."),
        };

        return request.Format == ExportFormat.Xlsx
            ? new ExportedFile(table.FileStem + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", XlsxWriter.Write(table, SheetName(request.ReportType)))
            : new ExportedFile(table.FileStem + ".pdf", "application/pdf", PdfWriter.Write(table));
    }

    private async Task<(string Name, string Currency)> EntityAsync(Guid? scope, CancellationToken ct)
    {
        if (scope is { } companyId)
        {
            var name = await _db.Set<Company>().Where(c => c.Id == companyId).Select(c => c.Name).FirstOrDefaultAsync(ct) ?? "Company";
            var currency = await _db.Set<AccountingSettings>().Where(s => s.CompanyId == companyId).Select(s => s.BaseCurrency).FirstOrDefaultAsync(ct) ?? "AED";
            return (name, currency);
        }
        var tenantName = await _db.Set<Tenant>().Where(t => t.Id == _tenant.TenantId).Select(t => t.Name).FirstOrDefaultAsync(ct) ?? "All companies";
        return ($"{tenantName} — all companies", "AED");
    }

    private async Task<Guid> LedgerAccountAsync(Guid accountId, Guid? scope, CancellationToken ct)
    {
        var q = _db.Set<Account>().Where(a => a.Id == accountId);
        if (scope is { } companyId) q = q.Where(a => a.CompanyId == companyId);
        return await q.AnyAsync(ct) ? accountId : throw new NotFoundException("Account", accountId);
    }

    private static string SheetName(ExportReportType type) => type switch
    {
        ExportReportType.BalanceSheet => "Balance Sheet",
        ExportReportType.Ledger => "Ledger",
        ExportReportType.Transactions => "Transactions",
        _ => "Trial Balance",
    };
}
