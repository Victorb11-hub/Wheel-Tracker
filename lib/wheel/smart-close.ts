import type { RegularLeg, Trade } from '../../types/trade';
import {
  AddPositionInput,
  emptyPlan,
  Plan,
  PlannerCtx,
  TradeInsert,
  WheelState,
} from './plan';

const isOpenSellPutOrCall = (
  t: Trade
): t is RegularLeg & { action: 'sell'; status: 'open' } =>
  t.action === 'sell' &&
  t.status === 'open' &&
  (t.type === 'put' || t.type === 'call');

// "Smart-close detection" per spec § Smart-close:
// Triggered when adding a new trade with action=buy AND a trade_ref.
// Match an open sell+put/call with same trade_ref + symbol; strike must match
// unless input.strike is null/0 (caller signaled "match any").
export function detectSmartCloseMatch(
  input: AddPositionInput,
  openTrades: Trade[]
): RegularLeg | null {
  if (input.action !== 'buy') return null;
  if (!input.trade_ref) return null;

  const symbol = input.symbol.toUpperCase();
  const matchAnyStrike = input.strike == null || input.strike === 0;

  for (const t of openTrades) {
    if (!isOpenSellPutOrCall(t)) continue;
    if (t.trade_ref !== input.trade_ref) continue;
    if (t.symbol !== symbol) continue;
    if (!matchAnyStrike && t.strike !== input.strike) continue;
    return t;
  }
  return null;
}

// Build the smart-close Plan: mark the matched sell as closed, insert the
// closing BUY row, and ensure a `Trade Ref: {ref}` group exists with both ids.
export function planSmartClose(
  input: AddPositionInput,
  match: RegularLeg,
  state: WheelState,
  ctx: PlannerCtx
): Plan {
  if (!input.trade_ref) {
    throw new Error('planSmartClose requires input.trade_ref');
  }

  const buyId = ctx.newId();
  const symbol = input.symbol.toUpperCase();

  const buyInsert: TradeInsert = {
    id: buyId,
    trade_ref: input.trade_ref,
    account: input.account ?? match.account,
    symbol,
    contracts: input.contracts,
    strike:
      input.strike == null || input.strike === 0 ? match.strike : input.strike,
    premium: input.premium,
    action: 'buy',
    type: input.type ?? match.type,
    date_opened: input.date_opened,
    date_closed: input.date_opened,
    exp_date: input.exp_date ?? match.exp_date,
    price_at_action: input.price_at_action,
    info: input.info,
    status: 'closed',
    close_price: null,
    closing_notes: null,
    is_closing_trade: true,
    is_rolled: false,
    is_covered_call: false,
    is_assignment: false,
    is_called_away: false,
    linked_stock_id: null,
    assigned_price: null,
    full_cycle_pl: null,
    cycle_details: null,
  };

  const groupName = `Trade Ref: ${input.trade_ref}`;
  const existing = state.groups.find((g) => g.name === groupName);
  const idsToAdd = existing
    ? [match.id, buyId].filter((id) => !existing.trade_ids.includes(id))
    : [match.id, buyId];

  return {
    ...emptyPlan(),
    tradeUpdates: [
      {
        id: match.id,
        patch: {
          status: 'closed',
          date_closed: input.date_opened,
        },
      },
    ],
    tradeInserts: [buyInsert],
    groupUpserts: [{ name: groupName, addTradeIds: idsToAdd }],
  };
}

// Plain-add fallback: when smart-close doesn't apply, just insert the row
// as-is. No group handling, no buyback linkage.
export function planPlainAdd(
  input: AddPositionInput,
  ctx: PlannerCtx
): Plan {
  if (input.type == null) {
    throw new Error('planPlainAdd requires input.type');
  }
  if (input.strike == null) {
    throw new Error('planPlainAdd requires input.strike');
  }

  const id = ctx.newId();
  const insert: TradeInsert = {
    id,
    trade_ref: input.trade_ref,
    account: input.account,
    symbol: input.symbol.toUpperCase(),
    contracts: input.contracts,
    strike: input.strike,
    premium: input.premium,
    action: input.action,
    type: input.type,
    date_opened: input.date_opened,
    date_closed: null,
    exp_date: input.exp_date,
    price_at_action: input.price_at_action,
    info: input.info,
    status: 'open',
    close_price: null,
    closing_notes: null,
    is_closing_trade: false,
    is_rolled: false,
    is_covered_call: false,
    is_assignment: false,
    is_called_away: false,
    linked_stock_id: null,
    assigned_price: null,
    full_cycle_pl: null,
    cycle_details: null,
  };

  return { ...emptyPlan(), tradeInserts: [insert] };
}

// Top-level entry: pick smart-close or plain-add.
export function planAddTrade(
  input: AddPositionInput,
  state: WheelState,
  ctx: PlannerCtx
): Plan {
  const openTrades = state.trades.filter((t) => t.status === 'open');
  const match = detectSmartCloseMatch(input, openTrades);
  if (match) return planSmartClose(input, match, state, ctx);
  return planPlainAdd(input, ctx);
}
