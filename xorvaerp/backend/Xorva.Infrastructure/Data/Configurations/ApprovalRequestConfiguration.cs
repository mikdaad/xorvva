using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Core.Entities;

namespace Xorva.Infrastructure.Data.Configurations;

public class ApprovalRequestConfiguration : IEntityTypeConfiguration<ApprovalRequest>
{
    public void Configure(EntityTypeBuilder<ApprovalRequest> builder)
    {
        builder.ToTable("ApprovalRequests");
        builder.HasKey(r => r.Id);

        builder.Property(r => r.ActionKey).IsRequired().HasMaxLength(200);
        builder.Property(r => r.Title).IsRequired().HasMaxLength(300);
        builder.Property(r => r.CommandJson).IsRequired();
        builder.Property(r => r.RequesterEmail).HasMaxLength(256);
        builder.Property(r => r.RuleNameSnapshot).HasMaxLength(200);
        builder.Property(r => r.Outcome).HasMaxLength(1000);

        // Provider-agnostic optimistic concurrency token (bumped per action).
        builder.Property(r => r.Version).IsConcurrencyToken();

        builder.HasMany(r => r.Steps)
            .WithOne(s => s.ApprovalRequest)
            .HasForeignKey(s => s.ApprovalRequestId)
            .OnDelete(DeleteBehavior.Cascade);

        // Inbox query path: pending requests within a company.
        builder.HasIndex(r => new { r.CompanyId, r.Status })
            .HasDatabaseName("IX_ApprovalRequests_CompanyId_Status");
    }
}
