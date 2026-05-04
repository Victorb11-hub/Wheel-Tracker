import { MockDataClient } from './mock-client';
import { planClose } from '../wheel/close';
import { planSellCoveredCall } from '../wheel/covered-call';
import { planCalledAway } from '../wheel/called-away';
import { fixedCtx } from '../wheel/test-helpers';

describe('MockDataClient — seed shape', () => {
  test('seed has every UI scenario present', async () => {
    const c = new MockDataClient();
    const s = await c.getState();

    // Scenario 1: at least one open CSP with no trade_ref
    expect(
      s.trades.some(
        (t) =>
          t.action === 'sell' &&
          t.type === 'put' &&
          t.status === 'open' &&
          t.trade_ref === null
      )
    ).toBe(true);

    // Scenario 2: at least one open rolled trade
    expect(
      s.trades.some(
        (t) => t.is_rolled && t.status === 'open' && t.action === 'sell'
      )
    ).toBe(true);

    // Scenario 3: at least one open covered call with linked_stock_id set
    expect(
      s.trades.some(
        (t) =>
          t.is_covered_call &&
          t.status === 'open' &&
          t.linked_stock_id !== null
      )
    ).toBe(true);

    // Scenario 3 cont.: stock with 2+ covered calls in jsonb
    expect(s.stocks.some((sp) => sp.covered_calls.length >= 2)).toBe(true);

    // Scenario 4: a fully closed group (sell+buyback)
    const closedGroup = s.groups.find((g) => g.name === 'Trade Ref: 103');
    expect(closedGroup).toBeDefined();
    expect(closedGroup?.trade_ids.length).toBe(2);

    // Scenario 5: a Full Wheel Cycle group
    const wheelGroup = s.groups.find((g) =>
      g.name.includes('Full Wheel Cycle')
    );
    expect(wheelGroup).toBeDefined();
    expect(wheelGroup?.trade_ids.length).toBeGreaterThanOrEqual(4);

    // Two accounts represented (Main + IRA in trades)
    const accounts = new Set(
      s.trades.map((t) => t.account).filter((x): x is string => !!x)
    );
    expect(accounts.has('Main')).toBe(true);
    expect(accounts.has('IRA')).toBe(true);

    // Both symbols present
    const symbols = new Set(s.trades.map((t) => t.symbol));
    expect(symbols.has('TSLA')).toBe(true);
    expect(symbols.has('META')).toBe(true);
  });

  test('seed includes called-away row with cycle_details', async () => {
    const c = new MockDataClient();
    const s = await c.getState();
    const calledAway = s.trades.find((t) => t.is_called_away);
    expect(calledAway).toBeDefined();
    expect(calledAway?.full_cycle_pl).toBeGreaterThan(0);
    expect(calledAway?.cycle_details).toMatchObject({
      putPremium: expect.any(Number),
      callPremiums: expect.any(Number),
      stockProfit: expect.any(Number),
      assignedPrice: expect.any(Number),
      salePrice: expect.any(Number),
    });
  });

  test('getState returns deep clones (mutating result does not affect store)', async () => {
    const c = new MockDataClient();
    const s1 = await c.getState();
    s1.trades[0].symbol = 'MUTATED';
    const s2 = await c.getState();
    expect(s2.trades[0].symbol).not.toBe('MUTATED');
  });
});

