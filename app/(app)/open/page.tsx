'use client';

import { AllOpenTable } from '@/components/trades/all-open-table';
import { useFullState } from '@/lib/queries/use-state';

export default function OpenPositionsPage() {
  const { data: state, isLoading } = useFullState();

  if (isLoading || !state) {
    return (
      <div className="mt-6 rounded-lg border border-border bg-surface p-12 text-center text-sm text-text-muted">
        Loading…
      </div>
    );
  }

  const openTrades = state.trades.filter((t) => t.status === 'open');
  const closedTrades = state.trades.filter((t) => t.status !== 'open');

  return (
    <>
      <div className="mb-3 mt-6 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">All Open Positions</h2>
        <p className="text-sm text-text-muted">
          {openTrades.length + state.stocks.length} active · sorted by Date Opened ↓
        </p>
      </div>

      <AllOpenTable
        trades={state.trades}
        stocks={state.stocks}
        closedTrades={closedTrades}
      />
    </>
  );
}
