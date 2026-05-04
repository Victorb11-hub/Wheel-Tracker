import { exportTradesToCsv } from './to-csv';
import { EXCEL_COLUMNS } from './to-excel';
import { buildSeed } from '@/lib/data/seed';

// Parse a CSV string into rows of cells, RFC 4180 aware (handles quoted
// fields with embedded commas + escaped quotes). Sufficient for these
// tests — uses the same xlsx round-trip as production code would.
import * as XLSX from 'xlsx';
function parseCsvRows(csv: string): string[][] {
  const wb = XLSX.read(csv, { type: 'string', raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as string[][];
}

describe('exportTradesToCsv — full (default)', () => {
  test('header matches the Trades column ordering, all 29 columns', () => {
    const seed = buildSeed();
    const { content, filename } = exportTradesToCsv(seed);
    const rows = parseCsvRows(content);
    expect(rows[0]).toEqual([...EXCEL_COLUMNS.trades]);
    expect(filename).toMatch(/^wheel-tracker-trades-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('one row per trade', () => {
    const seed = buildSeed();
    const { content } = exportTradesToCsv(seed);
    const rows = parseCsvRows(content);
    expect(rows.length - 1).toBe(seed.trades.length); // -1 for header
  });

  test('cycle_details on a called-away row is JSON-stringified, parses back to an object', () => {
    const seed = buildSeed();
    const { content } = exportTradesToCsv(seed);
    const rows = parseCsvRows(content);
    const header = rows[0];
    const cycleIdx = header.indexOf('cycle_details');
    const actionIdx = header.indexOf('action');
    const calledAway = rows.slice(1).find((r) => r[actionIdx] === 'called-away');
    expect(calledAway).toBeDefined();
    const cell = calledAway![cycleIdx];
    expect(typeof cell).toBe('string');
    expect(cell.length).toBeGreaterThan(0);
    const parsed = JSON.parse(cell);
    expect(parsed).toHaveProperty('putPremium');
    expect(parsed).toHaveProperty('stockProfit');
  });

  test('null fields are emitted as empty cells, not "null"', () => {
    const seed = buildSeed();
    const { content } = exportTradesToCsv(seed);
    const rows = parseCsvRows(content);
    const header = rows[0];
    const tradeRefIdx = header.indexOf('trade_ref');
    const symbolIdx = header.indexOf('symbol');
    const strikeIdx = header.indexOf('strike');
    // openTslaCsp has trade_ref: null
    const target = rows
      .slice(1)
      .find((r) => r[symbolIdx] === 'TSLA' && r[strikeIdx] === '240');
    expect(target).toBeDefined();
    const cell = target![tradeRefIdx];
    expect(cell === undefined || cell === '').toBe(true);
  });

  test('RFC 4180 escaping: a field containing a comma round-trips intact', () => {
    // The seed's tslaStockPosition info column has commas in some
    // notes — but trades' info is what's exported. Pick a trade whose
    // info contains a comma or test by injecting one.
    const seed = buildSeed();
    const target = seed.trades[0];
    const tweaked = {
      ...seed,
      trades: [
        { ...target, info: 'note with a comma, and "quotes" inside' },
        ...seed.trades.slice(1),
      ],
    };
    const { content } = exportTradesToCsv(tweaked);
    const rows = parseCsvRows(content);
    const header = rows[0];
    const infoIdx = header.indexOf('info');
    expect(rows[1][infoIdx]).toBe('note with a comma, and "quotes" inside');
  });
});

describe('exportTradesToCsv — broker-style (includeInternal: false)', () => {
  test('drops internal columns and uses -broker filename suffix', () => {
    const seed = buildSeed();
    const { content, filename } = exportTradesToCsv(seed, { includeInternal: false });
    const rows = parseCsvRows(content);
    const header = rows[0];

    const dropped = [
      'id',
      'user_id',
      'is_closing_trade',
      'is_rolled',
      'is_covered_call',
      'is_assignment',
      'is_called_away',
      'linked_stock_id',
      'cycle_details',
    ];
    for (const col of dropped) {
      expect(header).not.toContain(col);
    }
    // 29 - 9 dropped = 20 columns
    expect(header.length).toBe(EXCEL_COLUMNS.trades.length - dropped.length);
    expect(filename).toMatch(/^wheel-tracker-trades-broker-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('keeps user-facing columns: symbol, strike, premium, dates, action, type', () => {
    const seed = buildSeed();
    const { content } = exportTradesToCsv(seed, { includeInternal: false });
    const rows = parseCsvRows(content);
    const header = rows[0];
    for (const col of [
      'symbol',
      'strike',
      'premium',
      'date_opened',
      'date_closed',
      'exp_date',
      'action',
      'type',
      'contracts',
      'trade_ref',
      'account',
      'info',
    ]) {
      expect(header).toContain(col);
    }
  });
});
