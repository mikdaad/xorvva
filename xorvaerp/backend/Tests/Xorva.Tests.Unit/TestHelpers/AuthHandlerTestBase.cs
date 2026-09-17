using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Infrastructure.Data;
using Xorva.Infrastructure.Services;

namespace Xorva.Tests.Unit.TestHelpers;

/// <summary>
/// Shared fixture for auth handler tests.
/// Uses SQLite in-memory — a real relational database with FKs and unique indexes,
/// far closer to PostgreSQL behavior than the EF InMemory provider.
/// Each test class instance gets a fresh isolated database.
/// </summary>
public abstract class AuthHandlerTestBase : IDisposable
{
    protected readonly FakeTenantService TenantService = new();
    protected readonly XorvaDbContext Db;
    protected readonly PasswordHasher Hasher = new();
    protected readonly IConfiguration Config;
    protected readonly JwtTokenService JwtService;

    private readonly SqliteConnection _connection;

    protected AuthHandlerTestBase()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<XorvaDbContext>()
            .UseSqlite(_connection)
            .Options;

        Db = new XorvaDbContext(options, TenantService);
        Db.Database.EnsureCreated();

        Config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["JwtSettings:SecretKey"] = new string('k', 88),
                ["JwtSettings:Issuer"] = "XorvaERP.Tests",
                ["JwtSettings:Audience"] = "XorvaERP.Tests",
                ["JwtSettings:AccessTokenExpirationMinutes"] = "15",
                ["JwtSettings:RefreshTokenExpirationDays"] = "7"
            })
            .Build();

        JwtService = new JwtTokenService(Config);
    }

    /// <summary>Seeds a user directly into the database and returns it.</summary>
    protected ApplicationUser SeedUser(
        string email,
        string password = "Password@123",
        SystemRole role = SystemRole.Employee,
        Guid? tenantId = null,
        Guid? companyId = null,
        bool isActive = true)
    {
        var user = new ApplicationUser
        {
            Email = email.ToLower(),
            PasswordHash = Hasher.Hash(password),
            FirstName = "Test",
            LastName = "User",
            Role = role,
            TenantId = tenantId,
            CompanyId = companyId,
            IsActive = isActive
        };
        Db.Users.Add(user);
        Db.SaveChanges();
        return user;
    }

    /// <summary>Seeds a Tenant root row (required by FK before any Company can exist).</summary>
    protected Tenant SeedTenant(Guid? id = null)
    {
        var tenant = new Tenant
        {
            Id = id ?? Guid.CreateVersion7(),
            Name = "Test Tenant",
            ContactEmail = "owner@test.tenant"
        };
        Db.Tenants.Add(tenant);
        Db.SaveChanges();
        return tenant;
    }

    /// <summary>Seeds a Company under an existing Tenant.</summary>
    protected Company SeedCompany(Guid tenantId, string name = "Test Co")
    {
        var company = new Company { TenantId = tenantId, Name = name };
        Db.Companies.Add(company);
        Db.SaveChanges();
        return company;
    }

    /// <summary>Makes the fake tenant service act as the given user.</summary>
    protected void ActAs(ApplicationUser user) =>
        TenantService.SetTenant(
            user.Id,
            user.TenantId ?? Guid.Empty,
            user.CompanyId ?? Guid.Empty,
            user.Role,
            user.Email);

    public void Dispose()
    {
        Db.Dispose();
        _connection.Dispose();
        GC.SuppressFinalize(this);
    }
}
