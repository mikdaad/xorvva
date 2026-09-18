using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Entities;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.Sales.Entities;
using Xorva.Modules.Accounting.Banking.Entities;
using Xorva.Modules.Accounting.Tax.Entities;
using Xorva.Modules.Accounting.Purchases.Entities;
using Xorva.Modules.Accounting.Assets.Entities;
using Xorva.Modules.Accounting.Currency.Entities;
using Xorva.Modules.Accounting.Vouchers.Entities;
using Xorva.Modules.Accounting.CostCentres.Entities;
using Xorva.Modules.Accounting.Documents.Entities;
using Xorva.Modules.Platform.Entities;

namespace Xorva.Infrastructure.Data;

/// <summary>
/// Central EF Core DbContext for the Xorva ERP platform.
/// 
/// Key responsibilities:
/// 1. Register all entity DbSets from all modules
/// 2. Apply global query filters for multi-tenancy (TenantEntity subclasses)
/// 3. Auto-populate audit fields (CreatedAt, UpdatedAt, CreatedBy, UpdatedBy) on SaveChanges
/// 4. Apply entity configurations from all modules
/// 
/// The global query filter ensures that:
///   db.SomeEntity.ToList()  →  SELECT * FROM SomeEntity WHERE TenantId = @currentTenantId
/// This is the EF Core layer of multi-tenancy. PostgreSQL RLS is the second layer (Day 2).
/// </summary>
public class XorvaDbContext : DbContext, IXorvaDbContext
{
    private readonly ICurrentTenantService _tenantService;

    public XorvaDbContext(DbContextOptions<XorvaDbContext> options, ICurrentTenantService tenantService)
        : base(options)
    {
        _tenantService = tenantService;
    }

    // ═══════════════════════════════════════════════════════════
    // AUTH MODULE
    // ═══════════════════════════════════════════════════════════
    public DbSet<ApplicationUser> Users => Set<ApplicationUser>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    // ═══════════════════════════════════════════════════════════
    // TENANT MODULE
    // ═══════════════════════════════════════════════════════════
    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<Branch> Branches => Set<Branch>();
    public DbSet<TenantSubscription> TenantSubscriptions => Set<TenantSubscription>();

    // ═══════════════════════════════════════════════════════════
    // APPROVAL ENGINE
    // ═══════════════════════════════════════════════════════════
    public DbSet<ApprovalRule> ApprovalRules => Set<ApprovalRule>();
    public DbSet<ApprovalRequest> ApprovalRequests => Set<ApprovalRequest>();
    public DbSet<ApprovalRequestStep> ApprovalRequestSteps => Set<ApprovalRequestStep>();
    public DbSet<ApprovalRuleAudit> ApprovalRuleAudits => Set<ApprovalRuleAudit>();

    // ═══════════════════════════════════════════════════════════
    // HR MODULE
    // ═══════════════════════════════════════════════════════════
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<Designation> Designations => Set<Designation>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<EmployeeHistory> EmployeeHistories => Set<EmployeeHistory>();
    public DbSet<Holiday> Holidays => Set<Holiday>();
    public DbSet<LeaveType> LeaveTypes => Set<LeaveType>();
    public DbSet<LeaveAllocation> LeaveAllocations => Set<LeaveAllocation>();
    public DbSet<LeaveRequest> LeaveRequests => Set<LeaveRequest>();
    public DbSet<PayRun> PayRuns => Set<PayRun>();
    public DbSet<Payslip> Payslips => Set<Payslip>();
    // Admin-designed employee-record tabs (HR-owned dynamic sections)
    public DbSet<EmployeeTab> EmployeeTabs => Set<EmployeeTab>();
    public DbSet<EmployeeTabField> EmployeeTabFields => Set<EmployeeTabField>();
    public DbSet<EmployeeTabRecord> EmployeeTabRecords => Set<EmployeeTabRecord>();
    public DbSet<HrFile> HrFiles => Set<HrFile>();

    // ═══════════════════════════════════════════════════════════
    // ACCOUNTING MODULE
    // ═══════════════════════════════════════════════════════════
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<AccountingSettings> AccountingSettings => Set<AccountingSettings>();
    public DbSet<JournalEntry> JournalEntries => Set<JournalEntry>();
    public DbSet<JournalLine> JournalLines => Set<JournalLine>();
    public DbSet<FiscalYear> FiscalYears => Set<FiscalYear>();
    public DbSet<FiscalPeriod> FiscalPeriods => Set<FiscalPeriod>();
    public DbSet<Contact> Contacts => Set<Contact>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<BankAccount> BankAccounts => Set<BankAccount>();
    public DbSet<TaxRate> TaxRates => Set<TaxRate>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceLine> InvoiceLines => Set<InvoiceLine>();
    public DbSet<CustomerPayment> CustomerPayments => Set<CustomerPayment>();
    public DbSet<PaymentAllocation> PaymentAllocations => Set<PaymentAllocation>();
    public DbSet<CreditNote> CreditNotes => Set<CreditNote>();
    public DbSet<CreditNoteLine> CreditNoteLines => Set<CreditNoteLine>();
    public DbSet<Bill> Bills => Set<Bill>();
    public DbSet<BillLine> BillLines => Set<BillLine>();
    public DbSet<SupplierPayment> SupplierPayments => Set<SupplierPayment>();
    public DbSet<BillPaymentAllocation> BillPaymentAllocations => Set<BillPaymentAllocation>();
    public DbSet<FixedAsset> FixedAssets => Set<FixedAsset>();
    public DbSet<DebitNote> DebitNotes => Set<DebitNote>();
    public DbSet<DebitNoteLine> DebitNoteLines => Set<DebitNoteLine>();
    public DbSet<ExchangeRate> ExchangeRates => Set<ExchangeRate>();

