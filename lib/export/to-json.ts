import type { FullState } from '@/lib/data/client';
import { IMPORT_FORMAT_VERSION, type ImportPayload } from '@/lib/import/schema';

// Build the canonical export payload from the current FullState. Pure —
// no DOM, no file I/O. Caller wraps the result in a Blob for download.
export function buildExportPayload(state: FullState): ImportPayload {
  return {
    version: IMPORT_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    trades: state.trades,
    stocks: state.stocks,
    groups: state.groups,
    accounts: state.accounts,
  };
}

export function exportToJson(state: FullState): { content: string; filename: string } {
  const payload = buildExportPayload(state);
  const content = JSON.stringify(payload, null, 2);
  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return {
    content,
    filename: `wheel-tracker-${stamp}.json`,
  };
}
