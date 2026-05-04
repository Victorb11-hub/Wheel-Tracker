'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MutationModal } from '@/components/ui/mutation-modal';
import { useEditTrade } from '@/lib/queries/use-trades';
import type { CustomAccount, Trade } from '@/types/trade';

// Edit modal — non-financial + financial fields.
//
// Financial-field edits (strike/premium/contracts/close_price) on a
// closed/assigned trade trigger a two-stage confirm: user fills the form,
// clicks Save, sees a warning that downstream P&L (Total P&L, Win Rate,
// Overall Return) will recompute, and must confirm before the mutation fires.
//
// Synthetic rows (action='assignment' | 'called-away') don't expose the
// financial section — those values come from the assignment event itself
// and editing them here would diverge from the linked stock-position
// snapshot.
//
// TODO: Editing financial fields on a put that triggered an assignment
// (status='assigned') won't auto-recompute the StockPosition's
// original_put.{premium, premiumCollected} snapshot or any Full Wheel Cycle
// group's full_cycle_pl. Capture this when those derivations are wired up.
export function EditTradeModal({
  trade,
  accounts,
  open,
  onOpenChange,
}: {
  trade: Trade | null;
  accounts: CustomAccount[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const editTrade = useEditTrade();

  const [info, setInfo] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [tradeRef, setTradeRef] = useState('');
  const [account, setAccount] = useState('');
  const [dateOpened, setDateOpened] = useState('');
  const [dateClosed, setDateClosed] = useState('');
  const [expDate, setExpDate] = useState('');
  // Financial fields stored as strings to preserve user input fidelity.
  const [strike, setStrike] = useState('');
  const [premium, setPremium] = useState('');
  const [contracts, setContracts] = useState('');
  const [closePrice, setClosePrice] = useState('');

  const [stage, setStage] = useState<'edit' | 'confirm'>('edit');

  // Reset form when the modal opens for a different trade.
  useEffect(() => {
    if (!trade) return;
    setInfo(trade.info ?? '');
    setClosingNotes(trade.closing_notes ?? '');
    setTradeRef(trade.trade_ref ?? '');
    setAccount(trade.account ?? '');
    setDateOpened(trade.date_opened ?? '');
    setDateClosed(trade.date_closed ?? '');
    setExpDate(trade.exp_date ?? '');
    setStrike(String(trade.strike ?? ''));
    setPremium(String(trade.premium ?? ''));
    setContracts(String(trade.contracts ?? ''));
    setClosePrice(trade.close_price != null ? String(trade.close_price) : '');
    setStage('edit');
    editTrade.reset();
    // editTrade.reset is stable; intentionally omitted from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade?.id, open]);

  if (!trade) return null;

  const isClosed = trade.status !== 'open';
  const isRegularLeg = trade.action === 'sell' || trade.action === 'buy';

  function emptyToNull(s: string): string | null {
    const t = s.trim();
    return t === '' ? null : t;
  }

  // Detect whether any financial input differs from the original trade.
  // Compares as numbers (so "5" vs "5.00" reads as unchanged), and treats
  // empty close_price as null.
  function financialFieldsChanged(): boolean {
    if (!trade || !isRegularLeg) return false;
    const numChanged = (input: string, original: number) => {
      const parsed = parseFloat(input);
      if (Number.isNaN(parsed)) return true; // bad input → flag as changed
      return parsed !== original;
    };
    if (numChanged(strike, trade.strike)) return true;
    if (numChanged(premium, trade.premium)) return true;
    if (numChanged(contracts, trade.contracts)) return true;
    const cp = closePrice.trim();
    const origCp = trade.close_price;
    if (cp === '' && origCp != null) return true;
    if (cp !== '' && (origCp == null || parseFloat(cp) !== origCp)) return true;
    return false;
  }

  function buildPatch(): Partial<Trade> {
    const base: Partial<Trade> = {
      info: emptyToNull(info),
      closing_notes: emptyToNull(closingNotes),
      trade_ref: emptyToNull(tradeRef),
      account: emptyToNull(account),
      date_opened: dateOpened,
      date_closed: emptyToNull(dateClosed),
      exp_date: emptyToNull(expDate),
    };
    if (isRegularLeg) {
      const cp = closePrice.trim();
      Object.assign(base, {
        strike: parseFloat(strike),
        premium: parseFloat(premium),
        contracts: parseInt(contracts, 10),
        close_price: cp === '' ? null : parseFloat(cp),
      });
    }
    return base;
  }

  function validate(): string | null {
    if (isRegularLeg) {
      if (Number.isNaN(parseFloat(strike)) || parseFloat(strike) < 0)
        return 'Strike must be a non-negative number.';
      if (Number.isNaN(parseFloat(premium)) || parseFloat(premium) < 0)
        return 'Premium must be a non-negative number.';
      const c = parseInt(contracts, 10);
      if (Number.isNaN(c) || c < 1) return 'Contracts must be at least 1.';
      const cp = closePrice.trim();
      if (cp !== '' && (Number.isNaN(parseFloat(cp)) || parseFloat(cp) < 0))
        return 'Close price must be a non-negative number.';
    }
    return null;
  }

  const validationError = validate();
  const canSubmit = validationError === null && !editTrade.isPending;
  const needsConfirm = isClosed && financialFieldsChanged();

  async function runMutation() {
    if (!trade) return;
    await editTrade.mutateAsync({ id: trade.id, patch: buildPatch() });
    onOpenChange(false);
  }

  function handlePrimary() {
    if (validationError !== null) return;
    if (stage === 'edit' && needsConfirm) {
      setStage('confirm');
      return;
    }
    void runMutation();
  }

  // CONFIRM STAGE — recompute warning before commit.
  if (stage === 'confirm') {
    return (
      <MutationModal
        open={open}
        onOpenChange={(next) => {
          if (!next) editTrade.reset();
          onOpenChange(next);
        }}
        title="Recompute downstream P&L?"
        onSubmit={runMutation}
        submitLabel="Confirm and save"
        pendingLabel="Saving…"
        cancelLabel="Back"
        isPending={editTrade.isPending}
        error={editTrade.error as Error | null}
        contentClassName="max-w-md"
      >
        <div className="rounded-md border border-assignment bg-assignment-bg p-3 text-sm text-assignment">
          <p className="font-semibold">
            You&rsquo;re editing financial fields on a {trade.status} trade.
          </p>
          <p className="mt-2 text-text">
            Total P&amp;L, Win Rate, and Overall Return will recalculate from
            the new values. Any group this trade belongs to will reflect the
            updated P&amp;L immediately.
          </p>
        </div>
      </MutationModal>
    );
  }

  // EDIT STAGE
  return (
    <MutationModal
      open={open}
      onOpenChange={(next) => {
        if (!next) editTrade.reset();
        onOpenChange(next);
      }}
      title={`Edit ${trade.symbol} ${trade.action} ${trade.type}`}
      onSubmit={handlePrimary}
      submitLabel={needsConfirm ? 'Save…' : 'Save changes'}
      pendingLabel="Saving…"
      isPending={editTrade.isPending}
      canSubmit={canSubmit}
      error={(editTrade.error as Error | null) ?? validationErrorAsError(validationError)}
      contentClassName="max-w-xl"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Trade Ref" htmlFor="edit-trade-ref">
          <Input
            id="edit-trade-ref"
            value={tradeRef}
            onChange={(e) => setTradeRef(e.target.value)}
            placeholder="e.g. 102"
          />
        </Field>

        <Field label="Account" htmlFor="edit-trade-account">
          <select
            id="edit-trade-account"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text focus-visible:border-credit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-credit"
          >
            <option value="">— No account —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
            {account && !accounts.some((a) => a.name === account) && (
              <option value={account}>{account}</option>
            )}
          </select>
        </Field>

        <Field label="Date Opened" htmlFor="edit-trade-date-opened">
          <Input
            id="edit-trade-date-opened"
            type="date"
            value={dateOpened}
            onChange={(e) => setDateOpened(e.target.value)}
          />
        </Field>

        <Field label="Expiration" htmlFor="edit-trade-exp">
          <Input
            id="edit-trade-exp"
            type="date"
            value={expDate}
            onChange={(e) => setExpDate(e.target.value)}
          />
        </Field>

        {isClosed && (
          <Field label="Date Closed" htmlFor="edit-trade-date-closed">
            <Input
              id="edit-trade-date-closed"
              type="date"
              value={dateClosed}
              onChange={(e) => setDateClosed(e.target.value)}
            />
          </Field>
        )}
      </div>

      {isRegularLeg && (
        <div className="rounded-md border border-border bg-surface-raised p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-faint">
            Financial fields
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Field label="Strike" htmlFor="edit-trade-strike">
              <Input
                id="edit-trade-strike"
                type="number"
                step="0.01"
                min="0"
                value={strike}
                onChange={(e) => setStrike(e.target.value)}
              />
            </Field>
            <Field label="Premium" htmlFor="edit-trade-premium">
              <Input
                id="edit-trade-premium"
                type="number"
                step="0.01"
                min="0"
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
              />
            </Field>
            <Field label="Contracts" htmlFor="edit-trade-contracts">
              <Input
                id="edit-trade-contracts"
                type="number"
                step="1"
                min="1"
                value={contracts}
                onChange={(e) => setContracts(e.target.value)}
              />
            </Field>
            {isClosed && (
              <Field label="Close Price" htmlFor="edit-trade-close-price">
                <Input
                  id="edit-trade-close-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={closePrice}
                  onChange={(e) => setClosePrice(e.target.value)}
                  placeholder="—"
                />
              </Field>
            )}
          </div>
        </div>
      )}

      <Field label="Info / notes" htmlFor="edit-trade-info">
        <textarea
          id="edit-trade-info"
          value={info}
          onChange={(e) => setInfo(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint focus-visible:border-credit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-credit"
          placeholder="Open-leg context, strategy notes…"
        />
      </Field>

      {isClosed && (
        <Field label="Closing notes" htmlFor="edit-trade-closing-notes">
          <textarea
            id="edit-trade-closing-notes"
            value={closingNotes}
            onChange={(e) => setClosingNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint focus-visible:border-credit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-credit"
            placeholder="Why this trade closed, broker note, etc."
          />
        </Field>
      )}
    </MutationModal>
  );
}

function validationErrorAsError(msg: string | null): Error | null {
  return msg ? new Error(msg) : null;
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
