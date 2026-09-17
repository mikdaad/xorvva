using Xorva.Core.Approvals;

namespace Xorva.Infrastructure.Services;

/// <summary>
/// Singleton registry built from every ApprovableActionDescriptor the modules
/// registered in DI. This is what makes the rule builder dynamic: modules declare
/// their actions, the engine indexes them, no hardcoding.
/// </summary>
public class ApprovableActionRegistry : IApprovableActionRegistry
{
    private readonly Dictionary<string, ApprovableActionDescriptor> _byKey;

    public ApprovableActionRegistry(IEnumerable<ApprovableActionDescriptor> descriptors)
    {
        // Last registration wins on key collision (deterministic, avoids startup crash).
        _byKey = descriptors
            .GroupBy(d => d.ActionKey)
            .ToDictionary(g => g.Key, g => g.Last());
    }

    public IReadOnlyCollection<ApprovableActionDescriptor> All => _byKey.Values;

    public ApprovableActionDescriptor? Find(string actionKey) =>
        _byKey.GetValueOrDefault(actionKey);

    public Type? ResolveCommandType(string actionKey) =>
        _byKey.TryGetValue(actionKey, out var d) ? d.CommandType : null;
}
