'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MutationModal } from '@/components/ui/mutation-modal';
import { fmtSignedUSD, fmtUSD } from '@/components/trades/format';
import { useCalledAway } from '@/lib/queries/use-wheel';
import { cn } from '@/lib/utils';
import type { StockPosition, Trade } from '@/types/trade';

// Called Away — wraps lib/wheel/called-away.ts. Closes the entire wheel
// cycle. The planner produces:
//   1. tradeUpdates: closes any open covered calls linked to this stock
//      (close_price=0, "Exercised" note, status='closed').
//   2. tradeInserts: synthetic CalledAwayRow with cycle_details +
//      full_cycle_pl populated.
//   3. stockDeletes: removes the StockPosition row.
//   4. groupUpserts (if trade_ref set): builds/updates
//      `Trade Ref: {ref} - Full Wheel Cycle` group containing the original
//      put, assignment row, all covered-call sells, and the called-away row.
//
// IRREVERSIBLE — the modal surfaces the full breakdown so the user sees
// exactly what they're locking in. Stock-leg P&L uses assigned_price (the
// "moment of assignment" reference) per the planner's cycle_details
// convention; if cost_basis differs from assigned_price, both are shown so
// the divergence is visible.
export function CalledAwayModal({
  stock,
  trades,
  open,
  onOpenChange,
}: {
  stock: StockPosition | null;
  trades: Trade[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const calledAway = useCalledAway();

  const [calledAwayDate, setCalledAwayDate] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!stock) return;
    setCalledAwayDate(todayISO());
    setSalePrice('');
    setNotes('');
    calledAway.reset();
    // calledAway.reset is stable; intentionally omitted from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock?.id, open]);

  if (!stock) return null;

  const salePriceNum = parseFloat(salePrice);

  const validationError = (() => {
    if (calledAwayDate === '') return 'Called-away date is required.';
    if (salePrice === '' || Number.isNaN(salePriceNum) || salePriceNum <= 0)
      return 'Sale price must be a positive number.';
    return null;
  })();

  const canSubmit = validationError === null && !calledAway.isPending;

  // Already-realized (denormalized snapshots — premiums in dollars).
  const putPremium = stock.original_put.premiumCollected;
  const callPremiums = stock.covered_calls.reduce(
    (sum, c) => sum + c.premium,
    0
  );
  const running = putPremium + callPremiums;

  // Open CCs that will be force-closed by the planner. Surface the count so
  // the user knows what side-effect they're triggering.
  const openCcCount = trades.filter(
    (t) =>
      t.is_covered_call &&
      t.linked_stock_id === stock.id &&
      t.status === 'open'
  ).length;

  // Live forward-looking math. Stock leg uses assigned_price to match the
  // planner's cycle_details.stockProfit calculation.
  const preview = (() => {
    if (Number.isNaN(salePriceNum)) return null;
    const stockLeg = (salePriceNum - stock.assigned_price) * stock.shares;
    return {
      stockLeg,
      total: running + stockLeg,
    };
  })();

  async function handleSubmit() {
    if (!stock) return;
    await calledAway.mutateAsync({
      stock_id: stock.id,
      calledAwayDate,
      salePrice: salePriceNum,
      notes: notes.trim() === '' ? null : notes.trim(),
    });
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) calledAway.reset();
    onOpenChange(next);
  }

  return (
    <MutationModal
      open={open}
      onOpenChange={handleOpenChange}
      title={`Called away — ${stock.symbol}`}
      onSubmit={handleSubmit}
      submitLabel="Confirm called away"
      pendingLabel="Closing cycle…"
      isPending={calledAway.isPending}
      canSubmit={canSubmit}
      destructive
      error={
        (calledAway.error as Error | null) ??
        (validationError ? new Error(validationError) : null)
      }
      contentClassName="max-w-xl"
    >
      <div className="rounded-md border border-debit bg-debit-bg p-3 text-sm">
        <p className="font-semibold text-debit">
          This closes the entire wheel cycle. Irreversible.
        </p>
        <p className="mt-1 text-text">
          The stock position is deleted, all open covered calls
          {openCcCount > 0 ? ` (${openCcCount}) ` : ' '}
          are marked closed/exercised, and a Full Wheel Cycle group is built
          {stock.trade_ref ? ` (Trade Ref: ${stock.trade_ref}).` : '.'}
        </p>
      </div>

      <div className="rounded-md border border-border bg-surface-raised p-3 text-sm">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-faint">
          Position
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
          <Stat label="Shares" value={`${stock.shares} sh`} />
          <Stat label="Cost basis" value={`${fmtUSD(stock.cost_basis)}/sh`} />
          <Stat
            label="Assigned price"
            value={`${fmtUSD(stock.assigned_price)}/sh`}
          />
          <Stat
            label="Covered calls written"
            value={`${stock.covered_calls.length} (${openCcCount} open)`}
          />
        </div>
        {stock.cost_basis !== stock.assigned_price && (
          <p className="mt-2 text-xs text-text-faint">
            Cost basis and assigned price differ — stock-leg P&amp;L below
            uses assigned price ({fmtUSD(stock.assigned_price)}) to match the
            cycle&rsquo;s reference point.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Called-away date" htmlFor="called-away-date">
          <Input
            id="called-away-date"
            type="date"
            value={calledAwayDate}
            onChange={(e) => setCalledAwayDate(e.target.value)}
          />
        </Field>
        <Field label="Sale price ($/share)" htmlFor="called-away-price">
          <Input
            id="called-away-price"
            type="number"
            step="0.01"
            min="0"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            placeholder="e.g. 275.00"
            autoFocus
          />
        </Field>
      </div>

      {preview && (
        <div className="rounded-md border border-border bg-surface-raised p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-faint">
            Total Wheel Cycle P&amp;L
          </div>
          <dl className="space-y-1.5 text-sm tabular-nums">
            <BreakdownRow
              label="Put premium collected"
              value={putPremium}
            />
            <BreakdownRow
              label={`Covered call premiums (${stock.covered_calls.length} ${stock.covered_calls.length === 1 ? 'call' : 'calls'})`}
              value={callPremiums}
            />
            <div className="my-1 border-t border-border" />
            <BreakdownRow
              label="Running P&L (already realized)"
              value={running}
              subdued
            />
            <BreakdownRow
              label={`Stock leg: (${fmtUSD(salePriceNum)} − ${fmtUSD(stock.assigned_price)}) × ${stock.shares}`}
              value={preview.stockLeg}
            />
            <div className="my-2 border-t-2 border-border-strong" />
            <div className="flex items-baseline justify-between">
              <dt className="text-md font-semibold text-text">
                Total wheel cycle P&amp;L
              </dt>
              <dd
                className={cn(
                  'text-lg font-bold tabular-nums',
                  preview.total > 0 && 'text-credit',
                  preview.total < 0 && 'text-debit',
                  preview.total === 0 && 'text-text-muted'
                )}
              >
                {fmtSignedUSD(preview.total)}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <Field label="Notes" htmlFor="called-away-notes">
        <textarea
          id="called-away-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint focus-visible:border-credit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-credit"
          placeholder="Exercised at expiration, early called away, etc."
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

function BreakdownRow({
  label,
  value,
  subdued,
}: {
  label: string;
  value: number;
  subdued?: boolean;
}) {
  const tone =
    value > 0 ? 'text-credit' : value < 0 ? 'text-debit' : 'text-text-muted';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt
        className={cn('text-text-muted', subdued && 'font-semibold text-text')}
      >
        {label}
      </dt>
      <dd className={cn(tone, subdued && 'font-semibold')}>
        {fmtSignedUSD(value)}
      </dd>
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
