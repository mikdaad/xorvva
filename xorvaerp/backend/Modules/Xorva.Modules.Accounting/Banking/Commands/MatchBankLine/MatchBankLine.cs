using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Banking.Entities;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Banking.Commands.MatchBankLine;

/// <summary>What to do with one statement line: Confirm (against a GL line), Unmatch, Ignore, or Suggest (re-run rules for the statement).</summary>
public enum BankLineAction { Confirm, Unmatch, Ignore }

/// <summary>
/// Confirm / unmatch / ignore a bank statement line via the 0004 RPCs. Confirming stamps
/// <c>JournalLines.IsReconciled</c> and links the voucher; unmatching clears both again.
/// </summary>
public record MatchBankLineCommand : IRequest<ApiResponse<BankStatementLineDto>>
{
    public Guid LineId { get; init; }
    public Guid? CompanyId { get; init; }
    public BankLineAction Action { get; init; }
    /// <summary>Required for Confirm unless the line already carries a suggestion.</summary>
    public Guid? JournalLineId { get; init; }
}

public class MatchBankLineValidator : AbstractValidator<MatchBankLineCommand>
{
    public MatchBankLineValidator()
    {
        RuleFor(x => x.LineId).NotEmpty();
        RuleFor(x => x.Action).IsInEnum();
    }
}

public class MatchBankLineHandler : IRequestHandler<MatchBankLineCommand, ApiResponse<BankStatementLineDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IAccountingRpc _rpc;

    public MatchBankLineHandler(IXorvaDbContext db, ICurrentTenantService tenant, IAccountingRpc rpc)
    {
        _db = db;
        _tenant = tenant;
        _rpc = rpc;
    }

    public async Task<ApiResponse<BankStatementLineDto>> Handle(MatchBankLineCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var line = await _db.Set<BankStatementLine>().AsNoTracking()
            .FirstOrDefaultAsync(l => l.Id == request.LineId && l.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Bank statement line", request.LineId);

        string message;
        switch (request.Action)
        {
            case BankLineAction.Confirm:
            {
                var journalLineId = request.JournalLineId ?? line.MatchedJournalLineId
                    ?? throw new BadRequestException("Choose the ledger entry this bank line settles.");
                var jl = await _db.Set<JournalLine>().AsNoTracking()
                    .Where(l => l.Id == journalLineId && l.CompanyId == companyId)
                    .Select(l => new { l.Id, l.Debit, l.Credit })
                    .FirstOrDefaultAsync(ct) ?? throw new NotFoundException("Journal line", journalLineId);
                // Bank debit (money out) must meet a GL credit on the bank ledger and vice-versa.
                if (line.Debit > 0 && jl.Credit != line.Debit || line.Credit > 0 && jl.Debit != line.Credit)
                    throw new BadRequestException("Amounts differ — the ledger entry must equal the bank line (bank debit ↔ ledger credit).");
                await _rpc.ConfirmBankMatchAsync(line.Id, journalLineId, ct);
                message = "Matched.";
                break;
            }
            case BankLineAction.Unmatch:
                if (line.MatchStatus == BankMatchStatus.Unmatched) throw new ConflictException("This line is not matched.");
                await _rpc.UnmatchBankLineAsync(line.Id, ct);
                message = "Match removed.";
                break;
            case BankLineAction.Ignore:
                if (line.MatchStatus == BankMatchStatus.Matched) throw new ConflictException("Unmatch the line before ignoring it.");
                await _rpc.IgnoreBankLineAsync(line.Id, ct);
                message = "Line ignored.";
                break;
            default:
                throw new BadRequestException("Unknown action.");
        }

        var fresh = await _db.Set<BankStatementLine>().AsNoTracking().FirstAsync(l => l.Id == line.Id, ct);
        return ApiResponse<BankStatementLineDto>.Ok(fresh.ToDto(), message);
    }
}

/// <summary>Re-runs exact-amount + rule matching over a statement's unmatched lines.</summary>
public record SuggestBankMatchesCommand : IRequest<ApiResponse<int>>
{
    public Guid StatementId { get; init; }
    public Guid? CompanyId { get; init; }
}

public class SuggestBankMatchesHandler : IRequestHandler<SuggestBankMatchesCommand, ApiResponse<int>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IAccountingRpc _rpc;

    public SuggestBankMatchesHandler(IXorvaDbContext db, ICurrentTenantService tenant, IAccountingRpc rpc)
    {
        _db = db;
        _tenant = tenant;
        _rpc = rpc;
    }

    public async Task<ApiResponse<int>> Handle(SuggestBankMatchesCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var exists = await _db.Set<BankStatement>().AnyAsync(s => s.Id == request.StatementId && s.CompanyId == companyId, ct);
        if (!exists) throw new NotFoundException("Bank statement", request.StatementId);
        var n = await _rpc.SuggestBankMatchesAsync(request.StatementId, ct);
        return ApiResponse<int>.Ok(n, n == 0 ? "No new suggestions." : $"{n} suggestion(s) added.");
    }
}
