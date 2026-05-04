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
import { buildSeed } from '@/lib/data/seed';

export default function DashboardPage() {
  const state = buildSeed();
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
