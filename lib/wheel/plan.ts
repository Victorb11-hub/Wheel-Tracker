import type {
  Trade,
  TradeAction,
  TradeType,
  StockPosition,
  TradeGroup,
} from '../../types/trade';

// ---------- Insert / patch shapes ----------------------------------------
// `user_id`, `created_at`, `updated_at` are filled by the DataClient layer.
// `id` IS included on inserts — planners generate it via ctx.newId() so
// downstream entities (groups) can reference it deterministically.

export type TradeInsert = Omit<Trade, 'user_id' | 'created_at' | 'updated_at'>;
export type TradePatch = { id: string; patch: Partial<Omit<Trade, 'id' | 'user_id' | 'created_at' | 'updated_at'>> };

export type StockInsert = Omit<StockPosition, 'user_id' | 'created_at' | 'updated_at'>;
export type StockPatch = { id: string; patch: Partial<Omit<StockPosition, 'id' | 'user_id' | 'created_at' | 'updated_at'>> };
export type StockDelete = { id: string };

// Group upsert keyed by (user_id, name). DB enforces uniqueness; we just
// declare "ensure a group with this name exists and contains these trade ids".
// `addTradeIds` are appended to existing array, deduped server-side.
export type GroupUpsert = { name: string; addTradeIds: string[] };

export interface Plan {
  tradeInserts: TradeInsert[];
  tradeUpdates: TradePatch[];
  stockInserts: StockInsert[];
  stockUpdates: StockPatch[];
  stockDeletes: StockDelete[];
  groupUpserts: GroupUpsert[];
}

export const emptyPlan = (): Plan => ({
  tradeInserts: [],
  tradeUpdates: [],
  stockInserts: [],
  stockUpdates: [],
  stockDeletes: [],
  groupUpserts: [],
});

// ---------- Inputs --------------------------------------------------------

export interface PlannerCtx {
  newId: () => string;
}

export interface AddPositionInput {
  trade_ref: string | null;
  account: string | null;
  symbol: string;
  contracts: number;
  strike: number | null;       // null/0 on a BUY → "match any strike" (smart-close)
  premium: number;
  action: TradeAction;
  type: TradeType | null;      // null on a smart-close BUY → inherit from match
  date_opened: string;
  exp_date: string | null;
  price_at_action: number | null;
  info: string | null;
}

export interface CloseInput {
  trade_id: string;
  close_date: string;
  closing_premium: number;
  closing_notes: string | null;
}

export interface RollInput {
  trade_id: string;
  rollCloseDate: string;
  rollClosingPremium: number;
  rollNewStrike: number;
  rollNewPremium: number;
  rollNewExpDate: string;
  rollPriceAtAction: number | null;
  rollNewType: 'put' | 'call';
  rollNotes: string | null;
}

export interface AssignInput {
  trade_id: string;            // the sold put being assigned
  assignDate: string;
  assignmentPrice: number;
  assignmentNotes: string | null;
}

export interface SellCoveredCallInput {
  stock_id: string;
  strike: number;
  premium: number;             // per-share
  expDate: string;
  dateOpened: string;
  notes: string | null;
}

export interface CalledAwayInput {
  stock_id: string;
  calledAwayDate: string;
  salePrice: number;
  notes: string | null;
}

// ---------- Local state snapshot the planners read from ------------------

export interface WheelState {
  trades: Trade[];             // all trades, open + closed
  stocks: StockPosition[];
  groups: TradeGroup[];
}
