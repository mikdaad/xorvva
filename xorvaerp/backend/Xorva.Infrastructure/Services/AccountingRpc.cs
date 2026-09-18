using System.Data;
using System.Data.Common;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;
using NpgsqlTypes;
using Xorva.Core.Exceptions;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Infrastructure.Services;

/// <summary>
/// PostgreSQL implementation of <see cref="IAccountingRpc"/>. Every call runs on the
/// DbContext's own connection (and its ambient transaction, if the handler opened one), so:
///  * the session context published by <c>TenantSessionInterceptor</c> is in effect → RLS
///    and <c>app.current_user_id()</c> see the real caller;
///  * a handler can stage EF changes, call an RPC, and commit both atomically.
///
/// PostgreSQL errors raised by the scripts are mapped to Xorva exceptions by SQLSTATE so the
/// existing ExceptionMiddleware returns the usual 400/403/404/409 envelopes.
/// </summary>
public sealed class AccountingRpc : IAccountingRpc
{
    private readonly XorvaDbContext _db;

    public AccountingRpc(XorvaDbContext db) => _db = db;

    // ── 0003 vouchers ────────────────────────────────────────────────────────

    public Task<string> GenerateVoucherNumberAsync(Guid companyId, VoucherType type, int fiscalYear, CancellationToken ct) =>
        ScalarAsync<string>("SELECT accounting.generate_voucher_number(@p0, @p1, @p2)", ct,
            P("p0", companyId), P("p1", type.ToString()), P("p2", fiscalYear));

    public Task<Guid> PostVoucherAsync(Guid voucherId, IReadOnlyList<RpcLedgerLine> lines, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(lines.Select(l => new
        {
            account_id = l.AccountId,
            contact_id = l.ContactId,
            tax_rate_id = l.TaxRateId,
            cost_centre_id = l.CostCentreId,
            description = l.Description,
            base_debit = l.BaseDebit,
            base_credit = l.BaseCredit,
        }));
        return ScalarAsync<Guid>("SELECT accounting.post_voucher_atomic(@p0, @p1)", ct, P("p0", voucherId), Jsonb("p1", json));
    }

    public Task<Guid> ReverseVoucherAsync(Guid voucherId, string reason, DateOnly? reversalDate, CancellationToken ct) =>
        ScalarAsync<Guid>("SELECT accounting.reverse_voucher(@p0, @p1, @p2)", ct,
            P("p0", voucherId), P("p1", reason), Date("p2", reversalDate ?? DateOnly.FromDateTime(DateTime.UtcNow)));

    // ── 0004 bank import ─────────────────────────────────────────────────────

    public async Task<RpcBankImportResult> ImportBankStatementAsync(Guid bankAccountId, string sourceFile, string sourceFormat, string linesJson,
        DateOnly? statementDate, decimal? openingBalance, decimal? closingBalance, CancellationToken ct)
    {
        var rows = await QueryAsync(
            "SELECT statement_id, lines_imported, lines_skipped FROM accounting.import_bank_statement(@p0, @p1, @p2, @p3, @p4, @p5, @p6)",
            r => new RpcBankImportResult(r.GetGuid(0), r.GetInt32(1), r.GetInt32(2)), ct,
            P("p0", bankAccountId), P("p1", sourceFile), P("p2", sourceFormat), Jsonb("p3", linesJson),
            Date("p4", statementDate), Numeric("p5", openingBalance), Numeric("p6", closingBalance));
        return rows.Single();
    }

    public Task<int> SuggestBankMatchesAsync(Guid statementId, CancellationToken ct) =>
        ScalarAsync<int>("SELECT accounting.suggest_bank_matches(@p0)", ct, P("p0", statementId));

    public Task ConfirmBankMatchAsync(Guid bankLineId, Guid journalLineId, CancellationToken ct) =>
        ExecuteAsync("SELECT accounting.confirm_bank_match(@p0, @p1)", ct, P("p0", bankLineId), P("p1", journalLineId));

