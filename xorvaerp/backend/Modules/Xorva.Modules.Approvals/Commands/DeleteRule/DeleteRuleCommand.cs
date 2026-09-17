using MediatR;
using Xorva.Core.Common;

namespace Xorva.Modules.Approvals.Commands.DeleteRule;

public record DeleteRuleCommand(Guid RuleId) : IRequest<ApiResponse>;
