'use client';

import { usePathname } from 'next/navigation';
import { StatStrip } from '@/components/chrome/stat-strip';
import { TabsNav } from '@/components/chrome/tabs-nav';

// Wraps the stat strip + tabs nav and hides them on focused-workflow
// routes (currently /import). Keeps the conditional in one place so
// individual chrome components stay route-agnostic.
export function ChromeBars() {
  const pathname = usePathname();
  if (pathname === '/import' || pathname.startsWith('/import/')) return null;
  return (
    <>
      <div className="mb-6">
        <StatStrip />
      </div>
      <TabsNav />
    </>
  );
}
