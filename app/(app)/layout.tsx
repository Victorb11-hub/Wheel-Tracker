import { TopBar } from '@/components/chrome/top-bar';
import { ChromeBars } from '@/components/chrome/chrome-bars';
import { Providers } from '@/lib/queries/providers';

// Hoisted chrome: TopBar always renders. StatStrip + TabsNav are gated by
// route via <ChromeBars> so focused workflows (/import) get a clean page
// without the tab nav. Per-tab bodies sit beneath.
//
// StatStrip and TabsNav subscribe to React Query directly so chrome
// counts re-derive live on mutations without a route refresh.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="min-h-screen bg-bg text-text">
        <TopBar />
        <main className="mx-auto max-w-[1800px] px-6 py-6">
          <ChromeBars />
          {children}
        </main>
      </div>
    </Providers>
  );
}
