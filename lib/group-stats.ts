import { calculateCashRequired, calculatePL } from './calculations';
import type { Trade, TradeGroup } from '../types/trade';

// Per-group P&L + cash + return %. Used by the Closed Groups list,
// the dashboard Quick Stats card, and the stat strip.
//
// Rules:
//   - Excludes is_closing_trade rows (they're matched by their original sell).
//   - Cash basis = first non-synthetic-stock trade's cash required, defaulting
//     to 0 if none. (Stocks/assignment rows have no notional collateral.)
export interface GroupStats {
  group: TradeGroup;
  trades: Trade[];
  netPL: number;
  cashBasis: number;
  returnPct: number;       // 0 if cash basis is 0
  hasOpenLeg: boolean;
  hasFullWheel: boolean;
}

export function computeGroupStats(
  group: TradeGroup,
  allTrades: Trade[]
): GroupStats {
  const closedTrades = allTrades.filter((t) => t.status !== 'open');
  const trades = group.trade_ids
    .map((id) => allTrades.find((t) => t.id === id))
    .filter((t): t is Trade => Boolean(t));

  const netPL = trades.reduce(
    (sum, t) => (t.is_closing_trade ? sum : sum + calculatePL(t, closedTrades)),
    0
  );

  // Cash basis: first leg with non-zero cash required (skips synthetic stock rows).
  let cashBasis = 0;
  for (const t of trades) {
    if (t.action === 'assignment' || t.action === 'called-away') continue;
    const cash = calculateCashRequired(t);
    if (cash > 0) {
      cashBasis = cash;
      break;
    }
  }

  const returnPct = cashBasis > 0 ? (netPL / cashBasis) * 100 : 0;
  const hasOpenLeg = trades.some((t) => t.status === 'open');
  const hasFullWheel = trades.some((t) => t.is_called_away);

  return { group, trades, netPL, cashBasis, returnPct, hasOpenLeg, hasFullWheel };
}