    // ── Ported from TrueLedge (tables owned by Sql/Accounting/*.sql; EF = read model + drafts) ──
    public DbSet<Voucher> Vouchers => Set<Voucher>();
    public DbSet<VoucherLine> VoucherLines => Set<VoucherLine>();
    public DbSet<CostCentreDimension> CostCentreDimensions => Set<CostCentreDimension>();
    public DbSet<CostCentre> CostCentres => Set<CostCentre>();
    public DbSet<BankStatement> BankStatements => Set<BankStatement>();
    public DbSet<BankStatementLine> BankStatementLines => Set<BankStatementLine>();
    public DbSet<BankMatchRule> BankMatchRules => Set<BankMatchRule>();
    public DbSet<AccountingDocumentFile> AccountingDocumentFiles => Set<AccountingDocumentFile>();
    public DbSet<AccountingDocument> AccountingDocuments => Set<AccountingDocument>();
    public DbSet<DocumentExtraction> DocumentExtractions => Set<DocumentExtraction>();
    public DbSet<DocumentFieldSuggestion> DocumentFieldSuggestions => Set<DocumentFieldSuggestion>();

    // ═══════════════════════════════════════════════════════════
    // PLATFORM MODULE (dynamic entities — admin-defined sub-modules)
    // ═══════════════════════════════════════════════════════════
    public DbSet<EntityDefinition> EntityDefinitions => Set<EntityDefinition>();
    public DbSet<FieldDefinition> FieldDefinitions => Set<FieldDefinition>();
    public DbSet<CustomRecord> CustomRecords => Set<CustomRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ─── Apply entity configurations ────────────────────────
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(XorvaDbContext).Assembly);

        // ─── Global query filters for multi-tenancy ─────────────
        // Tenant root:        Id == @currentTenant (users only ever see their own tenant row)
        // TenantEntity:       TenantId == @currentTenant (tenant isolation — security boundary)
        // CompanyEntity:      + company confinement unless the caller has cross-company access
        // This makes cross-tenant data access physically impossible at the ORM level.
        modelBuilder.Entity<Tenant>().HasQueryFilter(t => t.Id == _tenantService.TenantId);

        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            if (typeof(CompanyEntity).IsAssignableFrom(entityType.ClrType))
            {
                ApplyCompanyFilterMethod.MakeGenericMethod(entityType.ClrType).Invoke(this, [modelBuilder]);
            }
            else if (typeof(TenantEntity).IsAssignableFrom(entityType.ClrType))
            {
                ApplyTenantFilterMethod.MakeGenericMethod(entityType.ClrType).Invoke(this, [modelBuilder]);
            }
        }
    }

    private static readonly MethodInfo ApplyTenantFilterMethod =
        typeof(XorvaDbContext).GetMethod(nameof(ApplyTenantFilter), BindingFlags.NonPublic | BindingFlags.Instance)!;

    private static readonly MethodInfo ApplyCompanyFilterMethod =
        typeof(XorvaDbContext).GetMethod(nameof(ApplyCompanyFilter), BindingFlags.NonPublic | BindingFlags.Instance)!;

    /// <summary>
    /// Tenant isolation filter for tenant-scoped entities.
    ///
    /// IMPORTANT: the lambda must reference this DbContext instance (via the _tenantService
    /// field). EF Core caches the model once per context type, but it rewrites references
    /// to the DbContext instance inside query filters at query time — so every request
    /// evaluates the CURRENT scoped tenant. Embedding the service with Expression.Constant
    /// would freeze the first request's instance into the cached model and silently break
    /// isolation for all subsequent requests.
    /// </summary>
    private void ApplyTenantFilter<TEntity>(ModelBuilder modelBuilder) where TEntity : TenantEntity
    {
        modelBuilder.Entity<TEntity>().HasQueryFilter(e => e.TenantId == _tenantService.TenantId);
    }

    /// <summary>
    /// Tenant isolation + role-aware company confinement for company-scoped entities.
    /// SuperAdmin (CEO) sees every company in their tenant; everyone else only their own.
    /// The service properties become SQL parameters evaluated per request.
    /// </summary>
    private void ApplyCompanyFilter<TEntity>(ModelBuilder modelBuilder) where TEntity : CompanyEntity
    {
        modelBuilder.Entity<TEntity>().HasQueryFilter(e =>
            e.TenantId == _tenantService.TenantId &&
            (_tenantService.HasCrossCompanyAccess || e.CompanyId == _tenantService.CompanyId));
    }

    /// <summary>
    /// Automatically populates audit fields on every save operation.
    /// No module needs to manually set CreatedAt, UpdatedAt, CreatedBy, UpdatedBy.
    /// </summary>
    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        SetAuditFields();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        SetAuditFields();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    private void SetAuditFields()
    {
        var entries = ChangeTracker.Entries<BaseEntity>();
        var now = DateTime.UtcNow;

        foreach (var entry in entries)
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    entry.Entity.CreatedAt = now;
                    if (entry.Entity is AuditableEntity addedAuditable)
                    {
                        addedAuditable.CreatedBy = _tenantService.UserId == Guid.Empty ? null : _tenantService.UserId;
                    }
                    break;

                case EntityState.Modified:
                    entry.Entity.UpdatedAt = now;
                    if (entry.Entity is AuditableEntity modifiedAuditable)
                    {
                        modifiedAuditable.UpdatedBy = _tenantService.UserId == Guid.Empty ? null : _tenantService.UserId;
                    }
                    break;
            }
        }
    }
}
