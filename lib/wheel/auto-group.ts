import type { Trade, TradeGroup } from '../../types/trade';

// =============================================================================
// Auto-Group by Trade Ref — destructive rebuild of "auto-shaped" groups.
//
// Rules:
//   - "Auto-shaped" group = name starts with "Trade Ref:". Safe to rebuild.
//   - "Manual" group = name does NOT start with "Trade Ref:". Preserved.
//   - Rebuilt group name:
//       Trade Ref: {ref} - Full Wheel Cycle  if any member is is_called_away
//       Trade Ref: {ref}                     otherwise
//   - Only CLOSED trades with a non-empty trade_ref are bucketed.
//     Open trades, ungrouped trades, and trades with null/'' trade_ref are
//     left alone — they stay wherever they were before (manual groups), or
//     remain ungrouped.
// =============================================================================

const AUTO_PREFIX = 'Trade Ref:';
const FULL_WHEEL_SUFFIX = ' - Full Wheel Cycle';

export function isAutoShapedName(name: string): boolean {
  return name.startsWith(AUTO_PREFIX);
}

export interface AutoGroupPlan {
  // Groups to KEEP exactly as-is (these are manual, name doesn't match prefix).
  preserved: TradeGroup[];

  // Groups to DELETE (these are old auto-shaped groups being replaced).
  toDelete: TradeGroup[];

  // Groups to CREATE (the rebuilt set).
  // Each carries the chosen name + the trade_ids that fall under that ref.
  toCreate: { name: string; trade_ids: string[] }[];
}

// Pure planner. Caller (UI) shows the confirmation dialog using
// `preserved.length`, `toDelete.length`, `toCreate.length`, then commits.
export function planAutoGroup(
  trades: Trade[],
  existingGroups: TradeGroup[]
): AutoGroupPlan {
  const preserved = existingGroups.filter((g) => !isAutoShapedName(g.name));
  const toDelete = existingGroups.filter((g) => isAutoShapedName(g.name));

  // Bucket eligible closed trades by trade_ref.
  const byRef = new Map<string, Trade[]>();
  for (const t of trades) {
    if (t.status === 'open') continue;
    const ref = t.trade_ref;
    if (ref == null || ref === '') continue;
    const arr = byRef.get(ref);
    if (arr) arr.push(t);
    else byRef.set(ref, [t]);
  }

  const toCreate: { name: string; trade_ids: string[] }[] = [];
  for (const [ref, members] of byRef) {
    const isFullWheel = members.some((t) => t.is_called_away);
    const name = `${AUTO_PREFIX} ${ref}${isFullWheel ? FULL_WHEEL_SUFFIX : ''}`;
    // Dedupe by id (defensive — same trade shouldn't appear twice but be safe).
    const ids = Array.from(new Set(members.map((t) => t.id)));
    toCreate.push({ name, trade_ids: ids });
  }

  // Stable order: alphabetical by name keeps tests + UI consistent.
  toCreate.sort((a, b) => a.name.localeCompare(b.name));

  return { preserved, toDelete, toCreate };
}

// Convenience for the UI dialog summary.
export interface AutoGroupSummary {
  existingTotal: number;
  existingAuto: number;
  existingManual: number;
  rebuiltCount: number;
}

export function summarizeAutoGroup(
  plan: AutoGroupPlan
): AutoGroupSummary {
  const existingAuto = plan.toDelete.length;
  const existingManual = plan.preserved.length;
  return {
    existingTotal: existingAuto + existingManual,
    existingAuto,
    existingManual,
    rebuiltCount: plan.toCreate.length,
  };
}
