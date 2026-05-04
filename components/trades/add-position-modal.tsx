'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MutationModal } from '@/components/ui/mutation-modal';
import { fmtUSD } from '@/components/trades/format';
import { useAddPosition } from '@/lib/queries/use-wheel';
import { useFullState } from '@/lib/queries/use-state';
import { detectSmartCloseMatch } from '@/lib/wheel/smart-close';
import type { AddPositionInput } from '@/lib/wheel/plan';
import type { TradeAction, TradeType } from '@/types/trade';

// Add Position — top-bar entry point for both:
//   - Plain add: new sell put/call or buy leg.
//   - Smart-close: typing a BUY with a matching open SELL (same symbol +
//     trade_ref) auto-closes that sell instead of inserting a free-floating
//     buy. The planner (planAddTrade) handles routing; the modal surfaces
//     the match as a heads-up callout above submit so the user isn't
//     surprised by side effects.
//
// Default-date pattern (per established convention): date_opened defaults
// to today, exp_date defaults to today+30 (~30 DTE typical entry).
export function AddPositionModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: state } = useFullState();
  const addPosition = useAddPosition();

  const [symbol, setSymbol] = useState('');
  const [action, setAction] = useState<TradeAction>('sell');
  const [type, setType] = useState<TradeType>('put');
  const [strike, setStrike] = useState('');
  const [premium, setPremium] = useState('');
  const [contracts, setContracts] = useState('1');
  const [dateOpened, setDateOpened] = useState('');
  const [expDate, setExpDate] = useState('');
  const [priceAtAction, setPriceAtAction] = useState('');
  const [account, setAccount] = useState('');
  const [tradeRef, setTradeRef] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (!open) return;
    setSymbol('');
    setAction('sell');
    setType('put');
    setStrike('');
    setPremium('');
    setContracts('1');
    setDateOpened(todayISO());
    setExpDate(addDaysISO(30));
    setPriceAtAction('');
    setAccount('');
    setTradeRef('');
    setInfo('');
    addPosition.reset();
    // addPosition.reset is stable; intentionally omitted from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const accounts = state?.accounts ?? [];
  const openTrades = state?.trades.filter((t) => t.status === 'open') ?? [];

  const strikeNum = parseFloat(strike);
  const premiumNum = parseFloat(premium);
  const contractsNum = parseInt(contracts, 10);
  const priceAtActionNum =
    priceAtAction.trim() === '' ? null : parseFloat(priceAtAction);

  // Live smart-close detection: typed buy + trade_ref + matching open sell.
  const smartCloseMatch = useMemo(() => {
    if (action !== 'buy') return null;
    if (tradeRef.trim() === '') return null;
    if (symbol.trim() === '') return null;
    if (Number.isNaN(contractsNum) || contractsNum < 1) return null;
    const candidateInput: AddPositionInput = {
      trade_ref: tradeRef.trim(),
      account: account === '' ? null : account,
      symbol: symbol.trim().toUpperCase(),
      contracts: contractsNum,
      strike: Number.isNaN(strikeNum) ? null : strikeNum,
      premium: Number.isNaN(premiumNum) ? 0 : premiumNum,
      action: 'buy',
      type,
      date_opened: dateOpened,
      exp_date: expDate === '' ? null : expDate,
      price_at_action: priceAtActionNum,
      info: info.trim() === '' ? null : info.trim(),
    };
    return detectSmartCloseMatch(candidateInput, openTrades);
  }, [
    action,
    tradeRef,
    symbol,
    contractsNum,
    strikeNum,
    premiumNum,
    type,
    dateOpened,
    expDate,
    priceAtActionNum,
    account,
    info,
    openTrades,
  ]);

  const validationError = (() => {
    if (symbol.trim() === '') return 'Symbol is required.';
    if (Number.isNaN(strikeNum) || strikeNum <= 0)
      return 'Strike must be a positive number.';
    if (Number.isNaN(premiumNum) || premiumNum < 0)
      return 'Premium must be a non-negative number.';
    if (Number.isNaN(contractsNum) || contractsNum < 1 || !Number.isInteger(contractsNum))
      return 'Contracts must be an integer ≥ 1.';
    if (dateOpened === '') return 'Date opened is required.';
    if (expDate === '') return 'Expiration is required.';
    if (expDate <= dateOpened)
      return 'Expiration must be after date opened.';
    if (priceAtAction.trim() !== '' && (Number.isNaN(priceAtActionNum!) || priceAtActionNum! < 0))
      return 'Underlying price must be a non-negative number.';
    return null;
  })();

  const canSubmit = validationError === null && !addPosition.isPending;

  async function handleSubmit() {
    const input: AddPositionInput = {
      trade_ref: tradeRef.trim() === '' ? null : tradeRef.trim(),
      account: account === '' ? null : account,
      symbol: symbol.trim().toUpperCase(),
      contracts: contractsNum,
      strike: strikeNum,
      premium: premiumNum,
      action,
      type,
      date_opened: dateOpened,
      exp_date: expDate,
      // price_at_action defaults to strike when blank, per spec.
      price_at_action: priceAtActionNum ?? strikeNum,
      info: info.trim() === '' ? null : info.trim(),
    };
    await addPosition.mutateAsync(input);
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) addPosition.reset();
    onOpenChange(next);
  }

  return (
    <MutationModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Add position"
      onSubmit={handleSubmit}
      submitLabel={smartCloseMatch ? 'Close matching position' : 'Add position'}
      pendingLabel="Saving…"
      isPending={addPosition.isPending}
      canSubmit={canSubmit}
      error={
        (addPosition.error as Error | null) ??
        (validationError ? new Error(validationError) : null)
      }
      contentClassName="max-w-2xl"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Symbol" htmlFor="add-symbol">
          <Input
            id="add-symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="e.g. NVDA"
            autoFocus
          />
        </Field>
        <Field label="Action" htmlFor="add-action">
          <select
            id="add-action"
            value={action}
            onChange={(e) => setAction(e.target.value as TradeAction)}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text focus-visible:border-credit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-credit"
          >
            <option value="sell">Sell</option>
            <option value="buy">Buy</option>
          </select>
        </Field>
        <Field label="Type" htmlFor="add-type">
          <select
            id="add-type"
            value={type}
            onChange={(e) => setType(e.target.value as TradeType)}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text focus-visible:border-credit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-credit"
          >
            <option value="put">Put</option>
            <option value="call">Call</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Strike" htmlFor="add-strike">
          <Input
            id="add-strike"
            type="number"
            step="0.01"
            min="0"
            value={strike}
            onChange={(e) => setStrike(e.target.value)}
            placeholder="e.g. 400"
          />
        </Field>
        <Field label="Premium ($/share)" htmlFor="add-premium">
          <Input
            id="add-premium"
            type="number"
            step="0.01"
            min="0"
            value={premium}
            onChange={(e) => setPremium(e.target.value)}
            placeholder="e.g. 5.00"
          />
        </Field>
        <Field label="Contracts" htmlFor="add-contracts">
          <Input
            id="add-contracts"
            type="number"
            step="1"
            min="1"
            value={contracts}
            onChange={(e) => setContracts(e.target.value)}
          />
        </Field>
        <Field label="Underlying price (optional)" htmlFor="add-price-at-action">
          <Input
            id="add-price-at-action"
            type="number"
            step="0.01"
            min="0"
            value={priceAtAction}
            onChange={(e) => setPriceAtAction(e.target.value)}
            placeholder="defaults to strike"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Date opened" htmlFor="add-date-opened">
          <Input
            id="add-date-opened"
            type="date"
            value={dateOpened}
            onChange={(e) => setDateOpened(e.target.value)}
          />
        </Field>
        <Field label="Expiration" htmlFor="add-exp-date">
          <Input
            id="add-exp-date"
            type="date"
            value={expDate}
            onChange={(e) => setExpDate(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Account" htmlFor="add-account">
          <select
            id="add-account"
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
          </select>
        </Field>
        <Field label="Trade Ref" htmlFor="add-trade-ref">
          <Input
            id="add-trade-ref"
            value={tradeRef}
            onChange={(e) => setTradeRef(e.target.value)}
            placeholder="e.g. 105"
          />
        </Field>
      </div>

      <Field label="Info / notes" htmlFor="add-info">
        <textarea
          id="add-info"
          value={info}
          onChange={(e) => setInfo(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint focus-visible:border-credit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-credit"
          placeholder="Strategy, market context, etc."
        />
      </Field>

      {smartCloseMatch && (
        <div className="rounded-md border border-roll bg-roll-bg p-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-roll">
            Smart-close detected
          </div>
          <p className="mt-1 text-text">
            This matches your open{' '}
            <span className="font-semibold">
              {smartCloseMatch.symbol} {fmtUSD(smartCloseMatch.strike)}{' '}
              {smartCloseMatch.type}
            </span>{' '}
            (Trade Ref:{' '}
            <code className="rounded bg-surface-raised px-1">
              {smartCloseMatch.trade_ref}
            </code>
            ). Submitting will close that position and group both legs under{' '}
            <code className="rounded bg-surface-raised px-1">
              Trade Ref: {smartCloseMatch.trade_ref}
            </code>
            , not create a new buy.
          </p>
          <p className="mt-2 text-xs text-text-faint">
            Override by clearing the Trade Ref field if you meant a fresh buy.
          </p>
        </div>
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
