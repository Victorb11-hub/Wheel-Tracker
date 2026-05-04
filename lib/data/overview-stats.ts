import {
  calculateCashRequired,
  calculatePL,
} from '../calculations';
import { getClosedGroups } from '../closed-groups';
import type { FullState } from './client';
import type { StatCardProps } from '@/components/chrome/stat-strip';
import { fmtSignedPct, fmtSignedUSD, fmtUSD } from '@/components/trades/format';

// Stat-strip computations shared across every (app) page so the chrome stays
// consistent. Hoisted out of the Open Positions page so it's a single source
// of truth that can be unit-tested later.
export function buildOverviewStats(state: FullState): StatCardProps[] {
  const openTrades = state.trades.filter((t) => t.status === 'open');
  const closedTrades = state.trades.filter((t) => t.status !== 'open');

  const totalPL = state.trades.reduce(
    (sum, t) => (t.is_closing_trade ? sum : sum + calculatePL(t, closedTrades)),
    0
  );

  const closedGroups = getClosedGroups(state.groups, state.trades);

  const groupReturns = closedGroups.map((g) => {
    const ts = g.trade_ids
      .map((id) => state.trades.find((x) => x.id === id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    const profit = ts.reduce(
      (sum, t) => (t.is_closing_trade ? sum : sum + calculatePL(t, closedTrades)),
      0
    );
    const first = ts[0];
    const cash =
      first && (first.action === 'sell' || first.action === 'buy')
        ? calculateCashRequired(first)
        : 0;
    return cash > 0 ? (profit / cash) * 100 : 0;
  });
  const overallReturn = groupReturns.reduce((s, x) => s + x, 0);

  const totalCollateral = openTrades.reduce(
    (sum, t) =>
      t.action === 'sell' || t.action === 'buy'
        ? sum + calculateCashRequired(t)
        : sum,
    0
  );

  const openPuts = openTrades.filter(
    (t) => t.action === 'sell' && t.type === 'put'
  ).length;
  const openCalls = openTrades.filter(
    (t) => t.action === 'sell' && t.type === 'call'
  ).length;

  const fullWheels = state.groups.filter((g) =>
    g.name.includes('Full Wheel Cycle')
  ).length;
  const wins = closedGroups.length - fullWheels;

  const cashSecuredCount = openTrades.filter(
    (t) =>
      (t.action === 'sell' || t.action === 'buy') && calculateCashRequired(t) > 0
  ).length;

  return [
    {
      label: 'Total P&L',
      value: fmtSignedUSD(totalPL),
      sub: 'All open + closed',
      tone: totalPL >= 0 ? 'positive' : 'negative',
    },
    {
      label: 'Overall Return',
      value: fmtSignedPct(overallReturn.toFixed(2)),
      sub: 'On closed groups',
      tone: overallReturn >= 0 ? 'positive' : 'negative',
    },
    {
      label: 'Total Collateral',
      value: fmtUSD(totalCollateral, { cents: false }),
      sub: `${cashSecuredCount} cash-secured legs`,
    },
    {
      label: 'Open Positions',
      value: String(openTrades.length),
      sub: `${openPuts} puts · ${openCalls} covered calls`,
    },
    {
      label: 'Closed Groups',
      value: String(closedGroups.length),
      sub: `${wins} wins · ${fullWheels} full wheel`,
    },
  ];
}

export function buildTabs(state: FullState) {
  const openTrades = state.trades.filter((t) => t.status === 'open');
  const closedGroups = getClosedGroups(state.groups, state.trades);
  return [
    { href: '/dashboard', label: 'Dashboard' },
    {
      href: '/open',
      label: 'Open Positions',
      count: openTrades.length + state.stocks.length,
    },
    { href: '/groups', label: 'Closed Groups', count: closedGroups.length },
    { href: '/trades', label: 'All Trades', count: state.trades.length },
    { href: '/stocks', label: 'Stock Positions', count: state.stocks.length },
  ];
}
