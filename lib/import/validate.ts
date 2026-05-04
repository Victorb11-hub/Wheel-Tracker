import type {
  CustomAccount,
  StockPosition,
  Trade,
} from '@/types/trade';
import type { TradeGroup } from '@/types/trade';
import type { RowError } from './schema';

// Per-row validators. Each returns the typed object (or null) plus a
// collected list of errors. Validation is structural — enums, numeric
// ranges, required-string non-emptiness. Cross-row reference checks
// (e.g. groups[].trade_ids[] resolving to trades) happen after this layer.
//
// Validation is permissive on shape: missing optional fields are coerced
// to null rather than rejected, so the canonical Export → Import round-
// trip works without per-field gymnastics. Strict mode can be added when
// real-world bad data demands it.

const ACTIONS = new Set(['sell', 'buy', 'assignment', 'called-away']);
const TYPES = new Set(['put', 'call', 'stock']);
const STATUSES = new Set(['open', 'closed', 'assigned']);

function isYMD(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isYMDOrNull(s: unknown): s is string | null {
  return s === null || isYMD(s);
}

function isNonNegativeNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

function isPositiveInteger(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1;
}

export function validateTrade(
  raw: unknown,
  rowIndex: number
): { trade: Trade | null; errors: RowError[] } {
  const errors: RowError[] = [];
  const e = (field: string, message: string) =>
    errors.push({ sheet: 'trades', row: rowIndex, field, message });

  if (typeof raw !== 'object' || raw === null) {
    e('*', 'Expected an object.');
    return { trade: null, errors };
  }

  const t = raw as Record<string, unknown>;

  if (typeof t.id !== 'string' || t.id === '') e('id', 'id is required.');
  if (typeof t.symbol !== 'string' || t.symbol === '')
    e('symbol', 'symbol is required.');
  if (!ACTIONS.has(t.action as string))
    e('action', `invalid action "${String(t.action)}" — must be one of sell, buy, assignment, called-away.`);
  if (!TYPES.has(t.type as string))
    e('type', `invalid type "${String(t.type)}" — must be one of put, call, stock.`);
  if (!STATUSES.has(t.status as string))
    e('status', `invalid status "${String(t.status)}" — must be one of open, closed, assigned.`);
  if (!isNonNegativeNumber(t.strike)) e('strike', 'strike must be a non-negative number.');
  if (!isNonNegativeNumber(t.premium)) e('premium', 'premium must be a non-negative number.');
  if (!isPositiveInteger(t.contracts))
    e('contracts', 'contracts must be a positive integer.');
  if (!isYMD(t.date_opened)) e('date_opened', 'date_opened must be YYYY-MM-DD.');
  if (!isYMDOrNull(t.date_closed)) e('date_closed', 'date_closed must be YYYY-MM-DD or null.');
  if (!isYMDOrNull(t.exp_date)) e('exp_date', 'exp_date must be YYYY-MM-DD or null.');

  if (errors.length > 0) return { trade: null, errors };
  return { trade: raw as Trade, errors: [] };
}

export function validateStock(
  raw: unknown,
  rowIndex: number
): { stock: StockPosition | null; errors: RowError[] } {
  const errors: RowError[] = [];
  const e = (field: string, message: string) =>
    errors.push({ sheet: 'stocks', row: rowIndex, field, message });

  if (typeof raw !== 'object' || raw === null) {
    e('*', 'Expected an object.');
    return { stock: null, errors };
  }
  const s = raw as Record<string, unknown>;

  if (typeof s.id !== 'string' || s.id === '') e('id', 'id is required.');
  if (typeof s.symbol !== 'string' || s.symbol === '')
    e('symbol', 'symbol is required.');
  if (!isPositiveInteger(s.shares)) e('shares', 'shares must be a positive integer.');
  if (!isNonNegativeNumber(s.cost_basis))
    e('cost_basis', 'cost_basis must be non-negative.');
  if (s.status !== 'holding' && s.status !== 'called-away')
    e('status', `invalid status "${String(s.status)}" — must be holding or called-away.`);
  if (typeof s.original_put !== 'object' || s.original_put === null)
    e('original_put', 'original_put snapshot missing.');
  if (!Array.isArray(s.covered_calls))
    e('covered_calls', 'covered_calls must be an array.');

  if (errors.length > 0) return { stock: null, errors };
  return { stock: raw as StockPosition, errors: [] };
}

export function validateGroup(
  raw: unknown,
  rowIndex: number
): { group: TradeGroup | null; errors: RowError[] } {
  const errors: RowError[] = [];
  const e = (field: string, message: string) =>
    errors.push({ sheet: 'groups', row: rowIndex, field, message });

  if (typeof raw !== 'object' || raw === null) {
    e('*', 'Expected an object.');
    return { group: null, errors };
  }
  const g = raw as Record<string, unknown>;

  if (typeof g.id !== 'string' || g.id === '') e('id', 'id is required.');
  if (typeof g.name !== 'string' || g.name === '') e('name', 'name is required.');
  if (!Array.isArray(g.trade_ids)) {
    e('trade_ids', 'trade_ids must be an array of strings.');
  } else if (!g.trade_ids.every((x) => typeof x === 'string')) {
    e('trade_ids', 'trade_ids entries must be strings.');
  }

  if (errors.length > 0) return { group: null, errors };
  return { group: raw as TradeGroup, errors: [] };
}

export function validateAccount(
  raw: unknown,
  rowIndex: number
): { account: CustomAccount | null; errors: RowError[] } {
  const errors: RowError[] = [];
  const e = (field: string, message: string) =>
    errors.push({ sheet: 'accounts', row: rowIndex, field, message });

  if (typeof raw !== 'object' || raw === null) {
    e('*', 'Expected an object.');
    return { account: null, errors };
  }
  const a = raw as Record<string, unknown>;

  if (typeof a.id !== 'string' || a.id === '') e('id', 'id is required.');
  if (typeof a.name !== 'string' || a.name === '') e('name', 'name is required.');

  if (errors.length > 0) return { account: null, errors };
  return { account: raw as CustomAccount, errors: [] };
}
