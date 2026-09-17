using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;

namespace Xorva.Modules.Tenants.Commands.CompleteOnboarding;

/// <summary>Stamps the caller's tenant as onboarded (called when the CEO finishes/skips the wizard).</summary>
public record CompleteOnboardingCommand : IRequest<ApiResponse>;

public class CompleteOnboardingCommandHandler : IRequestHandler<CompleteOnboardingCommand, ApiResponse>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public CompleteOnboardingCommandHandler(XorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse> Handle(CompleteOnboardingCommand request, CancellationToken cancellationToken)
    {
        var tenant = await _db.Tenants.FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("No tenant context.");

        tenant.OnboardedAt ??= DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return ApiResponse.Ok("Onboarding complete.");
    }
}
