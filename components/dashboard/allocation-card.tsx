import { fmtUSD } from '@/components/trades/format';
import type { AllocationRow } from '@/lib/dashboard-stats';

export function AllocationCard({ rows }: { rows: AllocationRow[] }) {
  return (
    <div className="col-span-2 rounded-xl border border-border bg-surface p-5">
      <h3 className="text-xs font-medium uppercase tracking-wider text-text-faint">
        Portfolio Allocation by Symbol
      </h3>
      <div className="mt-4 space-y-3">
        {rows.length === 0 && (
          <p className="text-sm text-text-muted">No open positions.</p>
        )}
        {rows.map((r) => (
          <div key={r.symbol}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-semibold">{r.symbol}</span>
              <span className="tabular-nums text-text-muted">
                {fmtUSD(r.cash, { cents: false })} ·{' '}
                <span className="text-credit">{r.pct.toFixed(1)}%</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${r.pct}%`,
                  background: 'var(--color-credit-gradient)',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
