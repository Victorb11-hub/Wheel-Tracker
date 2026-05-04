import type {
  AssignmentRow,
  CalledAwayRow,
  CustomAccount,
  RegularLeg,
  StockPosition,
  Trade,
  TradeGroup,
  UserPreferences,
} from '../../types/trade';
import type { FullState } from './client';

// ============================================================================
// Seed dataset for the in-memory mock.
//
// Designed deliberately to exercise every UI state, not "look realistic":
//   - Open CSP on TSLA, ~30 DTE, OTM
//   - Open put that's been rolled (is_rolled=true with prior closed legs grouped)
//   - Open covered call (is_covered_call=true, linked_stock_id set)
//   - Held stock with 2+ covered calls in covered_calls jsonb
//   - Fully closed group (sold→buy-to-close)
//   - Full Wheel Cycle group (assigned put → assignment → covered call → called-away)
//   - One trade with no trade_ref (ungrouped)
//   - Trades with notes/info for truncation styling
//   - Two accounts (Main + IRA)
//   - Spread across ~12 weeks for the weekly chart
//
// Symbols: TSLA + META (Victor's actual wheels).
// "Today" anchor: 2026-05-01 (matches CLAUDE.md's currentDate).
// ============================================================================

const USER_ID = 'mock-user-1';
const TODAY = '2026-05-01';

// ---------- ID factory ----------------------------------------------------
let nextId = 1;
const id = (prefix: string) => `${prefix}-${String(nextId++).padStart(4, '0')}`;
const ts = (date: string) => `${date}T12:00:00.000Z`;

// ---------- Defaults ------------------------------------------------------

const baseTrade = (
  date_opened: string
): Omit<Trade, 'action' | 'type' | 'id' | 'strike'> & {
  is_assignment: false;
  is_called_away: false;
  assigned_price: null;
  full_cycle_pl: null;
  cycle_details: null;
} => ({
  user_id: USER_ID,
  trade_ref: null,
  account: 'Main',
  symbol: 'TSLA',
  contracts: 1,
  premium: 0,
  date_opened,
  date_closed: null,
  exp_date: null,
  price_at_action: null,
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
  created_at: ts(date_opened),
  updated_at: ts(date_opened),
});

const sellPut = (over: Partial<RegularLeg> & { date_opened: string }): RegularLeg =>
  ({
    ...baseTrade(over.date_opened),
    id: id('t'),
    action: 'sell',
    type: 'put',
    strike: 100,
    ...over,
  }) as RegularLeg;

const sellCall = (over: Partial<RegularLeg> & { date_opened: string }): RegularLeg =>
  ({
    ...baseTrade(over.date_opened),
    id: id('t'),
    action: 'sell',
    type: 'call',
    strike: 100,
    ...over,
  }) as RegularLeg;

const buyToClose = (
  over: Partial<RegularLeg> & { date_opened: string }
): RegularLeg =>
  ({
    ...baseTrade(over.date_opened),
    id: id('t'),
    action: 'buy',
    type: 'put',
    strike: 100,
    is_closing_trade: true,
    status: 'closed',
    date_closed: over.date_opened,
    ...over,
  }) as RegularLeg;

// ============================================================================
// 1. SCENARIO: Plain open CSP on TSLA, ~30 DTE, OTM, no trade_ref
// (exercises ungrouped open trade rendering)
// ============================================================================
const openTslaCsp = sellPut({
  date_opened: '2026-04-15',
  exp_date: '2026-05-29',     // ~28 DTE from 2026-05-01
  symbol: 'TSLA',
  strike: 240,
  premium: 4.5,
  price_at_action: 258,
  account: 'Main',
  trade_ref: null,            // intentionally ungrouped
  info: 'Standard CSP entry — wheel restart after last cycle closed',
});

// ============================================================================
// 2. SCENARIO: Rolled-and-still-open put on META
// Original sell + buy-to-close (closed legs in group), new sell open with
// is_rolled=true sharing the same trade_ref.
// ============================================================================
const metaRollOriginal = sellPut({
  date_opened: '2026-03-10',
  date_closed: '2026-03-28',
  exp_date: '2026-04-04',
  status: 'closed',
  symbol: 'META',
  strike: 480,
  premium: 6.0,
  close_price: 1.5,
  price_at_action: 510,
  account: 'IRA',
  trade_ref: '101',
  is_rolled: true,
  info: 'Rolled to capture more premium when META dipped',
});

