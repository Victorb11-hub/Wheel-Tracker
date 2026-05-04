'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AddPositionModal } from '@/components/trades/add-position-modal';
import { downloadBlob } from '@/lib/export/download';
import { exportToJson } from '@/lib/export/to-json';
import { useFullState } from '@/lib/queries/use-state';

export function TopBar() {
  const [addOpen, setAddOpen] = useState(false);
  const { data: state } = useFullState();

  // Kept for migration/recovery. Wire back into a menu item when needed.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleExportJson() {
    if (!state) return;
    const { content, filename } = exportToJson(state);
    downloadBlob(content, filename, 'application/json');
  }

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
        <Button size="md" onClick={() => setAddOpen(true)}>
          + Add Position
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="secondary" aria-label="Settings">
              ⚙
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/*
              JSON export/import are intentionally hidden from end-user
              menus — JSON is our internal backup/migration format. Code
              kept dormant via handleExportJson + the JSON parser/importer.
              Re-expose under a "Recovery" or migration menu if needed.
            */}
            <DropdownMenuLabel>Export</DropdownMenuLabel>
            <DropdownMenuItem disabled>
              Export → Excel (coming soon)
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              Export → CSV (coming soon)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Import</DropdownMenuLabel>
            <DropdownMenuItem disabled>
              Import → Excel (coming soon)
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              Import → CSV (coming soon)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="icon" variant="secondary" aria-label="Logout">
          ⎋
        </Button>
      </div>

      <AddPositionModal open={addOpen} onOpenChange={setAddOpen} />
    </header>
  );
}
