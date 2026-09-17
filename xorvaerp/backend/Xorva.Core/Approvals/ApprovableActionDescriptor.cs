namespace Xorva.Core.Approvals;

/// <summary>
/// Describes one approvable action a module exposes. Registered at startup so the
/// rule-builder dropdowns are populated DYNAMICALLY — no hardcoded action list in
/// the engine. A new module in a future phase just registers its descriptors and
/// its actions appear in the approval settings automatically.
/// </summary>
/// <param name="Module">Business module label shown in the rule builder (e.g. "HR", "Organization").</param>
/// <param name="ActionKey">Stable key, matches the command's ApprovalActionKey.</param>
/// <param name="DisplayName">Friendly action name for the Action dropdown.</param>
/// <param name="CommandType">The command CLR type — used to deserialize + replay.</param>
/// <param name="RequiresModuleActivation">
/// True for business-module actions (only offered to companies that activated the module).
/// False for foundation actions (always available, e.g. Organization/Users).
/// </param>
/// <param name="SupportsAmountThreshold">
/// True when the command implements <see cref="IAmountApprovableAction"/>, so a rule for
/// it may carry an amount threshold. The rule builder shows the threshold field only for
/// these actions. Defaults false — existing (non-money) actions are unaffected.
/// </param>
public record ApprovableActionDescriptor(
    string Module,
    string ActionKey,
    string DisplayName,
    Type CommandType,
    bool RequiresModuleActivation,
    bool SupportsAmountThreshold = false);
