using MediatR;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Auth.DTOs;

namespace Xorva.Modules.Auth.Commands.RegisterUser;

/// <summary>
/// Registers a new user. All the rules (role hierarchy, tenant/company scoping, email
/// uniqueness, password hashing) live in <see cref="IUserProvisioningService"/> so this
/// path and the person-centric CreateEmployee "grant access" path stay identical.
/// </summary>
public class RegisterUserCommandHandler : IRequestHandler<RegisterUserCommand, ApiResponse<UserDto>>
{
    private readonly IUserProvisioningService _provisioning;

    public RegisterUserCommandHandler(IUserProvisioningService provisioning)
    {
        _provisioning = provisioning;
    }

    public async Task<ApiResponse<UserDto>> Handle(RegisterUserCommand request, CancellationToken cancellationToken)
    {
        var user = await _provisioning.ProvisionAsync(new ProvisionLoginRequest
        {
            Email = request.Email,
            Password = request.Password,
            FirstName = request.FirstName,
            LastName = request.LastName,
            Role = request.Role,
            TenantId = request.TenantId,
            CompanyId = request.CompanyId,
            DepartmentId = request.DepartmentId
        }, cancellationToken);

        return ApiResponse<UserDto>.Ok(user.ToDto(), "User registered successfully.");
    }
}
