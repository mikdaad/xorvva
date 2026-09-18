using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Xorva.Infrastructure.Data;
using Xorva.Infrastructure.Sql;

#nullable disable

namespace Xorva.Infrastructure.Migrations
{
    /// <summary>
    /// Applies the accounting schema ported from TrueLedge (PostgreSQL + Supabase) — see
    /// <c>Sql/Accounting/README</c> header comments in each script.
    ///
    /// This is deliberately a THIN WRAPPER: the seven <c>.sql</c> files embedded in this
    /// assembly are the source of truth for the tables, CHECK constraints, RLS policies,
    /// invariant triggers and RPC functions. EF Core only learns about the resulting tables
    /// as a read model (Configurations/Accounting/*), which is why the model snapshot was
    /// updated together with this file without any CreateTable operations.
    ///
    /// Script order (each is idempotent — CREATE OR REPLACE / IF NOT EXISTS):
    ///   0001 app.set_session_context + RLS helpers, RLS on existing accounting tables
    ///   0002 cost-centre dimensions / cost centres, JournalLines.CostCentreId
    ///   0003 vouchers, voucher lines, sequences, single-ledger immutability + period triggers,
    ///        post_voucher_atomic / reverse_voucher
    ///   0004 bank statements / lines / match rules, import + matching RPCs
    ///   0005 master-data enrichment (Accounts, Contacts, Products, TaxRates, Settings),
    ///        soft/hard period close
    ///   0006 AI document inbox (files, documents, extractions, field suggestions)
    ///   0007 report RPCs (balance sheet tree, ledger statement, register, trial balance,
    ///        cost-centre report, bank-rec summary)
    ///
    /// Provider guard: the Testing environment runs this DbContext on SQLite through
    /// EnsureCreated (never through migrations), but if anyone points migrations at a
    /// non-PostgreSQL provider the scripts are skipped rather than failing.
    ///
    /// ── EF model catch-up (one-time, run locally after pulling this) ──────────────────
    /// This migration's Designer keeps the PREVIOUS model on purpose. The read-model
    /// mappings (Configurations/Accounting/{Voucher,CostCentre,BankImport,Document}Configurations
    /// + the enrichment columns) must reach the model snapshot through an EMPTY migration:
    ///
    ///   cd backend
    ///   dotnet ef migrations add AccountingReadModel -p Xorva.Infrastructure -s Xorva.API
    ///   # open Migrations/&lt;ts&gt;_AccountingReadModel.cs and DELETE everything inside Up() and Down()
    ///   # (keep the .Designer.cs and the regenerated XorvaDbContextModelSnapshot.cs untouched)
    ///   dotnet ef migrations add Probe -p Xorva.Infrastructure -s Xorva.API   # must be empty → then
    ///   dotnet ef migrations remove -p Xorva.Infrastructure -s Xorva.API
    ///   dotnet ef database update -p Xorva.Infrastructure -s Xorva.API
    ///
    /// Why: the tables/columns already exist (created by the scripts above); an EF-generated
    /// CreateTable/AddColumn body would fail on them. Emptying the body records the model
    /// without touching the database — the standard EF pattern for externally-managed schema.
    /// If the generated Up() contains anything OTHER than the accounting tables/columns listed
    /// in context/DATABASE_SCHEMA.md, a mapping drifted — fix the configuration, don't keep it.
    /// </summary>
    [DbContext(typeof(XorvaDbContext))]
    [Migration("20260917120000_AccountingSqlPort")]
    public partial class AccountingSqlPort : Migration
    {
        private const string Npgsql = "Npgsql.EntityFrameworkCore.PostgreSQL";

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            if (migrationBuilder.ActiveProvider != Npgsql)
                return;

            foreach (var script in SqlScript.AccountingScripts())
            {
                migrationBuilder.Sql(SqlScript.Read("Accounting", script));
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Intentionally not reversible: the scripts add columns to live ledger tables and
            // install invariant triggers on JournalEntries/JournalLines. Rolling that back on a
            // database that has posted vouchers would orphan ledger rows. Restore from backup
            // instead, exactly as for any other ledger-schema change.
            if (migrationBuilder.ActiveProvider != Npgsql)
                return;

            migrationBuilder.Sql("""
                DO $$ BEGIN
                  RAISE EXCEPTION 'Migration 20260917120000_AccountingSqlPort cannot be reverted automatically. Restore the database from a backup taken before it was applied.';
                END $$;
                """);
        }
    }
}