    public Task UnmatchBankLineAsync(Guid bankLineId, CancellationToken ct) =>
        ExecuteAsync("SELECT accounting.unmatch_bank_line(@p0)", ct, P("p0", bankLineId));

    public Task IgnoreBankLineAsync(Guid bankLineId, CancellationToken ct) =>
        ExecuteAsync("SELECT accounting.ignore_bank_line(@p0)", ct, P("p0", bankLineId));

    // ── 0005 periods ─────────────────────────────────────────────────────────

    public Task SetPeriodCloseStatusAsync(Guid periodId, PeriodCloseStatus status, CancellationToken ct) =>
        ExecuteAsync("SELECT accounting.set_period_close_status(@p0, @p1)", ct, P("p0", periodId), P("p1", status.ToString()));

    // ── 0006 AI documents ────────────────────────────────────────────────────

    public Task<Guid> UploadDocumentAsync(Guid companyId, string fileName, string contentType, byte[] data, DocumentKind kind, IReadOnlyList<string>? tags, CancellationToken ct) =>
        ScalarAsync<Guid>("SELECT accounting.upload_document(@p0, @p1, @p2, @p3, @p4, @p5)", ct,
            P("p0", companyId), P("p1", fileName), P("p2", contentType), Bytea("p3", data), P("p4", kind.ToString()), TextArray("p5", tags));

    public Task BeginDocumentExtractionAsync(Guid documentId, CancellationToken ct) =>
        ExecuteAsync("SELECT accounting.begin_document_extraction(@p0)", ct, P("p0", documentId));

    public Task<Guid> CompleteDocumentExtractionAsync(Guid documentId, string extractedJson, string? rawResponseJson, string modelUsed, string? modelVersion, int? processingTimeMs, CancellationToken ct) =>
        ScalarAsync<Guid>("SELECT accounting.complete_document_extraction(@p0, @p1, @p2, @p3, @p4, @p5)", ct,
            P("p0", documentId), Jsonb("p1", extractedJson), Jsonb("p2", rawResponseJson), P("p3", modelUsed), P("p4", modelVersion), Int("p5", processingTimeMs));

    public Task FailDocumentExtractionAsync(Guid documentId, string message, CancellationToken ct) =>
        ExecuteAsync("SELECT accounting.fail_document_extraction(@p0, @p1)", ct, P("p0", documentId), P("p1", message));

    public Task OverrideDocumentFieldAsync(Guid extractionId, string fieldName, string? value, CancellationToken ct) =>
        ExecuteAsync("SELECT accounting.override_document_field(@p0, @p1, @p2)", ct, P("p0", extractionId), P("p1", fieldName), P("p2", value));

    public Task AcceptDocumentExtractionAsync(Guid extractionId, Guid voucherId, CancellationToken ct) =>
        ExecuteAsync("SELECT accounting.accept_document_extraction(@p0, @p1)", ct, P("p0", extractionId), P("p1", voucherId));

    public Task RejectDocumentAsync(Guid documentId, string? reason, CancellationToken ct) =>
        ExecuteAsync("SELECT accounting.reject_document(@p0, @p1)", ct, P("p0", documentId), P("p1", reason));

    // ── 0007 reports ─────────────────────────────────────────────────────────

    public Task<JsonElement> GetBalanceSheetAsync(Guid? companyId, DateOnly asOf, CancellationToken ct) =>
        JsonAsync("SELECT accounting.get_balance_sheet(@p0, @p1)", ct, Uuid("p0", companyId), Date("p1", asOf));

    public Task<JsonElement> GetLedgerStatementAsync(Guid accountId, DateOnly? from, DateOnly? to, Guid? costCentreId, CancellationToken ct) =>
        JsonAsync("SELECT accounting.get_ledger_statement(@p0, @p1, @p2, @p3)", ct, P("p0", accountId), Date("p1", from), Date("p2", to), Uuid("p3", costCentreId));

