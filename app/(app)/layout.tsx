import { TopBar } from '@/components/chrome/top-bar';
import { StatStrip } from '@/components/chrome/stat-strip';
import { TabsNav } from '@/components/chrome/tabs-nav';
import { Providers } from '@/lib/queries/providers';
import { buildSeed } from '@/lib/data/seed';
import { buildOverviewStats, buildTabs } from '@/lib/data/overview-stats';

// Hoisted chrome: TopBar + StatStrip + TabsNav render on every (app) page.
// Each tab's body sits beneath. Pages render only their content.
//
// <Providers> sets up the React Query + DataClient context for tabs that
// have been flipped to client-side (currently only Closed Groups, per
// option (a)). Server-rendered tabs ignore the providers entirely; the
// chrome above is server-rendered and DOES NOT live-update on client
// mutations until that tab is also flipped (tracked separately).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const state = buildSeed();
  const cards = buildOverviewStats(state);
  const tabs = buildTabs(state);

  return (
    <Providers>
      <div className="min-h-screen bg-bg text-text">
        <TopBar />
        <main className="mx-auto max-w-[1800px] px-6 py-6">
          <div className="mb-6">
            <StatStrip cards={cards} />
          </div>
          <TabsNav tabs={tabs} />
          {children}
        </main>
      </div>
    </Providers>
  );
}
