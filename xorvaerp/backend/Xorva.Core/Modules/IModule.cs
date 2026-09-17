using System.Reflection;
using Microsoft.Extensions.DependencyInjection;

namespace Xorva.Core.Modules;

/// <summary>
/// The plug-in contract every Xorva platform module implements.
///
/// This is the seam that makes modules INDEPENDENT: the application composes itself
/// from the set of installed <see cref="IModule"/> implementations instead of a central
/// file hard-listing each module's services, validators and metadata. Adding a module
/// becomes "ship an <see cref="IModule"/> in a referenced assembly" — no edits to the
/// host's startup.
///
/// A module self-declares:
///  • its identity (<see cref="Key"/>, <see cref="DisplayName"/>, <see cref="Description"/>) — drives the subscription catalog,
///  • its dependencies (<see cref="DependsOn"/>) — so we never enable a module without its prerequisites,
///  • whether it is always-on platform plumbing or an optional, subscribable business module (<see cref="IsCore"/>),
///  • how to register its own services (<see cref="RegisterServices"/>).
/// </summary>
public interface IModule
{
    /// <summary>Stable key, also stored in <c>Company.ActiveModules</c> (see <c>ModuleCatalog</c>).</summary>
    string Key { get; }

    /// <summary>Human-readable name shown in the module catalog / marketplace.</summary>
    string DisplayName { get; }

    /// <summary>One-line description for the catalog.</summary>
    string Description { get; }

    /// <summary>Keys of modules this one requires (e.g. Payroll depends on HR + Accounting).</summary>
    string[] DependsOn { get; }

    /// <summary>
    /// Core platform modules (Auth, Tenants, Approvals) are always on and cannot be
    /// unsubscribed. Business modules (HR, Accounting, …) are optional and subscribable.
    /// </summary>
    bool IsCore { get; }

    /// <summary>Registration order; lower runs first, so a dependency loads before its dependants.</summary>
    int Order { get; }

    /// <summary>The module's own assembly — used to scan handlers, validators and EF configurations.</summary>
    Assembly Assembly { get; }

    /// <summary>Registers this module's services (MediatR handlers, engines, approvable actions).</summary>
    void RegisterServices(IServiceCollection services);
}
