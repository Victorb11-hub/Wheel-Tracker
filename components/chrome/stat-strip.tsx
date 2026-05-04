'use client';

import { buildOverviewStats } from '@/lib/data/overview-stats';
import { useFullState } from '@/lib/queries/use-state';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'positive' | 'negative' | 'neutral';
}

function StatCard({ label, value, sub, tone = 'neutral' }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-wider text-text-faint">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums leading-tight',
          tone === 'positive' && 'text-credit',
          tone === 'negative' && 'text-debit'
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-sm text-text-muted">{sub}</div>}
    </div>
  );
}

// Subscribes to the React Query cache directly. With initialData on
// useFullState, SSR + client-hydration both render from the seed snapshot,
// so first paint matches and subsequent mutations re-derive cards live.
export function StatStrip() {
  const { data: state } = useFullState();
  const cards = state ? buildOverviewStats(state) : [];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <StatCard key={c.label} {...c} />
      ))}
    </div>
  );
}
