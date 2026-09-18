using System.Reflection;

namespace Xorva.Infrastructure.Sql;

/// <summary>
/// Reads the SQL files under <c>Sql/**</c> that are compiled into this assembly as
/// embedded resources. They are the SOURCE OF TRUTH for the accounting schema that was
/// ported from TrueLedge (PostgreSQL RPCs, RLS policies, invariant triggers). EF Core
/// does not model them; a thin migration per file calls <see cref="Read"/> and hands
/// the text to <c>migrationBuilder.Sql(...)</c>.
///
/// Every script is idempotent (CREATE OR REPLACE / IF NOT EXISTS / DROP TRIGGER IF
/// EXISTS), so re-running one is safe. Resource names follow the MSBuild convention:
/// <c>Xorva.Infrastructure.Sql.Accounting.0001_app_session_context.sql</c>.
/// </summary>
public static class SqlScript
{
    private static readonly Assembly Assembly = typeof(SqlScript).Assembly;

    /// <summary>Returns the text of an embedded script, e.g. <c>Read("Accounting", "0001_app_session_context.sql")</c>.</summary>
    public static string Read(string folder, string fileName)
    {
        var resourceName = $"Xorva.Infrastructure.Sql.{folder}.{fileName}";
        using var stream = Assembly.GetManifestResourceStream(resourceName)
            ?? throw new FileNotFoundException(
                $"Embedded SQL script '{resourceName}' was not found. " +
                $"Available: {string.Join(", ", Assembly.GetManifestResourceNames().Where(n => n.EndsWith(".sql")))}");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    /// <summary>All embedded accounting scripts in apply order (file names sort by their 4-digit prefix).</summary>
    public static IReadOnlyList<string> AccountingScripts() =>
        Assembly.GetManifestResourceNames()
            .Where(n => n.StartsWith("Xorva.Infrastructure.Sql.Accounting.") && n.EndsWith(".sql"))
            .Select(n => n["Xorva.Infrastructure.Sql.Accounting.".Length..])
            .OrderBy(n => n, StringComparer.Ordinal)
            .ToList();
}
