import type { TradeAction } from '@/types/trade';

// Broker action-code parser. Schwab and TastyTrade use 4-letter codes for
// option transactions: STO/BTO/BTC/STC. We collapse them onto our 2-value
// action ('sell' | 'buy') because the rest of our schema doesn't track
// open-vs-close intent — that's recovered from is_closing_trade flagging
// during smart-close detection.
//
//   STO (Sell to Open)  → sell
//   BTO (Buy to Open)   → buy
//   BTC (Buy to Close)  → buy   (the smart-close planner handles linkage)
//   STC (Sell to Close) → sell
//
// Plain 'buy' and 'sell' (lowercase or capitalized) pass through unchanged.
// Returns null on unrecognized values so row-validation can surface a
// per-row error instead of silently coercing to 'sell'.
export function parseActionCode(raw: unknown): TradeAction | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  switch (code) {
    case 'STO':
    case 'STC':
    case 'SELL':
    case 'S':
      return 'sell';
    case 'BTO':
    case 'BTC':
    case 'BUY':
    case 'B':
      return 'buy';
    case 'ASSIGNMENT':
    case 'ASSIGNED':
      return 'assignment';
    case 'CALLED-AWAY':
    case 'CALLED AWAY':
    case 'EXPIRED-EXERCISED':
      return 'called-away';
  }
  return null;
}

// Helper for the description-pattern detection: a column is "option-
// description-style" if its first non-empty cell looks like
// "SYMBOL MM/DD/YYYY STRIKE P|C". v1 doesn't auto-parse these; we surface
// a warning telling the user to split the column before importing.
const OPTION_DESCRIPTION_RE =
  /^[A-Z]{1,5}\s+\d{2}\/\d{2}\/\d{4}\s+\d+(\.\d+)?\s+[PC]\b/i;

export function looksLikeOptionDescription(sampleValues: string[]): boolean {
  for (const v of sampleValues) {
    const trimmed = v?.trim();
    if (!trimmed) continue;
    if (OPTION_DESCRIPTION_RE.test(trimmed)) return true;
    // First non-empty value didn't match — bail. Don't keep scanning,
    // because a single row of an option-description column should be
    // representative; if it doesn't match, the column is something else.
    return false;
  }
  return false;
}
