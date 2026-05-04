import type {
  CustomAccount,
  StockPosition,
  Trade,
  TradeGroup,
  ThemePref,
  UserPreferences,
} from '../../types/trade';
import type { Plan } from '../wheel/plan';

// One snapshot the UI loads on mount and refreshes after every applyPlan.
// All writes go through applyPlan or the targeted helpers below.
export interface FullState {
  trades: Trade[];
  stocks: StockPosition[];
  groups: TradeGroup[];
  accounts: CustomAccount[];
  prefs: UserPreferences;
}

// Inputs for the non-planner-driven mutations. These are flows the wheel
// state-machine doesn't model: editing a single trade, deletion + undo,
// reopening a closed trade, account CRUD, theme persistence, group rename.

export interface EditTradeInput {
  id: string;
  patch: Partial<Omit<Trade, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;
}

export interface DeletedTradeRecord {
  trade: Trade;
  // Snapshot of any group that contained this trade so undo can restore it.
  groupSnapshots: Array<{ id: string; trade_ids: string[] }>;
}

export interface DataClient {
  // Single source of truth for the UI to load + re-render from.
  getState(): Promise<FullState>;

  // Apply a Plan from a wheel/* planner. MUST be transactional — if any write
  // fails, all prior writes within the call are rolled back. Mock + Supabase
  // both enforce this so the swap is mechanical.
  applyPlan(plan: Plan): Promise<void>;

  // ----- Targeted mutations not driven by Plans -------------------------
  editTrade(input: EditTradeInput): Promise<void>;
  deleteTrade(id: string): Promise<DeletedTradeRecord>;
  undoDeleteTrade(record: DeletedTradeRecord): Promise<void>;
  reopenTrade(id: string): Promise<void>;

  // Account CRUD
  addAccount(name: string): Promise<CustomAccount>;
  removeAccount(id: string): Promise<void>;

  // Group management
  createGroup(name: string, tradeIds: string[]): Promise<TradeGroup>;
  renameGroup(id: string, name: string): Promise<void>;
  deleteGroup(id: string): Promise<void>;
  setGroupTradeIds(id: string, tradeIds: string[]): Promise<void>;

  // Preferences
  setTheme(theme: ThemePref): Promise<void>;

  // Optional, mock-only: re-seed from scratch. Real client throws.
  reset?(): Promise<void>;
}
