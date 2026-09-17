using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Auth.DTOs;

namespace Xorva.Modules.Auth.Queries.GetCurrentUser;

public class GetCurrentUserQueryHandler : IRequestHandler<GetCurrentUserQuery, ApiResponse<UserDto>>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenantService;

    public GetCurrentUserQueryHandler(XorvaDbContext db, ICurrentTenantService tenantService)
    {
        _db = db;
        _tenantService = tenantService;
    }

    public async Task<ApiResponse<UserDto>> Handle(GetCurrentUserQuery request, CancellationToken cancellationToken)
    {
        var user = await _db.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == _tenantService.UserId, cancellationToken);

        if (user is null)
            throw new NotFoundException("User", _tenantService.UserId);

        return ApiResponse<UserDto>.Ok(user.ToDto());
    }
}