describe('MockDataClient — applyPlan transactional', () => {
  test('successful plan persists all writes', async () => {
    const c = new MockDataClient();
    const before = await c.getState();
    const openCsp = before.trades.find(
      (t) => t.action === 'sell' && t.type === 'put' && t.status === 'open'
    )!;

    const plan = planClose(
      {
        trade_id: openCsp.id,
        close_date: '2026-05-02',
        closing_premium: 1.5,
        closing_notes: 'test close',
      },
      {
        trades: before.trades,
        stocks: before.stocks,
        groups: before.groups,
      },
      fixedCtx('plan')
    );

    await c.applyPlan(plan);
    const after = await c.getState();

    const closed = after.trades.find((t) => t.id === openCsp.id);
    expect(closed?.status).toBe('closed');
    expect(closed?.close_price).toBe(1.5);
    expect(after.trades.length).toBe(before.trades.length + 1); // +1 for synthetic close
  });

  test('throwing mid-plan rolls back all prior writes (transactional)', async () => {
    const c = new MockDataClient();
    const before = await c.getState();

    // Construct an evil plan: insert one valid trade, then update a missing id.
    const badPlan = {
      tradeInserts: [
        {
          id: 'new-trade-id',
          trade_ref: null,
          account: null,
          symbol: 'XYZ',
          contracts: 1,
          strike: 50,
          premium: 1,
          action: 'sell' as const,
          type: 'put' as const,
          date_opened: '2026-05-01',
          date_closed: null,
          exp_date: '2026-06-01',
          price_at_action: null,
          info: null,
          status: 'open' as const,
          close_price: null,
          closing_notes: null,
          is_closing_trade: false,
          is_rolled: false,
          is_covered_call: false,
          is_assignment: false as const,
          is_called_away: false as const,
          linked_stock_id: null,
          assigned_price: null,
          full_cycle_pl: null,
          cycle_details: null,
        },
      ],
      tradeUpdates: [{ id: 'does-not-exist', patch: { premium: 999 } }],
      stockInserts: [],
      stockUpdates: [],
      stockDeletes: [],
      groupUpserts: [],
    };

    await expect(c.applyPlan(badPlan)).rejects.toThrow();

    const after = await c.getState();
    expect(after.trades.length).toBe(before.trades.length);
    expect(after.trades.some((t) => t.id === 'new-trade-id')).toBe(false);
  });

  test('group upsert appends to existing group, dedupes', async () => {
    const c = new MockDataClient();
    const before = await c.getState();
    const existingGroup = before.groups.find((g) => g.name === 'Trade Ref: 103')!;
    const beforeIdsCount = existingGroup.trade_ids.length;

    await c.applyPlan({
      tradeInserts: [],
      tradeUpdates: [],
      stockInserts: [],
      stockUpdates: [],
      stockDeletes: [],
      groupUpserts: [
        {
          name: 'Trade Ref: 103',
          addTradeIds: [...existingGroup.trade_ids, 'never-seen'],
        },
      ],
    });

    const after = await c.getState();
    const updated = after.groups.find((g) => g.name === 'Trade Ref: 103')!;
    expect(updated.trade_ids).toContain('never-seen');
    expect(updated.trade_ids.length).toBe(beforeIdsCount + 1); // dedup, +1 only
  });

  test('group upsert creates a new group when name not seen', async () => {
    const c = new MockDataClient();
    await c.applyPlan({
      tradeInserts: [],
      tradeUpdates: [],
      stockInserts: [],
      stockUpdates: [],
      stockDeletes: [],
      groupUpserts: [{ name: 'Trade Ref: 999', addTradeIds: ['a', 'b'] }],
    });
    const s = await c.getState();
    const fresh = s.groups.find((g) => g.name === 'Trade Ref: 999');
    expect(fresh?.trade_ids).toEqual(['a', 'b']);
  });
});

describe('MockDataClient — destructive flows + reset()', () => {
  test('called-away removes the stock and adds a called-away row', async () => {
    const c = new MockDataClient();
    const before = await c.getState();
    const stock = before.stocks[0]!;

    const plan = planCalledAway(
      {
        stock_id: stock.id,
        calledAwayDate: '2026-05-15',
        salePrice: 280,
        notes: null,
      },
      {
        trades: before.trades,
        stocks: before.stocks,
        groups: before.groups,
      },
      fixedCtx('ca')
    );

    await c.applyPlan(plan);
    const after = await c.getState();

    expect(after.stocks.find((s) => s.id === stock.id)).toBeUndefined();
    expect(
      after.trades.some(
        (t) => t.is_called_away && t.symbol === stock.symbol
      )
    ).toBe(true);
  });

  test('reset() restores the seed after destructive flow', async () => {
    const c = new MockDataClient();
    const before = await c.getState();
    const stock = before.stocks[0]!;

    const plan = planCalledAway(
      {
        stock_id: stock.id,
        calledAwayDate: '2026-05-15',
        salePrice: 280,
        notes: null,
      },
      { trades: before.trades, stocks: before.stocks, groups: before.groups },
      fixedCtx('ca')
    );
    await c.applyPlan(plan);
    expect((await c.getState()).stocks.length).toBeLessThan(before.stocks.length);

    await c.reset!();

    const restored = await c.getState();
    expect(restored.stocks.length).toBe(before.stocks.length);
    expect(restored.trades.length).toBe(before.trades.length);
    expect(restored.groups.length).toBe(before.groups.length);
  });
});

