'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  planAutoGroup,
  summarizeAutoGroup,
} from '@/lib/wheel/auto-group';
import type { Trade, TradeGroup } from '@/types/trade';

// Destructive-action confirmation BEFORE running auto-group.
// Surfaces the manual-group count so the user can cancel if they have a custom
// group that doesn't follow the ref convention.
export function AutoGroupButton({
  trades,
  groups,
  onConfirm,
}: {
  trades: Trade[];
  groups: TradeGroup[];
  onConfirm?: (plan: ReturnType<typeof planAutoGroup>) => void;
}) {
  const [open, setOpen] = useState(false);

  const plan = planAutoGroup(trades, groups);
  const summary = summarizeAutoGroup(plan);

  function handleConfirm() {
    onConfirm?.(plan);
    setOpen(false);
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Auto-Group by Trade Ref #
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-baseline gap-2">
              <span className="text-assignment">⚠</span>
              Auto-Group will replace existing groups
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-text-muted">
            <p>
              This will replace{' '}
              <span className="font-semibold text-text">{summary.existingAuto}</span>{' '}
              existing auto-shaped group{summary.existingAuto === 1 ? '' : 's'} with{' '}
              <span className="font-semibold text-text">{summary.rebuiltCount}</span>{' '}
              group{summary.rebuiltCount === 1 ? '' : 's'} built from Trade Ref.
            </p>
            {summary.existingManual > 0 ? (
              <p>
                <span className="font-semibold text-credit">
                  {summary.existingManual} manually-created group
                  {summary.existingManual === 1 ? '' : 's'} will be preserved.
                </span>{' '}
                (Manual groups are those whose name doesn&rsquo;t start with{' '}
                <code className="rounded bg-surface-raised px-1">Trade Ref:</code>.)
              </p>
            ) : (
              <p className="text-text-faint">
                No manually-created groups detected. All existing groups follow the
                Trade Ref convention and will be rebuilt.
              </p>
            )}
            <p className="text-text-faint">Continue?</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirm}>
              Replace {summary.existingAuto} group
              {summary.existingAuto === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
