import { AllTradesTable } from '@/components/trades/all-trades-table';
import { buildSeed } from '@/lib/data/seed';

export default function AllTradesPage() {
  const state = buildSeed();

  return (
    <>
      <div className="mb-3 mt-6 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">All Trades</h2>
        <p className="text-sm text-text-muted">
          {state.trades.length} total leg{state.trades.length === 1 ? '' : 's'} ·
          audit log of every trade event
        </p>
      </div>

      <AllTradesTable trades={state.trades} />
    </>
  );
}
