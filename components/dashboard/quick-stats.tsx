import { fmtSignedUSD } from '@/components/trades/format';
import type { QuickStats } from '@/lib/dashboard-stats';
import { cn } from '@/lib/utils';

export function QuickStatsCard({ stats }: { stats: QuickStats }) {
  const Stat = ({
    label,
    value,
    tone,
  }: {
    label: string;
    value: string;
    tone: 'positive' | 'negative' | 'neutral';
  }) => (
    <div className="flex-1 rounded-md border border-border bg-surface-raised p-4">
      <div className="text-xs uppercase tracking-wider text-text-faint">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-xl font-bold tabular-nums',
          tone === 'positive' && 'text-credit',
          tone === 'negative' && 'text-debit'
        )}
      >
        {value}
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-text-faint">
        Quick Stats
      </h3>
      <div className="flex flex-col gap-3 md:flex-row">
        <Stat
          label="Avg Trade P&L"
          value={fmtSignedUSD(stats.avg)}
          tone={stats.avg >= 0 ? 'positive' : 'negative'}
        />
        <Stat
          label="Best Trade"
          value={fmtSignedUSD(stats.best)}
          tone="positive"
        />
        <Stat
          label="Worst Trade"
          value={fmtSignedUSD(stats.worst)}
          tone={stats.worst >= 0 ? 'positive' : 'negative'}
        />
      </div>
      <p className="mt-3 text-xs text-text-faint">
        Across {stats.count} closed group{stats.count === 1 ? '' : 's'}
      </p>
    </div>
  );
}