const metaRollBuyback = buyToClose({
  date_opened: '2026-03-28',
  exp_date: '2026-04-04',
  symbol: 'META',
  strike: 480,
  premium: 1.5,
  account: 'IRA',
  trade_ref: '101',
  is_rolled: true,
  info: 'Rolled - closing leg',
});

const metaRollNew = sellPut({
  date_opened: '2026-03-28',
  exp_date: '2026-05-15',     // ~14 DTE from today
  symbol: 'META',
  strike: 470,
  premium: 7.25,
  price_at_action: 495,
  account: 'IRA',
  trade_ref: '101',
  is_rolled: true,
  info: 'Rolled: down 10 strikes for additional credit',
});

// ============================================================================
// 3. SCENARIO: Held stock position (TSLA, assigned), with 2 covered calls.
// One covered call still OPEN (orange-row in Open Positions, linked_stock_id),
// one covered call CLOSED (expired worthless before sale).
// Plus the original assigned PUT and synthetic ASSIGNMENT row.
// All grouped into a NOT-YET-COMPLETE wheel cycle (no called-away yet).
// ============================================================================
const tslaAssignedPut = sellPut({
  date_opened: '2026-02-05',
  date_closed: '2026-03-13',
  exp_date: '2026-03-13',
  status: 'assigned',
  symbol: 'TSLA',
  strike: 250,
  premium: 5.5,
  price_at_action: 262,
  assigned_price: 250,
  account: 'Main',
  trade_ref: '102',
  closing_notes: 'Assigned at expiration ITM',
});

const TSLA_STOCK_ID = id('s');

const tslaAssignmentRow: AssignmentRow = {
  ...baseTrade('2026-03-13'),
  id: id('t'),
  action: 'assignment',
  type: 'stock',
  is_assignment: true,
  is_called_away: false,
  status: 'closed',
  date_closed: '2026-03-13',
  symbol: 'TSLA',
  strike: 250,
  contracts: 1,
  premium: 0,
  account: 'Main',
  trade_ref: '102',
  assigned_price: 250,
  price_at_action: 250,
  linked_stock_id: TSLA_STOCK_ID,
  info: 'Assigned 100 shares at $250',
  full_cycle_pl: null,
  cycle_details: null,
};

// First covered call (CLOSED — expired worthless March)
const tslaCcExpired = sellCall({
  date_opened: '2026-03-15',
  date_closed: '2026-04-17',
  exp_date: '2026-04-17',
  status: 'closed',
  symbol: 'TSLA',
  strike: 270,
  premium: 3.0,
  close_price: 0,
  price_at_action: 252,
  account: 'Main',
  trade_ref: '102',
  is_covered_call: true,
  linked_stock_id: TSLA_STOCK_ID,
  info: 'CC #1 — expired worthless',
});

// Second covered call (OPEN — exercises is_covered_call open-positions render)
const tslaCcOpen = sellCall({
  date_opened: '2026-04-21',
  exp_date: '2026-05-22',     // ~21 DTE
  symbol: 'TSLA',
  strike: 275,
  premium: 4.25,
  price_at_action: 264,
  account: 'Main',
  trade_ref: '102',
  is_covered_call: true,
  linked_stock_id: TSLA_STOCK_ID,
  info: 'CC #2 — open, hoping for called away above $275',
});

