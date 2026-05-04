import type {
  CustomAccount,
  StockPosition,
  ThemePref,
  Trade,
  TradeGroup,
} from '../../types/trade';
import type { Plan, TradeInsert, StockInsert } from '../wheel/plan';
import type {
  DataClient,
  DeletedTradeRecord,
  EditTradeInput,
  FullState,
} from './client';
import { buildSeed, SEED_USER_ID } from './seed';

// In-memory implementation of DataClient.
//
// Contract notes:
//   - applyPlan is transactional: snapshot → mutate → on throw, restore.
//     This mirrors what Supabase will give us via a single round-trip stored
//     procedure or a `with` statement, so the swap is mechanical.
//   - All writes set user_id from a fixed mock user. Real client will inject
//     auth.uid() from Supabase session.
//   - All reads return defensive deep clones so callers can't mutate state
//     by holding a reference. Same contract Supabase serialization gives us.
export class MockDataClient implements DataClient {
  private state: FullState;
  private readonly userId: string;

  constructor(opts: { userId?: string } = {}) {
    this.userId = opts.userId ?? SEED_USER_ID;
    this.state = buildSeed();
  }

  // ----- snapshots -------------------------------------------------------

  async getState(): Promise<FullState> {
    return this.snapshot();
  }

  async reset(): Promise<void> {
    this.state = buildSeed();
  }

  // ----- transactional plan apply ---------------------------------------

  async applyPlan(plan: Plan): Promise<void> {
    const backup = this.snapshot();
    try {
      this.applyTradeInserts(plan.tradeInserts);
      this.applyTradeUpdates(plan.tradeUpdates);
      this.applyStockInserts(plan.stockInserts);
      this.applyStockUpdates(plan.stockUpdates);
      this.applyStockDeletes(plan.stockDeletes);
      this.applyGroupUpserts(plan.groupUpserts);
    } catch (err) {
      // Rollback: restore snapshot atomically.
      this.state = backup;
      throw err;
    }
  }

  // ----- targeted mutations ---------------------------------------------

  async editTrade({ id, patch }: EditTradeInput): Promise<void> {
    const idx = this.state.trades.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error(`editTrade: trade ${id} not found`);
    this.state.trades[idx] = this.mergeTrade(this.state.trades[idx], patch);
  }

  async deleteTrade(id: string): Promise<DeletedTradeRecord> {
    const idx = this.state.trades.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error(`deleteTrade: trade ${id} not found`);
    const trade = this.state.trades[idx];

    // Snapshot the groups that contain this id so undo can restore membership.
    const groupSnapshots = this.state.groups
      .filter((g) => g.trade_ids.includes(id))
      .map((g) => ({ id: g.id, trade_ids: [...g.trade_ids] }));

    this.state.trades.splice(idx, 1);
    for (const g of this.state.groups) {
      g.trade_ids = g.trade_ids.filter((tid) => tid !== id);
      g.updated_at = new Date().toISOString();
    }

    return { trade: structuredClone(trade), groupSnapshots };
  }

  async undoDeleteTrade(record: DeletedTradeRecord): Promise<void> {
    this.state.trades.push(structuredClone(record.trade));
    for (const snap of record.groupSnapshots) {
      const g = this.state.groups.find((x) => x.id === snap.id);
      if (g) {
        g.trade_ids = [...snap.trade_ids];
        g.updated_at = new Date().toISOString();
      }
    }
  }

  async reopenTrade(id: string): Promise<void> {
    const idx = this.state.trades.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error(`reopenTrade: trade ${id} not found`);
    const t = this.state.trades[idx];
    this.state.trades[idx] = this.mergeTrade(t, {
      status: 'open',
      date_closed: null,
      close_price: null,
      closing_notes: null,
    });
    // Remove from any group it was in.
    for (const g of this.state.groups) {
      if (g.trade_ids.includes(id)) {
        g.trade_ids = g.trade_ids.filter((tid) => tid !== id);
        g.updated_at = new Date().toISOString();
      }
    }
  }

  // ----- accounts -------------------------------------------------------

  async addAccount(name: string): Promise<CustomAccount> {
    if (this.state.accounts.some((a) => a.name === name)) {
      throw new Error(`addAccount: account "${name}" already exists`);
    }
    const account: CustomAccount = {
      id: this.newId('a'),
      user_id: this.userId,
      name,
      created_at: new Date().toISOString(),
    };
    this.state.accounts.push(account);
    return structuredClone(account);
  }

  async removeAccount(id: string): Promise<void> {
    const idx = this.state.accounts.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error(`removeAccount: account ${id} not found`);
    this.state.accounts.splice(idx, 1);
  }

  // ----- groups ---------------------------------------------------------

  async createGroup(name: string, tradeIds: string[]): Promise<TradeGroup> {
    if (this.state.groups.some((g) => g.name === name)) {
      throw new Error(`createGroup: group "${name}" already exists`);
    }
    const now = new Date().toISOString();
    const group: TradeGroup = {
      id: this.newId('g'),
      user_id: this.userId,
      name,
      trade_ids: [...tradeIds],
      created_at: now,
      updated_at: now,
    };
    this.state.groups.push(group);
    return structuredClone(group);
  }

