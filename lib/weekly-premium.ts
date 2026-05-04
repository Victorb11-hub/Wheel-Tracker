import { calculateRollCredit } from './calculations';
import {
  eachWeekBetween,
  getWeekStart,
} from './dates';
import type { Trade } from '../types/trade';

// =============================================================================
// Weekly premium bucketing for the Dashboard chart.
//
// Spec — every option leg lands once, in the week of its last cash event.
// Roll buybacks are attributed to the NEW leg only, never to the leg they
// closed. Concretely:
//
//   CLOSING TRADES (is_closing_trade=true): excluded entirely. Their dollar
//     impact is rolled into either the leg they closed (standalone close) or
//     the new leg they brought into existence (roll buyback).
//
//   ASSIGNMENT / CALLED-AWAY synthetic rows: not counted (option legs only).
//
//   OPEN legs:
//     - Bucket = exp_date.
//     - is_rolled with trade_ref → calculateRollCredit (= newPremium −
//       most-recent-buyback) when available; falls back to full premium.
//     - Otherwise → full premium.
//
//   CLOSED sells:
//     - Bucket = date_closed (falls back to exp_date if missing).
//     - Start from full premium.
//     - Subtract the predecessor's roll buyback if this leg was created by
//       a previous roll (i.e., is_rolled=true AND there's a closed sell
//       with same trade_ref+symbol whose date_closed matches this leg's
//       date_opened — that predecessor's close_price IS the buyback that
//       attributes here).
//     - Subtract this leg's own close_price IF the close was a standalone
//       early close. If this leg was itself closed-by-roll (matched
//       buyback + new opening on its date_closed), don't subtract — that
//       buyback attributes to the new successor leg instead.
//
//   CLOSED buys (non-closing): contribute -premium (long puts/calls).
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

// True when this leg's closure was caused by a roll (matched buyback +
// new opening sell on its date_closed, all sharing trade_ref+symbol).
// In that case, the leg's close_price is the roll buyback that attributes
// to the successor leg, not to this one.
function isClosedByRoll(t: Trade, allTrades: Trade[]): boolean {
  if (!t.is_rolled) return false;
  if (t.status !== 'closed') return false;
  if (t.date_closed == null) return false;
  if (t.trade_ref == null) return false;

  const buyback = allTrades.find(
    (x) =>
      x.is_closing_trade &&
      x.action === 'buy' &&
      x.trade_ref === t.trade_ref &&
      x.symbol === t.symbol &&
      x.date_closed === t.date_closed
  );
  if (!buyback) return false;

  const newOpening = allTrades.find(
    (x) =>
      !x.is_closing_trade &&
      x.action === 'sell' &&
      x.is_rolled === true &&
      x.trade_ref === t.trade_ref &&
      x.symbol === t.symbol &&
      x.date_opened === t.date_closed &&
      x.id !== t.id
  );
  return newOpening != null;
}

// Returns the predecessor sell that was rolled into this leg (i.e., the
// previous-roll's original whose close_price IS the buyback that brought
// `t` into existence). null when `t` is not a roll-new-leg.
function findRollPredecessor(t: Trade, allTrades: Trade[]): Trade | null {
  if (!t.is_rolled) return null;
  if (!t.trade_ref) return null;
  return (
    allTrades.find(
      (x) =>
        x.action === 'sell' &&
        x.is_rolled === true &&
        x.status === 'closed' &&
        x.trade_ref === t.trade_ref &&
        x.symbol === t.symbol &&
        x.date_closed === t.date_opened &&
        x.id !== t.id
    ) ?? null
  );
}

// Returns the bucket date (or null to skip) and the dollar amount.
function bucketContribution(
  t: Trade,
  allTrades: Trade[]
): { bucketDate: string; amount: number } | null {
  if (t.is_closing_trade) return null;
  if (t.action === 'assignment' || t.action === 'called-away') return null;

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

  if (t.action === 'buy') {
    return { bucketDate, amount: -premiumDollars(t) };
  }
  if (t.action !== 'sell') return null;

  let amount = premiumDollars(t);

  const predecessor = findRollPredecessor(t, allTrades);
  if (predecessor) {
    amount -= closingDollars(predecessor);
  }

  if (!isClosedByRoll(t, allTrades)) {
    amount -= closingDollars(t);
  }

  return { bucketDate, amount };
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
