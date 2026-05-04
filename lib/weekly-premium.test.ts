import { bucketWeeklyPremium, computeRangeWindow } from './weekly-premium';
import type { RegularLeg, Trade } from '../types/trade';
import {
  buyClose,
  sellCall,
  sellPut,
} from './wheel/test-helpers';

// Helper: convert weekStart Date → 'YYYY-MM-DD' for stable assertions.
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Anchor "today" inside one of the test weeks so `next/last/prev-and-next` are deterministic.
const NOW = new Date(2026, 3, 15);   // Wednesday 2026-04-15 — current week is 2026-04-13

describe('computeRangeWindow', () => {
  test('all-time → unbounded, no fill', () => {
    const w = computeRangeWindow({ kind: 'all-time' }, NOW);
    expect(w.from).toBeNull();
    expect(w.to).toBeNull();
    expect(w.fillEmpty).toBe(false);
  });

  test('next 4 → current Monday through 3 weeks ahead', () => {
    const w = computeRangeWindow({ kind: 'next', n: 4 }, NOW);
    expect(ymd(w.from!)).toBe('2026-04-13');
    expect(ymd(w.to!)).toBe('2026-05-04');
    expect(w.fillEmpty).toBe(true);
  });

  test('last 12 → 12 Mondays back through previous Monday', () => {
    const w = computeRangeWindow({ kind: 'last', n: 12 }, NOW);
    expect(ymd(w.from!)).toBe('2026-01-19');
    expect(ymd(w.to!)).toBe('2026-04-06');
    expect(w.fillEmpty).toBe(true);
  });

  test('prev-and-next 4/4 → 8 weeks centered on current', () => {
    const w = computeRangeWindow({ kind: 'prev-and-next', prev: 4, next: 4 }, NOW);
    expect(ymd(w.from!)).toBe('2026-03-16');
    expect(ymd(w.to!)).toBe('2026-05-11');
    expect(w.fillEmpty).toBe(true);
  });
});

// =============================================================================
// Bucketing
// =============================================================================

describe('bucketWeeklyPremium — closed trades', () => {
  test('uses date_closed when present, not exp_date', () => {
    const t = sellPut({
      id: 't1',
      status: 'closed',
      date_closed: '2026-04-08',  // week of 2026-04-06
      exp_date: '2026-04-17',     // week of 2026-04-13 (would be wrong)
      premium: 2,
      contracts: 1,
      close_price: 0.5,
    });
    const out = bucketWeeklyPremium([t], { kind: 'all-time' }, NOW);
    expect(out).toHaveLength(1);
    expect(ymd(out[0].weekStart)).toBe('2026-04-06');
    expect(out[0].total).toBe(150); // 200 - 50
  });

  test('falls back to exp_date when date_closed missing', () => {
    const t = sellPut({
      id: 't1',
      status: 'closed',
      date_closed: null,
      exp_date: '2026-04-17',
      premium: 2,
      contracts: 1,
      close_price: 0.5,
    });
    const out = bucketWeeklyPremium([t], { kind: 'all-time' }, NOW);
    expect(out).toHaveLength(1);
    expect(ymd(out[0].weekStart)).toBe('2026-04-13'); // week of 2026-04-17
    expect(out[0].total).toBe(150);
  });

  test('skips trade with neither date_closed nor exp_date (no crash)', () => {
    const t = sellPut({
      id: 't1',
      status: 'closed',
      date_closed: null,
      exp_date: null,
      premium: 2,
    });
    const out = bucketWeeklyPremium([t], { kind: 'all-time' }, NOW);
    expect(out).toEqual([]);
  });

  test('is_closing_trade rows excluded entirely (no double-count)', () => {
    const sold = sellPut({
      id: 'sold',
      status: 'closed',
      date_closed: '2026-04-08',
      premium: 2,
      contracts: 1,
      close_price: 0.5,
    });
    const buyback = buyClose({
      id: 'bb',
      date_closed: '2026-04-08',
      premium: 0.5,
      contracts: 1,
    });
    const out = bucketWeeklyPremium([sold, buyback], { kind: 'all-time' }, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].total).toBe(150); // only sold counted
  });
});

