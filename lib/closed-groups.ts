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
