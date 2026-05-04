import type { AssignmentRow, RegularLeg, Trade } from '../../types/trade';
import {
  AssignInput,
  emptyPlan,
  Plan,
  PlannerCtx,
  StockInsert,
  WheelState,
} from './plan';

const isSellPut = (
  t: Trade
): t is RegularLeg & { action: 'sell'; type: 'put' } =>
  t.action === 'sell' && t.type === 'put';

// Assignment per spec § "Assignment":
// 1. Create stock_position from the assigned put (snapshot the put on the row).
// 2. Mark put status='assigned', stamp date_closed + assigned_price + closing_notes.
// 3. Insert a synthetic ASSIGNMENT row in trades for the audit log.
export function planAssign(
  input: AssignInput,
  state: WheelState,
  ctx: PlannerCtx
): Plan {
  const put = state.trades.find((t) => t.id === input.trade_id);
  if (!put) throw new Error(`planAssign: trade ${input.trade_id} not found`);
  if (!isSellPut(put)) {
    throw new Error('planAssign: only sold puts can be assigned');
  }
  if (put.status !== 'open') {
    throw new Error(`planAssign: put ${input.trade_id} is not open`);
  }

  const stockId = ctx.newId();
  const assignmentTradeId = ctx.newId();
  const shares = put.contracts * 100;
  const totalCost = put.strike * shares;
  const totalValue = input.assignmentPrice * shares;
  const premiumCollected = put.premium * put.contracts * 100;

  const stockInsert: StockInsert = {
    id: stockId,
    symbol: put.symbol,
    shares,
    cost_basis: put.strike,
    assigned_price: input.assignmentPrice,
    total_cost: totalCost,
    total_value: totalValue,
    assigned_date: input.assignDate,
    original_put_id: put.id,
    original_put: {
      strike: put.strike,
      premium: put.premium,
      contracts: put.contracts,
      dateOpened: put.date_opened,
      tradeRef: put.trade_ref,
      premiumCollected,
    },
    covered_calls: [],
    account: put.account,
    trade_ref: put.trade_ref,
    status: 'holding',
  };

  const assignmentInsert: AssignmentRow & { id: string } = {
    id: assignmentTradeId,
    user_id: '',                  // filled by DataClient
    trade_ref: put.trade_ref,
    account: put.account,
    symbol: put.symbol,
    contracts: put.contracts,
    strike: put.strike,
    premium: 0,
    action: 'assignment',
    type: 'stock',
    date_opened: input.assignDate,
    date_closed: input.assignDate,
    exp_date: put.exp_date,
    price_at_action: input.assignmentPrice,
    info:
      input.assignmentNotes ??
      `Assigned ${shares} shares at $${input.assignmentPrice}`,
    status: 'closed',
    close_price: null,
    closing_notes: input.assignmentNotes,
    is_closing_trade: false,
    is_rolled: false,
    is_covered_call: false,
    is_assignment: true,
    is_called_away: false,
    linked_stock_id: stockId,
    assigned_price: input.assignmentPrice,
    full_cycle_pl: null,
    cycle_details: null,
    created_at: '',
    updated_at: '',
  };

  return {
    ...emptyPlan(),
    tradeUpdates: [
      {
        id: put.id,
        patch: {
          status: 'assigned',
          date_closed: input.assignDate,
          assigned_price: input.assignmentPrice,
          closing_notes: input.assignmentNotes,
        },
      },
    ],
    tradeInserts: [
      {
        id: assignmentInsert.id,
        trade_ref: assignmentInsert.trade_ref,
        account: assignmentInsert.account,
        symbol: assignmentInsert.symbol,
        contracts: assignmentInsert.contracts,
        strike: assignmentInsert.strike,
        premium: assignmentInsert.premium,
        action: assignmentInsert.action,
        type: assignmentInsert.type,
        date_opened: assignmentInsert.date_opened,
        date_closed: assignmentInsert.date_closed,
        exp_date: assignmentInsert.exp_date,
        price_at_action: assignmentInsert.price_at_action,
        info: assignmentInsert.info,
        status: assignmentInsert.status,
        close_price: assignmentInsert.close_price,
        closing_notes: assignmentInsert.closing_notes,
        is_closing_trade: assignmentInsert.is_closing_trade,
        is_rolled: assignmentInsert.is_rolled,
        is_covered_call: assignmentInsert.is_covered_call,
        is_assignment: true,
        is_called_away: false,
        linked_stock_id: assignmentInsert.linked_stock_id,
        assigned_price: assignmentInsert.assigned_price,
        full_cycle_pl: null,
        cycle_details: null,
      },
    ],
    stockInserts: [stockInsert],
  };
}
