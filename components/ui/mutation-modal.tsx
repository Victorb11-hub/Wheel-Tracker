'use client';

import { type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Shared shell for every mutation modal: Edit, Delete confirm, Close, Roll,
// Assign, Sell Call, Called Away. Owns dialog plumbing + footer + error +
// pending UI so each per-mutation modal is just its form fields. Caller
// retains full control over open state and form/validation logic.
export function MutationModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel,
  pendingLabel,
  cancelLabel = 'Cancel',
  isPending = false,
  canSubmit = true,
  error = null,
  destructive = false,
  contentClassName,
  hideSubmit = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  onSubmit: () => void | Promise<void>;
  submitLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  isPending?: boolean;
  canSubmit?: boolean;
  error?: Error | null;
  destructive?: boolean;
  contentClassName?: string;
  // Hide the primary submit button entirely. Used by blocked-state confirms
  // (e.g. a delete that's prevented by referential integrity) where the
  // dialog's only action is acknowledgment.
  hideSubmit?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClassName}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <div className="text-sm text-text-muted">{description}</div>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-4">{children}</div>

        {error && (
          <div className="rounded-md border border-debit bg-debit-bg p-3 text-sm text-debit">
            {error.message}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {cancelLabel}
          </Button>
          {!hideSubmit && (
            <Button
              variant={destructive ? 'danger' : 'primary'}
              onClick={() => void onSubmit()}
              disabled={!canSubmit || isPending}
            >
              {isPending ? (pendingLabel ?? `${submitLabel}…`) : submitLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
