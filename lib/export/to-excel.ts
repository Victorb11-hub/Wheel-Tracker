import * as XLSX from 'xlsx';
import type { FullState } from '@/lib/data/client';
import { IMPORT_FORMAT_VERSION } from '@/lib/import/schema';

// Excel export — multi-sheet workbook in the same canonical schema as
// the JSON exporter. Nested fields (cycle_details, original_put,
// covered_calls, trade_ids) are JSON-stringified into single cells so
// round-trip import can rehydrate them. No styling, no formulas, no
// Excel-isms — just header row + data rows + column widths. Parser-
// friendly by construction.

// Column ordering is fixed and shared with the import parser. Adding a
// field is a v1→v2 migration; never reorder existing columns.
const TRADE_COLUMNS = [
  'id',
  'user_id',
  'symbol',
  'action',
  'type',
  'strike',
  'premium',
  'contracts',
  'date_opened',
  'date_closed',
  'exp_date',
  'price_at_action',
  'status',
  'close_price',
  'closing_notes',
  'info',
  'trade_ref',
  'account',
  'is_closing_trade',
  'is_rolled',
  'is_covered_call',
  'is_assignment',
  'is_called_away',
  'linked_stock_id',
  'assigned_price',
  'full_cycle_pl',
  'cycle_details',
  'created_at',
  'updated_at',
] as const;

const STOCK_COLUMNS = [
  'id',
  'user_id',
  'symbol',
  'shares',
  'cost_basis',
  'assigned_price',
  'total_cost',
  'total_value',
  'assigned_date',
  'original_put_id',
  'original_put',
  'covered_calls',
  'account',
  'trade_ref',
  'status',
  'created_at',
  'updated_at',
] as const;

const GROUP_COLUMNS = [
  'id',
  'user_id',
  'name',
  'trade_ids',
  'created_at',
  'updated_at',
] as const;

const ACCOUNT_COLUMNS = ['id', 'user_id', 'name', 'created_at'] as const;

// Fields whose value is an object/array — JSON-stringified into the cell.
const JSON_FIELDS = new Set([
  'cycle_details',
  'original_put',
  'covered_calls',
  'trade_ids',
]);

function toRow<T extends Record<string, unknown>>(
  obj: T,
  columns: readonly string[]
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const col of columns) {
    const v = obj[col];
    if (JSON_FIELDS.has(col) && v != null) {
      row[col] = JSON.stringify(v);
    } else if (v === null || v === undefined) {
      row[col] = '';
    } else {
      row[col] = v;
    }
  }
  return row;
}

function sheetFromRows(
  rows: Record<string, unknown>[],
  columns: readonly string[]
): XLSX.WorkSheet {
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...columns] });
  // Reasonable fixed widths so the sheet is readable on first open without
  // forcing the user to manually expand columns.
  ws['!cols'] = columns.map((col) => ({ wch: defaultWidth(col) }));
  return ws;
}

function defaultWidth(col: string): number {
  if (col === 'id' || col.endsWith('_id')) return 12;
  if (col === 'cycle_details' || col === 'original_put' || col === 'covered_calls' || col === 'trade_ids')
    return 60;
  if (col === 'info' || col === 'closing_notes' || col === 'name') return 32;
  if (col.includes('date') || col.includes('_at')) return 22;
  return 14;
}

function buildMetadataSheet(): XLSX.WorkSheet {
  const README =
    'This file is a Wheel Tracker export. ' +
    'Sheets: Trades, Stocks, Groups, Accounts (one row per entity) plus this Metadata sheet. ' +
    'Cells in the columns cycle_details, original_put, covered_calls, and trade_ids contain JSON-stringified data — leave them as-is for round-trip import. ' +
    'Do not reformat columns, convert dates, or apply formulas. ' +
    'Text-as-typed is the contract. ' +
    'Imports are version-checked: changing the version field causes the importer to reject the file.';

  const data = [
    ['Field', 'Value'],
    ['version', IMPORT_FORMAT_VERSION],
    ['exported_at', new Date().toISOString()],
    ['README', README],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 14 }, { wch: 100 }];
  return ws;
}

export function exportToExcel(state: FullState): {
  content: ArrayBuffer;
  filename: string;
} {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildMetadataSheet(), 'Metadata');

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      state.trades.map((t) => toRow(t as unknown as Record<string, unknown>, TRADE_COLUMNS)),
      TRADE_COLUMNS
    ),
    'Trades'
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      state.stocks.map((s) => toRow(s as unknown as Record<string, unknown>, STOCK_COLUMNS)),
      STOCK_COLUMNS
    ),
    'Stocks'
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      state.groups.map((g) => toRow(g as unknown as Record<string, unknown>, GROUP_COLUMNS)),
      GROUP_COLUMNS
    ),
    'Groups'
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      state.accounts.map((a) => toRow(a as unknown as Record<string, unknown>, ACCOUNT_COLUMNS)),
      ACCOUNT_COLUMNS
    ),
    'Accounts'
  );

  const content = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const stamp = new Date().toISOString().slice(0, 10);
  return { content, filename: `wheel-tracker-${stamp}.xlsx` };
}

// Re-exported for the importer (Phase 6) to keep the column ordering
// authoritative in one place.
export const EXCEL_COLUMNS = {
  trades: TRADE_COLUMNS,
  stocks: STOCK_COLUMNS,
  groups: GROUP_COLUMNS,
  accounts: ACCOUNT_COLUMNS,
  jsonFields: JSON_FIELDS,
} as const;
