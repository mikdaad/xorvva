using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Core.Entities;

namespace Xorva.Infrastructure.Data.Configurations;

public class TenantSubscriptionConfiguration : IEntityTypeConfiguration<TenantSubscription>
{
    public void Configure(EntityTypeBuilder<TenantSubscription> builder)
    {
        builder.ToTable("TenantSubscriptions");
        builder.HasKey(s => s.Id);

        builder.Property(s => s.PlanKey).IsRequired().HasMaxLength(40);

        // List<string> → PostgreSQL text[] (native primitive-collection mapping; JSON on SQLite).
        builder.Property(s => s.SubscribedModules);

        // One subscription row per tenant.
        builder.HasIndex(s => s.TenantId).IsUnique()
            .HasDatabaseName("IX_TenantSubscriptions_TenantId");
    }
}
