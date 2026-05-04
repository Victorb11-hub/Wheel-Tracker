'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  planAutoGroup,
  summarizeAutoGroup,
} from '@/lib/wheel/auto-group';
import type { Trade, TradeGroup } from '@/types/trade';

// Shows a destructive-action confirmation BEFORE running auto-group.
// The summary surfaces the manual-group count specifically so the user can
// cancel if they have a custom group that doesn't follow the ref convention.
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

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="auto-group-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-assignment">⚠</span>
              <h2 id="auto-group-title" className="text-lg font-semibold">
                Auto-Group will replace existing groups
              </h2>
            </div>
            <div className="space-y-3 text-sm text-text-muted">
              <p>
                This will replace{' '}
                <span className="font-semibold text-text">
                  {summary.existingAuto}
                </span>{' '}
                existing auto-shaped group
                {summary.existingAuto === 1 ? '' : 's'} with{' '}
                <span className="font-semibold text-text">
                  {summary.rebuiltCount}
                </span>{' '}
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
                  No manually-created groups detected. All existing groups follow
                  the Trade Ref convention and will be rebuilt.
                </p>
              )}
              <p className="text-text-faint">
                Continue?
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleConfirm}>
                Replace {summary.existingAuto} group
                {summary.existingAuto === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
