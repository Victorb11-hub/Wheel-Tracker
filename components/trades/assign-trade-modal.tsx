'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MutationModal } from '@/components/ui/mutation-modal';
import { fmtDate, fmtSignedUSD, fmtUSD } from '@/components/trades/format';
import { useAssignTrade } from '@/lib/queries/use-wheel';
import type { Trade } from '@/types/trade';

// Assign a sold put — wraps lib/wheel/assign.ts. The planner produces:
//   1. tradeUpdates: marks the put status='assigned', stamps date_closed +
//      assigned_price + closing_notes.
//   2. stockInserts: a new StockPosition with cost_basis = put.strike,
//      shares = contracts × 100, snapshot of the put on original_put.
//   3. tradeInserts: a synthetic AssignmentRow (action='assignment',
//      type='stock', is_assignment=true, status='closed') for the audit log.
//
// Default-date pattern: assignment date is "happens-now" → today.
// assigned_price defaults to the strike (typical assignment at expiration);
// override to record current underlying price for context.
export function AssignTradeModal({
  trade,
  open,
  onOpenChange,
}: {
  trade: Trade | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const assignTrade = useAssignTrade();

  const [assignDate, setAssignDate] = useState('');
  const [assignmentPrice, setAssignmentPrice] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!trade) return;
    setAssignDate(todayISO());
    setAssignmentPrice(String(trade.strike));
    setNotes('');
    assignTrade.reset();
    // assignTrade.reset is stable; intentionally omitted from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade?.id, open]);

  if (!trade) return null;
  if (trade.action !== 'sell' || trade.type !== 'put') return null;

  const priceNum = parseFloat(assignmentPrice);
  const shares = trade.contracts * 100;
  const totalCost = trade.strike * shares;
  const premiumCollected = trade.premium * shares;

  const validationError = (() => {
    if (assignDate === '') return 'Assignment date is required.';
    if (assignmentPrice === '' || Number.isNaN(priceNum) || priceNum <= 0)
      return 'Assignment price must be a positive number.';
    return null;
  })();

  const canSubmit = validationError === null && !assignTrade.isPending;

  // Net P&L on the assignment "moment": premium previously collected, plus
  // the unrealized mark on the shares (market vs strike). When market < strike
  // (assignment ITM at expiration), the shares are worth less than what you
  // paid — that's where the wheel typically sits before covered calls.
  const previewLine = (() => {
    if (Number.isNaN(priceNum)) return null;
    const sharesMarketValue = priceNum * shares;
    const unrealizedOnShares = sharesMarketValue - totalCost;
    return {
      sharesMarketValue,
      unrealizedOnShares,
      // Total view at the assignment moment: realized put premium + unrealized
      // share P&L. Doesn't include any future covered-call premiums.
      net: premiumCollected + unrealizedOnShares,
    };
  })();

  async function handleSubmit() {
    if (!trade) return;
    await assignTrade.mutateAsync({
      trade_id: trade.id,
      assignDate,
      assignmentPrice: priceNum,
      assignmentNotes: notes.trim() === '' ? null : notes.trim(),
    });
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) assignTrade.reset();
    onOpenChange(next);
  }

  return (
    <MutationModal
      open={open}
      onOpenChange={handleOpenChange}
      title={`Assign ${trade.symbol} put @ ${fmtUSD(trade.strike)}`}
      onSubmit={handleSubmit}
      submitLabel="Confirm assignment"
      pendingLabel="Assigning…"
      isPending={assignTrade.isPending}
      canSubmit={canSubmit}
      error={
        (assignTrade.error as Error | null) ??
        (validationError ? new Error(validationError) : null)
      }
      contentClassName="max-w-lg"
    >
      <div className="rounded-md border border-border bg-surface-raised p-3 text-sm">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-faint">
          Sold put
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
          <Stat label="Strike" value={fmtUSD(trade.strike)} />
          <Stat label="Premium" value={`${fmtUSD(trade.premium)}/sh`} />
          <Stat label="Contracts" value={String(trade.contracts)} />
          <Stat
            label="Premium collected"
            value={fmtUSD(premiumCollected, { cents: false })}
          />
          <Stat label="Opened" value={fmtDate(trade.date_opened)} />
          <Stat label="Expires" value={fmtDate(trade.exp_date)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Assignment date" htmlFor="assign-date">
          <Input
            id="assign-date"
            type="date"
            value={assignDate}
            onChange={(e) => setAssignDate(e.target.value)}
          />
        </Field>
        <Field
          label="Underlying price ($/share)"
          htmlFor="assign-price"
        >
          <Input
            id="assign-price"
            type="number"
            step="0.01"
            min="0"
            value={assignmentPrice}
            onChange={(e) => setAssignmentPrice(e.target.value)}
            autoFocus
          />
        </Field>
      </div>

      <div className="rounded-md border border-assignment bg-assignment-bg p-3 text-sm">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-assignment">
          You will receive
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
          <Stat label="Shares" value={`${shares} sh of ${trade.symbol}`} />
          <Stat label="Cost basis" value={`${fmtUSD(trade.strike)}/sh`} />
          <Stat label="Total cost" value={fmtUSD(totalCost, { cents: false })} />
          {previewLine && (
            <Stat
              label="Shares market value"
              value={fmtUSD(previewLine.sharesMarketValue, { cents: false })}
            />
          )}
        </div>
        {previewLine && (
          <div className="mt-3 border-t border-assignment pt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-text-muted">Net at assignment moment</span>
              <span
                className={
                  'font-semibold tabular-nums ' +
                  (previewLine.net > 0
                    ? 'text-credit'
                    : previewLine.net < 0
                      ? 'text-debit'
                      : 'text-text-muted')
                }
              >
                {fmtSignedUSD(previewLine.net)}
              </span>
            </div>
            <p className="mt-1 text-xs text-text-faint">
              Premium collected ({fmtSignedUSD(premiumCollected)}) plus
              unrealized share P&amp;L ({fmtSignedUSD(previewLine.unrealizedOnShares)}).
              Covered-call income from here on adds to this total.
            </p>
          </div>
        )}
      </div>

      <Field label="Assignment notes" htmlFor="assign-notes">
        <textarea
          id="assign-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint focus-visible:border-credit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-credit"
          placeholder="Assigned at expiration ITM, early assignment, etc."
        />
      </Field>
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
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
