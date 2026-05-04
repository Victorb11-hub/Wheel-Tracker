'use client';

import { AllTradesTable } from '@/components/trades/all-trades-table';
import { useFullState } from '@/lib/queries/use-state';

export default function AllTradesPage() {
  const { data: state, isLoading } = useFullState();

  if (isLoading || !state) {
    return (
      <div className="mt-6 rounded-lg border border-border bg-surface p-12 text-center text-sm text-text-muted">
        Loading…
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 mt-6 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">All Trades</h2>
        <p className="text-sm text-text-muted">
          {state.trades.length} total leg{state.trades.length === 1 ? '' : 's'} ·
          audit log of every trade event
        </p>
      </div>

      <AllTradesTable
        trades={state.trades}
        accounts={state.accounts}
        groups={state.groups}
        stocks={state.stocks}
      />
    </>
  );
}
