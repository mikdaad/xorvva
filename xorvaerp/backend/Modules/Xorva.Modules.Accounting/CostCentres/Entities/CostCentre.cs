using Xorva.Core.Entities;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.CostCentres.Entities;

/// <summary>
/// A cost-centre category (ported from TrueLedge <c>cost_centre_dimensions</c>): Project,
/// Department, Location … Each dimension owns a tree of <see cref="CostCentre"/>s.
/// Table DDL, RLS and triggers: <c>Sql/Accounting/0002_cost_centres.sql</c>.
/// </summary>
public class CostCentreDimension : CompanyEntity
{
    public CostCentreDimensionType DimensionType { get; set; } = CostCentreDimensionType.Custom;
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    /// <summary>When true the entry screen insists on a cost centre for every P&amp;L line.</summary>
    public bool IsMandatory { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
}

/// <summary>
/// A node in a dimension's tree (ported from TrueLedge <c>cost_centres</c>). Groups cannot be
/// posted to (trigger); <see cref="Level"/> is maintained by the database from
/// <see cref="ParentId"/>. Journal lines reference leaves through JournalLines.CostCentreId.
/// </summary>
public class CostCentre : CompanyEntity
{
    public Guid DimensionId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public Guid? ParentId { get; set; }
    /// <summary>Depth in the tree, 1 = root. Computed by trg_cost_centres_level.</summary>
    public short Level { get; set; } = 1;
    public bool IsGroup { get; set; }
    public bool IsActive { get; set; } = true;
    public decimal? Budget { get; set; }
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
}
