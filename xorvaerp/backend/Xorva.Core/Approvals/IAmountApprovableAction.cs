using Xorva.Core.Interfaces;

namespace Xorva.Core.Approvals;

/// <summary>
/// Opt-in companion to <see cref="IApprovableAction"/> for actions whose approval
/// requirement can depend on a monetary amount. When the governing rule sets an
/// <see cref="Entities.ApprovalRule.AmountThreshold"/>, the engine resolves this
/// amount and routes the action for approval ONLY when amount &gt;= threshold;
/// smaller occurrences execute normally.
///
/// A rule with no threshold (the default) never calls this — behavior is unchanged.
/// An action that does NOT implement this interface cannot carry a threshold
/// (the rule builder won't offer the field, and the create handler rejects it).
/// </summary>
public interface IAmountApprovableAction : IApprovableAction
{
    /// <summary>
    /// The amount this occurrence represents, in the company's base currency. Some
    /// actions carry it on the command (a payment's allocated total, a journal's
    /// debit sum); others read it from the target document (an invoice/bill total) —
    /// hence the context and the async signature. Return 0 when it cannot be resolved
    /// (e.g. the document is missing) — the action then runs and fails in its handler.
    /// </summary>
    Task<decimal> ResolveApprovalAmountAsync(IXorvaDbContext db, CancellationToken ct);
}
