using MediatR;
using Xorva.Core.Approvals;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Modules.Auth.DTOs;

namespace Xorva.Modules.Auth.Commands.RegisterUser;

/// <summary>
/// Command to register a new user in the system.
/// The caller's role determines which target roles they can create (enforced in handler).
/// Approvable: a company can require approval for new hires ("New Hire Approval").
/// </summary>
public record RegisterUserCommand : IRequest<ApiResponse<UserDto>>, IApprovableAction
{
    public string Email { get; init; } = string.Empty;
    public string Password { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public SystemRole Role { get; init; } = SystemRole.Employee;
    public Guid? TenantId { get; init; }
    public Guid? CompanyId { get; init; }
    public Guid? DepartmentId { get; init; }

    // ─── IApprovableAction ──────────────────────────────────────
    public const string ActionKey = "Auth.RegisterUser";
    public string ApprovalActionKey => ActionKey;
    public string ApprovalSummary => $"Add User: {FirstName} {LastName} ({Email}) as {Role}";
    public Guid? ApprovalCompanyId => CompanyId;
}
