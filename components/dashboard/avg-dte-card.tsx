import type { AvgDTEResult } from '@/lib/dashboard-stats';

export function AvgDTECard({ result }: { result: AvgDTEResult }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="text-xs font-medium uppercase tracking-wider text-text-faint">
        Avg Days to Expiration
      </h3>
      <div className="mt-2 text-3xl font-bold tabular-nums leading-tight text-text">
        {result.count > 0 ? Math.round(result.avg) : '—'}
      </div>
      <p className="mt-1 text-sm text-text-muted">
        {result.count > 0
          ? `Range: ${result.min}–${result.max} days`
          : 'No open option legs'}
      </p>
      <p className="mt-0.5 text-xs text-text-faint">
        Across {result.count} open leg{result.count === 1 ? '' : 's'}
      </p>
    </div>
  );
}
