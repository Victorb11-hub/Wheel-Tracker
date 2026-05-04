import { exportToJson } from '@/lib/export/to-json';
import { MockDataClient } from '@/lib/data/mock-client';
import { buildSeed } from '@/lib/data/seed';
import { parseJsonImport } from './parse-json';
import { IMPORT_FORMAT_VERSION } from './schema';
import type {
  CustomAccount,
  StockPosition,
  Trade,
  TradeGroup,
} from '@/types/trade';

// Strip DB-driven fields that legitimately differ between source and
// imported state: user_id (re-stamped from destination), created_at /
// updated_at (re-stamped from destination clock).
function stripVolatile<T extends Record<string, unknown>>(t: T): Omit<T, 'user_id' | 'created_at' | 'updated_at'> {
  const { user_id: _u, created_at: _c, updated_at: _ud, ...rest } = t as T & {
    user_id?: unknown;
    created_at?: unknown;
    updated_at?: unknown;
  };
  return rest;
}

function sortBy<T>(arr: T[], key: (t: T) => string): T[] {
  return [...arr].sort((a, b) => key(a).localeCompare(key(b)));
}

describe('JSON Export → Import round-trip', () => {
  test('seed state survives full round-trip into an empty client', async () => {
    const source = buildSeed();

    const { content } = exportToJson(source);
    const parsed = parseJsonImport(content);

    expect(parsed.errors).toEqual([]);
    expect(parsed.payload).not.toBeNull();
    expect(parsed.payload?.version).toBe(IMPORT_FORMAT_VERSION);

    const dest = new MockDataClient({ seed: false });
    await dest.bulkImport(parsed.payload!);
    const result = await dest.getState();

    expect(result.trades.length).toBe(source.trades.length);
    expect(result.stocks.length).toBe(source.stocks.length);
    expect(result.groups.length).toBe(source.groups.length);
    expect(result.accounts.length).toBe(source.accounts.length);

    // Modulo {user_id, created_at, updated_at}, every entity should match
    // exactly. ids are preserved because no collisions exist in an empty
    // destination, so cross-refs (groups[].trade_ids, stocks[]
    // .original_put_id, trades[].linked_stock_id) round-trip too.
    const tradesById = (xs: Trade[]) => sortBy(xs, (t) => t.id);
    expect(tradesById(result.trades).map(stripVolatile)).toEqual(
      tradesById(source.trades).map(stripVolatile)
    );

    const stocksById = (xs: StockPosition[]) => sortBy(xs, (s) => s.id);
    expect(stocksById(result.stocks).map(stripVolatile)).toEqual(
      stocksById(source.stocks).map(stripVolatile)
    );

    const groupsById = (xs: TradeGroup[]) => sortBy(xs, (g) => g.id);
    expect(groupsById(result.groups).map(stripVolatile)).toEqual(
      groupsById(source.groups).map(stripVolatile)
    );

    const accountsById = (xs: CustomAccount[]) => sortBy(xs, (a) => a.id);
    expect(accountsById(result.accounts).map(stripVolatile)).toEqual(
      accountsById(source.accounts).map(stripVolatile)
    );
  });

  test('importing into a non-empty client rewrites colliding ids and repoints cross-refs', async () => {
    const source = buildSeed();
    const { content } = exportToJson(source);
    const parsed = parseJsonImport(content);
    expect(parsed.errors).toEqual([]);

    // Destination already seeded — every id in `source` collides.
    const dest = new MockDataClient();
    const before = await dest.getState();

    await dest.bulkImport(parsed.payload!);
    const after = await dest.getState();

    // Length doubled (every source entity appended with rewritten id).
    expect(after.trades.length).toBe(before.trades.length + source.trades.length);
    expect(after.stocks.length).toBe(before.stocks.length + source.stocks.length);
    expect(after.groups.length).toBe(before.groups.length + source.groups.length);
    expect(after.accounts.length).toBe(
      before.accounts.length + source.accounts.length
    );

    // No id appears more than once.
    const tradeIds = after.trades.map((t) => t.id);
    expect(new Set(tradeIds).size).toBe(tradeIds.length);

    // Cross-references in newly imported groups must point to imported
    // (rewritten) trade ids, not original ones — the original ids in
    // source.groups[].trade_ids should now resolve via the rewrite map to
    // ids that exist in `after.trades` and are NOT in `before.trades`.
    const beforeTradeIds = new Set(before.trades.map((t) => t.id));
    const newlyImportedTradeIds = new Set(
      tradeIds.filter((id) => !beforeTradeIds.has(id))
    );
    const importedGroups = after.groups.slice(before.groups.length);
    for (const g of importedGroups) {
      for (const tid of g.trade_ids) {
        expect(newlyImportedTradeIds.has(tid)).toBe(true);
      }
    }

    // Stock original_put_id repointing: imported stocks should reference
    // imported (new) trade ids, not the seed's t-* ids.
    const importedStocks = after.stocks.slice(before.stocks.length);
    for (const s of importedStocks) {
      if (s.original_put_id) {
        expect(newlyImportedTradeIds.has(s.original_put_id)).toBe(true);
      }
    }

    // Trades linked_stock_id repointing: imported trades referencing a
    // stock that EXISTS in the import payload (not a dangling reference
    // to a called-away/deleted stock) should point to the newly imported
    // stock id. The seed has metaCalledAwayRow with linked_stock_id
    // pointing to a "deleted" META stock that's no longer in stocks[],
    // which is the dangling-historical case we don't try to repair.
    const beforeStockIds = new Set(before.stocks.map((s) => s.id));
    const importedStockIds = new Set(
      after.stocks.map((s) => s.id).filter((id) => !beforeStockIds.has(id))
    );
    const sourceStockIds = new Set(source.stocks.map((s) => s.id));
    for (const t of after.trades.slice(before.trades.length)) {
      const sourceTrade = source.trades.find(
        (s) => s.symbol === t.symbol && s.date_opened === t.date_opened
      );
      const originalLinked = sourceTrade?.linked_stock_id ?? null;
      if (originalLinked && sourceStockIds.has(originalLinked)) {
        // This trade pointed to a stock that's in the payload — must be
        // repointed to the new imported stock id.
        expect(importedStockIds.has(t.linked_stock_id ?? '')).toBe(true);
      }
    }
  });

});
