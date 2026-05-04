import { planRoll } from './roll';
import type { RollInput } from './plan';
import { fixedCtx, sellPut, state, tradeGroup } from './test-helpers';

const baseInput = (overrides: Partial<RollInput> = {}): RollInput => ({
  trade_id: 'sold',
  rollCloseDate: '2026-01-10',
  rollClosingPremium: 0.5,
  rollNewStrike: 95,
  rollNewPremium: 1.2,
  rollNewExpDate: '2026-01-22',
  rollPriceAtAction: 102,
  rollNewType: 'put',
  rollNotes: null,
  ...overrides,
});

describe('planRoll', () => {
  test('produces 1 update + 2 inserts', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47' });
    const plan = planRoll(baseInput(), state({ trades: [sold] }), fixedCtx());
    expect(plan.tradeUpdates).toHaveLength(1);
    expect(plan.tradeInserts).toHaveLength(2);
  });

  test('marks original closed + is_rolled=true', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47' });
    const plan = planRoll(baseInput(), state({ trades: [sold] }), fixedCtx());
    expect(plan.tradeUpdates[0]).toEqual({
      id: 'sold',
      patch: {
        status: 'closed',
        date_closed: '2026-01-10',
        is_rolled: true,
        close_price: 0.5,
      },
    });
  });

  test('closing leg: opposite action, is_closing_trade + is_rolled, inherits original strike/contracts/exp', () => {
    const sold = sellPut({
      id: 'sold',
      strike: 100,
      contracts: 2,
      exp_date: '2026-01-15',
      symbol: 'TSLA',
      account: 'Main',
      trade_ref: '47',
    });
    const plan = planRoll(baseInput(), state({ trades: [sold] }), fixedCtx());
    const closing = plan.tradeInserts[0];
    expect(closing.action).toBe('buy');
    expect(closing.type).toBe('put');
    expect(closing.strike).toBe(100);
    expect(closing.contracts).toBe(2);
    expect(closing.exp_date).toBe('2026-01-15');
    expect(closing.is_closing_trade).toBe(true);
    expect(closing.is_rolled).toBe(true);
    expect(closing.status).toBe('closed');
    expect(closing.symbol).toBe('TSLA');
    expect(closing.account).toBe('Main');
    expect(closing.trade_ref).toBe('47');
  });

  test('new leg: status=open, is_rolled=true, inherits trade_ref, has new strike/exp/type', () => {
    const sold = sellPut({ id: 'sold', strike: 100, trade_ref: '47' });
    const plan = planRoll(
      baseInput({
        rollNewStrike: 95,
        rollNewExpDate: '2026-01-22',
        rollNewType: 'call',
        rollNewPremium: 2.5,
      }),
      state({ trades: [sold] }),
      fixedCtx()
    );
    const newLeg = plan.tradeInserts[1];
    expect(newLeg.action).toBe('sell');
    expect(newLeg.type).toBe('call');
    expect(newLeg.strike).toBe(95);
    expect(newLeg.exp_date).toBe('2026-01-22');
    expect(newLeg.premium).toBe(2.5);
    expect(newLeg.status).toBe('open');
    expect(newLeg.is_rolled).toBe(true);
    expect(newLeg.is_closing_trade).toBe(false);
    expect(newLeg.trade_ref).toBe('47');
  });

  test('default info text when rollNotes is null', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47' });
    const plan = planRoll(baseInput(), state({ trades: [sold] }), fixedCtx());
    expect(plan.tradeInserts[0].info).toBe('Rolled - closing leg');
    expect(plan.tradeInserts[1].info).toBe('Rolled - new leg');
  });

  test('custom info prefixes when rollNotes provided', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47' });
    const plan = planRoll(
      baseInput({ rollNotes: 'down 5 strikes for credit' }),
      state({ trades: [sold] }),
      fixedCtx()
    );
    expect(plan.tradeInserts[0].info).toBe('Roll close: down 5 strikes for credit');
    expect(plan.tradeInserts[1].info).toBe('Rolled: down 5 strikes for credit');
  });

  test('group: only the two CLOSED ids go in (new open leg stays out)', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47' });
    const plan = planRoll(baseInput(), state({ trades: [sold] }), fixedCtx());
    expect(plan.groupUpserts[0].name).toBe('Trade Ref: 47');
    expect(plan.groupUpserts[0].addTradeIds).toEqual(['sold', 'id-1']);
    // 'id-2' (the new open leg) is NOT in the group
    expect(plan.groupUpserts[0].addTradeIds).not.toContain('id-2');
  });

  test('group: appends to existing group, dedupes existing ids', () => {
    const sold = sellPut({ id: 'sold', trade_ref: '47' });
    const existing = tradeGroup({
      name: 'Trade Ref: 47',
      trade_ids: ['sold'],
    });
    const plan = planRoll(
      baseInput(),
      state({ trades: [sold], groups: [existing] }),
      fixedCtx()
    );
    expect(plan.groupUpserts[0].addTradeIds).toEqual(['id-1']);
  });

  test('without trade_ref: no group upsert at all', () => {
    const sold = sellPut({ id: 'sold', trade_ref: null });
    const plan = planRoll(baseInput(), state({ trades: [sold] }), fixedCtx());
    expect(plan.groupUpserts).toHaveLength(0);
  });

  test('throws when trade not found', () => {
    expect(() =>
      planRoll(baseInput({ trade_id: 'missing' }), state(), fixedCtx())
    ).toThrow();
  });

  test('throws when trade is not open', () => {
    const sold = sellPut({ id: 'sold', status: 'closed' });
    expect(() =>
      planRoll(baseInput(), state({ trades: [sold] }), fixedCtx())
    ).toThrow();
  });

  test('rolling a covered call preserves is_covered_call + linked_stock_id on new leg', () => {
    const cc = sellPut({
      id: 'cc',
      action: 'sell',
      type: 'call',
      is_covered_call: true,
      linked_stock_id: 'stock-1',
      strike: 110,
      trade_ref: '47',
    });
    const plan = planRoll(
      baseInput({ trade_id: 'cc', rollNewType: 'call', rollNewStrike: 115 }),
      state({ trades: [cc] }),
      fixedCtx()
    );
    const newLeg = plan.tradeInserts[1];
    expect(newLeg.is_covered_call).toBe(true);
    expect(newLeg.linked_stock_id).toBe('stock-1');
  });
});
