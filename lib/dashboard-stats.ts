import { calculateCashRequired, calculatePL } from './calculations';
import { getClosedGroups } from './closed-groups';
import { daysBetween } from './dates';
import type { Trade, TradeGroup } from '../types/trade';

// =============================================================================
// Win Rate — closed groups only, judged by net group P&L.
//   net > 0  → win
//   net <= 0 → loss
// Open/rolled groups (any group containing a still-open trade) excluded.
// =============================================================================

export interface WinRateResult {
  wins: number;
  losses: number;
  rate: number;     // 0..100
  groupCount: number;
}

export function computeWinRate(
  groups: TradeGroup[],
  trades: Trade[]
): WinRateResult {
  const closedTrades = trades.filter((t) => t.status !== 'open');

  const closedGroups = getClosedGroups(groups, trades);

  let wins = 0;
  let losses = 0;
  for (const g of closedGroups) {
    const ts = g.trade_ids
      .map((id) => trades.find((x) => x.id === id))
      .filter((x): x is Trade => Boolean(x));
    const net = ts.reduce(
      (sum, t) => (t.is_closing_trade ? sum : sum + calculatePL(t, closedTrades)),
      0
    );
    if (net > 0) wins++;
    else losses++;
  }
  const total = wins + losses;
  return {
    wins,
    losses,
    rate: total > 0 ? (wins / total) * 100 : 0,
    groupCount: closedGroups.length,
  };
}

// =============================================================================
// Avg DTE — open option legs only. Stocks not swept in.
// =============================================================================

export interface AvgDTEResult {
  avg: number;
  min: number | null;
  max: number | null;
  count: number;
}

export function computeAvgDTE(
  trades: Trade[],
  now: Date = new Date()
): AvgDTEResult {
  const openLegs = trades.filter(
    (t) =>
      t.status === 'open' &&
      (t.action === 'sell' || t.action === 'buy') &&
      (t.type === 'put' || t.type === 'call') &&
      t.exp_date != null
  );
  if (openLegs.length === 0) {
    return { avg: 0, min: null, max: null, count: 0 };
  }
  const dtes = openLegs.map((t) => daysBetween(parseLocalYMD(t.exp_date!), now));
  const sum = dtes.reduce((a, b) => a + b, 0);
  return {
    avg: sum / openLegs.length,
    min: Math.min(...dtes),
    max: Math.max(...dtes),
    count: openLegs.length,
  };
}

// =============================================================================
// Allocation by symbol — open option legs only, sorted desc by $ at risk.
// =============================================================================

export interface AllocationRow {
  symbol: string;
  cash: number;
  pct: number;       // 0..100
}

export function computeAllocation(trades: Trade[]): AllocationRow[] {
  const openLegs = trades.filter(
    (t) =>
      t.status === 'open' &&
      (t.action === 'sell' || t.action === 'buy') &&
      (t.type === 'put' || t.type === 'call')
  );
  const bySymbol = new Map<string, number>();
  for (const t of openLegs) {
    const cash = calculateCashRequired(t);
    if (cash <= 0) continue;
    bySymbol.set(t.symbol, (bySymbol.get(t.symbol) ?? 0) + cash);
  }
  const total = Array.from(bySymbol.values()).reduce((a, b) => a + b, 0);
  return Array.from(bySymbol.entries())
    .map(([symbol, cash]) => ({
      symbol,
      cash,
      pct: total > 0 ? (cash / total) * 100 : 0,
    }))
    .sort((a, b) => b.cash - a.cash);
}

// =============================================================================
// Quick Stats — avg / best / worst trade P&L over closed groups
// =============================================================================

export interface QuickStats {
  avg: number;
  best: number;
  worst: number;
  count: number;
}

export function computeQuickStats(
  groups: TradeGroup[],
  trades: Trade[]
): QuickStats {
  const closedTrades = trades.filter((t) => t.status !== 'open');
  const closedGroups = getClosedGroups(groups, trades);
  const groupPLs = closedGroups.map((g) => {
    const ts = g.trade_ids
      .map((id) => trades.find((x) => x.id === id))
      .filter((x): x is Trade => Boolean(x));
    return ts.reduce(
      (sum, t) => (t.is_closing_trade ? sum : sum + calculatePL(t, closedTrades)),
      0
    );
  });
  if (groupPLs.length === 0) {
    return { avg: 0, best: 0, worst: 0, count: 0 };
  }
  const sum = groupPLs.reduce((a, b) => a + b, 0);
  return {
    avg: sum / groupPLs.length,
    best: Math.max(...groupPLs),
    worst: Math.min(...groupPLs),
    count: groupPLs.length,
  };
}

function parseLocalYMD(s: string): Date {
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
}
