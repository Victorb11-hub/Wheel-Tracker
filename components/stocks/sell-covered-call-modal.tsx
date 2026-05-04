'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MutationModal } from '@/components/ui/mutation-modal';
import { fmtSignedUSD, fmtUSD } from '@/components/trades/format';
import { useSellCoveredCall } from '@/lib/queries/use-wheel';
import type { StockPosition, Trade } from '@/types/trade';

// Sell a covered call against held shares. Wraps lib/wheel/covered-call.ts.
//
// Per the planner: contracts = stock.shares / 100; the new sell-call trade
// inherits symbol/account/trade_ref from the stock; a snapshot is appended
// to stock.covered_calls (premium in dollars). Stock must be 'holding'.
//
// Live "if called away" preview folds the new CC into the existing
// projection — uses the lowest open strike (this new one or any pre-existing
// open CC) since that's the strike that would be exercised first.
export function SellCoveredCallModal({
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
  const sellCall = useSellCoveredCall();

  const [strike, setStrike] = useState('');
  const [premium, setPremium] = useState('');
  const [expDate, setExpDate] = useState('');
  const [dateOpened, setDateOpened] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!stock) return;
    setStrike('');
    setPremium('');
    setExpDate('');
    setDateOpened(todayISO());
    setNotes('');
    sellCall.reset();
    // sellCall.reset is stable; intentionally omitted from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock?.id, open]);

  if (!stock) return null;

  const contracts = stock.shares / 100;
  const strikeNum = parseFloat(strike);
  const premiumNum = parseFloat(premium);

  const validationError = (() => {
    if (stock.shares % 100 !== 0)
      return `Stock has non-integer-contract shares (${stock.shares}). Cannot write a covered call.`;
    if (Number.isNaN(strikeNum) || strikeNum <= 0)
      return 'Strike must be a positive number.';
    if (Number.isNaN(premiumNum) || premiumNum < 0)
      return 'Premium must be a non-negative number.';
    if (dateOpened === '') return 'Date opened is required.';
    if (expDate === '') return 'Expiration date is required.';
    if (expDate <= dateOpened)
      return 'Expiration must be after date opened.';
    return null;
  })();

  const canSubmit = validationError === null && !sellCall.isPending;

  // Live projection — assume this CC enters the open-CC pool. Lowest open
  // strike is the one that would be exercised first if the stock rallies.
  const projection = (() => {
    if (Number.isNaN(strikeNum) || Number.isNaN(premiumNum)) return null;

    const existingPutPremium = stock.original_put.premiumCollected;
    const existingCallPremiums = stock.covered_calls.reduce(
      (s, c) => s + c.premium,
      0
    );
    const newCcDollars = premiumNum * contracts * 100;
    const projectedRunning =
      existingPutPremium + existingCallPremiums + newCcDollars;

    const existingOpenCcs = trades.filter(
      (t) =>
        t.is_covered_call &&
        t.linked_stock_id === stock.id &&
        t.status === 'open' &&
        t.action === 'sell' &&
        t.type === 'call'
    );
    const lowestStrike = existingOpenCcs.reduce(
      (lo, t) => Math.min(lo, t.strike),
      strikeNum
    );

    const stockGain = (lowestStrike - stock.cost_basis) * stock.shares;
    return {
      runningAfter: projectedRunning,
      lowestStrike,
      ifCalledAway: projectedRunning + stockGain,
    };
  })();

  async function handleSubmit() {
    if (!stock) return;
    await sellCall.mutateAsync({
      stock_id: stock.id,
      strike: strikeNum,
      premium: premiumNum,
      expDate,
      dateOpened,
      notes: notes.trim() === '' ? null : notes.trim(),
    });
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) sellCall.reset();
    onOpenChange(next);
  }

  return (
    <MutationModal
      open={open}
      onOpenChange={handleOpenChange}
      title={`Sell covered call against ${stock.symbol}`}
      onSubmit={handleSubmit}
      submitLabel="Sell call"
      pendingLabel="Selling…"
      isPending={sellCall.isPending}
      canSubmit={canSubmit}
      error={
        (sellCall.error as Error | null) ??
        (validationError ? new Error(validationError) : null)
      }
      contentClassName="max-w-lg"
    >
      <div className="rounded-md border border-border bg-surface-raised p-3 text-sm">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-faint">
          Position
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
          <Stat label="Shares" value={`${stock.shares} sh`} />
          <Stat label="Cost basis" value={`${fmtUSD(stock.cost_basis)}/sh`} />
          <Stat label="Contracts" value={String(contracts)} />
          <Stat
            label="Open CCs"
            value={String(
              trades.filter(
                (t) =>
                  t.is_covered_call &&
                  t.linked_stock_id === stock.id &&
                  t.status === 'open'
              ).length
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Strike" htmlFor="cc-strike">
          <Input
            id="cc-strike"
            type="number"
            step="0.01"
            min="0"
            value={strike}
            onChange={(e) => setStrike(e.target.value)}
            placeholder="e.g. 280"
            autoFocus
          />
        </Field>
        <Field label="Premium ($/share)" htmlFor="cc-premium">
          <Input
            id="cc-premium"
            type="number"
            step="0.01"
            min="0"
            value={premium}
            onChange={(e) => setPremium(e.target.value)}
            placeholder="e.g. 3.50"
          />
        </Field>
        <Field label="Date opened" htmlFor="cc-date-opened">
          <Input
            id="cc-date-opened"
            type="date"
            value={dateOpened}
            onChange={(e) => setDateOpened(e.target.value)}
          />
        </Field>
        <Field label="Expiration" htmlFor="cc-exp-date">
          <Input
            id="cc-exp-date"
            type="date"
            value={expDate}
            onChange={(e) => setExpDate(e.target.value)}
          />
        </Field>
      </div>

      {projection && (
        <div className="rounded-md border border-roll bg-roll-bg p-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-roll">
            Projection
          </div>
          <div className="mt-1 grid grid-cols-1 gap-1 tabular-nums">
            <div className="flex items-baseline justify-between">
              <span className="text-text-muted">Running P&amp;L after sale</span>
              <span
                className={
                  'font-semibold ' +
                  (projection.runningAfter >= 0 ? 'text-credit' : 'text-debit')
                }
              >
                {fmtSignedUSD(projection.runningAfter)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-text-muted">
                If called away at {fmtUSD(projection.lowestStrike)}
              </span>
              <span
                className={
                  'font-semibold ' +
                  (projection.ifCalledAway >= 0 ? 'text-credit' : 'text-debit')
                }
              >
                {fmtSignedUSD(projection.ifCalledAway)}
              </span>
            </div>
          </div>
          {strikeNum > 0 && strikeNum <= stock.cost_basis && (
            <p className="mt-2 text-xs text-debit">
              Strike is at or below cost basis ({fmtUSD(stock.cost_basis)}) —
              if called away, the stock leg locks in a loss.
            </p>
          )}
        </div>
      )}

      <Field label="Notes" htmlFor="cc-notes">
        <textarea
          id="cc-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint focus-visible:border-credit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-credit"
          placeholder="Strategy, market context, etc."
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
