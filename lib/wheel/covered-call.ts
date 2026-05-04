import {
  emptyPlan,
  Plan,
  PlannerCtx,
  SellCoveredCallInput,
  TradeInsert,
  WheelState,
} from './plan';

// Sell covered call against an assigned stock per spec § "Sell covered call":
// 1. Insert a sell+call trade with is_covered_call=true and linked_stock_id.
//    Inherits symbol/account/trade_ref from the stock_position.
//    Contracts = stock.shares / 100 (one call per 100 shares).
// 2. Append the call snapshot to stock_position.covered_calls (denormalized).
export function planSellCoveredCall(
  input: SellCoveredCallInput,
  state: WheelState,
  ctx: PlannerCtx
): Plan {
  const stock = state.stocks.find((s) => s.id === input.stock_id);
  if (!stock) {
    throw new Error(`planSellCoveredCall: stock ${input.stock_id} not found`);
  }
  if (stock.status !== 'holding') {
    throw new Error(
      `planSellCoveredCall: stock ${input.stock_id} is not holding`
    );
  }
  if (stock.shares % 100 !== 0) {
    throw new Error(
      `planSellCoveredCall: stock has non-integer-contract shares (${stock.shares})`
    );
  }

  const contracts = stock.shares / 100;
  const callId = ctx.newId();

  const insert: TradeInsert = {
    id: callId,
    trade_ref: stock.trade_ref,
    account: stock.account,
    symbol: stock.symbol,
    contracts,
    strike: input.strike,
    premium: input.premium,
    action: 'sell',
    type: 'call',
    date_opened: input.dateOpened,
    date_closed: null,
    exp_date: input.expDate,
    price_at_action: null,
    info: input.notes,
    status: 'open',
    close_price: null,
    closing_notes: null,
    is_closing_trade: false,
    is_rolled: false,
    is_covered_call: true,
    is_assignment: false,
    is_called_away: false,
    linked_stock_id: stock.id,
    assigned_price: null,
    full_cycle_pl: null,
    cycle_details: null,
  };

  // Denormalized snapshot — premium stored in dollars per spec.
  const totalPremium = input.premium * contracts * 100;
  const newCallSnapshot = {
    strike: input.strike,
    premium: totalPremium,
    expDate: input.expDate,
    dateOpened: input.dateOpened,
    notes: input.notes,
  };

  return {
    ...emptyPlan(),
    tradeInserts: [insert],
    stockUpdates: [
      {
        id: stock.id,
        patch: {
          covered_calls: [...stock.covered_calls, newCallSnapshot],
        },
      },
    ],
  };
}
