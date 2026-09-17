using Xorva.Core.Enums;
using Xorva.Core.Interfaces;

namespace Xorva.Tests.Unit.TestHelpers;

/// <summary>
/// Test double for ICurrentTenantService. Lets each test act as any user/role/tenant.
/// </summary>
public class FakeTenantService : ICurrentTenantService
{
    public Guid UserId { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid CompanyId { get; private set; }
    public SystemRole Role { get; private set; } = SystemRole.Employee;
    public string Email { get; private set; } = string.Empty;

    public bool HasCrossCompanyAccess => Role <= SystemRole.SuperAdmin;

    public void SetTenant(Guid userId, Guid tenantId, Guid companyId, SystemRole role, string email)
    {
        UserId = userId;
        TenantId = tenantId;
        CompanyId = companyId;
        Role = role;
        Email = email;
    }
}
