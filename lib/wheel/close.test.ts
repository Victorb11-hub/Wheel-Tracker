import { planClose } from './close';
import { fixedCtx, sellPut, state, tradeGroup } from './test-helpers';

describe('planClose', () => {
  test('marks original closed and stamps close_price', () => {
    const sold = sellPut({ id: 'sold', strike: 100, premium: 2, contracts: 1 });
    const plan = planClose(
      {
        trade_id: 'sold',
        close_date: '2026-01-10',
        closing_premium: 0.5,
        closing_notes: 'took profit',
      },
      state({ trades: [sold] }),
      fixedCtx()
    );

    expect(plan.tradeUpdates).toEqual([
      {
        id: 'sold',
        patch: {
          status: 'closed',
          date_closed: '2026-01-10',
          close_price: 0.5,
          closing_notes: 'took profit',
        },
      },
    ]);
  });

  test('inserts opposite-action closing leg with is_closing_trade=true', () => {
    const sold = sellPut({
      id: 'sold',
      strike: 100,
      premium: 2,
      contracts: 1,
      symbol: 'TSLA',
      account: 'Main',
      trade_ref: '47',
      exp_date: '2026-01-15',
    });
    const plan = planClose(
      {
        trade_id: 'sold',
        close_date: '2026-01-10',
        closing_premium: 0.5,
        closing_notes: null,
      },
      state({ trades: [sold] }),
      fixedCtx()
    );

    const close = plan.tradeInserts[0];
    expect(close.action).toBe('buy');
    expect(close.type).toBe('put');
    expect(close.symbol).toBe('TSLA');
    expect(close.account).toBe('Main');
    expect(close.trade_ref).toBe('47');
    expect(close.strike).toBe(100);
    expect(close.contracts).toBe(1);
    expect(close.premium).toBe(0.5);
    expect(close.exp_date).toBe('2026-01-15');
    expect(close.date_opened).toBe('2026-01-10');
    expect(close.date_closed).toBe('2026-01-10');
    expect(close.is_closing_trade).toBe(true);
    expect(close.is_rolled).toBe(false);
    expect(close.status).toBe('closed');
  });

  test('flips action correctly when closing a buy (long) leg', () => {
    const long = sellPut({
      id: 'long',
      action: 'buy',
      type: 'call',
      strike: 100,
    });
    const plan = planClose(
      {
        trade_id: 'long',
        close_date: '2026-01-10',
        closing_premium: 1.5,
        closing_notes: null,
      },
      state({ trades: [long] }),
      fixedCtx()
    );

    expect(plan.tradeInserts[0].action).toBe('sell');
  });

  test('with trade_ref: creates new group with both ids', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47' });
    const plan = planClose(
      {
        trade_id: 'sold',
        close_date: '2026-01-10',
        closing_premium: 0.5,
        closing_notes: null,
      },
      state({ trades: [sold] }),
      fixedCtx()
    );

    expect(plan.groupUpserts).toEqual([
      { name: 'Trade Ref: 47', addTradeIds: ['sold', 'id-1'] },
    ]);
  });

  test('with trade_ref: appends to existing group, dedupes', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47' });
    const existing = tradeGroup({
      name: 'Trade Ref: 47',
      trade_ids: ['sold'],
    });
    const plan = planClose(
      {
        trade_id: 'sold',
        close_date: '2026-01-10',
        closing_premium: 0.5,
        closing_notes: null,
      },
      state({ trades: [sold], groups: [existing] }),
      fixedCtx()
    );

    expect(plan.groupUpserts[0].addTradeIds).toEqual(['id-1']);
  });

  test('without trade_ref: no group upsert', () => {
    const sold = sellPut({ id: 'sold', trade_ref: null });
    const plan = planClose(
      {
        trade_id: 'sold',
        close_date: '2026-01-10',
        closing_premium: 0.5,
        closing_notes: null,
      },
      state({ trades: [sold] }),
      fixedCtx()
    );
    expect(plan.groupUpserts).toHaveLength(0);
  });

  test('throws when trade not found', () => {
    expect(() =>
      planClose(
        {
          trade_id: 'missing',
          close_date: '2026-01-10',
          closing_premium: 0.5,
          closing_notes: null,
        },
        state(),
        fixedCtx()
      )
    ).toThrow();
  });

  test('throws when trade is not open', () => {
    const sold = sellPut({ id: 'sold', status: 'closed' });
    expect(() =>
      planClose(
        {
          trade_id: 'sold',
          close_date: '2026-01-10',
          closing_premium: 0.5,
          closing_notes: null,
        },
        state({ trades: [sold] }),
        fixedCtx()
      )
    ).toThrow();
  });
});
