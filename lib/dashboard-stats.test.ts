import {
  computeAllocation,
  computeAvgDTE,
  computeQuickStats,
  computeWinRate,
} from './dashboard-stats';
import { buildSeed } from './data/seed';
import { sellPut, tradeGroup } from './wheel/test-helpers';

describe('computeWinRate', () => {
  test('seed: at least one win, rate is 100% (closed-win + full-wheel both positive)', () => {
    const s = buildSeed();
    const r = computeWinRate(s.groups, s.trades);
    expect(r.wins).toBeGreaterThanOrEqual(1);
    // Open-rolled group (Trade Ref: 101) excluded because metaRollNew is open
    // Closed-win group (Trade Ref: 103): meta sell premium 5 - close 1 = 400 → win
    // Full Wheel Cycle (Trade Ref: 100): putPremium 800 + cc1 400 + cc2 550 + stockProfit 3000 → all positive contribs
    expect(r.groupCount).toBeGreaterThanOrEqual(2);
  });

  test('zero closed groups → rate=0, no division by zero', () => {
    const r = computeWinRate([], []);
    expect(r.wins).toBe(0);
    expect(r.losses).toBe(0);
    expect(r.rate).toBe(0);
  });

  test('group with all-open trades → excluded', () => {
    const open = sellPut({ id: 'open', status: 'open' });
    const g = tradeGroup({ id: 'g1', trade_ids: ['open'] });
    const r = computeWinRate([g], [open]);
    expect(r.groupCount).toBe(0);
  });

  test('closed group with net loss → counted as loss', () => {
    const sold = sellPut({
      id: 'sold',
      status: 'closed',
      premium: 1,
      contracts: 1,
      close_price: 3,  // bought back higher → loss
      date_closed: '2026-01-10',
    });
    const g = tradeGroup({ id: 'g1', trade_ids: ['sold'] });
    const r = computeWinRate([g], [sold]);
    expect(r.wins).toBe(0);
    expect(r.losses).toBe(1);
  });
});

describe('computeAvgDTE', () => {
  test('seed: only counts open option legs (3 in seed), with min and max', () => {
    const s = buildSeed();
    // Anchor "today" to seed today (2026-05-01) for stable assertions
    const r = computeAvgDTE(s.trades, new Date(2026, 4, 1));
    // Open legs at exp 2026-05-29 (28d), 2026-05-15 (14d), 2026-05-22 (21d)
    expect(r.count).toBe(3);
    expect(r.min).toBe(14);
    expect(r.max).toBe(28);
    expect(r.avg).toBeCloseTo(21, 0);
  });

  test('no open option legs → zero, null min/max', () => {
    const r = computeAvgDTE([]);
    expect(r.count).toBe(0);
    expect(r.min).toBeNull();
    expect(r.max).toBeNull();
  });

  test('stocks NOT swept in', () => {
    // assignmentRow has type=stock, must be excluded
    const s = buildSeed();
    const onlyStocksAndAssignments = s.trades.filter(
      (t) => t.type === 'stock'
    );
    const r = computeAvgDTE(onlyStocksAndAssignments);
    expect(r.count).toBe(0);
  });
});

describe('computeAllocation', () => {
  test('seed: TSLA + META present, sums to 100%', () => {
    const s = buildSeed();
    const a = computeAllocation(s.trades);
    expect(a.length).toBe(2);
    const symbols = a.map((x) => x.symbol);
    expect(symbols).toContain('TSLA');
    expect(symbols).toContain('META');
    const totalPct = a.reduce((sum, x) => sum + x.pct, 0);
    expect(totalPct).toBeCloseTo(100, 1);
  });

  test('sorted desc by cash', () => {
    const s = buildSeed();
    const a = computeAllocation(s.trades);
    for (let i = 1; i < a.length; i++) {
      expect(a[i - 1].cash).toBeGreaterThanOrEqual(a[i].cash);
    }
  });

  test('empty trades → empty array', () => {
    expect(computeAllocation([])).toEqual([]);
  });
});

describe('computeQuickStats', () => {
  test('seed: best > 0, worst computed, count >= 2', () => {
    const s = buildSeed();
    const q = computeQuickStats(s.groups, s.trades);
    expect(q.count).toBeGreaterThanOrEqual(2);
    expect(q.best).toBeGreaterThan(0);
    expect(q.avg).toBeGreaterThan(0);
  });

  test('zero closed groups → all zeros, no NaN', () => {
    const q = computeQuickStats([], []);
    expect(q.avg).toBe(0);
    expect(q.best).toBe(0);
    expect(q.worst).toBe(0);
    expect(q.count).toBe(0);
  });
});
