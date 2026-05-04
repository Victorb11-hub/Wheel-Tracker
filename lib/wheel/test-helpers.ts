import type {
  AssignmentRow,
  CalledAwayRow,
  RegularLeg,
  StockPosition,
  Trade,
  TradeGroup,
} from '../../types/trade';
import type { PlannerCtx, WheelState } from './plan';

// Deterministic id factory: 'id-1', 'id-2', ...
export function makeIdFactory(prefix = 'id'): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

export const fixedCtx = (prefix?: string): PlannerCtx => ({
  newId: makeIdFactory(prefix),
});

const baseRegular: Omit<RegularLeg, 'action' | 'type'> = {
  id: 't0',
  user_id: 'u1',
  trade_ref: null,
  account: null,
  symbol: 'TSLA',
  contracts: 1,
  strike: 100,
  premium: 1,
  date_opened: '2026-01-01',
  date_closed: null,
  exp_date: '2026-01-15',
  price_at_action: 110,
  info: null,
  status: 'open',
  close_price: null,
  closing_notes: null,
  is_closing_trade: false,
  is_rolled: false,
  is_covered_call: false,
  is_assignment: false,
  is_called_away: false,
  linked_stock_id: null,
  assigned_price: null,
  full_cycle_pl: null,
  cycle_details: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

export const sellPut = (overrides: Partial<RegularLeg> = {}): RegularLeg => ({
  ...baseRegular,
  action: 'sell',
  type: 'put',
  ...overrides,
});

export const sellCall = (overrides: Partial<RegularLeg> = {}): RegularLeg => ({
  ...baseRegular,
  action: 'sell',
  type: 'call',
  ...overrides,
});

export const buyClose = (overrides: Partial<RegularLeg> = {}): RegularLeg => ({
  ...baseRegular,
  action: 'buy',
  type: 'put',
  is_closing_trade: true,
  status: 'closed',
  ...overrides,
});

export const assignmentRow = (
  overrides: Partial<AssignmentRow> = {}
): AssignmentRow => ({
  ...baseRegular,
  action: 'assignment',
  type: 'stock',
  is_assignment: true,
  is_called_away: false,
  status: 'closed',
  assigned_price: 100,
  full_cycle_pl: null,
  cycle_details: null,
  ...overrides,
});

export const calledAwayRow = (
  overrides: Partial<CalledAwayRow> = {}
): CalledAwayRow => ({
  ...baseRegular,
  action: 'called-away',
  type: 'stock',
  is_assignment: false,
  is_called_away: true,
  status: 'closed',
  assigned_price: null,
  full_cycle_pl: 0,
  cycle_details: {
    putPremium: 0,
    callPremiums: 0,
    stockProfit: 0,
    assignedPrice: 100,
    salePrice: 100,
  },
  ...overrides,
});

export const stockPosition = (
  overrides: Partial<StockPosition> = {}
): StockPosition => ({
  id: 's0',
  user_id: 'u1',
  symbol: 'TSLA',
  shares: 100,
  cost_basis: 100,
  assigned_price: 100,
  total_cost: 10000,
  total_value: 10000,
  assigned_date: '2026-01-15',
  original_put_id: 't0',
  original_put: {
    strike: 100,
    premium: 2,
    contracts: 1,
    dateOpened: '2026-01-01',
    tradeRef: null,
    premiumCollected: 200,
  },
  covered_calls: [],
  account: null,
  trade_ref: null,
  status: 'holding',
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
  ...overrides,
});

export const tradeGroup = (overrides: Partial<TradeGroup> = {}): TradeGroup => ({
  id: 'g0',
  user_id: 'u1',
  name: 'Trade Ref: 1',
  trade_ids: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

export const state = (overrides: Partial<WheelState> = {}): WheelState => ({
  trades: [],
  stocks: [],
  groups: [],
  ...overrides,
});

// Convenience: deeply-equal-ish trade insert assertion that strips
// irrelevant defaults so tests stay readable.
export function pickInsertHighlights<T extends Record<string, unknown>>(
  insert: T,
  keys: (keyof T)[]
): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) out[k] = insert[k];
  return out;
}
