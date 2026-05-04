import type { RegularLeg, Trade } from '../../types/trade';
import {
  emptyPlan,
  Plan,
  PlannerCtx,
  RollInput,
  TradeInsert,
  WheelState,
} from './plan';

const isClosableLeg = (t: Trade): t is RegularLeg =>
  t.action === 'sell' || t.action === 'buy';

// Roll per spec § "Rolling":
// 1. Mark original closed, is_rolled=true.
// 2. Insert buy-to-close leg (is_closing_trade + is_rolled, action flipped).
// 3. Insert new opening leg (status=open, is_rolled=true, same trade_ref).
// 4. Group: only the two CLOSED legs go into the group; the new open leg stays
//    out until it itself gets closed/rolled later.
export function planRoll(
  input: RollInput,
  state: WheelState,
  ctx: PlannerCtx
): Plan {
  const original = state.trades.find((t) => t.id === input.trade_id);
  if (!original) throw new Error(`planRoll: trade ${input.trade_id} not found`);
  if (!isClosableLeg(original)) {
    throw new Error('planRoll: only sell/buy legs can be rolled');
  }
  if (original.status !== 'open') {
    throw new Error(`planRoll: trade ${input.trade_id} is not open`);
  }

  const closingId = ctx.newId();
  const newLegId = ctx.newId();
  const oppositeAction = original.action === 'sell' ? 'buy' : 'sell';
  const closingInfo = input.rollNotes
    ? `Roll close: ${input.rollNotes}`
    : 'Rolled - closing leg';
  const openingInfo = input.rollNotes
    ? `Rolled: ${input.rollNotes}`
    : 'Rolled - new leg';

  const closingInsert: TradeInsert = {
    id: closingId,
    trade_ref: original.trade_ref,
    account: original.account,
    symbol: original.symbol,
    contracts: original.contracts,
    strike: original.strike,
    premium: input.rollClosingPremium,
    action: oppositeAction,
    type: original.type,
    date_opened: input.rollCloseDate,
    date_closed: input.rollCloseDate,
    exp_date: original.exp_date,
    price_at_action: null,
    info: closingInfo,
    status: 'closed',
    close_price: null,
    closing_notes: null,
    is_closing_trade: true,
    is_rolled: true,
    is_covered_call: false,
    is_assignment: false,
    is_called_away: false,
    linked_stock_id: null,
    assigned_price: null,
    full_cycle_pl: null,
    cycle_details: null,
  };

  const newLegInsert: TradeInsert = {
    id: newLegId,
    trade_ref: original.trade_ref,
    account: original.account,
    symbol: original.symbol,
    contracts: original.contracts,
    strike: input.rollNewStrike,
    premium: input.rollNewPremium,
    action: 'sell',
    type: input.rollNewType,
    date_opened: input.rollCloseDate,
    date_closed: null,
    exp_date: input.rollNewExpDate,
    price_at_action: input.rollPriceAtAction,
    info: openingInfo,
    status: 'open',
    close_price: null,
    closing_notes: null,
    is_closing_trade: false,
    is_rolled: true,
    is_covered_call: original.is_covered_call,
    is_assignment: false,
    is_called_away: false,
    linked_stock_id: original.linked_stock_id,
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
          date_closed: input.rollCloseDate,
          is_rolled: true,
          close_price: input.rollClosingPremium,
        },
      },
    ],
    tradeInserts: [closingInsert, newLegInsert],
  };

  if (original.trade_ref) {
    const groupName = `Trade Ref: ${original.trade_ref}`;
    const existing = state.groups.find((g) => g.name === groupName);
    // Only the two closed-leg ids go into the group. New open leg stays out.
    const desired = [original.id, closingId];
    const idsToAdd = existing
      ? desired.filter((id) => !existing.trade_ids.includes(id))
      : desired;
    plan.groupUpserts = [{ name: groupName, addTradeIds: idsToAdd }];
  }

  return plan;
}
