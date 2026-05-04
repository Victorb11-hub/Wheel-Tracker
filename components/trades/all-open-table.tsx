'use client';

import { useState } from 'react';
import {
  calculateCashRequired,
  calculateOTM,
  calculatePL,
  calculateReturnPercent,
} from '@/lib/calculations';
import type { CustomAccount, StockPosition, Trade } from '@/types/trade';
import { ActionBadge, RolledBadge, StatusBadge, TypeBadge } from './badges';
import { EditTradeModal } from './edit-trade-modal';
import { fmtDate, fmtSignedPct, fmtSignedUSD, fmtUSD } from './format';
import { cn } from '@/lib/utils';

const TH =
  'border-b border-border bg-surface-raised px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-faint';
const TD =
  'border-b border-border px-4 py-3 align-middle text-sm whitespace-nowrap';
const TD_NUM = 'tabular-nums text-right';

const ROW_ACTION =
  'rounded-sm border border-border bg-transparent px-2 py-1 text-xs font-medium text-text-muted transition-colors';
const ACTION_HOVER: Record<string, string> = {
  edit: 'hover:border-roll hover:text-roll',
  roll: 'hover:border-roll hover:text-roll',
  close: 'hover:border-credit hover:text-credit',
  assign: 'hover:border-assignment hover:text-assignment',
  delete: 'hover:border-debit hover:text-debit',
};

interface Props {
  trades: Trade[];
  stocks: StockPosition[];
  closedTrades: Trade[];
  accounts: CustomAccount[];
}

export function AllOpenTable({ trades, stocks, closedTrades, accounts }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingTrade = editingId
    ? trades.find((t) => t.id === editingId) ?? null
    : null;

  // Merge: open trades + held stock positions, ordered by date_opened desc.
  const openTrades = trades
    .filter((t) => t.status === 'open')
    .sort(
      (a, b) =>
        new Date(b.date_opened).getTime() - new Date(a.date_opened).getTime()
    );

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(TH, 'text-left')}>Symbol</th>
              <th className={cn(TH, 'text-right')}>Contracts</th>
              <th className={cn(TH, 'text-right')}>Strike</th>
              <th className={cn(TH, 'text-right')}>Premium</th>
              <th className={cn(TH, 'text-left')}>Action</th>
              <th className={cn(TH, 'text-left')}>Type</th>
              <th className={cn(TH, 'text-left')}>Date Opened ↓</th>
              <th className={cn(TH, 'text-left')}>Exp Date</th>
              <th className={cn(TH, 'text-right')}>Cash Required</th>
              <th className={cn(TH, 'text-right')}>Return %</th>
              <th className={cn(TH, 'text-right')}>% OTM</th>
              <th className={cn(TH, 'text-right')}>P&amp;L</th>
              <th className={cn(TH, 'text-left')}>Info</th>
              <th className={cn(TH, 'text-left')}>Ref</th>
              <th className={cn(TH, 'text-left')}>Account</th>
              <th className={cn(TH, 'text-left')}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {openTrades.map((t) => (
              <TradeRow
                key={t.id}
                t={t}
                closedTrades={closedTrades}
                onEdit={() => setEditingId(t.id)}
              />
            ))}
            {stocks.map((s) => (
              <StockRow key={s.id} s={s} />
            ))}
          </tbody>
        </table>
      </div>

      <EditTradeModal
        trade={editingTrade}
        accounts={accounts}
        open={editingTrade !== null}
        onOpenChange={(next) => {
          if (!next) setEditingId(null);
        }}
      />
    </>
  );
}

