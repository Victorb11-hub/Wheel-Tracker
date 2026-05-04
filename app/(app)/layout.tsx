import { TopBar } from '@/components/chrome/top-bar';
import { StatStrip } from '@/components/chrome/stat-strip';
import { TabsNav } from '@/components/chrome/tabs-nav';
import { Providers } from '@/lib/queries/providers';

// Hoisted chrome: TopBar + StatStrip + TabsNav render on every (app) page.
// Each tab's body sits beneath. Pages render only their content.
//
// StatStrip and TabsNav subscribe to React Query directly so chrome
// counts re-derive live on mutations without a route refresh.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="min-h-screen bg-bg text-text">
        <TopBar />
        <main className="mx-auto max-w-[1800px] px-6 py-6">
          <div className="mb-6">
            <StatStrip />
          </div>
          <TabsNav />
          {children}
        </main>
      </div>
    </Providers>
  );
}
