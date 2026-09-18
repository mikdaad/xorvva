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

namespace Xorva.Modules.Accounting.Banking.Queries.GetBankStatement;

/// <summary>A statement with all its lines, enriched with matched entry numbers, rule names and suggested account names.</summary>
public record GetBankStatementQuery : IRequest<ApiResponse<BankStatementDetailDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
    public BankMatchStatus? Status { get; init; }
}

public class GetBankStatementHandler : IRequestHandler<GetBankStatementQuery, ApiResponse<BankStatementDetailDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetBankStatementHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<BankStatementDetailDto>> Handle(GetBankStatementQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        return ApiResponse<BankStatementDetailDto>.Ok(await BankStatementReader.LoadAsync(_db, request.Id, companyId, request.Status, ct));
    }
}

/// <summary>Shared loader so import/match commands return the same detail shape.</summary>
public static class BankStatementReader
{
    public static async Task<BankStatementDetailDto> LoadAsync(IXorvaDbContext _db, Guid id, Guid companyId, BankMatchStatus? status, CancellationToken ct)
    {
        var statement = await _db.Set<BankStatement>().AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == id && s.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Bank statement", id);

        var bankName = await _db.Set<BankAccount>().AsNoTracking().Where(b => b.Id == statement.BankAccountId).Select(b => b.Name).FirstOrDefaultAsync(ct);

        var all = await _db.Set<BankStatementLine>().AsNoTracking()
            .Where(l => l.StatementId == statement.Id).OrderBy(l => l.LineNumber).ToListAsync(ct);

        var jlIds = all.Where(l => l.MatchedJournalLineId.HasValue).Select(l => l.MatchedJournalLineId!.Value).Distinct().ToList();
        var entries = jlIds.Count == 0 ? new Dictionary<Guid, (string Number, string? Desc)>() :
            await (from l in _db.Set<JournalLine>().AsNoTracking()
                   join e in _db.Set<JournalEntry>().AsNoTracking() on l.JournalEntryId equals e.Id
                   where jlIds.Contains(l.Id)
                   select new { l.Id, e.EntryNumber, Desc = l.Description ?? e.Description })
                .ToDictionaryAsync(x => x.Id, x => (x.EntryNumber, (string?)x.Desc), ct);

        var ruleIds = all.Where(l => l.MatchRuleId.HasValue).Select(l => l.MatchRuleId!.Value).Distinct().ToList();
        var rules = ruleIds.Count == 0 ? new Dictionary<Guid, string>()
            : await _db.Set<BankMatchRule>().AsNoTracking().Where(r => ruleIds.Contains(r.Id)).ToDictionaryAsync(r => r.Id, r => r.RuleName, ct);

        var accIds = all.Where(l => l.SuggestedAccountId.HasValue).Select(l => l.SuggestedAccountId!.Value).Distinct().ToList();
        var accounts = accIds.Count == 0 ? new Dictionary<Guid, string>()
            : await _db.Set<Account>().AsNoTracking().Where(a => accIds.Contains(a.Id)).ToDictionaryAsync(a => a.Id, a => a.Code + " · " + a.Name, ct);

        var lines = all
            .Where(l => status is null || l.MatchStatus == status)
            .Select(l =>
            {
                (string Number, string? Desc)? e = l.MatchedJournalLineId is { } j && entries.TryGetValue(j, out var found) ? found : null;
                return l.ToDto(e?.Number, e?.Desc,
                    l.MatchRuleId is { } r ? rules.GetValueOrDefault(r) : null,
                    l.SuggestedAccountId is { } a ? accounts.GetValueOrDefault(a) : null);
            }).ToList();

        return new BankStatementDetailDto
        {
            Statement = statement.ToDto(bankName,
                all.Count(l => l.MatchStatus == BankMatchStatus.Matched), all.Count(l => l.MatchStatus == BankMatchStatus.Suggested),
                all.Count(l => l.MatchStatus == BankMatchStatus.Unmatched), all.Count(l => l.MatchStatus == BankMatchStatus.Ignored)),
            Lines = lines,
        };
    }
}

/// <summary>Unreconciled posted GL lines on the statement's bank ledger near a given line — candidates for a manual match.</summary>
public record GetBankMatchCandidatesQuery : IRequest<ApiResponse<List<BankMatchCandidateDto>>>
{
    public Guid LineId { get; init; }
    public Guid? CompanyId { get; init; }
    /// <summary>± days around the bank line date (default 30).</summary>
    public int WindowDays { get; init; } = 30;
    /// <summary>Only entries of exactly the same amount (default true).</summary>
    public bool ExactAmount { get; init; } = true;
}

public class GetBankMatchCandidatesHandler : IRequestHandler<GetBankMatchCandidatesQuery, ApiResponse<List<BankMatchCandidateDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetBankMatchCandidatesHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<BankMatchCandidateDto>>> Handle(GetBankMatchCandidatesQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var line = await _db.Set<BankStatementLine>().AsNoTracking()
            .FirstOrDefaultAsync(l => l.Id == request.LineId && l.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Bank statement line", request.LineId);
        var glAccountId = await _db.Set<BankAccount>().AsNoTracking().Where(b => b.Id == line.BankAccountId).Select(b => b.AccountId).FirstAsync(ct);

        var days = Math.Clamp(request.WindowDays, 1, 365);
        var from = line.LineDate.AddDays(-days).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var to = line.LineDate.AddDays(days + 1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);

        var taken = _db.Set<BankStatementLine>().Where(x => x.MatchedJournalLineId != null && x.Id != line.Id).Select(x => x.MatchedJournalLineId);

        var q = from l in _db.Set<JournalLine>().AsNoTracking()
                join e in _db.Set<JournalEntry>().AsNoTracking() on l.JournalEntryId equals e.Id
                where l.AccountId == glAccountId && l.CompanyId == companyId && !l.IsReconciled
                      && e.Status == JournalStatus.Posted && e.Date >= from && e.Date < to
                      && !taken.Contains(l.Id)
                select new BankMatchCandidateDto
                {
                    JournalLineId = l.Id, JournalEntryId = e.Id, EntryNumber = e.EntryNumber, Date = e.Date,
                    Description = l.Description ?? e.Description, Debit = l.Debit, Credit = l.Credit, ContactId = l.ContactId,
                };
        if (request.ExactAmount)
            q = line.Debit > 0 ? q.Where(c => c.Credit == line.Debit) : q.Where(c => c.Debit == line.Credit);

        var rows = await q.OrderBy(c => c.Date).Take(100).ToListAsync(ct);
        return ApiResponse<List<BankMatchCandidateDto>>.Ok(rows);
    }
}
