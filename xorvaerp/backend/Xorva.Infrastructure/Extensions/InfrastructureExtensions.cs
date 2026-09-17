using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xorva.Core.Approvals;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Infrastructure.Services;

namespace Xorva.Infrastructure.Extensions;

/// <summary>
/// DI registration for all Infrastructure services.
/// Called from Program.cs: builder.Services.AddInfrastructure(configuration)
/// </summary>
public static class InfrastructureExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // ─── Database ───────────────────────────────────────────
        // In the Testing environment the connection string is empty and the
        // integration-test factory replaces these options with SQLite in-memory,
        // so Npgsql is only configured when a real connection string exists.
        var connectionString = configuration.GetConnectionString("DefaultConnection");
        services.AddDbContext<XorvaDbContext>(options =>
        {
            if (string.IsNullOrWhiteSpace(connectionString))
                return;

            options.UseNpgsql(
                connectionString,
                npgsqlOptions =>
                {
                    npgsqlOptions.EnableRetryOnFailure(
                        maxRetryCount: 3,
                        maxRetryDelay: TimeSpan.FromSeconds(5),
                        errorCodesToAdd: null);

                    // Migration assembly is Infrastructure since that's where DbContext lives
                    npgsqlOptions.MigrationsAssembly(typeof(XorvaDbContext).Assembly.FullName);
                });
        });

        // ─── Core Services ──────────────────────────────────────
        services.AddScoped<ICurrentTenantService, CurrentTenantService>();
        services.AddSingleton<IDateTimeProvider, DateTimeProvider>();
        services.AddSingleton<PasswordHasher>();
        services.AddSingleton<JwtTokenService>();

        // ─── Approval Engine ────────────────────────────────────
        // Registry is a singleton built from all ApprovableActionDescriptors that
        // modules register in DI. Execution context is scoped (per request/replay).
        services.AddSingleton<IApprovableActionRegistry, ApprovableActionRegistry>();
        services.AddScoped<IApprovalExecutionContext, ApprovalExecutionContext>();
        // Encrypts the stored approval command payload (salary, password, ...).
        services.AddSingleton<IApprovalPayloadProtector, ApprovalPayloadProtector>();

        // ─── Persistence abstraction for module-owned entities ──
        services.AddScoped<IXorvaDbContext>(sp => sp.GetRequiredService<XorvaDbContext>());

        return services;
    }
}
