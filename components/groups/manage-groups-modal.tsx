'use client';

import { useEffect, useMemo, useState } from 'react';
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
import {
  useDeleteGroup,
  useRenameGroup,
  useSetGroupTradeIds,
} from '@/lib/queries/use-groups';
import { findHidingRef } from '@/lib/closed-groups';
import type { Trade, TradeGroup } from '@/types/trade';

type View =
  | { mode: 'list' }
  | { mode: 'edit'; groupId: string };

export function ManageGroupsModal({
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
  const [view, setView] = useState<View>({ mode: 'list' });

  // Reset to list view whenever the modal closes.
  useEffect(() => {
    if (!open) setView({ mode: 'list' });
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {view.mode === 'list' ? (
          <ListView
            groups={groups}
            onEdit={(id) => setView({ mode: 'edit', groupId: id })}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <EditView
            key={view.groupId}
            groupId={view.groupId}
            trades={trades}
            groups={groups}
            onBack={() => setView({ mode: 'list' })}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ListView({
  groups,
  onEdit,
  onClose,
}: {
  groups: TradeGroup[];
  onEdit: (id: string) => void;
  onClose: () => void;
}) {
  const deleteGroup = useDeleteGroup();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...groups].sort((a, b) => a.name.localeCompare(b.name)),
    [groups]
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Manage Groups</DialogTitle>
      </DialogHeader>

      {sorted.length === 0 ? (
        <div className="rounded-md border border-border bg-surface-raised p-6 text-center text-sm text-text-muted">
          No groups yet. Use Auto-Group or Create New Group to start.
        </div>
      ) : (
        <ul className="max-h-[480px] divide-y divide-border overflow-y-auto rounded-md border border-border">
          {sorted.map((g) => {
            const isConfirming = confirmId === g.id;
            return (
              <li
                key={g.id}
                className="flex items-center gap-3 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{g.name}</div>
                  <div className="text-xs text-text-faint">
                    {g.trade_ids.length} trade
                    {g.trade_ids.length === 1 ? '' : 's'}
                  </div>
                </div>
                {isConfirming ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-debit">Delete?</span>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={deleteGroup.isPending}
                      onClick={() =>
                        deleteGroup.mutate(g.id, {
                          onSuccess: () => setConfirmId(null),
                        })
                      }
                    >
                      {deleteGroup.isPending ? 'Deleting…' : 'Yes, delete'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => onEdit(g.id)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmId(g.id)}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {deleteGroup.isError && (
        <div className="rounded-md border border-debit bg-debit-bg p-3 text-sm text-debit">
          Delete failed: {(deleteGroup.error as Error).message}
        </div>
      )}

      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

function EditView({
  groupId,
  trades,
  groups,
  onBack,
  onClose,
}: {
  groupId: string;
  trades: Trade[];
  groups: TradeGroup[];
  onBack: () => void;
  onClose: () => void;
}) {
  const group = groups.find((g) => g.id === groupId);

  const [name, setName] = useState(group?.name ?? '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(group?.trade_ids ?? [])
  );

  const renameGroup = useRenameGroup();
  const setIds = useSetGroupTradeIds();

  const closedTrades = useMemo(() => trades.filter((t) => t.status !== 'open'), [trades]);

  // Group went away while editing (e.g., deleted in another tab). Bail.
  if (!group) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Group not found</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-muted">
          This group no longer exists. It may have been deleted.
        </p>
        <DialogFooter>
          <Button variant="secondary" onClick={onBack}>
            Back to list
          </Button>
        </DialogFooter>
      </>
    );
  }

  const trimmed = name.trim();
  const otherNames = new Set(
    groups.filter((g) => g.id !== groupId).map((g) => g.name.trim().toLowerCase())
  );
  const nameError =
    trimmed === ''
      ? 'Group name is required.'
      : otherNames.has(trimmed.toLowerCase())
        ? `Another group named "${trimmed}" already exists.`
        : null;

  const originalIds = new Set(group.trade_ids);
  const idsChanged =
    selectedIds.size !== originalIds.size ||
    Array.from(selectedIds).some((id) => !originalIds.has(id));
  const nameChanged = trimmed !== group.name;
  const dirty = nameChanged || idsChanged;
  const isPending = renameGroup.isPending || setIds.isPending;
  const canSave = dirty && nameError === null && !isPending;

  const hidingRef = useMemo(
    () => findHidingRef(Array.from(selectedIds), trades),
    [selectedIds, trades]
  );
  const wasHiddenBefore = findHidingRef(group.trade_ids, trades) !== null;
  const willBecomeHidden = hidingRef !== null && !wasHiddenBefore;

  async function handleSave() {
    if (!canSave) return;
    try {
      if (nameChanged) {
        await renameGroup.mutateAsync({ id: groupId, name: trimmed });
      }
      if (idsChanged) {
        await setIds.mutateAsync({ id: groupId, tradeIds: Array.from(selectedIds) });
      }
      onBack();
    } catch {
      // Errors surfaced inline below; keep the editor open.
    }
  }

  const error =
    (renameGroup.error as Error | null) ?? (setIds.error as Error | null);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit Group</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-group-name">Group name</Label>
          <Input
            id="edit-group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={trimmed !== '' && nameError !== null}
            aria-describedby={nameError ? 'edit-group-name-error' : undefined}
          />
          {trimmed !== '' && nameError !== null && (
            <p id="edit-group-name-error" className="text-xs text-debit">
              {nameError}
            </p>
          )}
        </div>

        <TradePicker
          trades={closedTrades}
          selectedIds={selectedIds}
          onChange={setSelectedIds}
          selectedHeading="In this group"
        />

        {willBecomeHidden && (
          <div className="rounded-md border border-assignment bg-assignment-bg p-3 text-sm text-assignment">
            <span className="font-semibold">Heads up:</span> one or more selected
            trades share Trade Ref{' '}
            <code className="rounded bg-surface-raised px-1 text-text">
              {hidingRef}
            </code>{' '}
            with an open position. After saving, this group will be hidden from
            the Closed Groups list until those positions close.
          </div>
        )}

        {error && (
          <div className="rounded-md border border-debit bg-debit-bg p-3 text-sm text-debit">
            Save failed: {error.message}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={!canSave}>
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </DialogFooter>
    </>
  );
}
