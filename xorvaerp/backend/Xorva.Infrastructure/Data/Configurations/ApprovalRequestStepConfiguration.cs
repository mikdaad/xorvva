using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Core.Entities;

namespace Xorva.Infrastructure.Data.Configurations;

public class ApprovalRequestStepConfiguration : IEntityTypeConfiguration<ApprovalRequestStep>
{
    public void Configure(EntityTypeBuilder<ApprovalRequestStep> builder)
    {
        builder.ToTable("ApprovalRequestSteps");
        builder.HasKey(s => s.Id);

        builder.Property(s => s.ActedByEmail).HasMaxLength(256);
        builder.Property(s => s.Comment).HasMaxLength(1000);

        builder.HasIndex(s => s.ApprovalRequestId)
            .HasDatabaseName("IX_ApprovalRequestSteps_ApprovalRequestId");
    }
}