    public Task<JsonElement> GetBankReconciliationSummaryAsync(Guid bankAccountId, DateOnly asOf, CancellationToken ct) =>
        JsonAsync("SELECT accounting.get_bank_reconciliation_summary(@p0, @p1)", ct, P("p0", bankAccountId), Date("p1", asOf));

    public Task<IReadOnlyList<RpcRegisterRow>> GetTransactionRegisterAsync(Guid? companyId, DateOnly? from, DateOnly? to, VoucherType? type, VoucherStatus? status,
        Guid? contactId, string? search, int limit, int offset, CancellationToken ct) =>
        QueryAsync("SELECT * FROM accounting.get_transaction_register(@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8)",
            r => new RpcRegisterRow(
                r.GetGuid(0), r.GetGuid(1), r.GetFieldValue<DateOnly>(2), r.GetString(3), r.GetString(4), r.GetString(5),
                Str(r, 6), Str(r, 7), Str(r, 8), r.GetString(9),
                r.GetDecimal(10), r.GetDecimal(11), r.IsDBNull(12) ? null : r.GetDecimal(12),
                r.IsDBNull(13) ? null : r.GetGuid(13), Str(r, 14), Str(r, 15), r.GetDateTime(16),
                r.GetInt64(17), r.GetDecimal(18)),
            ct,
            Uuid("p0", companyId), Date("p1", from), Date("p2", to), P("p3", type?.ToString()), P("p4", status?.ToString()),
            Uuid("p5", contactId), P("p6", search), P("p7", limit), P("p8", offset));

    public Task<IReadOnlyList<RpcTrialBalanceRow>> GetTrialBalanceAsync(Guid? companyId, DateOnly? from, DateOnly? to, CancellationToken ct) =>
        QueryAsync("SELECT * FROM accounting.get_trial_balance(@p0, @p1, @p2)",
            r => new RpcTrialBalanceRow(r.GetGuid(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4), r.GetBoolean(5),
                r.GetDecimal(6), r.GetDecimal(7), r.GetDecimal(8), r.GetDecimal(9), r.GetDecimal(10), r.GetDecimal(11)),
            ct, Uuid("p0", companyId), Date("p1", from), Date("p2", to));

    public Task<IReadOnlyList<RpcCostCentreReportRow>> GetCostCentreReportAsync(Guid? companyId, Guid? dimensionId, DateOnly? from, DateOnly? to, CancellationToken ct) =>
        QueryAsync("SELECT * FROM accounting.get_cost_centre_report(@p0, @p1, @p2, @p3)",
            r => new RpcCostCentreReportRow(r.GetGuid(0), r.GetGuid(1), r.GetString(2), r.GetString(3), r.GetString(4),
                r.IsDBNull(5) ? null : r.GetGuid(5), r.GetInt32(6), r.GetBoolean(7),
                r.GetDecimal(8), r.GetDecimal(9), r.GetDecimal(10), r.GetInt64(11)),
            ct, Uuid("p0", companyId), Uuid("p1", dimensionId), Date("p2", from), Date("p3", to));

    // ── plumbing ─────────────────────────────────────────────────────────────

    private static string? Str(DbDataReader r, int i) => r.IsDBNull(i) ? null : r.GetString(i);

    private static NpgsqlParameter P(string name, object? value) => new(name, value ?? DBNull.Value);
    private static NpgsqlParameter Uuid(string name, Guid? value) => new(name, NpgsqlDbType.Uuid) { Value = value.HasValue ? value.Value : DBNull.Value };
    private static NpgsqlParameter Int(string name, int? value) => new(name, NpgsqlDbType.Integer) { Value = value.HasValue ? value.Value : DBNull.Value };
    private static NpgsqlParameter Numeric(string name, decimal? value) => new(name, NpgsqlDbType.Numeric) { Value = value.HasValue ? value.Value : DBNull.Value };
    private static NpgsqlParameter Date(string name, DateOnly? value) => new(name, NpgsqlDbType.Date) { Value = value.HasValue ? value.Value : DBNull.Value };
    private static NpgsqlParameter Jsonb(string name, string? json) => new(name, NpgsqlDbType.Jsonb) { Value = json is null ? DBNull.Value : json };
    private static NpgsqlParameter Bytea(string name, byte[] data) => new(name, NpgsqlDbType.Bytea) { Value = data };
    private static NpgsqlParameter TextArray(string name, IReadOnlyList<string>? values) =>
        new(name, NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = values is null ? DBNull.Value : values.ToArray() };

