using System.Text.Json.Serialization;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Xorva.API.Behaviors;
using Xorva.API.Middleware;
using Xorva.Infrastructure.Extensions;
using Xorva.Infrastructure.Services;
using Xorva.Infrastructure.Modules;
using Xorva.Modules.Auth.Extensions;
using Xorva.Modules.Tenants.Extensions;
using Xorva.Modules.Approvals.Extensions;
using Xorva.Modules.HR.Extensions;
using Xorva.Modules.Accounting.Extensions;
using Xorva.Modules.Commerce.Extensions;
using Xorva.Modules.Platform.Extensions;

// ═══════════════════════════════════════════════════════════════════════════════
// XORVA ERP — Application Bootstrap
// ═══════════════════════════════════════════════════════════════════════════════
// Architecture: Modular Monolith with MediatR CQRS
// Auth: JWT Bearer with refresh token rotation
// Database: PostgreSQL (Neon) via EF Core
// Multi-tenancy: Global query filters + scoped tenant context
// ═══════════════════════════════════════════════════════════════════════════════

var builder = WebApplication.CreateBuilder(args);

// ─── Infrastructure (DbContext, JWT, Password, Tenant) ──────────────────────
builder.Services.AddInfrastructure(builder.Configuration);

// ─── Data Protection (encrypts the approval command payload at rest) ────────
// Default key ring. NOTE for production: persist keys (file/blob/KeyVault) so a
// restart can still decrypt in-flight approval payloads.
builder.Services.AddDataProtection();

// ─── Module Registration (self-registering plug-ins via the module kernel) ───
// The composition root declares which modules are INSTALLED (one assembly each); the
// registry then discovers their IModule manifests and wires each module's own services
// (MediatR handlers, engines, approvable actions) + exposes them via the catalog. To add
// a module: implement IModule and add its assembly to the list below — nothing else here.
var moduleRegistry = ModuleRegistry.Discover(
    typeof(AuthModule).Assembly,
    typeof(TenantsModule).Assembly,
    typeof(ApprovalsModule).Assembly,
    typeof(PlatformModule).Assembly,
    typeof(HrModule).Assembly,
    typeof(AccountingModule).Assembly,
    typeof(CommerceModule).Assembly);
moduleRegistry.RegisterAll(builder.Services);
builder.Services.AddSingleton(moduleRegistry);

// Cross-cutting dashboard aggregation (API-layer presentation concern).
builder.Services.AddScoped<Xorva.API.Dashboard.DashboardService>();

// ─── MediatR Pipeline Behaviors (ORDER MATTERS) ─────────────────────────────
// 1. Validation runs first — only VALID commands may be queued for approval.
// 2. Approval check runs second — intercepts approvable actions after validation.
builder.Services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));
builder.Services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ApprovalCheckBehavior<,>));

// ─── FluentValidation (scan every installed module assembly) ─────────────────
builder.Services.AddValidatorsFromAssemblies(moduleRegistry.Assemblies);

// ─── JWT Authentication ─────────────────────────────────────────────────────
var jwtService = new JwtTokenService(builder.Configuration);
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = jwtService.GetTokenValidationParameters();
    options.Events = new JwtBearerEvents
    {
        OnChallenge = context =>
        {
            // Override default WWW-Authenticate challenge to return our ApiResponse format
            context.HandleResponse();
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            context.Response.ContentType = "application/json";
            return context.Response.WriteAsJsonAsync(
                Xorva.Core.Common.ApiResponse.Fail("Authentication required. Please provide a valid JWT token."));
        }
    };
});

builder.Services.AddAuthorization();

// ─── CORS ───────────────────────────────────────────────────────────────────
var allowedOrigins = builder.Configuration.GetSection("CorsSettings:AllowedOrigins").Get<string[]>()
                     ?? ["http://localhost:5173"];

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// ─── Controllers + JSON Configuration ───────────────────────────────────────
builder.Services.AddControllers(options =>
    {
        // Promotes "queued for approval" responses to HTTP 202 Accepted.
        options.Filters.Add<Xorva.API.Filters.ApprovalStatusResultFilter>();
    })
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });

// ─── Swagger / OpenAPI ──────────────────────────────────────────────────────
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new() { Title = "Xorva ERP API", Version = "v1" });

    // JWT support in Swagger UI: the "Authorize" button. Paste the accessToken
    // from /api/auth/login — the "Bearer " prefix is added automatically.
    options.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = Microsoft.OpenApi.SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = Microsoft.OpenApi.ParameterLocation.Header,
        Description = "Paste ONLY the accessToken value from /api/auth/login (no 'Bearer ' prefix needed)."
    });
    options.AddSecurityRequirement(_ => new Microsoft.OpenApi.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.OpenApiSecuritySchemeReference("Bearer"),
            new List<string>()
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE PIPELINE — ORDER IS CRITICAL
// ═══════════════════════════════════════════════════════════════════════════════

var app = builder.Build();

// 1. Exception handler (FIRST — catches everything below)
app.UseMiddleware<ExceptionMiddleware>();

// 2. Request logging (logs method, path, status, duration)
app.UseMiddleware<RequestLoggingMiddleware>();

// 3. Swagger (dev only)
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "Xorva ERP API v1");
        options.RoutePrefix = "swagger";
    });
}

// 4. CORS
app.UseCors();

// 5. Authentication (validates JWT, populates HttpContext.User)
app.UseAuthentication();

// 6. Tenant Resolver (reads JWT claims → sets scoped ICurrentTenantService)
app.UseMiddleware<TenantResolverMiddleware>();

// 7. Authorization (checks [Authorize] and [RequireRole] attributes)
app.UseAuthorization();

// 8. Controllers (route to controller actions)
app.MapControllers();

// ─── Database: apply migrations + seed SystemAdmin ──────────────────────────
// (Not reached at EF design time — 'dotnet ef' aborts inside builder.Build().)
// Skipped in Testing: the integration-test factory owns schema creation (SQLite).
if (!app.Environment.IsEnvironment("Testing"))
{
    await Xorva.Infrastructure.Data.DbInitializer.InitializeAsync(app.Services);
}

// ─── Startup Banner ─────────────────────────────────────────────────────────
app.Logger.LogInformation("═══════════════════════════════════════════════════");
app.Logger.LogInformation("  XORVA ERP API v1.0 — Starting...");
app.Logger.LogInformation("  Environment: {Env}", app.Environment.EnvironmentName);
app.Logger.LogInformation("═══════════════════════════════════════════════════");

app.Run();

// ─── Required for Integration Tests (WebApplicationFactory needs this) ──────
public partial class Program { }
