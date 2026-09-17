using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Commands.CreateDepartment;

public record CreateDepartmentCommand : IRequest<ApiResponse<DepartmentDto>>
{
    public Guid? CompanyId { get; init; }   // CEO may target a company; else caller's own
    public string Name { get; init; } = string.Empty;
    public string Code { get; init; } = string.Empty;
    public string? Description { get; init; }
    public DepartmentFunction Function { get; init; } = DepartmentFunction.General;
    public Guid? ParentDepartmentId { get; init; }
    public List<DepartmentRuleDto>? Rules { get; init; }
}
