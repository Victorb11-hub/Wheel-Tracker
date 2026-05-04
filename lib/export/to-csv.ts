import * as XLSX from 'xlsx';
import type { FullState } from '@/lib/data/client';
import { EXCEL_COLUMNS } from './to-excel';

// CSV export — Trades-only by design. CSV is the broker-import use case;
// stocks/groups/accounts use Excel or JSON for full backup. The Trades
// columns mirror the Excel Trades sheet so the CSV file round-trips with
// the same parser the Excel importer uses.

// Internal/derived columns dropped from the broker-style flavor. These
// fields are reconstructed by the import pipeline (or simply not needed
// when handing a CSV to a broker / accountant). Keeping them on the
// "full" flavor preserves round-trip integrity.
const INTERNAL_COLUMNS = new Set<string>([
  'id',
  'user_id',
  'is_closing_trade',
  'is_rolled',
  'is_covered_call',
  'is_assignment',
  'is_called_away',
  'linked_stock_id',
  'cycle_details',
]);

const JSON_FIELDS = EXCEL_COLUMNS.jsonFields;

export interface CsvExportOptions {
  // true = all 29 columns, suitable for round-trip backup. (default)
  // false = drop internal/derived columns for a clean broker-style file.
  includeInternal?: boolean;
}

function buildRow(
  trade: Record<string, unknown>,
  columns: readonly string[]
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const col of columns) {
    const v = trade[col];
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

export function exportTradesToCsv(
  state: FullState,
  opts: CsvExportOptions = {}
): { content: string; filename: string } {
  const includeInternal = opts.includeInternal ?? true;
  const columns = includeInternal
    ? [...EXCEL_COLUMNS.trades]
    : EXCEL_COLUMNS.trades.filter((c) => !INTERNAL_COLUMNS.has(c));

  const rows = state.trades.map((t) =>
    buildRow(t as unknown as Record<string, unknown>, columns)
  );

  const ws = XLSX.utils.json_to_sheet(rows, { header: [...columns] });
  // sheet_to_csv handles RFC 4180 escaping (commas, newlines, embedded
  // quotes) automatically. No further string-munging needed.
  const content = XLSX.utils.sheet_to_csv(ws);

  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = includeInternal ? '' : '-broker';
  return {
    content,
    filename: `wheel-tracker-trades${suffix}-${stamp}.csv`,
  };
}
