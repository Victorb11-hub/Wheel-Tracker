import { getClosedGroups, isGroupClosed } from './closed-groups';
import {
  buyClose,
  sellPut,
  tradeGroup,
} from './wheel/test-helpers';

describe('isGroupClosed — clause (a): every member must be non-open', () => {
  test('group with an open member → not closed', () => {
    const open = sellPut({ id: 'open', status: 'open' });
    const g = tradeGroup({ id: 'g', trade_ids: ['open'] });
    expect(isGroupClosed(g, [open])).toBe(false);
  });

  test('group with all-closed members and no open trade with same ref → closed', () => {
    const sell = sellPut({
      id: 'sell',
      status: 'closed',
      trade_ref: '47',
      date_closed: '2026-01-10',
    });
    const bb = buyClose({ id: 'bb', trade_ref: '47' });
    const g = tradeGroup({ id: 'g', trade_ids: ['sell', 'bb'] });
    expect(isGroupClosed(g, [sell, bb])).toBe(true);
  });
});

describe('isGroupClosed — clause (b): no open trade with the group\'s trade_ref', () => {
  test('group whose ref matches an OPEN trade → NOT closed (rolled-cycle case)', () => {
    // Mirrors seed Trade Ref: 101: closed buyback in the group, but the rolled
    // new leg is open and shares trade_ref. Group must be excluded.
    const original = sellPut({
      id: 'orig',
      status: 'closed',
      trade_ref: '101',
      is_rolled: true,
      date_closed: '2026-03-28',
    });
    const buyback = buyClose({
      id: 'bb',
      trade_ref: '101',
      is_rolled: true,
    });
    const stillOpenRoll = sellPut({
      id: 'new-roll',
      status: 'open',
      trade_ref: '101',
      is_rolled: true,
    });
    const g = tradeGroup({
      id: 'g',
      name: 'Trade Ref: 101',
      trade_ids: ['orig', 'bb'],
    });
    expect(
      isGroupClosed(g, [original, buyback, stillOpenRoll])
    ).toBe(false);
  });

  test('SAME group, after the open leg is closed → becomes closed', () => {
    // Same setup, but flip stillOpenRoll to closed. Group should now qualify.
    const original = sellPut({
      id: 'orig',
      status: 'closed',
      trade_ref: '101',
      is_rolled: true,
    });
    const buyback = buyClose({
      id: 'bb',
      trade_ref: '101',
      is_rolled: true,
    });
    const nowClosedRoll = sellPut({
      id: 'new-roll',
      status: 'closed',
      trade_ref: '101',
      is_rolled: true,
      date_closed: '2026-04-15',
    });
    const g = tradeGroup({
      id: 'g',
      name: 'Trade Ref: 101',
      trade_ids: ['orig', 'bb'],
    });
    expect(
      isGroupClosed(g, [original, buyback, nowClosedRoll])
    ).toBe(true);
  });

  test('open trade with a DIFFERENT ref does not block the group', () => {
    const sell = sellPut({
      id: 'sell',
      status: 'closed',
      trade_ref: '47',
    });
    const bb = buyClose({ id: 'bb', trade_ref: '47' });
    const unrelated = sellPut({
      id: 'unrelated',
      status: 'open',
      trade_ref: '99',
    });
    const g = tradeGroup({ id: 'g', trade_ids: ['sell', 'bb'] });
    expect(isGroupClosed(g, [sell, bb, unrelated])).toBe(true);
  });

  test('group with no resolvable ref (manual, no member has trade_ref) → closed if all members closed', () => {
    const a = sellPut({
      id: 'a',
      status: 'closed',
      trade_ref: null,
    });
    const b = sellPut({
      id: 'b',
      status: 'closed',
      trade_ref: null,
    });
    const openElsewhere = sellPut({
      id: 'open',
      status: 'open',
      trade_ref: '47',
    });
    const g = tradeGroup({
      id: 'g',
      name: 'My Custom Group',
      trade_ids: ['a', 'b'],
    });
    expect(isGroupClosed(g, [a, b, openElsewhere])).toBe(true);
  });

  test('empty group (no trade_ids) → closed (vacuous truth)', () => {
    const g = tradeGroup({ id: 'g', trade_ids: [] });
    expect(isGroupClosed(g, [])).toBe(true);
  });
});

describe('getClosedGroups — list filter', () => {
  test('multiple groups: only those passing both clauses are returned', () => {
    const winSell = sellPut({
      id: 'win-sell',
      status: 'closed',
      trade_ref: '103',
    });
    const winBuyback = buyClose({ id: 'win-bb', trade_ref: '103' });
    const winGroup = tradeGroup({
      id: 'win',
      name: 'Trade Ref: 103',
      trade_ids: ['win-sell', 'win-bb'],
    });

    const rolledOrig = sellPut({
      id: 'roll-orig',
      status: 'closed',
      trade_ref: '101',
    });
    const rolledBuyback = buyClose({ id: 'roll-bb', trade_ref: '101' });
    const rolledNewOpen = sellPut({
      id: 'roll-new',
      status: 'open',
      trade_ref: '101',
    });
    const rolledGroup = tradeGroup({
      id: 'rolled',
      name: 'Trade Ref: 101',
      trade_ids: ['roll-orig', 'roll-bb'],
    });

    const trades = [
      winSell,
      winBuyback,
      rolledOrig,
      rolledBuyback,
      rolledNewOpen,
    ];
    const out = getClosedGroups([winGroup, rolledGroup], trades);
    expect(out).toEqual([winGroup]);

    // Now flip the rolled leg to closed → rolled group joins the list.
    const closedRoll = { ...rolledNewOpen, status: 'closed' as const };
    const out2 = getClosedGroups(
      [winGroup, rolledGroup],
      [winSell, winBuyback, rolledOrig, rolledBuyback, closedRoll]
    );
    expect(out2).toEqual([winGroup, rolledGroup]);
  });
});
