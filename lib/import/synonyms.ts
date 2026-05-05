// Canonical fields a CSV/Excel column can map to. State-machine flags
// (is_rolled, is_closing_trade, etc.) are intentionally absent — broker
// CSVs don't carry them, and importing them from a hand-edit is rare
// enough to require manual mapping via the dropdown. The mapper exposes
// these as the targets in the per-column dropdown.
export type CanonicalField =
  | 'symbol'
  | 'action'
  | 'type'
  | 'strike'
  | 'premium'
  | 'contracts'
  | 'date_opened'
  | 'date_closed'
  | 'exp_date'
  | 'price_at_action'
  | 'account'
  | 'trade_ref'
  | 'info'
  | 'closing_notes'
  | 'status'
  | 'close_price';

// Required canonical fields. The import button stays disabled until each
// of these has a source-column mapping. Type + contracts are optional
// with defaults (put / 1) and a yellow "verify after import" warning.
export const REQUIRED_FIELDS: ReadonlyArray<CanonicalField> = [
  'symbol',
  'action',
  'strike',
  'premium',
  'date_opened',
];

// Fields that import with a default + warning if unmapped. Surfaced in the
// mapper UI as a yellow notice when the user proceeds without mapping them.
export const DEFAULTED_FIELDS: ReadonlyArray<CanonicalField> = ['type', 'contracts'];

// Synonym table. Lower-case, punctuation-stripped. Order doesn't matter
// within an array — the matcher tries all of them. Common broker headers
// (Schwab, Fidelity, IBKR, TastyTrade, Tradier, ThinkOrSwim) are covered.
// Add more as we encounter real-world CSVs.
export const SYNONYMS: Record<CanonicalField, string[]> = {
  symbol: ['symbol', 'ticker', 'underlying', 'underlying symbol', 'stock', 'instrument'],
  action: [
    'action',
    'buy/sell',
    'side',
    'trans code',
    'transaction type',
    'transaction',
    'activity',
    'type of transaction',
  ],
  type: ['type', 'put/call', 'option type', 'right'],
  strike: ['strike', 'strike price', 'strike $', 'exercise price'],
  premium: ['premium', 'price', 'trade price', 'net price', 'limit price'],
  contracts: ['quantity', 'qty', 'contracts', 'number of contracts', 'position size'],
  date_opened: [
    'trade date',
    'date',
    'open date',
    'date opened',
    'activity date',
    'trans date',
    'order date',
  ],
  date_closed: ['close date', 'date closed', 'closing date', 'closed'],
  exp_date: ['exp date', 'expiration', 'expiration date', 'expiry', 'expires'],
  price_at_action: ['underlying price', 'stock price', 'price at trade', 'spot'],
  account: ['account', 'account number', 'account name', 'acct'],
  trade_ref: [
    'trade ref',
    'trade reference',
    'order id',
    'order number',
    'reference number',
    'trans #',
    'order',
  ],
  info: ['notes', 'description', 'memo', 'comment'],
  closing_notes: ['closing notes', 'close notes'],
  status: ['status', 'position status'],
  close_price: ['close price', 'closing price', 'close premium'],
};
