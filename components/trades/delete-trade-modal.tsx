'use client';

import { useMemo } from 'react';
import { MutationModal } from '@/components/ui/mutation-modal';
import { useDeleteTrade } from '@/lib/queries/use-trades';
import type { StockPosition, Trade, TradeGroup } from '@/types/trade';

// Trade Delete with cascade summary + block-on-stock-ref.
//
// Behavior (per agreed cascade rules):
//   - Strip the trade id from any group.trade_ids[]. The data layer
//     (MockDataClient.deleteTrade) does this silently — but the UI surfaces
//     it explicitly so the user isn't surprised.
//   - Block when this trade is referenced by stock_position.original_put_id.
//     The user must delete the stock position first; that flow doesn't exist
//     yet, so the blocked dialog points at the stock and offers no action
//     beyond Cancel.
//
// Stock-level Delete (with cascade-delete of linked open CCs) is a separate
// task — needs new deleteStock plumbing in DataClient.
export function DeleteTradeModal({
  trade,
  groups,
  stocks,
  open,
  onOpenChange,
}: {
  trade: Trade | null;
  groups: TradeGroup[];
  stocks: StockPosition[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const deleteTrade = useDeleteTrade();

  const containingGroups = useMemo(
    () =>
      trade ? groups.filter((g) => g.trade_ids.includes(trade.id)) : [],
    [trade, groups]
  );
  const referencedByStock = useMemo(
    () => (trade ? stocks.find((s) => s.original_put_id === trade.id) : null),
    [trade, stocks]
  );

  if (!trade) return null;

  const blocked = referencedByStock != null;

  async function handleDelete() {
    if (!trade) return;
    await deleteTrade.mutateAsync(trade.id);
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) deleteTrade.reset();
    onOpenChange(next);
  }

  if (blocked) {
    return (
      <MutationModal
        open={open}
        onOpenChange={handleOpenChange}
        title="Can't delete this trade"
        onSubmit={() => undefined}
        submitLabel=""
        cancelLabel="Got it"
        hideSubmit
        contentClassName="max-w-md"
      >
        <div className="rounded-md border border-debit bg-debit-bg p-3 text-sm">
          <p className="font-semibold text-debit">
            This trade is the original assigned put for{' '}
            <span className="text-text">{referencedByStock?.symbol}</span>.
          </p>
          <p className="mt-2 text-text">
            Deleting it would orphan the stock position&rsquo;s
            cost-basis snapshot. Delete the{' '}
            <span className="font-semibold">{referencedByStock?.symbol}</span>{' '}
            stock position first (Stock Positions tab), then come back to
            delete this trade.
          </p>
        </div>
      </MutationModal>
    );
  }

  return (
    <MutationModal
      open={open}
      onOpenChange={handleOpenChange}
      title={`Delete ${trade.symbol} ${trade.action} ${trade.type}?`}
      onSubmit={handleDelete}
      submitLabel="Delete trade"
      pendingLabel="Deleting…"
      isPending={deleteTrade.isPending}
      destructive
      error={deleteTrade.error as Error | null}
      contentClassName="max-w-md"
    >
      <div className="space-y-3 text-sm text-text-muted">
        <p>This action cannot be undone.</p>
        {containingGroups.length > 0 && (
          <p className="rounded-md border border-border bg-surface-raised p-3 text-text">
            This trade is in{' '}
            <span className="font-semibold">
              {containingGroups.length}{' '}
              {containingGroups.length === 1 ? 'group' : 'groups'}
            </span>{' '}
            (
            {containingGroups
              .map((g) => `"${g.name}"`)
              .join(', ')}
            ) — it will be removed from{' '}
            {containingGroups.length === 1 ? 'that group' : 'those groups'} on
            delete. The {containingGroups.length === 1 ? 'group' : 'groups'}{' '}
            will remain.
          </p>
        )}
        {trade.linked_stock_id && (
          <p className="rounded-md border border-assignment bg-assignment-bg p-3 text-text">
            <span className="font-semibold">Note:</span> this trade is linked
            to a stock position (covered call or assignment leg). The stock
            position itself is not affected by this delete.
          </p>
        )}
      </div>
    </MutationModal>
  );
}
