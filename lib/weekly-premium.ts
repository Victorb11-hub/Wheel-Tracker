import { calculateRollCredit } from './calculations';
import {
  eachWeekBetween,
  getWeekStart,
} from './dates';
import type { Trade } from '../types/trade';

// =============================================================================
// Weekly premium bucketing for the Dashboard chart.
//
// Per spec § Dashboard / Weekly Premium Collected:
//   CLOSED leg bucketing:
//     - Bucket date = date_closed if present, else exp_date.
//     - If neither present: skip (don't crash).
//     - Net premium = (premium × contracts × 100) - (close_price × contracts × 100).
//     - is_closing_trade rows: EXCLUDED entirely (would double-count).
//
//   OPEN leg bucketing:
//     - Bucket date = exp_date.
//     - If is_rolled: prefer calculateRollCredit; fall back to full premium when null.
//     - Else: full premium.
//     - Stocks: NOT swept in (Victor's rule — option legs only).
//
// Range filters return a list of week buckets (Mondays). Finite ranges
// emit empty $0 buckets to keep the chart continuous; "all time" only
// emits weeks that actually have data.
// =============================================================================

const SHARES_PER_CONTRACT = 100;

export interface WeekBucket {
  weekStart: Date;       // Monday 00:00 local
  total: number;         // dollars
}

export type Range =
  | { kind: 'prev-and-next'; prev: number; next: number }
  | { kind: 'next'; n: number }
  | { kind: 'last'; n: number }
  | { kind: 'last-months'; months: number }
  | { kind: 'last-year' }
  | { kind: 'all-time' };

// ---- Per-trade contribution (signed dollars) ----------------------------

function premiumDollars(t: Trade): number {
  return t.premium * t.contracts * SHARES_PER_CONTRACT;
}

function closingDollars(t: Trade): number {
  if (t.close_price == null) return 0;
  return t.close_price * t.contracts * SHARES_PER_CONTRACT;
}

// Returns the bucket date (or null to skip) and the dollar amount.
function bucketContribution(
  t: Trade,
  allTrades: Trade[]
): { bucketDate: string; amount: number } | null {
  if (t.is_closing_trade) return null;          // never count closes
  if (t.action === 'assignment' || t.action === 'called-away') return null; // synthetic rows

  if (t.status === 'open') {
    if (!t.exp_date) return null;
    if (t.is_rolled && t.trade_ref) {
      const credit = calculateRollCredit(t, allTrades);
      if (credit != null) return { bucketDate: t.exp_date, amount: credit };
    }
    return { bucketDate: t.exp_date, amount: premiumDollars(t) };
  }

  // Closed (or assigned)
  const bucketDate = t.date_closed ?? t.exp_date;
  if (!bucketDate) return null;

  // For sells: net = premium - closing cost. For buys (long puts/calls): -premium.
  if (t.action === 'sell') {
    return { bucketDate, amount: premiumDollars(t) - closingDollars(t) };
  }
  if (t.action === 'buy') {
    return { bucketDate, amount: -premiumDollars(t) };
  }
  return null;
}

// ---- Range computation --------------------------------------------------

interface RangeWindow {
  from: Date | null;     // inclusive Monday; null means open-ended past
  to: Date | null;       // inclusive Monday; null means open-ended future
  fillEmpty: boolean;    // emit $0 buckets for missing weeks within range
}

export function computeRangeWindow(range: Range, now: Date = new Date()): RangeWindow {
  const currentMonday = getWeekStart(now);

  if (range.kind === 'all-time') {
    return { from: null, to: null, fillEmpty: false };
  }

  if (range.kind === 'next') {
    const to = new Date(currentMonday);
    to.setDate(to.getDate() + 7 * (range.n - 1));
    return { from: currentMonday, to, fillEmpty: true };
  }

  if (range.kind === 'last') {
    const from = new Date(currentMonday);
    from.setDate(from.getDate() - 7 * range.n);
    const to = new Date(currentMonday);
    to.setDate(to.getDate() - 7);
    return { from, to, fillEmpty: true };
  }

  if (range.kind === 'prev-and-next') {
    const from = new Date(currentMonday);
    from.setDate(from.getDate() - 7 * range.prev);
    const to = new Date(currentMonday);
    to.setDate(to.getDate() + 7 * range.next);
    return { from, to, fillEmpty: true };
  }

  if (range.kind === 'last-months') {
    const from = new Date(currentMonday);
    from.setMonth(from.getMonth() - range.months);
    return { from: getWeekStart(from), to: currentMonday, fillEmpty: true };
  }

  // last-year
  const from = new Date(currentMonday);
  from.setFullYear(from.getFullYear() - 1);
  return { from: getWeekStart(from), to: currentMonday, fillEmpty: true };
}

// ---- Main bucketing entry point -----------------------------------------

export function bucketWeeklyPremium(
  trades: Trade[],
  range: Range,
  now: Date = new Date()
): WeekBucket[] {
  const window = computeRangeWindow(range, now);

  const totals = new Map<number, number>();   // key: monday epoch ms

  for (const t of trades) {
    const contrib = bucketContribution(t, trades);
    if (!contrib) continue;
    const monday = getWeekStart(parseLocalYMD(contrib.bucketDate));
    if (window.from && monday.getTime() < window.from.getTime()) continue;
    if (window.to && monday.getTime() > window.to.getTime()) continue;
    const key = monday.getTime();
    totals.set(key, (totals.get(key) ?? 0) + contrib.amount);
  }

  if (window.fillEmpty && window.from && window.to) {
    for (const monday of eachWeekBetween(window.from, window.to)) {
      const key = monday.getTime();
      if (!totals.has(key)) totals.set(key, 0);
    }
  }

  return Array.from(totals.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([key, total]) => ({ weekStart: new Date(key), total }));
}

// Parse "YYYY-MM-DD" as a LOCAL date at 00:00. Avoids the UTC drift bug from
// `new Date("YYYY-MM-DD")` (which parses as UTC midnight and shifts on display).
function parseLocalYMD(s: string): Date {
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
}