describe('bucketWeeklyPremium — open trades', () => {
  test('open + not rolled → full premium, bucketed to exp_date', () => {
    const t = sellPut({
      id: 't1',
      status: 'open',
      exp_date: '2026-05-15',  // week of 2026-05-11
      premium: 3,
      contracts: 1,
      is_rolled: false,
    });
    const out = bucketWeeklyPremium([t], { kind: 'all-time' }, NOW);
    expect(out).toHaveLength(1);
    expect(ymd(out[0].weekStart)).toBe('2026-05-11');
    expect(out[0].total).toBe(300);
  });

  test('open + is_rolled with matching buyback → uses calculateRollCredit', () => {
    const newLeg = sellPut({
      id: 'new',
      status: 'open',
      exp_date: '2026-05-15',
      premium: 3,
      contracts: 1,
      is_rolled: true,
      trade_ref: '47',
    });
    const buyback = buyClose({
      id: 'bb',
      symbol: 'TSLA',
      trade_ref: '47',
      premium: 1,
      contracts: 1,
      date_closed: '2026-04-15',
    });
    const out = bucketWeeklyPremium([newLeg, buyback], { kind: 'all-time' }, NOW);
    // Roll credit = 300 - 100 = 200; bucket = newLeg's exp_date week
    const bucket = out.find((b) => ymd(b.weekStart) === '2026-05-11')!;
    expect(bucket.total).toBe(200);
  });

  test('open + is_rolled with NO matching buyback → falls back to full premium', () => {
    const newLeg = sellPut({
      id: 'new',
      status: 'open',
      exp_date: '2026-05-15',
      premium: 3,
      contracts: 1,
      is_rolled: true,
      trade_ref: '47',
    });
    const out = bucketWeeklyPremium([newLeg], { kind: 'all-time' }, NOW);
    const bucket = out.find((b) => ymd(b.weekStart) === '2026-05-11')!;
    expect(bucket.total).toBe(300);
  });
});

