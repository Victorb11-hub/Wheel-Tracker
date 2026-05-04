import {
  calculateCashRequired,
  calculateReturnPercent,
  calculateOTM,
  calculatePL,
  calculateRollCredit,
  calculateDaysToExpiration,
} from './calculations';
import type {
  AssignmentRow,
  CalledAwayRow,
  RegularLeg,
  Trade,
} from '../types/trade';

// ---------- Builders ------------------------------------------------------

const baseRegular: Omit<RegularLeg, 'action' | 'type'> = {
  id: 't1',
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

const sellPut = (overrides: Partial<RegularLeg> = {}): RegularLeg => ({
  ...baseRegular,
  action: 'sell',
  type: 'put',
  ...overrides,
});

const sellCall = (overrides: Partial<RegularLeg> = {}): RegularLeg => ({
  ...baseRegular,
  action: 'sell',
  type: 'call',
  ...overrides,
});

const buyClose = (overrides: Partial<RegularLeg> = {}): RegularLeg => ({
  ...baseRegular,
  action: 'buy',
  type: 'put',
  is_closing_trade: true,
  status: 'closed',
  ...overrides,
});

const assignmentRow = (overrides: Partial<AssignmentRow> = {}): AssignmentRow => ({
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

const calledAwayRow = (overrides: Partial<CalledAwayRow> = {}): CalledAwayRow => ({
  ...baseRegular,
  action: 'called-away',
  type: 'stock',
  is_assignment: false,
  is_called_away: true,
  status: 'closed',
  assigned_price: null,
  full_cycle_pl: 1500,
  cycle_details: {
    putPremium: 200,
    callPremiums: 300,
    stockProfit: 1000,
    assignedPrice: 100,
    salePrice: 110,
  },
  ...overrides,
});

// ---------- calculateCashRequired ----------------------------------------

describe('calculateCashRequired', () => {
  test('cash-secured put: strike × contracts × 100', () => {
    expect(calculateCashRequired(sellPut({ strike: 100, contracts: 2 }))).toBe(20000);
  });

  test('covered call (is_covered_call=true): strike × contracts × 100', () => {
    expect(
      calculateCashRequired(
        sellCall({ strike: 110, contracts: 1, is_covered_call: true })
      )
    ).toBe(11000);
  });

  test('non-covered sold call: 0', () => {
    expect(calculateCashRequired(sellCall({ is_covered_call: false }))).toBe(0);
  });

  test('long put (buy): 0', () => {
    expect(
      calculateCashRequired({ ...baseRegular, action: 'buy', type: 'put' })
    ).toBe(0);
  });

  test('long call (buy): 0', () => {
    expect(
      calculateCashRequired({ ...baseRegular, action: 'buy', type: 'call' })
    ).toBe(0);
  });

  test('assignment row: 0', () => {
    expect(calculateCashRequired(assignmentRow())).toBe(0);
  });

  test('called-away row: 0', () => {
    expect(calculateCashRequired(calledAwayRow())).toBe(0);
  });
});

// ---------- calculateReturnPercent ---------------------------------------

describe('calculateReturnPercent', () => {
  test('sell put: positive return on cash required', () => {
    // premium $2 × 1 × 100 = $200; cash = $100 × 1 × 100 = $10000; 2.00%
    const t = sellPut({ premium: 2, strike: 100, contracts: 1 });
    expect(calculateReturnPercent(t)).toBe('2.00');
  });

  test('sell put: scales with contracts (numerator and denom both ×N)', () => {
    const t = sellPut({ premium: 2, strike: 100, contracts: 5 });
    expect(calculateReturnPercent(t)).toBe('2.00');
  });

  test('buy: negative return, falls back to strike × contracts × 100', () => {
    // cashRequired = 0, fallback denom = 100×1×100 = 10000, premium $1×100 = 100
    // multiplier = -1 → -1.00
    const t: RegularLeg = {
      ...baseRegular,
      action: 'buy',
      type: 'put',
      premium: 1,
      strike: 100,
    };
    expect(calculateReturnPercent(t)).toBe('-1.00');
  });

  test('non-covered sold call: cashRequired=0, falls back to strike denom', () => {
    const t = sellCall({ premium: 1, strike: 100, is_covered_call: false });
    expect(calculateReturnPercent(t)).toBe('1.00');
  });

  test('assignment row: 0.00', () => {
    expect(calculateReturnPercent(assignmentRow())).toBe('0.00');
  });

  test('called-away row: 0.00', () => {
    expect(calculateReturnPercent(calledAwayRow())).toBe('0.00');
  });

  test('strike=0 with cashRequired=0: returns 0.00 (no NaN)', () => {
    const t: RegularLeg = {
      ...baseRegular,
      action: 'buy',
      type: 'put',
      strike: 0,
      premium: 1,
    };
    expect(calculateReturnPercent(t)).toBe('0.00');
  });
});

// ---------- calculateOTM --------------------------------------------------

describe('calculateOTM', () => {
  test('put OTM: priceAtAction above strike → positive', () => {
    const t = sellPut({ strike: 100, price_at_action: 110 });
    expect(calculateOTM(t)).toBe('10.00');
  });

  test('put ITM: priceAtAction below strike → negative', () => {
    const t = sellPut({ strike: 100, price_at_action: 90 });
    expect(calculateOTM(t)).toBe('-10.00');
  });

  test('call OTM: strike above priceAtAction → positive', () => {
    const t = sellCall({ strike: 110, price_at_action: 100 });
    expect(calculateOTM(t)).toBe('10.00');
  });

  test('call ITM: strike below priceAtAction → negative', () => {
    const t = sellCall({ strike: 90, price_at_action: 100 });
    expect(calculateOTM(t)).toBe('-10.00');
  });

  test('null price_at_action: 0.00', () => {
    const t = sellPut({ price_at_action: null });
    expect(calculateOTM(t)).toBe('0.00');
  });

  test('assignment row: 0.00', () => {
    expect(calculateOTM(assignmentRow())).toBe('0.00');
  });

  test('called-away row: 0.00', () => {
    expect(calculateOTM(calledAwayRow())).toBe('0.00');
  });
});

// ---------- calculatePL ---------------------------------------------------

describe('calculatePL', () => {
  test('assignment row: 0', () => {
    expect(calculatePL(assignmentRow(), [])).toBe(0);
  });

  test('called-away row: returns cycle_details.stockProfit', () => {
    const t = calledAwayRow();
    expect(calculatePL(t, [])).toBe(1000);
  });

  test('open sell: full premium collected', () => {
    const t = sellPut({ premium: 2, contracts: 1, status: 'open' });
    expect(calculatePL(t, [])).toBe(200);
  });

  test('buy row: negative premium', () => {
    const t: RegularLeg = {
      ...baseRegular,
      action: 'buy',
      type: 'put',
      premium: 1.5,
      contracts: 1,
    };
    expect(calculatePL(t, [])).toBe(-150);
  });

  test('closed sell with close_price stamped: premium - closing cost', () => {
    const t = sellPut({
      premium: 2,
      contracts: 1,
      status: 'closed',
      close_price: 0.5,
      date_closed: '2026-01-10',
    });
    expect(calculatePL(t, [])).toBe(150); // 200 - 50
  });

  test('closed sell with close_price=0 and matching tradeRef: looks up buyback', () => {
    const sold = sellPut({
      id: 'sold',
      trade_ref: '47',
      premium: 2,
      contracts: 1,
      status: 'closed',
      close_price: 0,
      date_closed: '2026-01-10',
    });
    const buyback = buyClose({
      id: 'buyback',
      trade_ref: '47',
      symbol: 'TSLA',
      premium: 0.4,
      contracts: 1,
      date_closed: '2026-01-10',
    });
    // 200 - 40 = 160
    expect(calculatePL(sold, [buyback])).toBe(160);
  });

  test('closed sell with no tradeRef and close_price=0: just returns premium', () => {
    const t = sellPut({
      premium: 2,
      status: 'closed',
      close_price: 0,
      trade_ref: null,
    });
    expect(calculatePL(t, [])).toBe(200);
  });

  test('buyback lookup ignores rows with mismatched ref', () => {
    const sold = sellPut({
      trade_ref: '47',
      premium: 2,
      status: 'closed',
      close_price: 0,
      date_closed: '2026-01-10',
    });
    const wrongRef = buyClose({
      trade_ref: '48',
      premium: 0.5,
      date_closed: '2026-01-10',
    });
    expect(calculatePL(sold, [wrongRef])).toBe(200);
  });

  test('buyback lookup honors symbol', () => {
    const sold = sellPut({
      trade_ref: '47',
      symbol: 'TSLA',
      premium: 2,
      status: 'closed',
      close_price: 0,
      date_closed: '2026-01-10',
    });
    const wrongSymbol = buyClose({
      trade_ref: '47',
      symbol: 'META',
      premium: 0.5,
      date_closed: '2026-01-10',
    });
    expect(calculatePL(sold, [wrongSymbol])).toBe(200);
  });
});

// ---------- calculateRollCredit ------------------------------------------

describe('calculateRollCredit', () => {
  test('returns null when not rolled', () => {
    const t = sellPut({ is_rolled: false, trade_ref: '47' });
    expect(calculateRollCredit(t, [])).toBeNull();
  });

  test('returns null when no trade_ref', () => {
    const t = sellPut({ is_rolled: true, trade_ref: null });
    expect(calculateRollCredit(t, [])).toBeNull();
  });

  test('returns null when no buyback found', () => {
    const t = sellPut({ is_rolled: true, trade_ref: '47' });
    expect(calculateRollCredit(t, [])).toBeNull();
  });

  test('positive when net credit roll', () => {
    const newLeg = sellPut({
      is_rolled: true,
      trade_ref: '47',
      premium: 3,
      contracts: 1,
    });
    const buyback = buyClose({
      trade_ref: '47',
      symbol: 'TSLA',
      premium: 1,
      contracts: 1,
      date_closed: '2026-01-10',
    });
    // 300 - 100 = 200
    expect(calculateRollCredit(newLeg, [buyback])).toBe(200);
  });

  test('negative when net debit roll', () => {
    const newLeg = sellPut({
      is_rolled: true,
      trade_ref: '47',
      premium: 1,
    });
    const buyback = buyClose({
      trade_ref: '47',
      symbol: 'TSLA',
      premium: 3,
      date_closed: '2026-01-10',
    });
    expect(calculateRollCredit(newLeg, [buyback])).toBe(-200);
  });

  test('uses most recent buyback when multiple match', () => {
    const newLeg = sellPut({
      is_rolled: true,
      trade_ref: '47',
      premium: 2,
    });
    const older = buyClose({
      trade_ref: '47',
      premium: 0.5,
      date_closed: '2026-01-05',
    });
    const newer = buyClose({
      trade_ref: '47',
      premium: 1.5,
      date_closed: '2026-01-10',
    });
    // 200 - 150 = 50 (uses newer)
    expect(calculateRollCredit(newLeg, [older, newer])).toBe(50);
  });
});

// ---------- calculateDaysToExpiration ------------------------------------

describe('calculateDaysToExpiration', () => {
  const now = new Date('2026-01-10T12:00:00Z');

  test('future expiration: positive', () => {
    expect(calculateDaysToExpiration('2026-01-17', now)).toBe(7);
  });

  test('today: 0', () => {
    expect(calculateDaysToExpiration('2026-01-10', now)).toBe(0);
  });

  test('past expiration: negative', () => {
    expect(calculateDaysToExpiration('2026-01-03', now)).toBe(-7);
  });

  test('null exp_date: 0', () => {
    expect(calculateDaysToExpiration(null, now)).toBe(0);
  });
});
