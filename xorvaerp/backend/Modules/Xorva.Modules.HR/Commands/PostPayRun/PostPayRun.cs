using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Approvals;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Commands.PostPayRun;

/// <summary>
/// Posts a pay run's salary journal into Accounting via the Core <c>IJournalPoster</c>:
/// DR Salary Expense (gross) / CR Salary Payable (net). Requires Accounting to be set up
/// (the poster resolves the SystemAccounts from the company's AccountingSettings).
/// </summary>
public record PostPayRunCommand : IRequest<ApiResponse<PayRunDto>>, IAmountApprovableAction
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }

    public const string ActionKey = "Accounting.RunPayroll";
    public string ApprovalActionKey => ActionKey;
    public string ApprovalSummary => "Post payroll (salary journal)";
    public Guid? ApprovalCompanyId => CompanyId;

    // The gross payroll total decides whether an amount-threshold rule applies.
    public async Task<decimal> ResolveApprovalAmountAsync(IXorvaDbContext db, CancellationToken ct) =>
        await db.Set<PayRun>().Where(p => p.Id == Id).Select(p => p.TotalGross).FirstOrDefaultAsync(ct);
}

public class PostPayRunHandler : IRequestHandler<PostPayRunCommand, ApiResponse<PayRunDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IJournalPoster _poster;

    public PostPayRunHandler(IXorvaDbContext db, ICurrentTenantService tenant, IJournalPoster poster)
    {
        _db = db;
        _tenant = tenant;
        _poster = poster;
    }

    public async Task<ApiResponse<PayRunDto>> Handle(PostPayRunCommand request, CancellationToken ct)
    {
        var companyId = HrGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var payRun = await _db.Set<PayRun>().Include(p => p.Payslips)
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Pay run", request.Id);

        if (payRun.Status != PayRunStatus.Draft)
            throw new BadRequestException("This pay run is already posted.");
        if (payRun.TotalGross <= 0m)
            throw new BadRequestException("Nothing to post — the pay run total is zero.");

        var lines = new List<JournalLineDraft>
        {
            new() { SystemAccount = SystemAccount.SalaryExpense, Debit = payRun.TotalGross, Description = "Salaries" },
            new() { SystemAccount = SystemAccount.SalaryPayable, Credit = payRun.TotalNet, Description = "Net pay owed to staff" },
        };
        // With deductions, the difference would credit a deductions-payable account; today net == gross.

        var journalId = await _poster.PostAsync(new JournalDraft
        {
            CompanyId = companyId,
            Date = payRun.PayDate,
            Description = $"Payroll {payRun.Number}",
            SourceType = JournalSourceType.Payroll,
            SourceId = payRun.Id,
            Lines = lines,
        }, ct);

        payRun.Status = PayRunStatus.Posted;
        payRun.JournalEntryId = journalId;
        await _db.SaveChangesAsync(ct);

        return ApiResponse<PayRunDto>.Ok(payRun.ToDto(), "Pay run posted — salary journal created.");
    }
}
