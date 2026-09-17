namespace Xorva.Core.Approvals;

/// <summary>
/// Central catalog of every approvable action registered by the modules.
/// Singleton, populated once at startup from all registered descriptors.
/// </summary>
public interface IApprovableActionRegistry
{
    /// <summary>All registered descriptors.</summary>
    IReadOnlyCollection<ApprovableActionDescriptor> All { get; }

    /// <summary>Descriptor for an action key, or null if unknown/unregistered (orphaned rule).</summary>
    ApprovableActionDescriptor? Find(string actionKey);

    /// <summary>Resolves the command CLR type for an action key — used to deserialize on replay.</summary>
    Type? ResolveCommandType(string actionKey);
}
