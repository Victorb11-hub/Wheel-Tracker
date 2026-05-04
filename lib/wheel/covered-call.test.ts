import { planSellCoveredCall } from './covered-call';
import type { SellCoveredCallInput } from './plan';
import { fixedCtx, state, stockPosition } from './test-helpers';

const baseInput = (
  overrides: Partial<SellCoveredCallInput> = {}
): SellCoveredCallInput => ({
  stock_id: 'stock-1',
  strike: 110,
  premium: 1.5,
  expDate: '2026-02-15',
  dateOpened: '2026-01-20',
  notes: null,
  ...overrides,
});

describe('planSellCoveredCall', () => {
  test('produces 1 insert + 1 stock update', () => {
    const stock = stockPosition({ id: 'stock-1' });
    const plan = planSellCoveredCall(
      baseInput(),
      state({ stocks: [stock] }),
      fixedCtx()
    );
    expect(plan.tradeInserts).toHaveLength(1);
    expect(plan.stockUpdates).toHaveLength(1);
  });

  test('inserted call: is_covered_call=true, linked_stock_id, action=sell, type=call', () => {
    const stock = stockPosition({
      id: 'stock-1',
      symbol: 'TSLA',
      shares: 100,
      account: 'IRA',
      trade_ref: '47',
    });
    const plan = planSellCoveredCall(
      baseInput({ strike: 110, premium: 1.5 }),
      state({ stocks: [stock] }),
      fixedCtx()
    );
    const t = plan.tradeInserts[0];
    expect(t.action).toBe('sell');
    expect(t.type).toBe('call');
    expect(t.is_covered_call).toBe(true);
    expect(t.linked_stock_id).toBe('stock-1');
    expect(t.symbol).toBe('TSLA');
    expect(t.account).toBe('IRA');
    expect(t.trade_ref).toBe('47');
    expect(t.strike).toBe(110);
    expect(t.premium).toBe(1.5);
    expect(t.status).toBe('open');
    expect(t.contracts).toBe(1);
  });

  test('contracts = stock.shares / 100', () => {
    const stock = stockPosition({ id: 'stock-1', shares: 500 });
    const plan = planSellCoveredCall(
      baseInput(),
      state({ stocks: [stock] }),
      fixedCtx()
    );
    expect(plan.tradeInserts[0].contracts).toBe(5);
  });

  test('appends snapshot to stock.covered_calls (premium in DOLLARS)', () => {
    const stock = stockPosition({
      id: 'stock-1',
      shares: 200,
      covered_calls: [],
    });
    const plan = planSellCoveredCall(
      baseInput({
        strike: 110,
        premium: 1.5,
        expDate: '2026-02-15',
        dateOpened: '2026-01-20',
        notes: 'first call',
      }),
      state({ stocks: [stock] }),
      fixedCtx()
    );
    expect(plan.stockUpdates[0]).toEqual({
      id: 'stock-1',
      patch: {
        covered_calls: [
          {
            strike: 110,
            premium: 300, // 1.5 × 2 × 100
            expDate: '2026-02-15',
            dateOpened: '2026-01-20',
            notes: 'first call',
          },
        ],
      },
    });
  });

  test('appends to existing covered_calls without dropping prior entries', () => {
    const prior = {
      strike: 105,
      premium: 100,
      expDate: '2026-01-15',
      dateOpened: '2026-01-01',
      notes: null,
    };
    const stock = stockPosition({
      id: 'stock-1',
      shares: 100,
      covered_calls: [prior],
    });
    const plan = planSellCoveredCall(
      baseInput({ strike: 110, premium: 1 }),
      state({ stocks: [stock] }),
      fixedCtx()
    );
    const updatedCalls = plan.stockUpdates[0].patch.covered_calls!;
    expect(updatedCalls).toHaveLength(2);
    expect(updatedCalls[0]).toEqual(prior);
    expect(updatedCalls[1].strike).toBe(110);
  });

  test('throws when stock not found', () => {
    expect(() =>
      planSellCoveredCall(
        baseInput({ stock_id: 'missing' }),
        state(),
        fixedCtx()
      )
    ).toThrow();
  });

  test('throws when stock is already called-away', () => {
    const stock = stockPosition({ id: 'stock-1', status: 'called-away' });
    expect(() =>
      planSellCoveredCall(
        baseInput(),
        state({ stocks: [stock] }),
        fixedCtx()
      )
    ).toThrow();
  });

  test('throws when shares not divisible by 100', () => {
    const stock = stockPosition({ id: 'stock-1', shares: 150 });
    expect(() =>
      planSellCoveredCall(
        baseInput(),
        state({ stocks: [stock] }),
        fixedCtx()
      )
    ).toThrow();
  });
});