describe('MockDataClient — targeted mutations', () => {
  test('editTrade applies a patch', async () => {
    const c = new MockDataClient();
    const before = await c.getState();
    const t = before.trades[0]!;

    await c.editTrade({ id: t.id, patch: { info: 'updated note' } });
    const after = await c.getState();
    expect(after.trades.find((x) => x.id === t.id)?.info).toBe('updated note');
  });

  test('deleteTrade removes from store and from groups; undo restores', async () => {
    const c = new MockDataClient();
    const before = await c.getState();
    // Pick a trade that's in a group
    const group = before.groups.find((g) => g.trade_ids.length > 0)!;
    const tradeId = group.trade_ids[0]!;

    const record = await c.deleteTrade(tradeId);
    const afterDel = await c.getState();
    expect(afterDel.trades.some((t) => t.id === tradeId)).toBe(false);
    expect(
      afterDel.groups.find((g) => g.id === group.id)?.trade_ids.includes(tradeId)
    ).toBe(false);
    expect(record.groupSnapshots.length).toBeGreaterThan(0);

    await c.undoDeleteTrade(record);
    const afterUndo = await c.getState();
    expect(afterUndo.trades.some((t) => t.id === tradeId)).toBe(true);
    expect(
      afterUndo.groups.find((g) => g.id === group.id)?.trade_ids.includes(tradeId)
    ).toBe(true);
  });

  test('reopenTrade flips status and removes from groups', async () => {
    const c = new MockDataClient();
    const before = await c.getState();
    const closedInGroup = before.trades.find(
      (t) =>
        t.status === 'closed' &&
        before.groups.some((g) => g.trade_ids.includes(t.id))
    )!;

    await c.reopenTrade(closedInGroup.id);

    const after = await c.getState();
    const reopened = after.trades.find((t) => t.id === closedInGroup.id);
    expect(reopened?.status).toBe('open');
    expect(reopened?.date_closed).toBeNull();
    expect(
      after.groups.some((g) => g.trade_ids.includes(closedInGroup.id))
    ).toBe(false);
  });

  test('addAccount + removeAccount', async () => {
    const c = new MockDataClient();
    const created = await c.addAccount('Joint');
    const s1 = await c.getState();
    expect(s1.accounts.some((a) => a.name === 'Joint')).toBe(true);

    await c.removeAccount(created.id);
    const s2 = await c.getState();
    expect(s2.accounts.some((a) => a.name === 'Joint')).toBe(false);
  });

  test('addAccount throws on duplicate name', async () => {
    const c = new MockDataClient();
    await expect(c.addAccount('Main')).rejects.toThrow();
  });

  test('createGroup + renameGroup + deleteGroup', async () => {
    const c = new MockDataClient();
    const g = await c.createGroup('Test Group', ['a', 'b']);
    await c.renameGroup(g.id, 'Renamed Group');
    let s = await c.getState();
    expect(s.groups.find((x) => x.id === g.id)?.name).toBe('Renamed Group');

    await c.deleteGroup(g.id);
    s = await c.getState();
    expect(s.groups.some((x) => x.id === g.id)).toBe(false);
  });

  test('setTheme persists', async () => {
    const c = new MockDataClient();
    await c.setTheme('light');
    const s = await c.getState();
    expect(s.prefs.theme).toBe('light');
  });
});

describe('MockDataClient — chains across plans', () => {
  test('sell covered call → applies → covered_calls jsonb grows', async () => {
    const c = new MockDataClient();
    const before = await c.getState();
    const stock = before.stocks[0]!;
    const beforeCount = stock.covered_calls.length;

    const plan = planSellCoveredCall(
      {
        stock_id: stock.id,
        strike: 280,
        premium: 3.0,
        expDate: '2026-06-19',
        dateOpened: '2026-05-01',
        notes: 'next CC',
      },
      { trades: before.trades, stocks: before.stocks, groups: before.groups },
      fixedCtx('cc')
    );

    await c.applyPlan(plan);
    const after = await c.getState();
    const updated = after.stocks.find((s) => s.id === stock.id)!;
    expect(updated.covered_calls.length).toBe(beforeCount + 1);
    expect(updated.covered_calls[updated.covered_calls.length - 1]).toEqual({
      strike: 280,
      premium: 300,
      expDate: '2026-06-19',
      dateOpened: '2026-05-01',
      notes: 'next CC',
    });
  });
});