describe('bucketWeeklyPremium — roll buyback attribution', () => {
  // The roll buyback dollar amount must attribute to the NEW leg only,
  // never to the leg it closed. This guards against the historical
  // double-count where the buyback was subtracted from both the original
  // (via close_price) and the new leg (via calculateRollCredit).

  test('full roll cycle, new leg held to exp: original full premium + new leg roll-credit', () => {
    // Trade 1: sell 3/30 $7.25/sh, exp 4/17, rolled 4/13 (close_price $0.25/sh)
    const original = sellPut({
      id: 'orig',
      symbol: 'TSLA',
      trade_ref: '99',
      premium: 7.25,
      contracts: 1,
      strike: 100,
      date_opened: '2026-03-30',
      date_closed: '2026-04-13',
      exp_date: '2026-04-17',
      status: 'closed',
      is_rolled: true,
      close_price: 0.25,
    });
    // Trade 2: roll buyback on 4/13 (excluded entirely)
    const buyback = buyClose({
      id: 'roll-bb',
      symbol: 'TSLA',
      trade_ref: '99',
      premium: 0.25,
      contracts: 1,
      date_opened: '2026-04-13',
      date_closed: '2026-04-13',
      is_rolled: true,
    });
    // Trade 3: new leg opened 4/13, exp 5/22, $7 premium, held to exp
    const newLeg = sellPut({
      id: 'new',
      symbol: 'TSLA',
      trade_ref: '99',
      premium: 7,
      contracts: 1,
      strike: 95,
      date_opened: '2026-04-13',
      exp_date: '2026-05-22',
      status: 'open',
      is_rolled: true,
    });

    const out = bucketWeeklyPremium(
      [original, buyback, newLeg],
      { kind: 'all-time' },
      NOW
    );

    // Original → week of 4/13 (its date_closed week), full premium $725
    const origWeek = out.find((b) => ymd(b.weekStart) === '2026-04-13')!;
    expect(origWeek.total).toBe(725);
    // New leg → week of 5/18 (exp 5/22 falls in 5/18 week), roll credit
    // = 700 - 25 = 675
    const newWeek = out.find((b) => ymd(b.weekStart) === '2026-05-18')!;
    expect(newWeek.total).toBe(675);
    // No third bucket from the buyback row
    expect(out).toHaveLength(2);
  });

  test('full roll cycle, new leg early-closed: original full premium + new leg minus both buybacks', () => {
    // Trade 1: sell 3/30 $7.25/sh, rolled 4/13 (close_price $0.25/sh)
    const original = sellPut({
      id: 'orig',
      symbol: 'TSLA',
      trade_ref: '99',
      premium: 7.25,
      contracts: 1,
      strike: 100,
      date_opened: '2026-03-30',
      date_closed: '2026-04-13',
      exp_date: '2026-04-17',
      status: 'closed',
      is_rolled: true,
      close_price: 0.25,
    });
    // Trade 2: roll buyback on 4/13 (excluded)
    const rollBuyback = buyClose({
      id: 'roll-bb',
      symbol: 'TSLA',
      trade_ref: '99',
      premium: 0.25,
      contracts: 1,
      date_opened: '2026-04-13',
      date_closed: '2026-04-13',
      is_rolled: true,
    });
    // Trade 3: new leg opened 4/13, $7.25 premium, early-closed 5/4 for $0.50/sh
    const newLeg = sellPut({
      id: 'new',
      symbol: 'TSLA',
      trade_ref: '99',
      premium: 7.25,
      contracts: 1,
      strike: 95,
      date_opened: '2026-04-13',
      date_closed: '2026-05-04',
      exp_date: '2026-05-22',
      status: 'closed',
      is_rolled: true,
      close_price: 0.50,
    });
    // Trade 4: standalone early-close buyback on 5/4 (excluded)
    const earlyCloseBuyback = buyClose({
      id: 'early-bb',
      symbol: 'TSLA',
      trade_ref: '99',
      premium: 0.50,
      contracts: 1,
      date_opened: '2026-05-04',
      date_closed: '2026-05-04',
      is_rolled: false,
    });

    const out = bucketWeeklyPremium(
      [original, rollBuyback, newLeg, earlyCloseBuyback],
      { kind: 'all-time' },
      NOW
    );

    // Original → week of 4/13, full premium $725
    const origWeek = out.find((b) => ymd(b.weekStart) === '2026-04-13')!;
    expect(origWeek.total).toBe(725);
    // New leg → week of 5/4, premium minus predecessor's roll buyback
    // ($25) minus its own early-close buyback ($50) = 725 - 25 - 50 = 650
    const newWeek = out.find((b) => ymd(b.weekStart) === '2026-05-04')!;
    expect(newWeek.total).toBe(650);
    expect(out).toHaveLength(2);
    // Sanity: total across the whole cycle = $1,375 (worked example)
    expect(out.reduce((s, b) => s + b.total, 0)).toBe(1375);
  });

  test('standalone early close (no roll): premium minus close_price, bucketed to date_closed week', () => {
    // Sell 3/30 $7.25, exp 4/17, closed 4/6 for $0.50 (no roll involvement)
    const sold = sellPut({
      id: 'sold',
      symbol: 'TSLA',
      trade_ref: '50',
      premium: 7.25,
      contracts: 1,
      strike: 100,
      date_opened: '2026-03-30',
      date_closed: '2026-04-06',
      exp_date: '2026-04-17',
      status: 'closed',
      is_rolled: false,
      close_price: 0.50,
    });
    const buyback = buyClose({
      id: 'bb',
      symbol: 'TSLA',
      trade_ref: '50',
      premium: 0.50,
      contracts: 1,
      date_opened: '2026-04-06',
      date_closed: '2026-04-06',
      is_rolled: false,
    });

    const out = bucketWeeklyPremium([sold, buyback], { kind: 'all-time' }, NOW);
    expect(out).toHaveLength(1);
    // Week of 4/6 itself is the Monday → key 2026-04-06
    expect(ymd(out[0].weekStart)).toBe('2026-04-06');
    // 725 - 50 = 675
    expect(out[0].total).toBe(675);
  });

  test('held to exp, expired worthless: full premium in exp_date week', () => {
    // Sell 3/30 $7.25, exp 4/17, expired worthless (close_price=0)
    const sold = sellPut({
      id: 'sold',
      symbol: 'TSLA',
      trade_ref: '51',
      premium: 7.25,
      contracts: 1,
      strike: 100,
      date_opened: '2026-03-30',
      date_closed: '2026-04-17',
      exp_date: '2026-04-17',
      status: 'closed',
      is_rolled: false,
      close_price: 0,
    });

    const out = bucketWeeklyPremium([sold], { kind: 'all-time' }, NOW);
    expect(out).toHaveLength(1);
    expect(ymd(out[0].weekStart)).toBe('2026-04-13'); // 4/17 falls in 4/13 week
    expect(out[0].total).toBe(725);
  });
});

describe('bucketWeeklyPremium — stocks excluded', () => {
  test('assignment/called-away synthetic rows are NOT counted', () => {
    // Construct an assignment row directly; spec excludes them.
    const trades: Trade[] = [
      sellPut({
        id: 'pre-assign',
        status: 'assigned',
        date_closed: '2026-04-08',
        exp_date: '2026-04-08',
        premium: 5,
        contracts: 1,
      }),
      // Synthetic assignment row — must not contribute
      {
        id: 'assign-row',
        user_id: 'u1',
        trade_ref: null,
        account: null,
        symbol: 'TSLA',
        contracts: 1,
        strike: 100,
        premium: 0,
        action: 'assignment',
        type: 'stock',
        date_opened: '2026-04-08',
        date_closed: '2026-04-08',
        exp_date: null,
        price_at_action: null,
        info: null,
        status: 'closed',
        close_price: null,
        closing_notes: null,
        is_closing_trade: false,
        is_rolled: false,
        is_covered_call: false,
        is_assignment: true,
        is_called_away: false,
        linked_stock_id: null,
        assigned_price: 100,
        full_cycle_pl: null,
        cycle_details: null,
        created_at: '',
        updated_at: '',
      },
    ];
    const out = bucketWeeklyPremium(trades, { kind: 'all-time' }, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].total).toBe(500); // only the put premium
  });
});

