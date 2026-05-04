import { isAutoShapedName, planAutoGroup, summarizeAutoGroup } from './auto-group';
import {
  buyClose,
  calledAwayRow,
  sellPut,
  tradeGroup,
} from './test-helpers';

describe('isAutoShapedName', () => {
  test('"Trade Ref: 47" → auto-shaped', () => {
    expect(isAutoShapedName('Trade Ref: 47')).toBe(true);
  });
  test('"Trade Ref: 47 - Full Wheel Cycle" → auto-shaped', () => {
    expect(isAutoShapedName('Trade Ref: 47 - Full Wheel Cycle')).toBe(true);
  });
  test('"My Custom Group" → manual', () => {
    expect(isAutoShapedName('My Custom Group')).toBe(false);
  });
  test('"Earnings plays Q3" → manual', () => {
    expect(isAutoShapedName('Earnings plays Q3')).toBe(false);
  });
});

describe('planAutoGroup', () => {
  test('multiple distinct refs → one group per ref', () => {
    const trades = [
      sellPut({ id: 'a', status: 'closed', trade_ref: '47' }),
      buyClose({ id: 'a-bb', trade_ref: '47' }),
      sellPut({ id: 'b', status: 'closed', trade_ref: '48' }),
      buyClose({ id: 'b-bb', trade_ref: '48' }),
    ];
    const plan = planAutoGroup(trades, []);
    expect(plan.toCreate).toHaveLength(2);
    expect(plan.toCreate.map((g) => g.name)).toEqual([
      'Trade Ref: 47',
      'Trade Ref: 48',
    ]);
    expect(plan.toCreate[0].trade_ids).toEqual(['a', 'a-bb']);
    expect(plan.toCreate[1].trade_ids).toEqual(['b', 'b-bb']);
  });

  test('mixed: some closed trades with refs, some without → ungrouped trades stay out', () => {
    const trades = [
      sellPut({ id: 'with-ref', status: 'closed', trade_ref: '47' }),
      buyClose({ id: 'with-ref-bb', trade_ref: '47' }),
      sellPut({ id: 'no-ref', status: 'closed', trade_ref: null }),
    ];
    const plan = planAutoGroup(trades, []);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0].trade_ids).toEqual(['with-ref', 'with-ref-bb']);
    // 'no-ref' is not pulled into any rebuilt group
    expect(plan.toCreate[0].trade_ids).not.toContain('no-ref');
  });

  test('ref with is_called_away row → name carries Full Wheel Cycle suffix', () => {
    const trades = [
      sellPut({ id: 'put', status: 'closed', trade_ref: '47' }),
      calledAwayRow({ id: 'ca', trade_ref: '47' }),
    ];
    const plan = planAutoGroup(trades, []);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0].name).toBe('Trade Ref: 47 - Full Wheel Cycle');
  });

  test('ref without is_called_away → no Full Wheel Cycle suffix', () => {
    const trades = [
      sellPut({ id: 'put', status: 'closed', trade_ref: '47' }),
      buyClose({ id: 'bb', trade_ref: '47' }),
    ];
    const plan = planAutoGroup(trades, []);
    expect(plan.toCreate[0].name).toBe('Trade Ref: 47');
    expect(plan.toCreate[0].name).not.toContain('Full Wheel Cycle');
  });

  test('existing manual groups (name not starting Trade Ref:) → preserved', () => {
    const manual = tradeGroup({
      id: 'manual-1',
      name: 'Earnings plays Q3',
      trade_ids: ['x', 'y'],
    });
    const plan = planAutoGroup([], [manual]);
    expect(plan.preserved).toHaveLength(1);
    expect(plan.preserved[0]).toEqual(manual);
    expect(plan.toDelete).toHaveLength(0);
  });

  test('existing auto-shaped groups → marked for deletion (rebuilt wholesale)', () => {
    const oldAuto = tradeGroup({
      id: 'old-auto',
      name: 'Trade Ref: 99',
      trade_ids: ['stale-id'],
    });
    const trades = [
      sellPut({ id: 'a', status: 'closed', trade_ref: '47' }),
      buyClose({ id: 'a-bb', trade_ref: '47' }),
    ];
    const plan = planAutoGroup(trades, [oldAuto]);
    expect(plan.toDelete).toEqual([oldAuto]);
    // Rebuilt does NOT include any reference to ref 99 (no closed trades with that ref)
    expect(plan.toCreate.map((g) => g.name)).toEqual(['Trade Ref: 47']);
  });

  test('mix of manual + auto existing → manual preserved, auto deleted, rebuild from trades', () => {
    const manual = tradeGroup({
      id: 'manual-1',
      name: 'Earnings plays Q3',
      trade_ids: ['x', 'y'],
    });
    const oldAuto = tradeGroup({
      id: 'old-auto',
      name: 'Trade Ref: 99',
      trade_ids: ['stale'],
    });
    const oldFullWheel = tradeGroup({
      id: 'old-fw',
      name: 'Trade Ref: 100 - Full Wheel Cycle',
      trade_ids: ['stale-2'],
    });
    const trades = [
      sellPut({ id: 'a', status: 'closed', trade_ref: '47' }),
      buyClose({ id: 'a-bb', trade_ref: '47' }),
    ];
    const plan = planAutoGroup(trades, [manual, oldAuto, oldFullWheel]);
    expect(plan.preserved).toEqual([manual]);
    expect(plan.toDelete).toEqual(expect.arrayContaining([oldAuto, oldFullWheel]));
    expect(plan.toDelete).toHaveLength(2);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0].name).toBe('Trade Ref: 47');
  });

  test('empty closed trades → empty rebuild', () => {
    const plan = planAutoGroup([], []);
    expect(plan.preserved).toEqual([]);
    expect(plan.toDelete).toEqual([]);
    expect(plan.toCreate).toEqual([]);
  });

  test('only open trades, no closed → empty rebuild (open trades not auto-grouped)', () => {
    const trades = [sellPut({ id: 'open', status: 'open', trade_ref: '47' })];
    const plan = planAutoGroup(trades, []);
    expect(plan.toCreate).toEqual([]);
  });

  test('trade with empty-string trade_ref → treated same as null (not grouped)', () => {
    const trades = [
      sellPut({ id: 'empty', status: 'closed', trade_ref: '' }),
      sellPut({ id: 'a', status: 'closed', trade_ref: '47' }),
      buyClose({ id: 'a-bb', trade_ref: '47' }),
    ];
    const plan = planAutoGroup(trades, []);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0].trade_ids).not.toContain('empty');
  });

  test('dedupes trade ids if a trade somehow appears twice', () => {
    const t = sellPut({ id: 'dup', status: 'closed', trade_ref: '47' });
    const plan = planAutoGroup([t, t], []);
    expect(plan.toCreate[0].trade_ids).toEqual(['dup']);
  });
});

describe('summarizeAutoGroup', () => {
  test('counts produce a confirm-dialog-friendly summary', () => {
    const manual = tradeGroup({ id: 'm', name: 'Earnings plays Q3' });
    const auto1 = tradeGroup({ id: 'a1', name: 'Trade Ref: 1' });
    const auto2 = tradeGroup({ id: 'a2', name: 'Trade Ref: 2' });
    const trades = [
      sellPut({ id: 'x', status: 'closed', trade_ref: '47' }),
      sellPut({ id: 'y', status: 'closed', trade_ref: '48' }),
      sellPut({ id: 'z', status: 'closed', trade_ref: '48' }),
    ];
    const plan = planAutoGroup(trades, [manual, auto1, auto2]);
    const sum = summarizeAutoGroup(plan);
    expect(sum.existingTotal).toBe(3);
    expect(sum.existingAuto).toBe(2);
    expect(sum.existingManual).toBe(1);
    expect(sum.rebuiltCount).toBe(2); // refs 47 + 48
  });
});
