// Hand-written until `supabase gen types` is wired up after schema lockdown.
// Mirrors the SQL in supabase/migrations/0001_initial_schema.sql.

export type TradeAction = 'sell' | 'buy' | 'assignment' | 'called-away';
export type TradeType = 'put' | 'call' | 'stock';
export type TradeStatus = 'open' | 'closed' | 'assigned';
export type StockStatus = 'holding' | 'called-away';
export type ThemePref = 'dark' | 'light';

export interface CycleDetails {
  putPremium: number;
  callPremiums: number;
  stockProfit: number;
  assignedPrice: number;
  salePrice: number;
}

export interface OriginalPutSnapshot {
  strike: number;
  premium: number;
  contracts: number;
  dateOpened: string;
  tradeRef: string | null;
  premiumCollected: number;
}

export interface CoveredCallSnapshot {
  strike: number;
  premium: number;
  expDate: string;
  dateOpened: string;
  notes: string | null;
}

interface TradeBase {
  id: string;
  user_id: string;
  trade_ref: string | null;
  account: string | null;
  symbol: string;
  contracts: number;
  premium: number;
  date_opened: string;
  date_closed: string | null;
  exp_date: string | null;
  price_at_action: number | null;
  info: string | null;
  status: TradeStatus;
  close_price: number | null;
  closing_notes: string | null;
  is_closing_trade: boolean;
  is_rolled: boolean;
  is_covered_call: boolean;
  linked_stock_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegularLeg extends TradeBase {
  action: 'sell' | 'buy';
  type: 'put' | 'call';
  strike: number;
  is_assignment: false;
  is_called_away: false;
  assigned_price: null;
  full_cycle_pl: null;
  cycle_details: null;
}

export interface AssignmentRow extends TradeBase {
  action: 'assignment';
  type: 'stock';
  strike: number;
  is_assignment: true;
  is_called_away: false;
  assigned_price: number;
  full_cycle_pl: null;
  cycle_details: null;
}

export interface CalledAwayRow extends TradeBase {
  action: 'called-away';
  type: 'stock';
  strike: number;
  is_assignment: false;
  is_called_away: true;
  assigned_price: null;
  full_cycle_pl: number;
  cycle_details: CycleDetails;
}

export type Trade = RegularLeg | AssignmentRow | CalledAwayRow;

export interface StockPosition {
  id: string;
  user_id: string;
  symbol: string;
  shares: number;
  cost_basis: number;
  assigned_price: number;
  total_cost: number;
  total_value: number;
  assigned_date: string;
  original_put_id: string | null;
  original_put: OriginalPutSnapshot;
  covered_calls: CoveredCallSnapshot[];
  account: string | null;
  trade_ref: string | null;
  status: StockStatus;
  created_at: string;
  updated_at: string;
}

export interface TradeGroup {
  id: string;
  user_id: string;
  name: string;
  trade_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface CustomAccount {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface UserPreferences {
  user_id: string;
  theme: ThemePref;
  updated_at: string;
}
