'use client';

import { useState } from 'react';
import Link from 'next/link';
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
import { exportTradesToCsv } from '@/lib/export/to-csv';
import { exportToExcel } from '@/lib/export/to-excel';
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

  function handleExportExcel() {
    if (!state) return;
    const { content, filename } = exportToExcel(state);
    downloadBlob(
      new Blob([content], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      filename,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  }

  function handleExportCsvFull() {
    if (!state) return;
    const { content, filename } = exportTradesToCsv(state, { includeInternal: true });
    downloadBlob(content, filename, 'text/csv');
  }

  function handleExportCsvBroker() {
    if (!state) return;
    const { content, filename } = exportTradesToCsv(state, { includeInternal: false });
    downloadBlob(content, filename, 'text/csv');
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
            <DropdownMenuItem onSelect={handleExportExcel} disabled={!state}>
              Export → Excel
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleExportCsvFull} disabled={!state}>
              Export → Trades (CSV)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleExportCsvBroker} disabled={!state}>
              Export → Trades (CSV, broker-style)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Import</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/import">Import…</Link>
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
