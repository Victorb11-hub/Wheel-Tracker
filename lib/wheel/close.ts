import type { RegularLeg, Trade } from '../../types/trade';
import {
  CloseInput,
  emptyPlan,
  Plan,
  PlannerCtx,
  TradeInsert,
  WheelState,
} from './plan';

const isClosableLeg = (t: Trade): t is RegularLeg =>
  t.action === 'sell' || t.action === 'buy';

// Manual close per spec § "Closing manually":
// 1. Mark original closed, stamp date_closed + close_price.
// 2. Insert a synthetic opposite-action leg flagged is_closing_trade=true.
// 3. If trade_ref present, find-or-create `Trade Ref: {ref}` group with both ids.
export function planClose(
  input: CloseInput,
  state: WheelState,
  ctx: PlannerCtx
): Plan {
  const original = state.trades.find((t) => t.id === input.trade_id);
  if (!original) throw new Error(`planClose: trade ${input.trade_id} not found`);
  if (!isClosableLeg(original)) {
    throw new Error('planClose: only sell/buy legs can be manually closed');
  }
  if (original.status !== 'open') {
    throw new Error(`planClose: trade ${input.trade_id} is not open`);
  }

  const closingId = ctx.newId();
  const oppositeAction = original.action === 'sell' ? 'buy' : 'sell';

  const closingInsert: TradeInsert = {
    id: closingId,
    trade_ref: original.trade_ref,
    account: original.account,
    symbol: original.symbol,
    contracts: original.contracts,
    strike: original.strike,
    premium: input.closing_premium,
    action: oppositeAction,
    type: original.type,
    date_opened: input.close_date,
    date_closed: input.close_date,
    exp_date: original.exp_date,
    price_at_action: null,
    info: input.closing_notes,
    status: 'closed',
    close_price: null,
    closing_notes: input.closing_notes,
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

  const plan: Plan = {
    ...emptyPlan(),
    tradeUpdates: [
      {
        id: original.id,
        patch: {
          status: 'closed',
          date_closed: input.close_date,
          close_price: input.closing_premium,
          closing_notes: input.closing_notes,
        },
      },
    ],
    tradeInserts: [closingInsert],
  };

  if (original.trade_ref) {
    const groupName = `Trade Ref: ${original.trade_ref}`;
    const existing = state.groups.find((g) => g.name === groupName);
    const idsToAdd = existing
      ? [original.id, closingId].filter((id) => !existing.trade_ids.includes(id))
      : [original.id, closingId];
    plan.groupUpserts = [{ name: groupName, addTradeIds: idsToAdd }];
  }

  return plan;
}
