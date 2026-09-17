using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Infrastructure.Services;

namespace Xorva.Infrastructure.Data;

/// <summary>
/// Runs at application startup:
/// 1. Applies any pending EF Core migrations (keeps Neon schema in sync automatically).
/// 2. Seeds the SystemAdmin ("God account") if none exists.
///
/// The seed credentials come from configuration (user-secrets in development):
///   SeedSettings:SystemAdminEmail    (default: admin@xorva.com)
///   SeedSettings:SystemAdminPassword (REQUIRED — never hardcoded, never a default)
///
/// If no SystemAdmin exists and no password is configured, we log a critical warning
/// and skip seeding rather than create an account with a known default password.
/// </summary>
public static class DbInitializer
{
    public static async Task InitializeAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<XorvaDbContext>();
        var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var passwordHasher = scope.ServiceProvider.GetRequiredService<PasswordHasher>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DbInitializer");

        // ─── 1. Apply pending migrations ────────────────────────
        var pending = (await db.Database.GetPendingMigrationsAsync()).ToList();
        if (pending.Count > 0)
        {
            logger.LogInformation("Applying {Count} pending migration(s): {Migrations}",
                pending.Count, string.Join(", ", pending));
            await db.Database.MigrateAsync();
        }

        // ─── 2. Seed SystemAdmin ────────────────────────────────
        var hasSystemAdmin = await db.Users
            .IgnoreQueryFilters()
            .AnyAsync(u => u.Role == SystemRole.SystemAdmin);

        if (hasSystemAdmin)
            return;

        var email = configuration["SeedSettings:SystemAdminEmail"] ?? "admin@xorva.com";
        var password = configuration["SeedSettings:SystemAdminPassword"];

        if (string.IsNullOrWhiteSpace(password))
        {
            logger.LogCritical(
                "No SystemAdmin exists and SeedSettings:SystemAdminPassword is not configured. " +
                "Set it via 'dotnet user-secrets set \"SeedSettings:SystemAdminPassword\" \"<password>\"' and restart.");
            return;
        }

        db.Users.Add(new ApplicationUser
        {
            Email = email.ToLower().Trim(),
            PasswordHash = passwordHasher.Hash(password),
            FirstName = "System",
            LastName = "Admin",
            Role = SystemRole.SystemAdmin,
            TenantId = null,   // SystemAdmin operates above tenants
            CompanyId = null,
            IsActive = true
        });

        await db.SaveChangesAsync();
        logger.LogInformation("SystemAdmin seeded: {Email}", email);
    }
}