describe('bucketWeeklyPremium — range filters', () => {
  // Build trades across many weeks so range filtering is meaningful.
  const trades: RegularLeg[] = [
    sellPut({ id: 'a', status: 'closed', date_closed: '2026-02-06', premium: 1, contracts: 1, close_price: 0 }),
    sellPut({ id: 'b', status: 'closed', date_closed: '2026-03-13', premium: 2, contracts: 1, close_price: 0 }),
    sellPut({ id: 'c', status: 'closed', date_closed: '2026-04-03', premium: 3, contracts: 1, close_price: 0 }),
    sellPut({ id: 'd', status: 'open',   exp_date: '2026-04-24',    premium: 4, contracts: 1 }),
    sellCall({ id: 'e', status: 'open',  exp_date: '2026-05-22',    premium: 5, contracts: 1 }),
  ];

  test('next 4: only weeks ≥ current week, max 4 buckets', () => {
    const out = bucketWeeklyPremium(trades, { kind: 'next', n: 4 }, NOW);
    expect(out).toHaveLength(4); // 2026-04-13, 04-20, 04-27, 05-04
    const ymds = out.map((o) => ymd(o.weekStart));
    expect(ymds).toEqual(['2026-04-13', '2026-04-20', '2026-04-27', '2026-05-04']);
    // 'd' falls in 2026-04-20; 'e' (2026-05-22) is outside
    const dWeek = out.find((o) => ymd(o.weekStart) === '2026-04-20')!;
    expect(dWeek.total).toBe(400);
    // current week is empty
    expect(out.find((o) => ymd(o.weekStart) === '2026-04-13')!.total).toBe(0);
  });

  test('last 12: only weeks < current week, last 12 buckets', () => {
    const out = bucketWeeklyPremium(trades, { kind: 'last', n: 12 }, NOW);
    expect(out).toHaveLength(12);
    const last = out[out.length - 1];
    const first = out[0];
    expect(ymd(last.weekStart)).toBe('2026-04-06'); // previous Monday
    expect(ymd(first.weekStart)).toBe('2026-01-19');
    // 'a' (2026-02-06 → week 2026-02-02), 'b' (2026-03-13 → week 2026-03-09), 'c' (2026-04-03 → week 2026-03-30)
    expect(out.find((o) => ymd(o.weekStart) === '2026-02-02')!.total).toBe(100);
    expect(out.find((o) => ymd(o.weekStart) === '2026-03-09')!.total).toBe(200);
    expect(out.find((o) => ymd(o.weekStart) === '2026-03-30')!.total).toBe(300);
  });

  test('prev-and-next 4/4: 8 buckets centered on current week (9 inclusive)', () => {
    const out = bucketWeeklyPremium(
      trades,
      { kind: 'prev-and-next', prev: 4, next: 4 },
      NOW
    );
    // 4 weeks back + current + 4 ahead = 9 buckets
    expect(out).toHaveLength(9);
    expect(ymd(out[0].weekStart)).toBe('2026-03-16');
    expect(ymd(out[out.length - 1].weekStart)).toBe('2026-05-11');
  });

  test('finite range fills empty weeks with $0', () => {
    const sparse = [
      sellPut({ id: 's', status: 'open', exp_date: '2026-05-04', premium: 1, contracts: 1 }),
    ];
    const out = bucketWeeklyPremium(sparse, { kind: 'next', n: 4 }, NOW);
    expect(out).toHaveLength(4);
    const totals = out.map((b) => b.total);
    // Three $0 buckets + one $100 bucket (week of 2026-05-04)
    expect(totals.filter((t) => t === 0)).toHaveLength(3);
    expect(totals.find((t) => t === 100)).toBe(100);
  });

  test('all-time: only weeks with data, no fill', () => {
    const out = bucketWeeklyPremium(trades, { kind: 'all-time' }, NOW);
    // Should be exactly 5 weeks, one per trade (with one shared if any happened to share)
    const totals = out.map((b) => b.total);
    expect(totals).not.toContain(0);
    // No fill: there shouldn't be empty weeks between February and May
    const ymds = out.map((b) => ymd(b.weekStart));
    expect(ymds).toEqual([
      '2026-02-02', // a
      '2026-03-09', // b
      '2026-03-30', // c
      '2026-04-20', // d open exp_date 04-24
      '2026-05-18', // e open exp_date 05-22
    ]);
  });
});
