import { StockPositionCard } from '@/components/stocks/stock-position-card';
import { fmtSignedUSD } from '@/components/trades/format';
import { buildSeed } from '@/lib/data/seed';

export default function StockPositionsPage() {
  const state = buildSeed();

  // Holding only — called-away cycles live in Closed Groups as Full Wheel
  // Cycle groups; no duplication on this tab.
  const holding = state.stocks
    .filter((s) => s.status === 'holding')
    .sort((a, b) => b.assigned_date.localeCompare(a.assigned_date));

  // Running P&L per stock = put premium + sum of covered call premiums.
  const totalRunning = holding.reduce((sum, s) => {
    const put = s.original_put.premiumCollected;
    const calls = s.covered_calls.reduce((cs, c) => cs + c.premium, 0);
    return sum + put + calls;
  }, 0);

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Stock Positions
          </h2>
          <p className="text-sm text-text-muted">
            {holding.length} held position{holding.length === 1 ? '' : 's'} ·
            running{' '}
            <span
              className={
                totalRunning >= 0 ? 'text-credit' : 'text-debit'
              }
            >
              {fmtSignedUSD(totalRunning)}
            </span>
          </p>
        </div>
      </div>

      {holding.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-12 text-center">
          <p className="text-sm text-text-muted">
            No held stock positions. Assigned shares will appear here while
            you&rsquo;re writing covered calls against them.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {holding.map((s) => (
            <StockPositionCard
              key={s.id}
              stock={s}
              trades={state.trades}
            />
          ))}
        </div>
      )}
    </div>
  );
}
