import type { Trade, TradeGroup } from '../types/trade';

// =============================================================================
// "Closed group" rule (stricter than v2's first cut, restored from v1):
//
//   A group is closed iff
//     (a) every member trade is non-open, AND
//     (b) no trade in the broader trades[] array — even one not in the group —
//         shares the group's trade_ref AND is still open.
//
// The (b) clause catches rolled cycles: the new open leg shares trade_ref
// with the closed buyback in the group, so collateral and risk are still
// active. v1 had this; v2 dropped it; this restores it.
//
// Group ref is derived from the FIRST member trade. If a group's members
// disagree on trade_ref (manual mixed group), use whatever the first member
// has — same heuristic as v1.
// =============================================================================

export function getGroupRef(
  group: TradeGroup,
  trades: Trade[]
): string | null {
  for (const id of group.trade_ids) {
    const t = trades.find((x) => x.id === id);
    if (t && t.trade_ref) return t.trade_ref;
  }
  return null;
}

export function isGroupClosed(
  group: TradeGroup,
  trades: Trade[]
): boolean {
  // (a) every member non-open
  const allMembersClosed = group.trade_ids.every((id) => {
    const t = trades.find((x) => x.id === id);
    return !t || t.status !== 'open';
  });
  if (!allMembersClosed) return false;

  // (b) no open trade in trades[] with the same trade_ref as the group
  const ref = getGroupRef(group, trades);
  if (ref == null) return true;     // ungrouped/manual group with no ref → no risk binding
  const refHasOpenTrade = trades.some(
    (t) => t.status === 'open' && t.trade_ref === ref
  );
  return !refHasOpenTrade;
}

export function getClosedGroups(
  groups: TradeGroup[],
  trades: Trade[]
): TradeGroup[] {
  return groups.filter((g) => isGroupClosed(g, trades));
}

// Predicate used by Create/Manage modals to warn the user before they save a
// group that the closed-groups rule will hide. Same semantics as
// isGroupClosed — operates on a candidate trade_ids[] without needing a full
// TradeGroup. Returns the conflicting trade_ref so the warning can name it.
export function findHidingRef(
  tradeIds: string[],
  trades: Trade[]
): string | null {
  if (tradeIds.length === 0) return null;
  // (a) all members must be non-open; if any is open, the group is "hidden"
  // for a different reason — not the rule (b) ref conflict — so don't warn here.
  const anyMemberOpen = tradeIds.some((id) => {
    const t = trades.find((x) => x.id === id);
    return t?.status === 'open';
  });
  if (anyMemberOpen) return null;

  // Use getGroupRef semantics: first member with non-null ref wins.
  let ref: string | null = null;
  for (const id of tradeIds) {
    const t = trades.find((x) => x.id === id);
    if (t && t.trade_ref) {
      ref = t.trade_ref;
      break;
    }
  }
  if (ref == null) return null;

  const refHasOpenTrade = trades.some(
    (t) => t.status === 'open' && t.trade_ref === ref
  );
  return refHasOpenTrade ? ref : null;
}
