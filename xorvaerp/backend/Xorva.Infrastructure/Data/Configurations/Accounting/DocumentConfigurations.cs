using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.Accounting.Documents.Entities;

namespace Xorva.Infrastructure.Data.Configurations.Accounting;

// Read-model mappings for tables owned by Sql/Accounting/0006_ai_documents.sql
// (see the header comment in VoucherConfigurations.cs for the contract).

public class AccountingDocumentFileConfiguration : IEntityTypeConfiguration<AccountingDocumentFile>
{
    public void Configure(EntityTypeBuilder<AccountingDocumentFile> b)
    {
        b.ToTable("AccountingDocumentFiles");
        b.HasKey(f => f.Id);
        b.Property(f => f.FileName).HasMaxLength(260).IsRequired();
        b.Property(f => f.ContentType).HasMaxLength(120).IsRequired();
        b.Property(f => f.Sha256).HasColumnType("character(64)");
        b.Property(f => f.Data).HasColumnType("bytea").IsRequired();
        b.HasIndex(f => f.CompanyId).HasDatabaseName("IX_AccountingDocumentFiles_CompanyId");
    }
}

public class AccountingDocumentConfiguration : IEntityTypeConfiguration<AccountingDocument>
{
    public void Configure(EntityTypeBuilder<AccountingDocument> b)
    {
        b.ToTable("AccountingDocuments");
        b.HasKey(d => d.Id);
        b.Property(d => d.FileName).HasMaxLength(260).IsRequired();
        b.Property(d => d.MimeType).HasMaxLength(120).IsRequired();
        // List<string> → PostgreSQL text[] (same primitive-collection mapping as Company.ActiveModules;
        // no explicit store type so the SQLite test provider can pick its own JSON mapping).
        b.Property(d => d.Tags);
        b.Property(d => d.Status).HasConversion<string>().HasMaxLength(20).IsRequired();
        b.Property(d => d.StatusMessage).HasMaxLength(1000);
        b.Property(d => d.DocumentKind).HasConversion<string>().HasMaxLength(20).IsRequired();

        b.HasOne<AccountingDocumentFile>().WithMany().HasForeignKey(d => d.FileId).OnDelete(DeleteBehavior.Restrict);

        b.HasIndex(d => new { d.CompanyId, d.Status }).HasDatabaseName("IX_AccountingDocuments_CompanyId_Status");
        b.HasIndex(d => d.UploadedAt).IsDescending().HasDatabaseName("IX_AccountingDocuments_UploadedAt");
    }
}

public class DocumentExtractionConfiguration : IEntityTypeConfiguration<DocumentExtraction>
{
    public void Configure(EntityTypeBuilder<DocumentExtraction> b)
    {
        b.ToTable("DocumentExtractions");
        b.HasKey(e => e.Id);
        b.Property(e => e.ModelUsed).HasMaxLength(60).IsRequired();
        b.Property(e => e.ModelVersion).HasMaxLength(60);
        b.Property(e => e.RawResponse).HasColumnType("jsonb");
        b.Property(e => e.ExtractedData).HasColumnType("jsonb").IsRequired();
        b.Property(e => e.ConfidenceScore).HasColumnType("numeric(5,4)");

        b.HasOne<AccountingDocument>().WithMany().HasForeignKey(e => e.DocumentId).OnDelete(DeleteBehavior.Cascade);
        b.HasMany(e => e.Fields).WithOne().HasForeignKey(f => f.ExtractionId).OnDelete(DeleteBehavior.Cascade);

        b.HasIndex(e => new { e.DocumentId, e.CreatedAt }).IsDescending(false, true).HasDatabaseName("IX_DocumentExtractions_DocumentId");
        b.HasIndex(e => e.CompanyId).HasDatabaseName("IX_DocumentExtractions_CompanyId");
    }
}

public class DocumentFieldSuggestionConfiguration : IEntityTypeConfiguration<DocumentFieldSuggestion>
{
    public void Configure(EntityTypeBuilder<DocumentFieldSuggestion> b)
    {
        b.ToTable("DocumentFieldSuggestions");
        b.HasKey(f => f.Id);
        b.Property(f => f.FieldName).HasMaxLength(100).IsRequired();
        b.Property(f => f.FieldGroup).HasMaxLength(20);
        b.Property(f => f.ExtractedValue).HasColumnType("text");
        b.Property(f => f.UserOverride).HasColumnType("text");
        b.Property(f => f.FinalValue).HasColumnType("text");
        b.Property(f => f.Confidence).HasColumnType("numeric(5,4)");

        b.HasIndex(f => new { f.ExtractionId, f.FieldName }).IsUnique().HasDatabaseName("UQ_DocumentFieldSuggestions_Extraction_Field");
        b.HasIndex(f => f.CompanyId).HasDatabaseName("IX_DocumentFieldSuggestions_CompanyId");
    }
}
