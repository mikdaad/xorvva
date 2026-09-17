using Microsoft.EntityFrameworkCore;

namespace Xorva.Core.Interfaces;

/// <summary>
/// Persistence abstraction that lets a business module own its entities and query
/// them WITHOUT referencing Infrastructure (which holds the concrete DbContext).
///
/// Dependency direction stays clean: Module → Core (this interface); Infrastructure
/// → Module (the concrete XorvaDbContext registers the module's entities). No cycle.
///
/// The generic Set&lt;T&gt;() carries the module's own entity types, so Core never
/// needs to know them. Global query filters and audit still apply — they live on the
/// concrete DbContext and work for any CompanyEntity subclass.
/// </summary>
public interface IXorvaDbContext
{
    /// <summary>The queryable/trackable set for an entity type.</summary>
    DbSet<TEntity> Set<TEntity>() where TEntity : class;

    /// <summary>Persists pending changes (audit fields are set automatically).</summary>
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
