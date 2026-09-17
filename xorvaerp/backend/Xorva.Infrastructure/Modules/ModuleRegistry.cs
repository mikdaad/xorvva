using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using Xorva.Core.Modules;

namespace Xorva.Infrastructure.Modules;

/// <summary>
/// Discovers the installed <see cref="IModule"/> plug-ins and drives their registration.
///
/// This is a pure kernel — it references no module. The composition root (Program.cs)
/// passes the installed module assemblies to <see cref="Discover"/>; everything else the
/// host needs (service registration, validator scanning, the module catalog) is derived
/// from what it finds. Adding a module no longer edits the DI container, the validator
/// scan and the DbContext separately — it self-registers through its <see cref="IModule"/>.
/// </summary>
public sealed class ModuleRegistry
{
    /// <summary>Installed modules, ordered so a dependency loads before its dependants.</summary>
    public IReadOnlyList<IModule> Modules { get; }

    private ModuleRegistry(IReadOnlyList<IModule> modules) => Modules = modules;

    /// <summary>Scans the given assemblies for concrete <see cref="IModule"/> types, ordered by <see cref="IModule.Order"/>.</summary>
    public static ModuleRegistry Discover(params Assembly[] assemblies)
    {
        var modules = assemblies
            .Distinct()
            .SelectMany(a => a.GetTypes())
            .Where(t => typeof(IModule).IsAssignableFrom(t) && t is { IsAbstract: false, IsInterface: false })
            .Select(t => (IModule)Activator.CreateInstance(t)!)
            .OrderBy(m => m.Order)
            .ToList();

        return new ModuleRegistry(modules);
    }

    /// <summary>Registers every installed module's services, in dependency order.</summary>
    public void RegisterAll(IServiceCollection services)
    {
        foreach (var module in Modules)
            module.RegisterServices(services);
    }

    /// <summary>All module assemblies — for cross-cutting scans (e.g. FluentValidation validators).</summary>
    public Assembly[] Assemblies => Modules.Select(m => m.Assembly).Distinct().ToArray();

    /// <summary>True if a module with this key is installed.</summary>
    public bool Exists(string key) => Modules.Any(m => m.Key == key);

    /// <summary>True if the module is always-on platform plumbing (not separately subscribable).</summary>
    public bool IsCore(string key) => Modules.FirstOrDefault(m => m.Key == key)?.IsCore ?? false;

    /// <summary>The optional, subscribable business modules (everything that is not core), in order.</summary>
    public IReadOnlyList<IModule> Subscribable => Modules.Where(m => !m.IsCore).ToList();

    /// <summary>
    /// Expands a set of module keys to also include all of their (transitive) dependencies —
    /// so enabling Commerce automatically pulls in Accounting. Unknown keys are dropped.
    /// </summary>
    public IReadOnlySet<string> ExpandWithDependencies(IEnumerable<string> keys)
    {
        var byKey = Modules.ToDictionary(m => m.Key);
        var result = new HashSet<string>();
        var pending = new Stack<string>(keys);
        while (pending.Count > 0)
        {
            var key = pending.Pop();
            if (!byKey.TryGetValue(key, out var module) || !result.Add(key)) continue;
            foreach (var dep in module.DependsOn) pending.Push(dep);
        }
        return result;
    }
}
