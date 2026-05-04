import type { CalledAwayRow, RegularLeg, Trade } from '../../types/trade';
import {
  CalledAwayInput,
  emptyPlan,
  Plan,
  PlannerCtx,
  TradeInsert,
  WheelState,
} from './plan';

const isOpenCoveredCall = (
  t: Trade
): t is RegularLeg & { action: 'sell'; type: 'call'; status: 'open' } =>
  t.action === 'sell' &&
  t.type === 'call' &&
  t.status === 'open' &&
  !t.is_closing_trade;

// Find open covered calls associated with this stock per spec § "Called away":
// Try in order: linked_stock_id → symbol+trade_ref+is_covered_call → symbol+is_covered_call.
// Returns the first non-empty result.
function findOpenCoveredCalls(
  trades: Trade[],
  stockId: string,
  symbol: string,
  tradeRef: string | null
): RegularLeg[] {
  const open = trades.filter(isOpenCoveredCall);

  const byLinkedStock = open.filter((t) => t.linked_stock_id === stockId);
  if (byLinkedStock.length > 0) return byLinkedStock;

  if (tradeRef) {
    const byRef = open.filter(
      (t) =>
        t.symbol === symbol &&
        t.trade_ref === tradeRef &&
        t.is_covered_call
    );
    if (byRef.length > 0) return byRef;
  }

  return open.filter((t) => t.symbol === symbol && t.is_covered_call);
}

// Called away per spec § "Called away" — closes the entire wheel cycle.
// 1. Compute total cycle P&L from put premium + call premiums + stock profit.
// 2. Close any open covered calls for this stock (close_price=0, exercised note).
// 3. Insert a synthetic CALLED-AWAY trade row with cycle_details + full_cycle_pl.
// 4. Build/update the "Trade Ref: {ref} - Full Wheel Cycle" group with the
//    original PUT, ASSIGNMENT row, all covered-call SELLs, and the called-away row.
// 5. Delete the stock_position.
export function planCalledAway(
  input: CalledAwayInput,
  state: WheelState,
  ctx: PlannerCtx
): Plan {
  const stock = state.stocks.find((s) => s.id === input.stock_id);
  if (!stock) {
    throw new Error(`planCalledAway: stock ${input.stock_id} not found`);
  }
  if (stock.status !== 'holding') {
    throw new Error(`planCalledAway: stock ${input.stock_id} is not holding`);
  }

  // 1. Cycle P&L
  const putPremium = stock.original_put.premiumCollected;
  const callPremiums = stock.covered_calls.reduce(
    (sum, c) => sum + c.premium,
    0
  );
  const stockProfit = (input.salePrice - stock.assigned_price) * stock.shares;
  const totalPL = putPremium + callPremiums + stockProfit;

  // 2. Close open covered calls
  const openCalls = findOpenCoveredCalls(
    state.trades,
    stock.id,
    stock.symbol,
    stock.trade_ref
  );
  const callUpdates = openCalls.map((c) => ({
    id: c.id,
    patch: {
      status: 'closed' as const,
      date_closed: input.calledAwayDate,
      close_price: 0,
      closing_notes: `Exercised - Stock called away at $${input.salePrice}`,
    },
  }));

  // 3. Synthetic called-away row
  const calledAwayId = ctx.newId();
  const contracts = stock.shares / 100;
  const calledAwayInfo =
    input.notes ??
    `Called away at $${input.salePrice} - Total P&L: $${totalPL}`;

  const calledAwayInsert: TradeInsert = {
    id: calledAwayId,
    trade_ref: stock.trade_ref,
    account: stock.account,
    symbol: stock.symbol,
    contracts,
    strike: input.salePrice,
    premium: 0,
    action: 'called-away',
    type: 'stock',
    date_opened: input.calledAwayDate,
    date_closed: input.calledAwayDate,
    exp_date: null,
    price_at_action: input.salePrice,
    info: calledAwayInfo,
    status: 'closed',
    close_price: null,
    closing_notes: null,
    is_closing_trade: false,
    is_rolled: false,
    is_covered_call: false,
    is_assignment: false,
    is_called_away: true,
    linked_stock_id: stock.id,
    assigned_price: null,
    full_cycle_pl: totalPL,
    cycle_details: {
      putPremium,
      callPremiums,
      stockProfit,
      assignedPrice: stock.assigned_price,
      salePrice: input.salePrice,
    },
  };

  const plan: Plan = {
    ...emptyPlan(),
    tradeUpdates: callUpdates,
    tradeInserts: [calledAwayInsert],
    stockDeletes: [{ id: stock.id }],
  };

  // 4. Full Wheel Cycle group (only when trade_ref is set)
  if (stock.trade_ref) {
    const groupName = `Trade Ref: ${stock.trade_ref} - Full Wheel Cycle`;

    // Collect: original PUT (assigned), ASSIGNMENT row, all covered-call SELLs
    // (excluding any is_closing_trade buys), the new CALLED-AWAY row.
    const symbol = stock.symbol;
    const ref = stock.trade_ref;

    const putId = stock.original_put_id;
    const assignmentRowIds = state.trades
      .filter(
        (t) =>
          t.is_assignment &&
          t.symbol === symbol &&
          t.trade_ref === ref
      )
      .map((t) => t.id);
    const coveredCallSellIds = state.trades
      .filter(
        (t) =>
          t.is_covered_call &&
          t.action === 'sell' &&
          !t.is_closing_trade &&
          t.symbol === symbol &&
          t.trade_ref === ref
      )
      .map((t) => t.id);

    const desiredIds = Array.from(
      new Set(
        [
          putId,
          ...assignmentRowIds,
          ...coveredCallSellIds,
          calledAwayId,
        ].filter((id): id is string => Boolean(id))
      )
    );

    const existing = state.groups.find((g) => g.name === groupName);
    const idsToAdd = existing
      ? desiredIds.filter((id) => !existing.trade_ids.includes(id))
      : desiredIds;

    plan.groupUpserts = [{ name: groupName, addTradeIds: idsToAdd }];
  }

  return plan;
}
