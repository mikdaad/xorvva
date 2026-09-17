using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Core.Entities;
using Xorva.Core.Enums;

namespace Xorva.Infrastructure.Data.Configurations;

public class ApprovalRuleConfiguration : IEntityTypeConfiguration<ApprovalRule>
{
    public void Configure(EntityTypeBuilder<ApprovalRule> builder)
    {
        builder.ToTable("ApprovalRules");
        builder.HasKey(r => r.Id);

        builder.Property(r => r.Name).IsRequired().HasMaxLength(200);
        builder.Property(r => r.Module).IsRequired().HasMaxLength(100);
        builder.Property(r => r.ActionKey).IsRequired().HasMaxLength(200);

        // Ordered role chain stored as a comma-separated string (e.g. "3,2,1").
        // Provider-agnostic: works on PostgreSQL and the SQLite test database.
        builder.Property(r => r.ApproverRoles)
            .HasConversion(
                roles => string.Join(',', roles.Select(x => (int)x)),
                s => string.IsNullOrEmpty(s)
                    ? new List<SystemRole>()
                    : s.Split(',', StringSplitOptions.RemoveEmptyEntries)
                       .Select(x => (SystemRole)int.Parse(x)).ToList())
            .HasMaxLength(50)
            .Metadata.SetValueComparer(
                new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<List<SystemRole>>(
                    (a, b) => a!.SequenceEqual(b!),
                    v => v.Aggregate(0, (h, x) => HashCode.Combine(h, (int)x)),
                    v => v.ToList()));

        builder.Property(r => r.IsActive).IsRequired().HasDefaultValue(true);
        builder.Property(r => r.IsMandatory).IsRequired().HasDefaultValue(false);

        // Optional money gate. Nullable → legacy rules keep "always require approval".
        builder.Property(r => r.AmountThreshold).HasColumnType("decimal(18,2)");

        // Fast lookup path used on every intercepted action.
        builder.HasIndex(r => new { r.CompanyId, r.ActionKey })
            .HasDatabaseName("IX_ApprovalRules_CompanyId_ActionKey");
    }
}
