'use client';

import { Button } from '@/components/ui/button';

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface px-6">
      <div className="flex items-center gap-3">
        <div
          className="h-6 w-6 rounded-sm"
          style={{ background: 'var(--color-credit-gradient)' }}
        />
        <span className="text-md font-semibold">Wheel Tracker</span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="md">+ Add Position</Button>
        <Button size="icon" variant="secondary" aria-label="Settings">
          ⚙
        </Button>
        <Button size="icon" variant="secondary" aria-label="Logout">
          ⎋
        </Button>
      </div>
    </header>
  );
}
