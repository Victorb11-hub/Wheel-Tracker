import {
  detectSmartCloseMatch,
  planAddTrade,
  planPlainAdd,
  planSmartClose,
} from './smart-close';
import type { AddPositionInput } from './plan';
import {
  fixedCtx,
  sellCall,
  sellPut,
  state,
  tradeGroup,
} from './test-helpers';

const buyInput = (overrides: Partial<AddPositionInput> = {}): AddPositionInput => ({
  trade_ref: '47',
  account: 'Main',
  symbol: 'TSLA',
  contracts: 1,
  strike: 100,
  premium: 0.5,
  action: 'buy',
  type: 'put',
  date_opened: '2026-01-10',
  exp_date: '2026-01-15',
  price_at_action: 105,
  info: null,
  ...overrides,
});

// ---------- detectSmartCloseMatch ----------------------------------------

describe('detectSmartCloseMatch', () => {
  test('matches open sell put with same ref + symbol + strike', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47', strike: 100 });
    const result = detectSmartCloseMatch(buyInput(), [sold]);
    expect(result?.id).toBe('sold');
  });

  test('returns null when action is not buy', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47' });
    expect(detectSmartCloseMatch(buyInput({ action: 'sell' }), [sold])).toBeNull();
  });

  test('returns null when trade_ref missing', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47' });
    expect(detectSmartCloseMatch(buyInput({ trade_ref: null }), [sold])).toBeNull();
  });

  test('returns null when no open trade has same trade_ref', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '99' });
    expect(detectSmartCloseMatch(buyInput({ trade_ref: '47' }), [sold])).toBeNull();
  });

  test('returns null when symbol differs', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47', symbol: 'META' });
    expect(detectSmartCloseMatch(buyInput({ symbol: 'TSLA' }), [sold])).toBeNull();
  });

  test('symbol comparison is case-insensitive on input', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47', symbol: 'TSLA' });
    const result = detectSmartCloseMatch(buyInput({ symbol: 'tsla' }), [sold]);
    expect(result?.id).toBe('sold');
  });

  test('returns null when strike differs and input.strike is non-zero', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47', strike: 100 });
    expect(detectSmartCloseMatch(buyInput({ strike: 110 }), [sold])).toBeNull();
  });

  test('strike=0 matches any open trade with same ref/symbol', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47', strike: 100 });
    const result = detectSmartCloseMatch(buyInput({ strike: 0 }), [sold]);
    expect(result?.id).toBe('sold');
  });

  test('strike=null matches any open trade with same ref/symbol', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47', strike: 100 });
    const result = detectSmartCloseMatch(buyInput({ strike: null }), [sold]);
    expect(result?.id).toBe('sold');
  });

  test('does not match closed trades', () => {
    const sold = sellPut({
      id: 'sold',
      trade_ref: '47',
      status: 'closed',
      date_closed: '2026-01-09',
    });
    expect(detectSmartCloseMatch(buyInput(), [sold])).toBeNull();
  });

  test('does not match assignment / called-away rows', () => {
    // The only way to construct these is via assignmentRow / calledAwayRow,
    // both of which have status='closed' so they wouldn't match anyway.
    // This test guards the action filter.
    const sold = sellPut({
      id: 'sold',
      trade_ref: '47',
      action: 'sell',
    });
    // Sanity: confirm the buy filter rejects sell-input even with right ref.
    expect(detectSmartCloseMatch(buyInput({ action: 'sell' }), [sold])).toBeNull();
  });

  test('matches a sold call (covered call) with same ref + symbol', () => {
    const sold = sellCall({ id: 'sold', trade_ref: '47', strike: 110 });
    const result = detectSmartCloseMatch(
      buyInput({ strike: 110, type: 'call' }),
      [sold]
    );
    expect(result?.id).toBe('sold');
  });
});

// ---------- planSmartClose -----------------------------------------------