const tslaStockPosition: StockPosition = {
  id: TSLA_STOCK_ID,
  user_id: USER_ID,
  symbol: 'TSLA',
  shares: 100,
  cost_basis: 250,
  assigned_price: 250,
  total_cost: 25000,
  total_value: 25000,
  assigned_date: '2026-03-13',
  original_put_id: tslaAssignedPut.id,
  original_put: {
    strike: 250,
    premium: 5.5,
    contracts: 1,
    dateOpened: '2026-02-05',
    tradeRef: '102',
    premiumCollected: 550,
  },
  // Both denormalized snapshots — premium in DOLLARS per spec
  covered_calls: [
    {
      strike: 270,
      premium: 300,             // 3.0 × 1 × 100
      expDate: '2026-04-17',
      dateOpened: '2026-03-15',
      notes: 'CC #1 — expired worthless',
    },
    {
      strike: 275,
      premium: 425,             // 4.25 × 1 × 100
      expDate: '2026-05-22',
      dateOpened: '2026-04-21',
      notes: 'CC #2 — open',
    },
  ],
  account: 'Main',
  trade_ref: '102',
  status: 'holding',
  created_at: ts('2026-03-13'),
  updated_at: ts('2026-04-21'),
};

// ============================================================================
// 4. SCENARIO: Fully closed group on META (sold put → bought to close → grouped)
// Win-rate denominator includes this group; counts as a WIN (closed for credit).
// ============================================================================
const metaWinSell = sellPut({
  date_opened: '2026-02-20',
  date_closed: '2026-03-06',
  exp_date: '2026-03-20',
  status: 'closed',
  symbol: 'META',
  strike: 460,
  premium: 5.0,
  close_price: 1.0,
  price_at_action: 490,
  account: 'Main',
  trade_ref: '103',
  info: 'Standard 30-delta put',
});

const metaWinBuyback = buyToClose({
  date_opened: '2026-03-06',
  exp_date: '2026-03-20',
  symbol: 'META',
  strike: 460,
  premium: 1.0,
  account: 'Main',
  trade_ref: '103',
  info: 'Closed at 80% profit',
});

// ============================================================================
// 5. SCENARIO: Full Wheel Cycle on META — completed end-to-end
// sold put → assigned → covered calls → called-away.
// Tests Full Wheel Cycle group (special name suffix), called-away row with
// cycle_details, full_cycle_pl computed.
// ============================================================================
const metaWheelPut = sellPut({
  date_opened: '2025-12-10',
  date_closed: '2026-01-17',
  exp_date: '2026-01-17',
  status: 'assigned',
  symbol: 'META',
  strike: 500,
  premium: 8.0,
  price_at_action: 515,
  assigned_price: 500,
  account: 'Main',
  trade_ref: '100',
  closing_notes: 'Assigned at expiration',
});

const metaAssignmentRowId = id('t');
const META_WHEEL_STOCK_ID = id('s'); // referenced for completeness but stock is gone after called-away

const metaWheelAssignment: AssignmentRow = {
  ...baseTrade('2026-01-17'),
  id: metaAssignmentRowId,
  action: 'assignment',
  type: 'stock',
  is_assignment: true,
  is_called_away: false,
  status: 'closed',
  date_closed: '2026-01-17',
  symbol: 'META',
  strike: 500,
  contracts: 1,
  premium: 0,
  account: 'Main',
  trade_ref: '100',
  assigned_price: 500,
  price_at_action: 500,
  linked_stock_id: META_WHEEL_STOCK_ID,
  info: 'Assigned 100 shares at $500',
  full_cycle_pl: null,
  cycle_details: null,
};

// First covered call: closed worthless
const metaWheelCc1 = sellCall({
  date_opened: '2026-01-20',
  date_closed: '2026-02-20',
  exp_date: '2026-02-20',
  status: 'closed',
  symbol: 'META',
  strike: 520,
  premium: 4.0,
  close_price: 0,
  price_at_action: 502,
  account: 'Main',
  trade_ref: '100',
  is_covered_call: true,
  info: 'CC #1 — expired worthless',
});

// Second covered call: closed at called-away
const metaWheelCc2 = sellCall({
  date_opened: '2026-02-23',
  date_closed: '2026-03-21',
  exp_date: '2026-03-27',
  status: 'closed',
  symbol: 'META',
  strike: 530,
  premium: 5.5,
  close_price: 0,
  price_at_action: 518,
  account: 'Main',
  trade_ref: '100',
  is_covered_call: true,
  closing_notes: 'Exercised - Stock called away at $530',
  info: 'CC #2 — exercised',
});

