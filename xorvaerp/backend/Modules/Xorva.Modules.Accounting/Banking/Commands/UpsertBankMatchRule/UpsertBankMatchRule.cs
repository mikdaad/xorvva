using System.Text.RegularExpressions;
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

namespace Xorva.Modules.Accounting.Banking.Commands.UpsertBankMatchRule;

/// <summary>Create (Id null) / update a regex rule that suggests an account/contact for statement lines (evaluated case-insensitively by Postgres <c>~*</c>).</summary>
public record UpsertBankMatchRuleCommand : IRequest<ApiResponse<BankMatchRuleDto>>
{
    public Guid? Id { get; init; }
    public Guid? CompanyId { get; init; }
    public string RuleName { get; init; } = string.Empty;
    public string? Description { get; init; }
    public string Pattern { get; init; } = string.Empty;
    public BankMatchPatternField PatternField { get; init; } = BankMatchPatternField.Description;
    public Guid? TargetAccountId { get; init; }
    public Guid? TargetContactId { get; init; }
    public VoucherType? TargetVoucherType { get; init; }
    public int Priority { get; init; } = 100;
    public bool IsActive { get; init; } = true;
}

public class UpsertBankMatchRuleValidator : AbstractValidator<UpsertBankMatchRuleCommand>
{
    public UpsertBankMatchRuleValidator()
    {
        RuleFor(x => x.RuleName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Description).MaximumLength(500);
        RuleFor(x => x.Pattern).NotEmpty().MaximumLength(500).Must(BeValidRegex).WithMessage("Pattern is not a valid regular expression.");
        RuleFor(x => x.Priority).InclusiveBetween(1, 1000);
        RuleFor(x => x).Must(x => x.TargetAccountId.HasValue || x.TargetContactId.HasValue)
            .WithMessage("A rule must suggest an account or a contact.");
    }

    private static bool BeValidRegex(string p)
    {
        try { _ = new Regex(p, RegexOptions.None, TimeSpan.FromMilliseconds(100)); return true; }
        catch (ArgumentException) { return false; }
    }
}

public class UpsertBankMatchRuleHandler : IRequestHandler<UpsertBankMatchRuleCommand, ApiResponse<BankMatchRuleDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public UpsertBankMatchRuleHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<BankMatchRuleDto>> Handle(UpsertBankMatchRuleCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureAccountingActiveAsync(_db, companyId, ct);

        if (request.TargetAccountId is { } acc && !await _db.Set<Account>().AnyAsync(a => a.Id == acc && a.CompanyId == companyId && a.IsActive && !a.IsGroup, ct))
            throw new BadRequestException("Target account must be an active posting ledger of this company.");

        BankMatchRule rule;
        if (request.Id is { } id)
        {
            rule = await _db.Set<BankMatchRule>().FirstOrDefaultAsync(r => r.Id == id && r.CompanyId == companyId, ct)
                ?? throw new NotFoundException("Bank match rule", id);
        }
        else
        {
            rule = new BankMatchRule { TenantId = _tenant.TenantId, CompanyId = companyId };
            _db.Set<BankMatchRule>().Add(rule);
        }

        rule.RuleName = request.RuleName.Trim();
        rule.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        rule.Pattern = request.Pattern.Trim();
        rule.PatternField = request.PatternField;
        rule.TargetAccountId = request.TargetAccountId;
        rule.TargetContactId = request.TargetContactId;
        rule.TargetVoucherType = request.TargetVoucherType;
        rule.Priority = request.Priority;
        rule.IsActive = request.IsActive;
        await _db.SaveChangesAsync(ct);

        return ApiResponse<BankMatchRuleDto>.Ok(rule.ToDto(), request.Id is null ? "Rule created." : "Rule updated.");
    }
}

public record ListBankMatchRulesQuery : IRequest<ApiResponse<List<BankMatchRuleDto>>>
{
    public Guid? CompanyId { get; init; }
}

public class ListBankMatchRulesHandler : IRequestHandler<ListBankMatchRulesQuery, ApiResponse<List<BankMatchRuleDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListBankMatchRulesHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<BankMatchRuleDto>>> Handle(ListBankMatchRulesQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var rules = await _db.Set<BankMatchRule>().AsNoTracking()
            .Where(r => r.CompanyId == companyId).OrderBy(r => r.Priority).ThenBy(r => r.RuleName).ToListAsync(ct);
        return ApiResponse<List<BankMatchRuleDto>>.Ok([.. rules.Select(r => r.ToDto())]);
    }
}

public record DeleteBankMatchRuleCommand : IRequest<ApiResponse>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
}

public class DeleteBankMatchRuleHandler : IRequestHandler<DeleteBankMatchRuleCommand, ApiResponse>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public DeleteBankMatchRuleHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse> Handle(DeleteBankMatchRuleCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var rule = await _db.Set<BankMatchRule>().FirstOrDefaultAsync(r => r.Id == request.Id && r.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Bank match rule", request.Id);
        _db.Set<BankMatchRule>().Remove(rule);
        await _db.SaveChangesAsync(ct);
        return ApiResponse.Ok("Rule deleted.");
    }
}
