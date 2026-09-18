using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Xorva.Core.Interfaces;

namespace Xorva.Infrastructure.Data.Interceptors;

/// <summary>
/// Publishes the current request's tenant context to PostgreSQL every time EF Core opens
/// a connection: <c>SELECT app.set_session_context(user, tenant, company, role, cross)</c>.
///
/// This is the Xorva replacement for Supabase's <c>auth.uid()</c>/<c>auth.jwt()</c>: the
/// ported RLS policies (<c>app.has_company_access</c>) and RPCs
/// (<c>accounting.post_voucher_atomic</c>, <c>import_bank_statement</c>, report functions)
/// read these settings. It is the SECOND isolation layer — the EF global query filter in
/// <see cref="XorvaDbContext"/> stays the first.
///
/// Rules:
///  * Npgsql only. The Testing environment swaps in SQLite, where the function does not
///    exist; the interceptor detects that and becomes a no-op.
///  * Runs on every open (pooled connections are reset by Npgsql on return, which clears
///    session settings, so the values must be re-published per checkout).
///  * With no tenant context (migrations, DbInitializer seeding, background jobs) it still
///    calls the function with NULLs so a reused connection never carries a stale identity.
///    Those paths run as the table owner, which PostgreSQL exempts from RLS (ENABLE, not
///    FORCE) — see Sql/Accounting/0001_app_session_context.sql §3.
///  * Never throws for a missing function (e.g. a database where migrations have not yet
///    run): the app must be able to start and apply migration 0001 itself.
/// </summary>
public sealed class TenantSessionInterceptor : DbConnectionInterceptor
{
    private readonly ICurrentTenantService _tenant;

    // Set once we learn the current database lacks app.set_session_context (pre-migration
    // or non-PostgreSQL). Per-instance because the interceptor is scoped with the DbContext.
    private bool _disabled;

    public TenantSessionInterceptor(ICurrentTenantService tenant) => _tenant = tenant;

    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        if (ShouldSkip(connection)) return;
        try
        {
            using var cmd = BuildCommand(connection);
            cmd.ExecuteNonQuery();
        }
        catch (DbException ex) when (IsMissingFunction(ex))
        {
            _disabled = true;
        }
    }

    public override async Task ConnectionOpenedAsync(DbConnection connection, ConnectionEndEventData eventData, CancellationToken cancellationToken = default)
    {
        if (ShouldSkip(connection)) return;
        try
        {
            await using var cmd = BuildCommand(connection);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        catch (DbException ex) when (IsMissingFunction(ex))
        {
            _disabled = true;
        }
    }

    private bool ShouldSkip(DbConnection connection) =>
        _disabled || !connection.GetType().FullName!.StartsWith("Npgsql.", StringComparison.Ordinal);

    private DbCommand BuildCommand(DbConnection connection)
    {
        var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT app.set_session_context(@user, @tenant, @company, @role, @cross)";
        AddParam(cmd, "@user", NullIfEmpty(_tenant.UserId));
        AddParam(cmd, "@tenant", NullIfEmpty(_tenant.TenantId));
        AddParam(cmd, "@company", NullIfEmpty(_tenant.CompanyId));
        AddParam(cmd, "@role", (int)_tenant.Role);
        AddParam(cmd, "@cross", _tenant.HasCrossCompanyAccess && _tenant.TenantId != Guid.Empty);
        return cmd;
    }

    private static void AddParam(DbCommand cmd, string name, object? value)
    {
        var p = cmd.CreateParameter();
        p.ParameterName = name;
        p.Value = value ?? DBNull.Value;
        // Npgsql infers uuid/int/bool from the CLR type; DBNull needs an explicit type.
        if (value is null) p.DbType = System.Data.DbType.Guid;
        cmd.Parameters.Add(p);
    }

    private static object? NullIfEmpty(Guid id) => id == Guid.Empty ? null : id;

    /// <summary>PostgreSQL 42883 undefined_function / 3F000 invalid_schema_name.</summary>
    private static bool IsMissingFunction(DbException ex) =>
        ex.SqlState is "42883" or "3F000";
}
