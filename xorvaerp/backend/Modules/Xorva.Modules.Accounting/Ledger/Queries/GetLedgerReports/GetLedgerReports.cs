using System.Text.Json;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Banking.Entities;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Ledger.Queries.GetLedgerReports;

// ─────────────────────────────────────────────────────────────────────────────
// SQL-computed reports ported from TrueLedge (Sql/Accounting/0007). They return the JSONB the
// RPC builds (camelCase keys identical to trueledge/src/lib/reports/types.ts) so the ported
// React report components render them unchanged. Xorva's existing C# reports are untouched.
// ─────────────────────────────────────────────────────────────────────────────

/// <summary>accounting.get_balance_sheet — grouped assets / liabilities / equity with retained earnings roll-up.</summary>
public record GetLedgerBalanceSheetQuery : IRequest<ApiResponse<JsonElement>>
{
    public Guid? CompanyId { get; init; }
    public DateOnly? AsOf { get; init; }
}

public class GetLedgerBalanceSheetHandler : IRequestHandler<GetLedgerBalanceSheetQuery, ApiResponse<JsonElement>>
{
    private readonly ICurrentTenantService _tenant;
    private readonly IAccountingRpc _rpc;

    public GetLedgerBalanceSheetHandler(ICurrentTenantService tenant, IAccountingRpc rpc)
    {
        _tenant = tenant;
        _rpc = rpc;
    }

    public async Task<ApiResponse<JsonElement>> Handle(GetLedgerBalanceSheetQuery request, CancellationToken ct)
    {
        var scope = AccountingGuard.ResolveReportScope(_tenant, request.CompanyId);
        var json = await _rpc.GetBalanceSheetAsync(scope, request.AsOf ?? DateOnly.FromDateTime(DateTime.UtcNow), ct);
        return ApiResponse<JsonElement>.Ok(json);
    }
}

/// <summary>accounting.get_ledger_statement — one account's running-balance statement, optionally one cost centre.</summary>
public record GetLedgerStatementQuery : IRequest<ApiResponse<JsonElement>>
{
    public Guid AccountId { get; init; }
    public Guid? CompanyId { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
    public Guid? CostCentreId { get; init; }
}

public class GetLedgerStatementValidator : AbstractValidator<GetLedgerStatementQuery>
{
    public GetLedgerStatementValidator()
    {
        RuleFor(x => x.AccountId).NotEmpty();
        RuleFor(x => x).Must(x => x.From is null || x.To is null || x.From <= x.To).WithMessage("'From' must be on or before 'To'.");
    }
}

public class GetLedgerStatementHandler : IRequestHandler<GetLedgerStatementQuery, ApiResponse<JsonElement>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IAccountingRpc _rpc;

    public GetLedgerStatementHandler(IXorvaDbContext db, ICurrentTenantService tenant, IAccountingRpc rpc)
    {
        _db = db;
        _tenant = tenant;
        _rpc = rpc;
    }

    public async Task<ApiResponse<JsonElement>> Handle(GetLedgerStatementQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        if (!await _db.Set<Account>().AnyAsync(a => a.Id == request.AccountId && a.CompanyId == companyId, ct))
            throw new NotFoundException("Account", request.AccountId);
        var json = await _rpc.GetLedgerStatementAsync(request.AccountId, request.From, request.To, request.CostCentreId, ct);
        return ApiResponse<JsonElement>.Ok(json);
    }
}

/// <summary>accounting.get_bank_reconciliation_summary — book balance vs statement, matched/unmatched totals as of a date.</summary>
public record GetBankReconciliationSummaryQuery : IRequest<ApiResponse<JsonElement>>
{
    public Guid BankAccountId { get; init; }
    public Guid? CompanyId { get; init; }
    public DateOnly? AsOf { get; init; }
}

public class GetBankReconciliationSummaryHandler : IRequestHandler<GetBankReconciliationSummaryQuery, ApiResponse<JsonElement>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IAccountingRpc _rpc;

    public GetBankReconciliationSummaryHandler(IXorvaDbContext db, ICurrentTenantService tenant, IAccountingRpc rpc)
    {
        _db = db;
        _tenant = tenant;
        _rpc = rpc;
    }

    public async Task<ApiResponse<JsonElement>> Handle(GetBankReconciliationSummaryQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        if (!await _db.Set<BankAccount>().AnyAsync(b => b.Id == request.BankAccountId && b.CompanyId == companyId, ct))
            throw new NotFoundException("Bank account", request.BankAccountId);
        var json = await _rpc.GetBankReconciliationSummaryAsync(request.BankAccountId, request.AsOf ?? DateOnly.FromDateTime(DateTime.UtcNow), ct);
        return ApiResponse<JsonElement>.Ok(json);
    }
}

/// <summary>accounting.get_trial_balance — opening / period / closing columns per account, group rows included.</summary>
public record GetLedgerTrialBalanceQuery : IRequest<ApiResponse<List<TrialBalanceRowDto>>>
{
    public Guid? CompanyId { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
}

public record TrialBalanceRowDto(
    Guid AccountId, string Code, string Name, string AccountType, string AccountSubType, bool IsGroup,
    decimal OpeningDebit, decimal OpeningCredit, decimal PeriodDebit, decimal PeriodCredit, decimal ClosingDebit, decimal ClosingCredit);

public class GetLedgerTrialBalanceHandler : IRequestHandler<GetLedgerTrialBalanceQuery, ApiResponse<List<TrialBalanceRowDto>>>
{
    private readonly ICurrentTenantService _tenant;
    private readonly IAccountingRpc _rpc;

    public GetLedgerTrialBalanceHandler(ICurrentTenantService tenant, IAccountingRpc rpc)
    {
        _tenant = tenant;
        _rpc = rpc;
    }

    public async Task<ApiResponse<List<TrialBalanceRowDto>>> Handle(GetLedgerTrialBalanceQuery request, CancellationToken ct)
    {
        var scope = AccountingGuard.ResolveReportScope(_tenant, request.CompanyId);
        var rows = await _rpc.GetTrialBalanceAsync(scope, request.From, request.To, ct);
        return ApiResponse<List<TrialBalanceRowDto>>.Ok([.. rows.Select(r => new TrialBalanceRowDto(
            r.AccountId, r.Code, r.Name, r.AccountType, r.AccountSubType, r.IsGroup,
            r.OpeningDebit, r.OpeningCredit, r.PeriodDebit, r.PeriodCredit, r.ClosingDebit, r.ClosingCredit))]);
    }
}
