import type { Trade } from '../types/trade';

const SHARES_PER_CONTRACT = 100;

const isSyntheticRow = (t: Pick<Trade, 'action'>): boolean =>
  t.action === 'assignment' || t.action === 'called-away';

const dollars = (perShare: number, contracts: number): number =>
  perShare * contracts * SHARES_PER_CONTRACT;

// Cash collateral required to hold the position.
// Cash-secured puts: strike × contracts × 100
// Covered calls (is_covered_call=true): strike × contracts × 100 (notional display)
// Assignment / called-away rows: 0
// Everything else (long puts/calls, naked calls): 0
export function calculateCashRequired(t: Trade): number {
  if (isSyntheticRow(t)) return 0;

  const isSellPut = t.action === 'sell' && t.type === 'put';
  if (isSellPut) return dollars(t.strike, t.contracts);

  if (t.is_covered_call) return dollars(t.strike, t.contracts);

  return 0;
}

// Return % on the cash actually risked.
// Skip assignment/called-away rows (return "0.00").
// multiplier = action==='buy' ? -1 : 1
// If cashRequired > 0: (multiplier × totalPremium / cashRequired) × 100
// Else fall back to (multiplier × totalPremium / (strike × contracts × 100)) × 100
export function calculateReturnPercent(t: Trade): string {
  if (isSyntheticRow(t)) return '0.00';

  const multiplier = t.action === 'buy' ? -1 : 1;
  const totalPremium = dollars(t.premium, t.contracts);
  const cashRequired = calculateCashRequired(t);

  if (cashRequired > 0) {
    return ((multiplier * totalPremium) / cashRequired * 100).toFixed(2);
  }

  const fallbackDenom = t.strike * t.contracts * SHARES_PER_CONTRACT;
  if (fallbackDenom === 0) return '0.00';
  return ((multiplier * totalPremium) / fallbackDenom * 100).toFixed(2);
}

// % out-of-the-money relative to underlying when opened.
// Puts:  ((priceAtAction - strike) / strike) × 100      → positive = OTM (good)
// Calls: ((strike - priceAtAction) / priceAtAction) × 100  → positive = OTM (good)
export function calculateOTM(t: Trade): string {
  if (isSyntheticRow(t)) return '0.00';
  if (t.price_at_action == null) return '0.00';

  if (t.type === 'put') {
    if (t.strike === 0) return '0.00';
    return ((t.price_at_action - t.strike) / t.strike * 100).toFixed(2);
  }

  if (t.type === 'call') {
    if (t.price_at_action === 0) return '0.00';
    return ((t.strike - t.price_at_action) / t.price_at_action * 100).toFixed(2);
  }

  return '0.00';
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const dateOnly = (s: string): number => {
  const d = new Date(s);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// Realized + unrealized P&L for one row.
// - Assignment rows: 0
// - Called-away rows: cycle_details.stockProfit (only the stock leg; full cycle on full_cycle_pl)
// - Sell + closed: premiumCollected - closingCost
//     closingCost = (close_price ?? 0) × contracts × 100
//     If closingCost is 0 AND tradeRef set, find a is_closing_trade=true BUY in
//     allClosedTrades with same trade_ref + symbol, dateClosed within 1 day, use ITS premium.
// - Sell + open: premiumCollected
// - Buy: -premiumCollected
export function calculatePL(t: Trade, allClosedTrades: Trade[]): number {
  if (t.action === 'assignment') return 0;
  if (t.action === 'called-away') return t.cycle_details.stockProfit;

  const totalPremium = dollars(t.premium, t.contracts);

  if (t.action === 'buy') return -totalPremium;

  // action === 'sell'
  if (t.status !== 'closed') return totalPremium;

  let closingCost = dollars(t.close_price ?? 0, t.contracts);

  if (closingCost === 0 && t.trade_ref) {
    const ref = t.trade_ref;
    const sym = t.symbol;
    const closedAt = t.date_closed ? dateOnly(t.date_closed) : null;

    const match = allClosedTrades.find((c) => {
      if (!c.is_closing_trade) return false;
      if (c.action !== 'buy') return false;
      if (c.trade_ref !== ref) return false;
      if (c.symbol !== sym) return false;
      if (closedAt == null || !c.date_closed) return true;
      const cAt = dateOnly(c.date_closed);
      return Math.abs(cAt - closedAt) <= ONE_DAY_MS;
    });

    if (match) closingCost = dollars(match.premium, match.contracts);
  }

  return totalPremium - closingCost;
}

// Net credit/debit on a roll. Only meaningful when is_rolled=true and trade_ref set.
// Find the most recent buy-to-close (is_closing_trade=true, action=buy, same trade_ref)
// sorted by date_closed desc.
// Returns: newPremium($) - buybackCost($).  Positive = net credit.
// Returns null if no matching buyback found.
export function calculateRollCredit(
  t: Trade,
  allClosedTrades: Trade[]
): number | null {
  if (!t.is_rolled || !t.trade_ref) return null;

  const ref = t.trade_ref;
  const candidates = allClosedTrades
    .filter(
      (c) =>
        c.is_closing_trade &&
        c.action === 'buy' &&
        c.trade_ref === ref &&
        c.symbol === t.symbol
    )
    .sort((a, b) => {
      const aT = a.date_closed ? dateOnly(a.date_closed) : 0;
      const bT = b.date_closed ? dateOnly(b.date_closed) : 0;
      return bT - aT;
    });

  const buyback = candidates[0];
  if (!buyback) return null;

  const newPremium = dollars(t.premium, t.contracts);
  const buybackCost = dollars(buyback.premium, buyback.contracts);
  return newPremium - buybackCost;
}

// Days from today to expiration. Negative for expired.
export function calculateDaysToExpiration(
  expDate: string | null,
  now: Date = new Date()
): number {
  if (!expDate) return 0;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const exp = dateOnly(expDate);
  return Math.round((exp - today) / ONE_DAY_MS);
}
