using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Core.Entities;

namespace Xorva.Infrastructure.Data.Configurations;

public class ApprovalRuleAuditConfiguration : IEntityTypeConfiguration<ApprovalRuleAudit>
{
    public void Configure(EntityTypeBuilder<ApprovalRuleAudit> builder)
    {
        builder.ToTable("ApprovalRuleAudits");
        builder.HasKey(a => a.Id);

        builder.Property(a => a.RuleName).HasMaxLength(200);
        builder.Property(a => a.ChangeType).IsRequired().HasMaxLength(50);
        builder.Property(a => a.ChangedByEmail).HasMaxLength(256);
        builder.Property(a => a.Detail).HasMaxLength(1000);

        builder.HasIndex(a => a.CompanyId)
            .HasDatabaseName("IX_ApprovalRuleAudits_CompanyId");
    }
}
