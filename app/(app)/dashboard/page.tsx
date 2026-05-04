'use client';

import { AllocationCard } from '@/components/dashboard/allocation-card';
import { AvgDTECard } from '@/components/dashboard/avg-dte-card';
import { QuickStatsCard } from '@/components/dashboard/quick-stats';
import { WeeklyPremiumSection } from '@/components/dashboard/weekly-premium-section';
import { WinRateCard } from '@/components/dashboard/win-rate-card';
import {
  computeAllocation,
  computeAvgDTE,
  computeQuickStats,
  computeWinRate,
} from '@/lib/dashboard-stats';
import { useFullState } from '@/lib/queries/use-state';

export default function DashboardPage() {
  const { data: state, isLoading } = useFullState();

  if (isLoading || !state) {
    return (
      <div className="mt-6 rounded-lg border border-border bg-surface p-12 text-center text-sm text-text-muted">
        Loading…
      </div>
    );
  }

  // Anchor "now" to seed-today (2026-05-01) so DTE is stable in dev review.
  const now = new Date(2026, 4, 1);

  const winRate = computeWinRate(state.groups, state.trades);
  const avgDTE = computeAvgDTE(state.trades, now);
  const allocation = computeAllocation(state.trades);
  const quickStats = computeQuickStats(state.groups, state.trades);

  return (
    <div className="mt-6 space-y-5">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
        <WinRateCard result={winRate} />
        <AvgDTECard result={avgDTE} />
        <AllocationCard rows={allocation} />
      </div>

      <WeeklyPremiumSection trades={state.trades} />

      <QuickStatsCard stats={quickStats} />
    </div>
  );
}