// Called-away synthetic row
const metaCalledAwayRow: CalledAwayRow = {
  ...baseTrade('2026-03-21'),
  id: id('t'),
  action: 'called-away',
  type: 'stock',
  is_assignment: false,
  is_called_away: true,
  status: 'closed',
  date_closed: '2026-03-21',
  symbol: 'META',
  strike: 530,
  contracts: 1,
  premium: 0,
  account: 'Main',
  trade_ref: '100',
  assigned_price: null,
  price_at_action: 530,
  full_cycle_pl: 4350,         // 800 + 950 + (530-500)*100 = 800+950+3000 = 4750... see below
  cycle_details: {
    putPremium: 800,            // 8.0 × 100
    callPremiums: 950,          // 400 + 550
    stockProfit: 3000,          // (530-500) × 100
    assignedPrice: 500,
    salePrice: 530,
  },
  info: 'Called away at $530 - Total P&L: $4750',
};
// Recompute correctly: 800 + 950 + 3000 = 4750
metaCalledAwayRow.full_cycle_pl = 4750;

// ============================================================================
// Groups
// ============================================================================

const groupRolledOpen: TradeGroup = {
  id: id('g'),
  user_id: USER_ID,
  name: 'Trade Ref: 101',
  trade_ids: [metaRollOriginal.id, metaRollBuyback.id],
  // metaRollNew is the still-open new leg — stays out of the group per spec
  created_at: ts('2026-03-28'),
  updated_at: ts('2026-03-28'),
};

const groupClosedWin: TradeGroup = {
  id: id('g'),
  user_id: USER_ID,
  name: 'Trade Ref: 103',
  trade_ids: [metaWinSell.id, metaWinBuyback.id],
  created_at: ts('2026-03-06'),
  updated_at: ts('2026-03-06'),
};

const groupFullWheel: TradeGroup = {
  id: id('g'),
  user_id: USER_ID,
  name: 'Trade Ref: 100 - Full Wheel Cycle',
  trade_ids: [
    metaWheelPut.id,
    metaAssignmentRowId,
    metaWheelCc1.id,
    metaWheelCc2.id,
    metaCalledAwayRow.id,
  ],
  created_at: ts('2026-03-21'),
  updated_at: ts('2026-03-21'),
};

// ============================================================================
// Accounts + prefs
// ============================================================================

const accounts: CustomAccount[] = [
  {
    id: id('a'),
    user_id: USER_ID,
    name: 'Main',
    created_at: ts('2025-01-01'),
  },
  {
    id: id('a'),
    user_id: USER_ID,
    name: 'IRA',
    created_at: ts('2025-01-01'),
  },
  {
    id: id('a'),
    user_id: USER_ID,
    name: 'Roth IRA',
    created_at: ts('2025-01-01'),
  },
];

const prefs: UserPreferences = {
  user_id: USER_ID,
  theme: 'dark',
  updated_at: ts('2025-01-01'),
};

// ============================================================================
// Bundle
// ============================================================================

const trades: Trade[] = [
  // Scenario 1: ungrouped open CSP
  openTslaCsp,
  // Scenario 2: rolled META
  metaRollOriginal,
  metaRollBuyback,
  metaRollNew,
  // Scenario 3: TSLA stock + covered calls
  tslaAssignedPut,
  tslaAssignmentRow,
  tslaCcExpired,
  tslaCcOpen,
  // Scenario 4: closed META win
  metaWinSell,
  metaWinBuyback,
  // Scenario 5: full META wheel
  metaWheelPut,
  metaWheelAssignment,
  metaWheelCc1,
  metaWheelCc2,
  metaCalledAwayRow,
];

const stocks: StockPosition[] = [tslaStockPosition];
const groups: TradeGroup[] = [groupRolledOpen, groupClosedWin, groupFullWheel];

export function buildSeed(): FullState {
  // Trade objects are constructed at module load with frozen ids; cloning
  // gives every caller an independent copy with the same logical state.
  return {
    trades: trades.map((t) => structuredClone(t)),
    stocks: stocks.map((s) => structuredClone(s)),
    groups: groups.map((g) => structuredClone(g)),
    accounts: accounts.map((a) => structuredClone(a)),
    prefs: structuredClone(prefs),
  };
}

export const SEED_USER_ID = USER_ID;
export const SEED_TODAY = TODAY;