    private async Task<T> ScalarAsync<T>(string sql, CancellationToken ct, params NpgsqlParameter[] parameters)
    {
        await using var cmd = await CreateCommandAsync(sql, parameters, ct);
        var value = await RunAsync(() => cmd.ExecuteScalarAsync(ct));
        if (value is null || value is DBNull)
            throw new BadRequestException("The database function returned no value.");
        return (T)value;
    }

    private async Task ExecuteAsync(string sql, CancellationToken ct, params NpgsqlParameter[] parameters)
    {
        await using var cmd = await CreateCommandAsync(sql, parameters, ct);
        await RunAsync(() => cmd.ExecuteNonQueryAsync(ct));
    }

    private async Task<JsonElement> JsonAsync(string sql, CancellationToken ct, params NpgsqlParameter[] parameters)
    {
        await using var cmd = await CreateCommandAsync(sql, parameters, ct);
        var value = await RunAsync(() => cmd.ExecuteScalarAsync(ct));
        var text = value as string ?? "null";
        using var doc = JsonDocument.Parse(text);
        return doc.RootElement.Clone();
    }

    private async Task<IReadOnlyList<T>> QueryAsync<T>(string sql, Func<DbDataReader, T> map, CancellationToken ct, params NpgsqlParameter[] parameters)
    {
        await using var cmd = await CreateCommandAsync(sql, parameters, ct);
        return await RunAsync(async () =>
        {
            var list = new List<T>();
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct)) list.Add(map(reader));
            return (IReadOnlyList<T>)list;
        });
    }

    /// <summary>Command bound to EF's connection + current transaction; opens the connection if needed (fires the tenant interceptor).</summary>
    private async Task<NpgsqlCommand> CreateCommandAsync(string sql, NpgsqlParameter[] parameters, CancellationToken ct)
    {
        var connection = _db.Database.GetDbConnection() as NpgsqlConnection
            ?? throw new InvalidOperationException("Accounting RPCs require PostgreSQL (Npgsql).");
        if (connection.State != ConnectionState.Open)
            await _db.Database.OpenConnectionAsync(ct);

        var cmd = connection.CreateCommand();
        cmd.CommandText = sql;
        cmd.Transaction = _db.Database.CurrentTransaction?.GetDbTransaction() as NpgsqlTransaction;
        cmd.Parameters.AddRange(parameters);
        return cmd;
    }

    private static async Task<T> RunAsync<T>(Func<Task<T>> action)
    {
        try
        {
            return await action();
        }
        catch (PostgresException ex)
        {
            throw Translate(ex);
        }
    }

    /// <summary>SQLSTATE → Xorva exception. Messages come straight from the scripts (they are written for end users).</summary>
    private static Exception Translate(PostgresException ex) => ex.SqlState switch
    {
        PostgresErrorCodes.NoDataFound => new NotFoundException(ex.MessageText),
        PostgresErrorCodes.InsufficientPrivilege => new ForbiddenException(ex.MessageText),
        PostgresErrorCodes.UniqueViolation => new ConflictException(ex.MessageText),
        PostgresErrorCodes.CheckViolation or PostgresErrorCodes.RaiseException or PostgresErrorCodes.IntegrityConstraintViolation
            or PostgresErrorCodes.ForeignKeyViolation or PostgresErrorCodes.NotNullViolation => new BadRequestException(ex.MessageText),
        _ => ex,
    };
}
