using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.HR.Entities;

namespace Xorva.Infrastructure.Data.Configurations.HR;

public class HrFileConfiguration : IEntityTypeConfiguration<HrFile>
{
    public void Configure(EntityTypeBuilder<HrFile> b)
    {
        b.ToTable("HrFiles");
        b.HasKey(x => x.Id);
        b.Property(x => x.FileName).IsRequired().HasMaxLength(260);
        b.Property(x => x.ContentType).IsRequired().HasMaxLength(120);
        b.Property(x => x.Data).IsRequired();
    }
}
