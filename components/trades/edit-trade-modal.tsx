'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MutationModal } from '@/components/ui/mutation-modal';
import { useEditTrade } from '@/lib/queries/use-trades';
import type { CustomAccount, Trade } from '@/types/trade';

// Edit (non-financial) — info, closing_notes, trade_ref, account, dates.
// Financial fields (strike/premium/contracts/close_price/price_at_action)
// will be added in a follow-up step with a recompute warning per plan.
//
// TODO: when financial-field edits are added, recompute downstream snapshots
// for puts that triggered an assignment (StockPosition.original_put.* +
// any Full Wheel Cycle group's full_cycle_pl). Currently those are frozen
// at the moment of assignment and won't auto-update on edits.
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
    editTrade.reset();
    // editTrade.reset is stable across renders; intentionally omitted from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade?.id, open]);

  if (!trade) return null;

  const isClosed = trade.status !== 'open';

  function emptyToNull(s: string): string | null {
    const trimmed = s.trim();
    return trimmed === '' ? null : trimmed;
  }

  async function handleSubmit() {
    if (!trade) return;
    await editTrade.mutateAsync({
      id: trade.id,
      patch: {
        info: emptyToNull(info),
        closing_notes: emptyToNull(closingNotes),
        trade_ref: emptyToNull(tradeRef),
        account: emptyToNull(account),
        date_opened: dateOpened,
        date_closed: emptyToNull(dateClosed),
        exp_date: emptyToNull(expDate),
      },
    });
    onOpenChange(false);
  }

  return (
    <MutationModal
      open={open}
      onOpenChange={(next) => {
        if (!next) editTrade.reset();
        onOpenChange(next);
      }}
      title={`Edit ${trade.symbol} ${trade.action} ${trade.type}`}
      description={
        <>
          Editing non-financial fields. Strike, premium, contracts and close
          price are not editable here yet.
        </>
      }
      onSubmit={handleSubmit}
      submitLabel="Save changes"
      pendingLabel="Saving…"
      isPending={editTrade.isPending}
      error={editTrade.error as Error | null}
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
            {/* Preserve a free-form account that doesn't exist in accounts list */}
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