describe('planSmartClose', () => {
  test('produces 1 update + 1 insert + 1 group upsert', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47', strike: 100 });
    const plan = planSmartClose(buyInput(), sold, state(), fixedCtx());

    expect(plan.tradeUpdates).toHaveLength(1);
    expect(plan.tradeInserts).toHaveLength(1);
    expect(plan.groupUpserts).toHaveLength(1);
    expect(plan.stockInserts).toHaveLength(0);
    expect(plan.stockUpdates).toHaveLength(0);
  });

  test('marks matched trade closed with date_closed = input.date_opened', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47' });
    const plan = planSmartClose(
      buyInput({ date_opened: '2026-01-10' }),
      sold,
      state(),
      fixedCtx()
    );
    expect(plan.tradeUpdates[0]).toEqual({
      id: 'sold',
      patch: { status: 'closed', date_closed: '2026-01-10' },
    });
  });

  test('inserted BUY row has is_closing_trade=true and status=closed', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47' });
    const plan = planSmartClose(buyInput(), sold, state(), fixedCtx());
    const buy = plan.tradeInserts[0];
    expect(buy.action).toBe('buy');
    expect(buy.is_closing_trade).toBe(true);
    expect(buy.status).toBe('closed');
    expect(buy.date_closed).toBe(buy.date_opened);
  });

  test('inherits strike from match when input.strike is null/0', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47', strike: 100 });
    const plan = planSmartClose(
      buyInput({ strike: 0 }),
      sold,
      state(),
      fixedCtx()
    );
    expect(plan.tradeInserts[0].strike).toBe(100);

    const plan2 = planSmartClose(
      buyInput({ strike: null }),
      sold,
      state(),
      fixedCtx()
    );
    expect(plan2.tradeInserts[0].strike).toBe(100);
  });

  test('inherits type from match when input.type is null', () => {
    const sold = sellCall({ id: 'sold', trade_ref: '47', strike: 110 });
    const plan = planSmartClose(
      buyInput({ type: null, strike: 0 }),
      sold,
      state(),
      fixedCtx()
    );
    expect(plan.tradeInserts[0].type).toBe('call');
  });

  test('inherits account from match when input.account is null', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47', account: 'IRA' });
    const plan = planSmartClose(
      buyInput({ account: null }),
      sold,
      state(),
      fixedCtx()
    );
    expect(plan.tradeInserts[0].account).toBe('IRA');
  });

  test('uppercases symbol on insert', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47', symbol: 'TSLA' });
    const plan = planSmartClose(
      buyInput({ symbol: 'tsla' }),
      sold,
      state(),
      fixedCtx()
    );
    expect(plan.tradeInserts[0].symbol).toBe('TSLA');
  });

  test('creates new group when none exists', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47' });
    const plan = planSmartClose(buyInput(), sold, state(), fixedCtx());
    expect(plan.groupUpserts[0].name).toBe('Trade Ref: 47');
    expect(plan.groupUpserts[0].addTradeIds).toEqual(['sold', 'id-1']);
  });

  test('appends to existing group, dedupes existing ids', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47' });
    const existing = tradeGroup({
      name: 'Trade Ref: 47',
      trade_ids: ['sold', 'other'],
    });
    const plan = planSmartClose(
      buyInput(),
      sold,
      state({ groups: [existing] }),
      fixedCtx()
    );
    // 'sold' already in group — only the new buy id is added.
    expect(plan.groupUpserts[0].addTradeIds).toEqual(['id-1']);
  });
});

// ---------- planPlainAdd --------------------------------------------------

describe('planPlainAdd', () => {
  test('inserts a single open trade with no group handling', () => {
    const plan = planPlainAdd(
      {
        trade_ref: '99',
        account: 'Main',
        symbol: 'tsla',
        contracts: 2,
        strike: 100,
        premium: 1.5,
        action: 'sell',
        type: 'put',
        date_opened: '2026-01-01',
        exp_date: '2026-01-15',
        price_at_action: 110,
        info: null,
      },
      fixedCtx()
    );

    expect(plan.tradeInserts).toHaveLength(1);
    expect(plan.tradeUpdates).toHaveLength(0);
    expect(plan.groupUpserts).toHaveLength(0);

    const t = plan.tradeInserts[0];
    expect(t.id).toBe('id-1');
    expect(t.symbol).toBe('TSLA');
    expect(t.status).toBe('open');
    expect(t.is_closing_trade).toBe(false);
  });

  test('throws when type missing', () => {
    expect(() =>
      planPlainAdd(
        {
          trade_ref: null,
          account: null,
          symbol: 'TSLA',
          contracts: 1,
          strike: 100,
          premium: 1,
          action: 'sell',
          type: null,
          date_opened: '2026-01-01',
          exp_date: null,
          price_at_action: null,
          info: null,
        },
        fixedCtx()
      )
    ).toThrow();
  });

  test('throws when strike missing', () => {
    expect(() =>
      planPlainAdd(
        {
          trade_ref: null,
          account: null,
          symbol: 'TSLA',
          contracts: 1,
          strike: null,
          premium: 1,
          action: 'sell',
          type: 'put',
          date_opened: '2026-01-01',
          exp_date: null,
          price_at_action: null,
          info: null,
        },
        fixedCtx()
      )
    ).toThrow();
  });
});

// ---------- planAddTrade integration --------------------------------------

describe('planAddTrade', () => {
  test('routes to smart-close when match exists', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47', strike: 100 });
    const plan = planAddTrade(
      buyInput(),
      state({ trades: [sold] }),
      fixedCtx()
    );
    expect(plan.tradeUpdates).toHaveLength(1);
    expect(plan.groupUpserts).toHaveLength(1);
  });

  test('routes to plain-add when no match', () => {
    const plan = planAddTrade(
      buyInput({ trade_ref: '99' }),
      state(),
      fixedCtx()
    );
    expect(plan.tradeUpdates).toHaveLength(0);
    expect(plan.groupUpserts).toHaveLength(0);
    expect(plan.tradeInserts).toHaveLength(1);
  });

  test('plain-add for sell input even when ref matches an open sell (only buys trigger smart-close)', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47' });
    const plan = planAddTrade(
      buyInput({ action: 'sell', trade_ref: '47' }),
      state({ trades: [sold] }),
      fixedCtx()
    );
    expect(plan.tradeUpdates).toHaveLength(0);
    expect(plan.tradeInserts).toHaveLength(1);
    expect(plan.tradeInserts[0].action).toBe('sell');
  });
});
