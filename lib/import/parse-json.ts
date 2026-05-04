import {
  IMPORT_FORMAT_VERSION,
  type ImportPayload,
  type ParseResult,
  type RowError,
} from './schema';
import {
  validateAccount,
  validateGroup,
  validateStock,
  validateTrade,
} from './validate';
import type {
  CustomAccount,
  StockPosition,
  Trade,
  TradeGroup,
} from '@/types/trade';

// Parse a JSON-format import payload. Collects all per-row errors rather
// than aborting on first; returns null payload only on top-level fatal
// problems (invalid JSON / wrong version / missing arrays). Per-row errors
// drop the offending row but keep the rest of the payload importable.
export function parseJsonImport(content: string): ParseResult {
  const errors: RowError[] = [];

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (err) {
    errors.push({
      sheet: '*',
      row: 0,
      field: '*',
      message: `Invalid JSON: ${(err as Error).message}`,
    });
    return { payload: null, errors };
  }

  if (typeof raw !== 'object' || raw === null) {
    errors.push({
      sheet: '*',
      row: 0,
      field: '*',
      message: 'Top-level value must be an object.',
    });
    return { payload: null, errors };
  }

  const obj = raw as Record<string, unknown>;

  if (obj.version !== IMPORT_FORMAT_VERSION) {
    errors.push({
      sheet: '*',
      row: 0,
      field: 'version',
      message: `Unsupported version "${String(obj.version)}". Expected ${IMPORT_FORMAT_VERSION}.`,
    });
    return { payload: null, errors };
  }

  const tradesRaw = Array.isArray(obj.trades) ? obj.trades : [];
  const stocksRaw = Array.isArray(obj.stocks) ? obj.stocks : [];
  const groupsRaw = Array.isArray(obj.groups) ? obj.groups : [];
  const accountsRaw = Array.isArray(obj.accounts) ? obj.accounts : [];

  const trades: Trade[] = [];
  for (let i = 0; i < tradesRaw.length; i++) {
    const { trade, errors: errs } = validateTrade(tradesRaw[i], i + 1);
    errors.push(...errs);
    if (trade) trades.push(trade);
  }

  const stocks: StockPosition[] = [];
  for (let i = 0; i < stocksRaw.length; i++) {
    const { stock, errors: errs } = validateStock(stocksRaw[i], i + 1);
    errors.push(...errs);
    if (stock) stocks.push(stock);
  }

  const groups: TradeGroup[] = [];
  for (let i = 0; i < groupsRaw.length; i++) {
    const { group, errors: errs } = validateGroup(groupsRaw[i], i + 1);
    errors.push(...errs);
    if (group) groups.push(group);
  }

  const accounts: CustomAccount[] = [];
  for (let i = 0; i < accountsRaw.length; i++) {
    const { account, errors: errs } = validateAccount(accountsRaw[i], i + 1);
    errors.push(...errs);
    if (account) accounts.push(account);
  }

  const payload: ImportPayload = {
    version: IMPORT_FORMAT_VERSION,
    exported_at:
      typeof obj.exported_at === 'string'
        ? obj.exported_at
        : new Date().toISOString(),
    trades,
    stocks,
    groups,
    accounts,
  };

  return { payload, errors };
}
