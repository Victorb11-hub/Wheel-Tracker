import { planAssign } from './assign';
import type { AssignInput } from './plan';
import { fixedCtx, sellCall, sellPut, state } from './test-helpers';

const baseInput = (overrides: Partial<AssignInput> = {}): AssignInput => ({
  trade_id: 'sold',
  assignDate: '2026-01-15',
  assignmentPrice: 98,
  assignmentNotes: null,
  ...overrides,
});

describe('planAssign', () => {
  test('produces 1 update + 1 trade insert + 1 stock insert', () => {
    const sold = sellPut({ id: 'sold', strike: 100, contracts: 1, premium: 2 });
    const plan = planAssign(baseInput(), state({ trades: [sold] }), fixedCtx());
    expect(plan.tradeUpdates).toHaveLength(1);
    expect(plan.tradeInserts).toHaveLength(1);
    expect(plan.stockInserts).toHaveLength(1);
  });

  test('marks put assigned, stamps date_closed + assigned_price', () => {
    const sold = sellPut({ id: 'sold', strike: 100 });
    const plan = planAssign(baseInput(), state({ trades: [sold] }), fixedCtx());
    expect(plan.tradeUpdates[0]).toEqual({
      id: 'sold',
      patch: {
        status: 'assigned',
        date_closed: '2026-01-15',
        assigned_price: 98,
        closing_notes: null,
      },
    });
  });

  test('stock insert: shares = contracts × 100, costs use put.strike', () => {
    const sold = sellPut({
      id: 'sold',
      strike: 100,
      contracts: 2,
      premium: 2,
      symbol: 'TSLA',
      account: 'IRA',
      trade_ref: '47',
      date_opened: '2026-01-01',
    });
    const plan = planAssign(
      baseInput({ assignmentPrice: 98 }),
      state({ trades: [sold] }),
      fixedCtx()
    );
    const stock = plan.stockInserts[0];
    expect(stock.id).toBe('id-1');
    expect(stock.symbol).toBe('TSLA');
    expect(stock.shares).toBe(200);
    expect(stock.cost_basis).toBe(100);
    expect(stock.assigned_price).toBe(98);
    expect(stock.total_cost).toBe(20000);
    expect(stock.total_value).toBe(19600);
    expect(stock.assigned_date).toBe('2026-01-15');
    expect(stock.original_put_id).toBe('sold');
    expect(stock.account).toBe('IRA');
    expect(stock.trade_ref).toBe('47');
    expect(stock.status).toBe('holding');
    expect(stock.covered_calls).toEqual([]);
  });

  test('original_put snapshot captures premiumCollected = premium × contracts × 100', () => {
    const sold = sellPut({
      id: 'sold',
      strike: 100,
      contracts: 2,
      premium: 2.5,
      trade_ref: '47',
      date_opened: '2026-01-01',
    });
    const plan = planAssign(baseInput(), state({ trades: [sold] }), fixedCtx());
    expect(plan.stockInserts[0].original_put).toEqual({
      strike: 100,
      premium: 2.5,
      contracts: 2,
      dateOpened: '2026-01-01',
      tradeRef: '47',
      premiumCollected: 500,
    });
  });

  test('synthetic assignment trade: action=assignment, type=stock, is_assignment=true, status=closed', () => {
    const sold = sellPut({ id: 'sold', strike: 100, contracts: 1 });
    const plan = planAssign(
      baseInput({ assignmentPrice: 98 }),
      state({ trades: [sold] }),
      fixedCtx()
    );
    const t = plan.tradeInserts[0];
    expect(t.id).toBe('id-2'); // stock id is id-1, assignment trade is id-2
    expect(t.action).toBe('assignment');
    expect(t.type).toBe('stock');
    expect(t.is_assignment).toBe(true);
    expect(t.status).toBe('closed');
    expect(t.premium).toBe(0);
    expect(t.assigned_price).toBe(98);
    expect(t.price_at_action).toBe(98);
    expect(t.linked_stock_id).toBe('id-1');
  });

  test('default info text describes shares + price', () => {
    const sold = sellPut({ id: 'sold', strike: 100, contracts: 1 });
    const plan = planAssign(
      baseInput({ assignmentPrice: 98 }),
      state({ trades: [sold] }),
      fixedCtx()
    );
    expect(plan.tradeInserts[0].info).toBe('Assigned 100 shares at $98');
  });

  test('custom info when assignmentNotes provided', () => {
    const sold = sellPut({ id: 'sold', strike: 100 });
    const plan = planAssign(
      baseInput({ assignmentNotes: 'expired ITM' }),
      state({ trades: [sold] }),
      fixedCtx()
    );
    expect(plan.tradeInserts[0].info).toBe('expired ITM');
  });

  test('inherits trade_ref + account on assignment row and stock', () => {
    const sold = sellPut({
      id: 'sold',
      strike: 100,
      trade_ref: '47',
      account: 'IRA',
    });
    const plan = planAssign(baseInput(), state({ trades: [sold] }), fixedCtx());
    expect(plan.tradeInserts[0].trade_ref).toBe('47');
    expect(plan.tradeInserts[0].account).toBe('IRA');
    expect(plan.stockInserts[0].trade_ref).toBe('47');
    expect(plan.stockInserts[0].account).toBe('IRA');
  });

  test('throws when trade is not a sold put', () => {
    const sold = sellCall({ id: 'sold' });
    expect(() =>
      planAssign(baseInput(), state({ trades: [sold] }), fixedCtx())
    ).toThrow();
  });

  test('throws when put is not open', () => {
    const sold = sellPut({ id: 'sold', status: 'closed' });
    expect(() =>
      planAssign(baseInput(), state({ trades: [sold] }), fixedCtx())
    ).toThrow();
  });

  test('throws when trade not found', () => {
    expect(() =>
      planAssign(baseInput({ trade_id: 'missing' }), state(), fixedCtx())
    ).toThrow();
  });
});
