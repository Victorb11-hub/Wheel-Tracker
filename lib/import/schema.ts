// Canonical import/export schema. Same shape across JSON / Excel / CSV
// (the latter two flatten nested fields via JSON-stringification).
//
// version=1 freezes the wire format. Bump when fields are added/renamed.
// Importers must reject mismatched versions rather than silently coerce —
// catching format drift early is worth the friction.
//
// Round-trip contract: Export then Import (into an empty database) must
// produce a state byte-equivalent to the source, modulo:
//   - re-stamped created_at/updated_at on imported rows (DB-driven)
//   - id rewriting on collisions (cross-references repointed automatically)

import type {
  CustomAccount,
  StockPosition,
  Trade,
  TradeGroup,
} from '@/types/trade';

export const IMPORT_FORMAT_VERSION = 1;

export interface ImportPayload {
  version: number;
  exported_at: string;       // ISO timestamp
  trades: Trade[];
  stocks: StockPosition[];
  groups: TradeGroup[];
  accounts: CustomAccount[];
}

// Per-row validation outcome. Errors are collected, not thrown — the
// preview UI surfaces every problem rather than aborting on the first.
export interface RowError {
  sheet: string;             // 'trades' | 'stocks' | 'groups' | 'accounts'
  row: number;               // 1-based row index in the source file
  field: string;             // field name or '*' for cross-row issues
  message: string;
}

export interface ParseResult {
  payload: ImportPayload | null;  // null when fatal parse failure
  errors: RowError[];
}
