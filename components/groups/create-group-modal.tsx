'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TradePicker } from '@/components/groups/trade-picker';
import { useCreateGroup } from '@/lib/queries/use-groups';
import { findHidingRef } from '@/lib/closed-groups';
import type { Trade, TradeGroup } from '@/types/trade';

export function CreateGroupModal({
  trades,
  groups,
  open,
  onOpenChange,
}: {
  trades: Trade[];
  groups: TradeGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const createGroup = useCreateGroup();

  const closedTrades = useMemo(() => trades.filter((t) => t.status !== 'open'), [trades]);
  const existingNames = useMemo(
    () => new Set(groups.map((g) => g.name.trim().toLowerCase())),
    [groups]
  );

  const trimmed = name.trim();
  const nameError =
    trimmed === ''
      ? 'Group name is required.'
      : existingNames.has(trimmed.toLowerCase())
        ? `A group named "${trimmed}" already exists.`
        : null;

  const hidingRef = useMemo(
    () => findHidingRef(Array.from(selectedIds), trades),
    [selectedIds, trades]
  );

  const canSubmit = nameError === null && !createGroup.isPending;

  function reset() {
    setName('');
    setSelectedIds(new Set());
    createGroup.reset();
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    createGroup.mutate(
      { name: trimmed, tradeIds: Array.from(selectedIds) },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Group</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-group-name">Group name</Label>
            <Input
              id="create-group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Trade Ref: 47"
              autoFocus
              aria-invalid={trimmed !== '' && nameError !== null}
              aria-describedby={nameError ? 'create-group-name-error' : undefined}
            />
            {trimmed !== '' && nameError !== null && (
              <p id="create-group-name-error" className="text-xs text-debit">
                {nameError}
              </p>
            )}
          </div>

          <TradePicker
            trades={closedTrades}
            selectedIds={selectedIds}
            onChange={setSelectedIds}
          />

          {hidingRef && (
            <div className="rounded-md border border-assignment bg-assignment-bg p-3 text-sm text-assignment">
              <span className="font-semibold">Heads up:</span> one or more selected
              trades share Trade Ref{' '}
              <code className="rounded bg-surface-raised px-1 text-text">
                {hidingRef}
              </code>{' '}
              with an open position. This group will be hidden from the Closed
              Groups list until those positions close. You can still create it.
            </div>
          )}

          {createGroup.isError && (
            <div className="rounded-md border border-debit bg-debit-bg p-3 text-sm text-debit">
              Failed to create group: {(createGroup.error as Error).message}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {createGroup.isPending
              ? 'Creating…'
              : `Create group (${selectedIds.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