function TradeRow({
  t,
  closedTrades,
  onEdit,
}: {
  t: Trade;
  closedTrades: Trade[];
  onEdit: () => void;
}) {
  if (t.action !== 'sell' && t.action !== 'buy') return null;
  // After this guard t is RegularLeg
  const cash = calculateCashRequired(t);
  const ret = calculateReturnPercent(t);
  const otm = calculateOTM(t);
  const pl = calculatePL(t, closedTrades);

  return (
    <tr className="transition-colors hover:bg-surface-hover">
      <td className={TD}>
        <span className="inline-flex items-center gap-2">
          <a href="#" className="font-semibold text-text hover:text-credit">
            {t.symbol}
          </a>
          {t.is_rolled && <RolledBadge />}
        </span>
      </td>
      <td className={cn(TD, TD_NUM)}>{t.contracts}</td>
      <td className={cn(TD, TD_NUM)}>{fmtUSD(t.strike)}</td>
      <td className={cn(TD, TD_NUM)}>{fmtUSD(t.premium)}</td>
      <td className={TD}>
        <ActionBadge action={t.action} />
      </td>
      <td className={TD}>
        <TypeBadge type={t.type} />
      </td>
      <td className={TD}>{fmtDate(t.date_opened)}</td>
      <td className={TD}>{fmtDate(t.exp_date)}</td>
      <td className={cn(TD, TD_NUM)}>{fmtUSD(cash, { cents: false })}</td>
      <td className={cn(TD, TD_NUM, sign(ret))}>{fmtSignedPct(ret)}</td>
      <td className={cn(TD, TD_NUM, sign(otm))}>{fmtSignedPct(otm)}</td>
      <td className={cn(TD, TD_NUM, pl > 0 && 'text-credit', pl < 0 && 'text-debit')}>
        {fmtSignedUSD(pl)}
      </td>
      <td className={cn(TD, 'max-w-[220px] overflow-hidden text-ellipsis text-text-muted')}>
        <div className="overflow-hidden text-ellipsis whitespace-nowrap">
          {t.info ?? '—'}
        </div>
      </td>
      <td className={cn(TD, t.trade_ref ? '' : 'text-text-faint')}>
        {t.trade_ref ?? '—'}
      </td>
      <td className={TD}>{t.account ?? '—'}</td>
      <td className={TD}>
        <div className="inline-flex gap-1">
          <button className={cn(ROW_ACTION, ACTION_HOVER.edit)} onClick={onEdit}>
            Edit
          </button>
          <button className={cn(ROW_ACTION, ACTION_HOVER.roll)}>Roll</button>
          <button className={cn(ROW_ACTION, ACTION_HOVER.close)}>Close</button>
          {t.action === 'sell' && t.type === 'put' && (
            <button className={cn(ROW_ACTION, ACTION_HOVER.assign)}>Assign</button>
          )}
          <button className={cn(ROW_ACTION, ACTION_HOVER.delete)}>Delete</button>
        </div>
      </td>
    </tr>
  );
}

function StockRow({ s }: { s: StockPosition }) {
  // Running P&L: realized covered-call premium + unrealized stock gain at cost.
  // We don't track live prices, so display only collected premiums + (sale 0 - cost) avoided.
  // Conservative: callPremiums minus 0 unrealized (since we don't know current price).
  const callPremiums = s.covered_calls.reduce((sum, c) => sum + c.premium, 0);
  const runningPL = s.original_put.premiumCollected + callPremiums;

  return (
    <tr className="bg-assignment-bg transition-colors hover:bg-assignment-bg-strong">
      <td className={cn(TD, 'border-l-[3px] border-l-assignment')}>
        <div className="flex flex-col">
          <a href="#" className="font-semibold text-text hover:text-credit">
            {s.symbol}
          </a>
          <span className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-assignment">
            Stock · {s.shares} sh
          </span>
        </div>
      </td>
      <td className={cn(TD, TD_NUM, 'text-text-faint')}>—</td>
      <td className={cn(TD, TD_NUM)}>{fmtUSD(s.cost_basis)}</td>
      <td className={cn(TD, TD_NUM, 'text-text-faint')}>—</td>
      <td className={TD}>
        <StatusBadge status="assigned" />
      </td>
      <td className={TD}>
        <TypeBadge type="stock" />
      </td>
      <td className={TD}>{fmtDate(s.assigned_date)}</td>
      <td className={cn(TD, 'text-text-faint')}>—</td>
      <td className={cn(TD, TD_NUM)}>{fmtUSD(s.total_value, { cents: false })}</td>
      <td className={cn(TD, TD_NUM, 'text-text-faint')}>—</td>
      <td className={cn(TD, TD_NUM, 'text-text-faint')}>—</td>
      <td className={cn(TD, TD_NUM, runningPL >= 0 ? 'text-credit' : 'text-debit')}>
        {fmtSignedUSD(runningPL)}
        <div className="text-xs font-normal text-text-faint">Running P&amp;L</div>
      </td>
      <td className={cn(TD, 'max-w-[220px] overflow-hidden text-ellipsis text-text-muted')}>
        <div className="overflow-hidden text-ellipsis whitespace-nowrap">
          Cost basis {fmtUSD(s.cost_basis)} · {s.covered_calls.length} covered{' '}
          {s.covered_calls.length === 1 ? 'call' : 'calls'} written
        </div>
      </td>
      <td className={TD}>{s.trade_ref ?? '—'}</td>
      <td className={TD}>{s.account ?? '—'}</td>
      <td className={TD}>
        <div className="inline-flex gap-1">
          <button className={cn(ROW_ACTION, ACTION_HOVER.edit)}>Sell Call</button>
          <button className={cn(ROW_ACTION, ACTION_HOVER.assign)}>
            Called Away
          </button>
          <button className={cn(ROW_ACTION, ACTION_HOVER.delete)}>Delete</button>
        </div>
      </td>
    </tr>
  );
}

function sign(s: string): string {
  const n = parseFloat(s);
  if (n > 0) return 'text-credit';
  if (n < 0) return 'text-debit';
  return '';
}