  async renameGroup(id: string, name: string): Promise<void> {
    const g = this.state.groups.find((x) => x.id === id);
    if (!g) throw new Error(`renameGroup: group ${id} not found`);
    if (this.state.groups.some((x) => x.id !== id && x.name === name)) {
      throw new Error(`renameGroup: name "${name}" already in use`);
    }
    g.name = name;
    g.updated_at = new Date().toISOString();
  }

  async deleteGroup(id: string): Promise<void> {
    const idx = this.state.groups.findIndex((g) => g.id === id);
    if (idx < 0) throw new Error(`deleteGroup: group ${id} not found`);
    this.state.groups.splice(idx, 1);
  }

  async setGroupTradeIds(id: string, tradeIds: string[]): Promise<void> {
    const g = this.state.groups.find((x) => x.id === id);
    if (!g) throw new Error(`setGroupTradeIds: group ${id} not found`);
    g.trade_ids = [...tradeIds];
    g.updated_at = new Date().toISOString();
  }

  // ----- prefs ----------------------------------------------------------

  async setTheme(theme: ThemePref): Promise<void> {
    this.state.prefs = {
      ...this.state.prefs,
      theme,
      updated_at: new Date().toISOString(),
    };
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  // Defensive deep clone of the entire state.
  private snapshot(): FullState {
    return {
      trades: this.state.trades.map((t) => structuredClone(t)),
      stocks: this.state.stocks.map((s) => structuredClone(s)),
      groups: this.state.groups.map((g) => structuredClone(g)),
      accounts: this.state.accounts.map((a) => structuredClone(a)),
      prefs: structuredClone(this.state.prefs),
    };
  }

  // -- plan dispatch --

  private applyTradeInserts(inserts: TradeInsert[]): void {
    for (const ins of inserts) {
      if (this.state.trades.some((t) => t.id === ins.id)) {
        throw new Error(`applyPlan: trade insert id ${ins.id} already exists`);
      }
      this.state.trades.push(this.makeTrade(ins));
    }
  }

  private applyTradeUpdates(
    updates: { id: string; patch: Partial<Trade> }[]
  ): void {
    for (const upd of updates) {
      const idx = this.state.trades.findIndex((t) => t.id === upd.id);
      if (idx < 0) {
        throw new Error(`applyPlan: trade update target ${upd.id} not found`);
      }
      this.state.trades[idx] = this.mergeTrade(
        this.state.trades[idx],
        upd.patch
      );
    }
  }

  private applyStockInserts(inserts: StockInsert[]): void {
    for (const ins of inserts) {
      if (this.state.stocks.some((s) => s.id === ins.id)) {
        throw new Error(`applyPlan: stock insert id ${ins.id} already exists`);
      }
      const now = new Date().toISOString();
      this.state.stocks.push({
        ...ins,
        user_id: this.userId,
        created_at: now,
        updated_at: now,
      });
    }
  }

  private applyStockUpdates(
    updates: { id: string; patch: Partial<StockPosition> }[]
  ): void {
    for (const upd of updates) {
      const idx = this.state.stocks.findIndex((s) => s.id === upd.id);
      if (idx < 0) {
        throw new Error(`applyPlan: stock update target ${upd.id} not found`);
      }
      const merged = {
        ...this.state.stocks[idx],
        ...upd.patch,
        updated_at: new Date().toISOString(),
      };
      this.state.stocks[idx] = merged as StockPosition;
    }
  }

  private applyStockDeletes(deletes: { id: string }[]): void {
    for (const d of deletes) {
      const idx = this.state.stocks.findIndex((s) => s.id === d.id);
      if (idx < 0) {
        throw new Error(`applyPlan: stock delete target ${d.id} not found`);
      }
      this.state.stocks.splice(idx, 1);
    }
  }

  private applyGroupUpserts(upserts: { name: string; addTradeIds: string[] }[]): void {
    for (const up of upserts) {
      const existing = this.state.groups.find((g) => g.name === up.name);
      const now = new Date().toISOString();
      if (existing) {
        const merged = [...existing.trade_ids];
        for (const id of up.addTradeIds) {
          if (!merged.includes(id)) merged.push(id);
        }
        existing.trade_ids = merged;
        existing.updated_at = now;
      } else {
        this.state.groups.push({
          id: this.newId('g'),
          user_id: this.userId,
          name: up.name,
          trade_ids: [...up.addTradeIds],
          created_at: now,
          updated_at: now,
        });
      }
    }
  }

  // -- trade construction helpers --

  private makeTrade(ins: TradeInsert): Trade {
    const now = new Date().toISOString();
    // The TradeInsert type is a discriminated union; cast through unknown
    // because TS can't narrow Omit<Trade,...> & user_id-injection without
    // re-declaring every variant.
    return {
      ...ins,
      user_id: this.userId,
      created_at: now,
      updated_at: now,
    } as unknown as Trade;
  }

  private mergeTrade(t: Trade, patch: Partial<Trade>): Trade {
    return {
      ...t,
      ...patch,
      updated_at: new Date().toISOString(),
    } as Trade;
  }

  private newId(prefix: string): string {
    // Random suffix avoids collisions when re-seeded ids are still in flight.
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
