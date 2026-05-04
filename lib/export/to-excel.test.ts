import * as XLSX from 'xlsx';
import { exportToExcel, EXCEL_COLUMNS } from './to-excel';
import { buildSeed } from '@/lib/data/seed';
import { IMPORT_FORMAT_VERSION } from '@/lib/import/schema';

// These tests verify the byte-level shape of the Excel export — sheet
// names, column ordering, JSON-stringification of nested fields, metadata
// content. The full round-trip (Excel → bulkImport → equivalent state)
// gets tested in Phase 6 once the Excel parser exists.

function readSheet(content: ArrayBuffer, name: string): unknown[][] {
  const wb = XLSX.read(content, { type: 'array' });
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Missing sheet: ${name}`);
  return XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
}

describe('exportToExcel', () => {
  test('produces all five sheets in the expected order', () => {
    const seed = buildSeed();
    const { content } = exportToExcel(seed);
    const wb = XLSX.read(content, { type: 'array' });
    expect(wb.SheetNames).toEqual([
      'Metadata',
      'Trades',
      'Stocks',
      'Groups',
      'Accounts',
    ]);
  });

  test('Metadata sheet carries version + ISO timestamp + README', () => {
    const seed = buildSeed();
    const { content } = exportToExcel(seed);
    const rows = readSheet(content, 'Metadata');
    // Header row + 3 data rows
    expect(rows[0]).toEqual(['Field', 'Value']);
    expect(rows[1]).toEqual(['version', IMPORT_FORMAT_VERSION]);
    expect(rows[2][0]).toBe('exported_at');
    expect(typeof rows[2][1]).toBe('string');
    // ISO 8601 with Z: 2026-05-04T...Z
    expect(String(rows[2][1])).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(rows[3][0]).toBe('README');
    expect(String(rows[3][1])).toContain('Wheel Tracker');
  });

  test('Trades sheet header matches column ordering', () => {
    const seed = buildSeed();
    const { content } = exportToExcel(seed);
    const rows = readSheet(content, 'Trades');
    const header = rows[0] as string[];
    expect(header).toEqual([...EXCEL_COLUMNS.trades]);
  });

  test('cycle_details on a called-away row is JSON-stringified', () => {
    const seed = buildSeed();
    const { content } = exportToExcel(seed);
    const rows = readSheet(content, 'Trades');
    const header = rows[0] as string[];
    const cycleIdx = header.indexOf('cycle_details');
    const actionIdx = header.indexOf('action');
    expect(cycleIdx).toBeGreaterThan(-1);

    const calledAwayRow = rows
      .slice(1)
      .find((r) => r[actionIdx] === 'called-away');
    expect(calledAwayRow).toBeDefined();
    const cellValue = calledAwayRow![cycleIdx];
    // Must be a JSON string, not [object Object]
    expect(typeof cellValue).toBe('string');
    const parsed = JSON.parse(String(cellValue));
    expect(parsed).toHaveProperty('putPremium');
    expect(parsed).toHaveProperty('callPremiums');
    expect(parsed).toHaveProperty('stockProfit');
  });

  test('original_put + covered_calls on a stock row are JSON-stringified', () => {
    const seed = buildSeed();
    const { content } = exportToExcel(seed);
    const rows = readSheet(content, 'Stocks');
    const header = rows[0] as string[];
    const opIdx = header.indexOf('original_put');
    const ccIdx = header.indexOf('covered_calls');

    const dataRow = rows[1];
    expect(dataRow).toBeDefined();

    const op = JSON.parse(String(dataRow![opIdx]));
    expect(op).toHaveProperty('strike');
    expect(op).toHaveProperty('premiumCollected');

    const cc = JSON.parse(String(dataRow![ccIdx]));
    expect(Array.isArray(cc)).toBe(true);
  });

  test('Groups sheet trade_ids is JSON-stringified', () => {
    const seed = buildSeed();
    const { content } = exportToExcel(seed);
    const rows = readSheet(content, 'Groups');
    const header = rows[0] as string[];
    const tidIdx = header.indexOf('trade_ids');

    const dataRow = rows[1];
    expect(dataRow).toBeDefined();
    const tids = JSON.parse(String(dataRow![tidIdx]));
    expect(Array.isArray(tids)).toBe(true);
    expect(tids.every((x: unknown) => typeof x === 'string')).toBe(true);
  });

  test('null fields are emitted as empty cells, not the string "null"', () => {
    const seed = buildSeed();
    const { content } = exportToExcel(seed);
    const rows = readSheet(content, 'Trades');
    const header = rows[0] as string[];
    const tradeRefIdx = header.indexOf('trade_ref');
    // openTslaCsp has trade_ref: null per seed — find it by symbol+strike
    const symbolIdx = header.indexOf('symbol');
    const strikeIdx = header.indexOf('strike');
    const targetRow = rows
      .slice(1)
      .find((r) => r[symbolIdx] === 'TSLA' && r[strikeIdx] === 240);
    expect(targetRow).toBeDefined();
    // Empty cell renders as undefined or empty string, not 'null'
    const cell = targetRow![tradeRefIdx];
    expect(cell === undefined || cell === '').toBe(true);
  });
});
