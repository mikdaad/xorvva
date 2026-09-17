using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Auth.DTOs;

namespace Xorva.Modules.Auth.Commands.SetUserActive;

/// <summary>
/// Activate or deactivate a user (soft enable/disable of their login). The caller can only
/// manage users within their reach (SuperAdmin: their tenant; CompanyAdmin: their company)
/// and strictly below their own privilege. You can never change your own status.
/// </summary>
public record SetUserActiveCommand : IRequest<ApiResponse<UserDto>>
{
    public Guid UserId { get; init; }
    public bool IsActive { get; init; }
}

public class SetUserActiveCommandHandler : IRequestHandler<SetUserActiveCommand, ApiResponse<UserDto>>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public SetUserActiveCommandHandler(XorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<UserDto>> Handle(SetUserActiveCommand request, CancellationToken ct)
    {
        if (request.UserId == _tenant.UserId)
            throw new BadRequestException("You can't change your own account status.");

        var user = await _db.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == request.UserId, ct)
            ?? throw new NotFoundException("User", request.UserId);

        // Reach: non-system callers stay inside their tenant; a CompanyAdmin inside their company.
        if (_tenant.Role != SystemRole.SystemAdmin)
        {
            if (user.TenantId != _tenant.TenantId)
                throw new NotFoundException("User", request.UserId);
            if (_tenant.Role == SystemRole.CompanyAdmin && user.CompanyId != _tenant.CompanyId)
                throw new NotFoundException("User", request.UserId);
        }

        // Privilege: only manage users below your own rank.
        if ((int)user.Role <= (int)_tenant.Role)
            throw new ForbiddenException("You can only manage users with lower privilege than your own.");

        user.IsActive = request.IsActive;
        await _db.SaveChangesAsync(ct);

        return ApiResponse<UserDto>.Ok(user.ToDto(), request.IsActive ? "User activated." : "User deactivated.");
    }
}
