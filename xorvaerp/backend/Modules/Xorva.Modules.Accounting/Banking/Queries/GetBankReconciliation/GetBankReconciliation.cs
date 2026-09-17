using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Banking.Entities;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Banking.Queries.GetBankReconciliation;

public record BankReconLineDto
{
    public Guid Id { get; init; }
    public DateTime Date { get; init; }
    public string EntryNumber { get; init; } = string.Empty;
    public string? Description { get; init; }
    public decimal Debit { get; init; }
    public decimal Credit { get; init; }
    public bool IsReconciled { get; init; }
}

public record BankReconciliationDto
{
    public Guid BankAccountId { get; init; }
    public string BankAccountName { get; init; } = string.Empty;
    public decimal LedgerBalance { get; init; }
    public decimal ReconciledBalance { get; init; }
    public decimal UnreconciledBalance { get; init; }
    public List<BankReconLineDto> Lines { get; init; } = [];
}

/// <summary>Bank reconciliation working sheet — every ledger movement on the bank account,
/// with reconciled vs unreconciled balances. Tick lines that appear on the statement.</summary>
public record GetBankReconciliationQuery : IRequest<ApiResponse<BankReconciliationDto>>
{
    public Guid BankAccountId { get; init; }
    public Guid? CompanyId { get; init; }
}

public class GetBankReconciliationHandler : IRequestHandler<GetBankReconciliationQuery, ApiResponse<BankReconciliationDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetBankReconciliationHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<BankReconciliationDto>> Handle(GetBankReconciliationQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var bank = await _db.Set<BankAccount>()
            .FirstOrDefaultAsync(b => b.Id == request.BankAccountId && b.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Bank account", request.BankAccountId);

        var lines = await (
            from l in _db.Set<JournalLine>()
            join e in _db.Set<JournalEntry>() on l.JournalEntryId equals e.Id
            where l.CompanyId == companyId && l.AccountId == bank.AccountId
            orderby e.Date, e.EntryNumber
            select new BankReconLineDto
            {
                Id = l.Id, Date = e.Date, EntryNumber = e.EntryNumber, Description = l.Description ?? e.Description,
                Debit = l.Debit, Credit = l.Credit, IsReconciled = l.IsReconciled,
            }
        ).ToListAsync(ct);

        var ledger = Math.Round(lines.Sum(l => l.Debit - l.Credit), 2);
        var reconciled = Math.Round(lines.Where(l => l.IsReconciled).Sum(l => l.Debit - l.Credit), 2);

        return ApiResponse<BankReconciliationDto>.Ok(new BankReconciliationDto
        {
            BankAccountId = bank.Id,
            BankAccountName = bank.Name,
            LedgerBalance = ledger,
            ReconciledBalance = reconciled,
            UnreconciledBalance = Math.Round(ledger - reconciled, 2),
            Lines = lines,
        });
    }
}
