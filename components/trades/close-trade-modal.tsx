'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MutationModal } from '@/components/ui/mutation-modal';
import { fmtDate, fmtSignedUSD, fmtUSD } from '@/components/trades/format';
import { useCloseTrade } from '@/lib/queries/use-wheel';
import type { Trade } from '@/types/trade';

// Manual close — wraps lib/wheel/close.ts. Per the planner, this:
//   1. Stamps date_closed + close_price on the original trade.
//   2. Inserts a synthetic opposite-action leg with is_closing_trade=true.
//   3. If trade_ref is set, finds-or-creates `Trade Ref: {ref}` group with
//      both the original and the closing-leg ids.
//
// Closing premium is per-share (matches Trade.premium semantics). We show
// a live net credit/debit so the user sees the realized P&L before
// confirming.
export function CloseTradeModal({
  trade,
  open,
  onOpenChange,
}: {
  trade: Trade | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const closeTrade = useCloseTrade();

  const [closeDate, setCloseDate] = useState('');
  const [closingPremium, setClosingPremium] = useState('');
  const [closingNotes, setClosingNotes] = useState('');

  useEffect(() => {
    if (!trade) return;
    setCloseDate(todayISO());
    setClosingPremium('');
    setClosingNotes('');
    closeTrade.reset();
    // closeTrade.reset is stable; intentionally omitted from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade?.id, open]);

  if (!trade) return null;

  if (trade.action !== 'sell' && trade.action !== 'buy') {
    return null; // synthetic rows can't be manually closed
  }

  const premiumNum = parseFloat(closingPremium);
  const validationError = (() => {
    if (closeDate === '') return 'Close date is required.';
    if (closingPremium === '') return 'Closing premium is required.';
    if (Number.isNaN(premiumNum) || premiumNum < 0)
      return 'Closing premium must be a non-negative number.';
    return null;
  })();

  const canSubmit = validationError === null && !closeTrade.isPending;

  // Live realized P&L preview. For sells: collected − bought-back. For buys:
  // sold − initial cost. Synthetic rows are excluded above, so action is
  // strictly 'sell' | 'buy' here.
  const previewPL = (() => {
    if (Number.isNaN(premiumNum)) return null;
    const totalOriginal = trade.premium * trade.contracts * 100;
    const totalClosing = premiumNum * trade.contracts * 100;
    return trade.action === 'sell'
      ? totalOriginal - totalClosing
      : totalClosing - totalOriginal;
  })();

  async function handleSubmit() {
    if (!trade) return;
    await closeTrade.mutateAsync({
      trade_id: trade.id,
      close_date: closeDate,
      closing_premium: premiumNum,
      closing_notes: closingNotes.trim() === '' ? null : closingNotes.trim(),
    });
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) closeTrade.reset();
    onOpenChange(next);
  }

  return (
    <MutationModal
      open={open}
      onOpenChange={handleOpenChange}
      title={`Close ${trade.symbol} ${trade.action} ${trade.type}`}
      onSubmit={handleSubmit}
      submitLabel="Close trade"
      pendingLabel="Closing…"
      isPending={closeTrade.isPending}
      canSubmit={canSubmit}
      error={
        (closeTrade.error as Error | null) ??
        (validationError ? new Error(validationError) : null)
      }
      contentClassName="max-w-lg"
    >
      <div className="rounded-md border border-border bg-surface-raised p-3 text-sm">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-faint">
          Position
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
          <Stat label="Strike" value={fmtUSD(trade.strike)} />
          <Stat label="Original premium" value={`${fmtUSD(trade.premium)}/sh`} />
          <Stat label="Contracts" value={String(trade.contracts)} />
          <Stat
            label="Collected"
            value={fmtUSD(trade.premium * trade.contracts * 100, {
              cents: false,
            })}
          />
          <Stat label="Opened" value={fmtDate(trade.date_opened)} />
          <Stat label="Expires" value={fmtDate(trade.exp_date)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Close date" htmlFor="close-trade-date">
          <Input
            id="close-trade-date"
            type="date"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
          />
        </Field>
        <Field
          label={
            trade.action === 'sell'
              ? 'Buyback price ($/share)'
              : 'Sale price ($/share)'
          }
          htmlFor="close-trade-premium"
        >
          <Input
            id="close-trade-premium"
            type="number"
            step="0.01"
            min="0"
            value={closingPremium}
            onChange={(e) => setClosingPremium(e.target.value)}
            placeholder="e.g. 0.50"
            autoFocus
          />
        </Field>
      </div>

      {previewPL !== null && (
        <div className="rounded-md border border-border bg-surface-raised p-3 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-text-muted">Realized P&amp;L on close</span>
            <span
              className={
                'font-semibold tabular-nums ' +
                (previewPL > 0
                  ? 'text-credit'
                  : previewPL < 0
                    ? 'text-debit'
                    : 'text-text-muted')
              }
            >
              {fmtSignedUSD(previewPL)}
            </span>
          </div>
        </div>
      )}

      <Field label="Closing notes" htmlFor="close-trade-notes">
        <textarea
          id="close-trade-notes"
          value={closingNotes}
          onChange={(e) => setClosingNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint focus-visible:border-credit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-credit"
          placeholder="Closed at 80% profit, expired worthless, etc."
        />
      </Field>

      {trade.trade_ref && (
        <p className="text-xs text-text-faint">
          On close, both the original and the buy-to-close leg will be added
          to the <code className="rounded bg-surface-raised px-1">Trade Ref: {trade.trade_ref}</code> group.
        </p>
      )}
    </MutationModal>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-text-muted">{label}</span>
      <span className="text-text">{value}</span>
    </div>
  );
}

function todayISO(): string {
  // Caller will see the same date the system clock shows; no seed-anchoring
  // here — date pickers always start on a real "today".
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
