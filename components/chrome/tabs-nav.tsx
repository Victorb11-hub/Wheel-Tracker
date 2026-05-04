'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { buildTabs } from '@/lib/data/overview-stats';
import { useFullState } from '@/lib/queries/use-state';
import { cn } from '@/lib/utils';

// Subscribes to the React Query cache directly. Counts re-derive on every
// state change — chrome stays in sync with mutations without a route refresh.
export function TabsNav() {
  const pathname = usePathname();
  const { data: state } = useFullState();
  const tabs = state ? buildTabs(state) : [];

  return (
    <nav
      className="mb-5 flex gap-2 border-b border-border pb-2"
      aria-label="Primary"
    >
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + '/');
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-credit bg-credit-bg-strong text-credit'
                : 'border-transparent text-text-muted hover:bg-surface hover:text-text'
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs',
                  active
                    ? 'bg-credit text-text-on-accent'
                    : 'bg-surface-raised text-text-muted'
                )}
              >
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
