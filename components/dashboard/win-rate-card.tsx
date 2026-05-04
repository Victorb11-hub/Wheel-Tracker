import { cn } from '@/lib/utils';
import type { WinRateResult } from '@/lib/dashboard-stats';

export function WinRateCard({ result }: { result: WinRateResult }) {
  const isHigh = result.rate >= 50;
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-text-faint">
          Win Rate
        </h3>
        <button
          className="text-xs text-text-muted hover:text-text"
          aria-label="What counts as a win?"
          title="Win Rate methodology"
        >
          ⓘ
        </button>
      </div>
      <div
        className={cn(
          'mt-2 text-3xl font-bold tabular-nums leading-tight',
          isHigh ? 'text-credit' : 'text-debit'
        )}
      >
        {result.rate.toFixed(1)}%
      </div>
      <p className="mt-1 text-sm text-text-muted">
        {result.wins} winning · {result.losses} losing
      </p>
      <p className="mt-0.5 text-xs text-text-faint">
        Based on {result.groupCount} closed group
        {result.groupCount === 1 ? '' : 's'}
      </p>
    </div>
  );
}
