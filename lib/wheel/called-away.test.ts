import { planCalledAway } from './called-away';
import type { CalledAwayInput } from './plan';
import {
  assignmentRow,
  buyClose,
  fixedCtx,
  sellCall,
  sellPut,
  state,
  stockPosition,
  tradeGroup,
} from './test-helpers';

const baseInput = (
  overrides: Partial<CalledAwayInput> = {}
): CalledAwayInput => ({
  stock_id: 'stock-1',
  calledAwayDate: '2026-03-01',
  salePrice: 110,
  notes: null,
  ...overrides,
});

describe('planCalledAway', () => {
  test('produces 1 insert + 1 stock delete; no group when trade_ref absent', () => {
    const stock = stockPosition({
      id: 'stock-1',
      shares: 100,
      assigned_price: 100,
      original_put: {
        strike: 100,
        premium: 2,
        contracts: 1,
        dateOpened: '2026-01-01',
        tradeRef: null,
        premiumCollected: 200,
      },
      trade_ref: null,
      covered_calls: [],
    });
    const plan = planCalledAway(
      baseInput(),
      state({ stocks: [stock] }),
      fixedCtx()
    );
    expect(plan.tradeInserts).toHaveLength(1);
    expect(plan.stockDeletes).toEqual([{ id: 'stock-1' }]);
    expect(plan.groupUpserts).toHaveLength(0);
  });

  test('cycle P&L = putPremium + callPremiums + stockProfit', () => {
    const stock = stockPosition({
      id: 'stock-1',
      shares: 100,
      assigned_price: 100,
      original_put: {
        strike: 100,
        premium: 2,
        contracts: 1,
        dateOpened: '2026-01-01',
        tradeRef: '47',
        premiumCollected: 200,
      },
      covered_calls: [
        {
          strike: 110,
          premium: 150, // dollars
          expDate: '2026-02-15',
          dateOpened: '2026-01-20',
          notes: null,
        },
        {
          strike: 110,
          premium: 100,
          expDate: '2026-02-28',
          dateOpened: '2026-02-16',
          notes: null,
        },
      ],
      trade_ref: '47',
    });
    // putPremium = 200; callPremiums = 250; stockProfit = (110-100)*100 = 1000
    // total = 1450
    const plan = planCalledAway(
      baseInput({ salePrice: 110 }),
      state({ stocks: [stock] }),
      fixedCtx()
    );
    const t = plan.tradeInserts[0];
    expect(t.full_cycle_pl).toBe(1450);
    expect(t.cycle_details).toEqual({
      putPremium: 200,
      callPremiums: 250,
      stockProfit: 1000,
      assignedPrice: 100,
      salePrice: 110,
    });
  });

  test('called-away row: action=called-away, type=stock, is_called_away=true, contracts=shares/100, linked_stock_id', () => {
    const stock = stockPosition({
      id: 'stock-1',
      shares: 200,
      assigned_price: 100,
      original_put: {
        strike: 100,
        premium: 2,
        contracts: 2,
        dateOpened: '2026-01-01',
        tradeRef: null,
        premiumCollected: 400,
      },
      covered_calls: [],
    });
    const plan = planCalledAway(
      baseInput({ salePrice: 110 }),
      state({ stocks: [stock] }),
      fixedCtx()
    );
    const t = plan.tradeInserts[0];
    expect(t.action).toBe('called-away');
    expect(t.type).toBe('stock');
    expect(t.is_called_away).toBe(true);
    expect(t.contracts).toBe(2);
    expect(t.strike).toBe(110);
    expect(t.price_at_action).toBe(110);
    expect(t.linked_stock_id).toBe('stock-1');
    expect(t.premium).toBe(0);
  });

  test('default info text describes price + total P&L', () => {
    const stock = stockPosition({
      id: 'stock-1',
      shares: 100,
      assigned_price: 100,
      original_put: {
        strike: 100,
        premium: 2,
        contracts: 1,
        dateOpened: '2026-01-01',
        tradeRef: null,
        premiumCollected: 200,
      },
      covered_calls: [],
    });
    const plan = planCalledAway(
      baseInput({ salePrice: 110 }),
      state({ stocks: [stock] }),
      fixedCtx()
    );
    // 200 + 0 + (110-100)*100 = 1200
    expect(plan.tradeInserts[0].info).toBe(
      'Called away at $110 - Total P&L: $1200'
    );
  });

  test('closes open covered calls found via linked_stock_id', () => {
    const stock = stockPosition({ id: 'stock-1', symbol: 'TSLA' });
    const cc = sellCall({
      id: 'cc-1',
      symbol: 'TSLA',
      is_covered_call: true,
      linked_stock_id: 'stock-1',
      status: 'open',
    });
    const plan = planCalledAway(
      baseInput({ salePrice: 110 }),
      state({ stocks: [stock], trades: [cc] }),
      fixedCtx()
    );
    expect(plan.tradeUpdates).toHaveLength(1);
    expect(plan.tradeUpdates[0]).toEqual({
      id: 'cc-1',
      patch: {
        status: 'closed',
        date_closed: '2026-03-01',
        close_price: 0,
        closing_notes: 'Exercised - Stock called away at $110',
      },
    });
  });

  test('falls back to symbol+trade_ref when linked_stock_id not present', () => {
    const stock = stockPosition({
      id: 'stock-1',
      symbol: 'TSLA',
      trade_ref: '47',
    });
    const cc = sellCall({
      id: 'cc-1',
      symbol: 'TSLA',
      trade_ref: '47',
      is_covered_call: true,
      linked_stock_id: null,
      status: 'open',
    });
    const plan = planCalledAway(
      baseInput(),
      state({ stocks: [stock], trades: [cc] }),
      fixedCtx()
    );
    expect(plan.tradeUpdates.map((u) => u.id)).toEqual(['cc-1']);
  });

  test('falls back to symbol+is_covered_call as last resort', () => {
    const stock = stockPosition({
      id: 'stock-1',
      symbol: 'TSLA',
      trade_ref: null,
    });
    const cc = sellCall({
      id: 'cc-1',
      symbol: 'TSLA',
      trade_ref: null,
      is_covered_call: true,
      linked_stock_id: null,
      status: 'open',
    });
    const plan = planCalledAway(
      baseInput(),
      state({ stocks: [stock], trades: [cc] }),
      fixedCtx()
    );
    expect(plan.tradeUpdates.map((u) => u.id)).toEqual(['cc-1']);
  });

  test('does not close non-covered calls or already-closed calls', () => {
    const stock = stockPosition({ id: 'stock-1', symbol: 'TSLA' });
    const naked = sellCall({
      id: 'naked',
      symbol: 'TSLA',
      is_covered_call: false,
      status: 'open',
    });
    const closed = sellCall({
      id: 'closed-cc',
      symbol: 'TSLA',
      is_covered_call: true,
      linked_stock_id: 'stock-1',
      status: 'closed',
    });
    const plan = planCalledAway(
      baseInput(),
      state({ stocks: [stock], trades: [naked, closed] }),
      fixedCtx()
    );
    expect(plan.tradeUpdates).toHaveLength(0);
  });

  test('Full Wheel Cycle group: collects put + assignment + covered-call sells + called-away row', () => {
    const put = sellPut({
      id: 'put-1',
      symbol: 'TSLA',
      trade_ref: '47',
      status: 'assigned',
    });
    const assign = assignmentRow({
      id: 'assign-1',
      symbol: 'TSLA',
      trade_ref: '47',
    });
    const cc1 = sellCall({
      id: 'cc-1',
      symbol: 'TSLA',
      trade_ref: '47',
      is_covered_call: true,
      status: 'closed', // already closed (e.g. expired worthless before sale)
    });
    const cc2 = sellCall({
      id: 'cc-2',
      symbol: 'TSLA',
      trade_ref: '47',
      is_covered_call: true,
      linked_stock_id: 'stock-1',
      status: 'open',
    });
    const ccBuyback = buyClose({
      id: 'cc-bb',
      symbol: 'TSLA',
      trade_ref: '47',
      // is_covered_call is false on the BUY-to-close itself; spec excludes is_closing_trade buys
    });
    const stock = stockPosition({
      id: 'stock-1',
      symbol: 'TSLA',
      trade_ref: '47',
      original_put_id: 'put-1',
    });

    const plan = planCalledAway(
      baseInput(),
      state({ stocks: [stock], trades: [put, assign, cc1, cc2, ccBuyback] }),
      fixedCtx()
    );

    expect(plan.groupUpserts).toHaveLength(1);
    expect(plan.groupUpserts[0].name).toBe(
      'Trade Ref: 47 - Full Wheel Cycle'
    );
    const ids = plan.groupUpserts[0].addTradeIds;
    expect(ids).toEqual(
      expect.arrayContaining(['put-1', 'assign-1', 'cc-1', 'cc-2', 'id-1'])
    );
    expect(ids).not.toContain('cc-bb');
    expect(ids).toHaveLength(5);
  });

  test('Full Wheel Cycle group: dedupes ids that already exist in the group', () => {
    const put = sellPut({
      id: 'put-1',
      symbol: 'TSLA',
      trade_ref: '47',
      status: 'assigned',
    });
    const assign = assignmentRow({
      id: 'assign-1',
      symbol: 'TSLA',
      trade_ref: '47',
    });
    const stock = stockPosition({
      id: 'stock-1',
      symbol: 'TSLA',
      trade_ref: '47',
      original_put_id: 'put-1',
    });
    const existing = tradeGroup({
      name: 'Trade Ref: 47 - Full Wheel Cycle',
      trade_ids: ['put-1'],
    });

    const plan = planCalledAway(
      baseInput(),
      state({ stocks: [stock], trades: [put, assign], groups: [existing] }),
      fixedCtx()
    );

    expect(plan.groupUpserts[0].addTradeIds).toEqual(['assign-1', 'id-1']);
  });

  test('throws when stock not found', () => {
    expect(() =>
      planCalledAway(
        baseInput({ stock_id: 'missing' }),
        state(),
        fixedCtx()
      )
    ).toThrow();
  });

  test('throws when stock already called-away', () => {
    const stock = stockPosition({ id: 'stock-1', status: 'called-away' });
    expect(() =>
      planCalledAway(
        baseInput(),
        state({ stocks: [stock] }),
        fixedCtx()
      )
    ).toThrow();
  });

  test('stock delete is in the plan', () => {
    const stock = stockPosition({ id: 'stock-1' });
    const plan = planCalledAway(
      baseInput(),
      state({ stocks: [stock] }),
      fixedCtx()
    );
    expect(plan.stockDeletes).toEqual([{ id: 'stock-1' }]);
  });
});
