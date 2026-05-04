'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MutationModal } from '@/components/ui/mutation-modal';
import { fmtDate, fmtSignedUSD, fmtUSD } from '@/components/trades/format';
import { useRollTrade } from '@/lib/queries/use-wheel';
import type { Trade } from '@/types/trade';

// Roll an open option leg. Wraps lib/wheel/roll.ts. The planner produces a
// 3-write transaction:
//   1. Marks the original trade closed + is_rolled=true.
//   2. Inserts the buy-to-close leg (action flipped, is_closing_trade=true,
//      is_rolled=true).
//   3. Inserts the new opening leg (status='open', is_rolled=true, same
//      trade_ref, type per user choice — usually same).
// Original + buy-to-close go into `Trade Ref: {ref}` group; new open leg
// stays out until it's closed/rolled later.
//
// Default-date pattern (per established convention): "happens-now" dates
// default to today, "future" dates default to today+30.
export function RollTradeModal({
  trade,
  open,
  onOpenChange,
}: {
  trade: Trade | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rollTrade = useRollTrade();

  const [closeDate, setCloseDate] = useState('');
  const [closingPremium, setClosingPremium] = useState('');
  const [newStrike, setNewStrike] = useState('');
  const [newPremium, setNewPremium] = useState('');
  const [newExpDate, setNewExpDate] = useState('');
  const [newType, setNewType] = useState<'put' | 'call'>('put');
  const [priceAtAction, setPriceAtAction] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!trade) return;
    setCloseDate(todayISO());
    setClosingPremium('');
    setNewStrike('');
    setNewPremium('');
    setNewExpDate(addDaysISO(30));
    setNewType(trade.type === 'call' ? 'call' : 'put');
    setPriceAtAction('');
    setNotes('');
    rollTrade.reset();
    // rollTrade.reset is stable; intentionally omitted from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade?.id, open]);

  if (!trade) return null;
  if (trade.action !== 'sell' && trade.action !== 'buy') return null;

  const closingPremiumNum = parseFloat(closingPremium);
  const newStrikeNum = parseFloat(newStrike);
  const newPremiumNum = parseFloat(newPremium);
  const priceAtActionNum = priceAtAction.trim() === '' ? null : parseFloat(priceAtAction);

  const validationError = (() => {
    if (closeDate === '') return 'Roll close date is required.';
    if (closingPremium === '' || Number.isNaN(closingPremiumNum) || closingPremiumNum < 0)
      return 'Buyback price must be a non-negative number.';
    if (newStrike === '' || Number.isNaN(newStrikeNum) || newStrikeNum <= 0)
      return 'New strike must be a positive number.';
    if (newPremium === '' || Number.isNaN(newPremiumNum) || newPremiumNum < 0)
      return 'New premium must be a non-negative number.';
    if (newExpDate === '') return 'New expiration is required.';
    if (newExpDate <= closeDate)
      return 'New expiration must be after the roll close date.';
    if (priceAtAction.trim() !== '' && (Number.isNaN(priceAtActionNum!) || priceAtActionNum! < 0))
      return 'Underlying price must be a non-negative number.';
    return null;
  })();

  const canSubmit = validationError === null && !rollTrade.isPending;

  // Net credit/debit on the roll: new premium received − buyback paid (sells).
  // For a short position being rolled (the wheel-tracker norm), positive
  // means rolled for credit.
  const previewNet = (() => {
    if (Number.isNaN(closingPremiumNum) || Number.isNaN(newPremiumNum)) return null;
    const newDollars = newPremiumNum * trade.contracts * 100;
    const closingDollars = closingPremiumNum * trade.contracts * 100;
    return trade.action === 'sell'
      ? newDollars - closingDollars
      : closingDollars - newDollars;
  })();

  async function handleSubmit() {
    if (!trade) return;
    await rollTrade.mutateAsync({
      trade_id: trade.id,
      rollCloseDate: closeDate,
      rollClosingPremium: closingPremiumNum,
      rollNewStrike: newStrikeNum,
      rollNewPremium: newPremiumNum,
      rollNewExpDate: newExpDate,
      rollPriceAtAction: priceAtActionNum,
      rollNewType: newType,
      rollNotes: notes.trim() === '' ? null : notes.trim(),
    });
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) rollTrade.reset();
    onOpenChange(next);
  }

  return (
    <MutationModal
      open={open}
      onOpenChange={handleOpenChange}
      title={`Roll ${trade.symbol} ${trade.action} ${trade.type}`}
      onSubmit={handleSubmit}
      submitLabel="Roll trade"
      pendingLabel="Rolling…"
      isPending={rollTrade.isPending}
      canSubmit={canSubmit}
      error={
        (rollTrade.error as Error | null) ??
        (validationError ? new Error(validationError) : null)
      }
      contentClassName="max-w-xl"
    >
      <div className="rounded-md border border-border bg-surface-raised p-3 text-sm">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-faint">
          Original position
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
          <Stat label="Strike" value={fmtUSD(trade.strike)} />
          <Stat label="Premium" value={`${fmtUSD(trade.premium)}/sh`} />
          <Stat label="Contracts" value={String(trade.contracts)} />
          <Stat label="Expires" value={fmtDate(trade.exp_date)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Roll close date" htmlFor="roll-close-date">
          <Input
            id="roll-close-date"
            type="date"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
          />
        </Field>
        <Field label="Buyback price ($/share)" htmlFor="roll-buyback-price">
          <Input
            id="roll-buyback-price"
            type="number"
            step="0.01"
            min="0"
            value={closingPremium}
            onChange={(e) => setClosingPremium(e.target.value)}
            placeholder="e.g. 1.50"
            autoFocus
          />
        </Field>
      </div>

      <div className="rounded-md border border-border bg-surface-raised p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-faint">
          New leg
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Field label="Strike" htmlFor="roll-new-strike">
            <Input
              id="roll-new-strike"
              type="number"
              step="0.01"
              min="0"
              value={newStrike}
              onChange={(e) => setNewStrike(e.target.value)}
              placeholder="e.g. 470"
            />
          </Field>
          <Field label="Premium ($/share)" htmlFor="roll-new-premium">
            <Input
              id="roll-new-premium"
              type="number"
              step="0.01"
              min="0"
              value={newPremium}
              onChange={(e) => setNewPremium(e.target.value)}
              placeholder="e.g. 7.25"
            />
          </Field>
          <Field label="Expiration" htmlFor="roll-new-exp">
            <Input
              id="roll-new-exp"
              type="date"
              value={newExpDate}
              onChange={(e) => setNewExpDate(e.target.value)}
            />
          </Field>
          <Field label="Type" htmlFor="roll-new-type">
            <select
              id="roll-new-type"
              value={newType}
              onChange={(e) => setNewType(e.target.value as 'put' | 'call')}
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text focus-visible:border-credit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-credit"
            >
              <option value="put">Put</option>
              <option value="call">Call</option>
            </select>
          </Field>
          <Field label="Underlying price (optional)" htmlFor="roll-price-at-action">
            <Input
              id="roll-price-at-action"
              type="number"
              step="0.01"
              min="0"
              value={priceAtAction}
              onChange={(e) => setPriceAtAction(e.target.value)}
              placeholder="e.g. 495"
            />
          </Field>
        </div>
      </div>

      {previewNet !== null && (
        <div className="rounded-md border border-border bg-surface-raised p-3 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-text-muted">
              Net {previewNet >= 0 ? 'credit' : 'debit'} on roll
            </span>
            <span
              className={
                'font-semibold tabular-nums ' +
                (previewNet > 0
                  ? 'text-credit'
                  : previewNet < 0
                    ? 'text-debit'
                    : 'text-text-muted')
              }
            >
              {fmtSignedUSD(previewNet)}
            </span>
          </div>
        </div>
      )}

      <Field label="Notes" htmlFor="roll-notes">
        <textarea
          id="roll-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint focus-visible:border-credit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-credit"
          placeholder="Why this roll, market context, etc."
        />
      </Field>

      {trade.trade_ref && (
        <p className="text-xs text-text-faint">
          Both the original and the buy-to-close leg will be added to{' '}
          <code className="rounded bg-surface-raised px-1">Trade Ref: {trade.trade_ref}</code>.
          The new open leg stays outside the group until it&rsquo;s closed.
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
  return addDaysISO(0);
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
