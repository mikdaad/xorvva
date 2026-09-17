using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xorva.Infrastructure.Data;

namespace Xorva.Tests.Integration;

/// <summary>
/// Boots the REAL API — full middleware pipeline, JWT auth, MediatR, validators —
/// with a SQLite in-memory database instead of Neon PostgreSQL.
///
/// Environment "Testing":
///  - Program.cs skips DbInitializer (this factory owns schema creation)
///  - InfrastructureExtensions skips Npgsql (empty connection string)
/// </summary>
public class XorvaApiFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Test config (dummy JWT key, empty connection string) lives in
        // appsettings.Testing.json — loaded by the host itself. Injecting config
        // here would NOT work: with minimal hosting, factory-added sources load
        // BEFORE the app's appsettings.json and get overridden by it.
        builder.UseEnvironment("Testing");

        builder.ConfigureServices(services =>
        {
            // Swap the (unconfigured) Npgsql options for SQLite in-memory.
            // The connection stays open for the factory's lifetime — closing it
            // would destroy the in-memory database.
            var descriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(DbContextOptions<XorvaDbContext>));
            if (descriptor is not null)
                services.Remove(descriptor);

            _connection.Open();
            services.AddDbContext<XorvaDbContext>(options => options.UseSqlite(_connection));
        });
    }

    /// <summary>Creates the schema. Call once after construction.</summary>
    public void EnsureDatabaseCreated()
    {
        using var scope = Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<XorvaDbContext>().Database.EnsureCreated();
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
            _connection.Dispose();
    }
}
