'use client';

import { useMemo, useState } from 'react';
import { RotateCw } from 'lucide-react';
import {
  calculateCashRequired,
  calculateOTM,
  calculatePL,
  calculateReturnPercent,
} from '@/lib/calculations';
import type {
  CustomAccount,
  StockPosition,
  Trade,
  TradeGroup,
} from '@/types/trade';
import { Button } from '@/components/ui/button';
import { ActionBadge, RolledBadge, StatusBadge, TypeBadge } from './badges';
import { CloseTradeModal } from './close-trade-modal';
import { DeleteTradeModal } from './delete-trade-modal';
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

type StatusFilter = 'all' | 'open' | 'closed' | 'rolled' | 'assigned';

const STATUS_PILLS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'closed', label: 'Closed' },
  { id: 'rolled', label: 'Rolled' },
  { id: 'assigned', label: 'Assigned' },
];

type SortKey = 'symbol' | 'date_opened' | 'date_closed' | 'exp_date' | 'strike' | 'premium' | 'pl';
type SortDir = 'asc' | 'desc';

function matchesStatus(t: Trade, filter: StatusFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'open':
      return t.status === 'open';
    case 'closed':
      return t.status === 'closed';
    case 'rolled':
      return t.is_rolled === true;
    case 'assigned':
      return t.status === 'assigned' || t.action === 'assignment';
  }
}

function emptyMessage(status: StatusFilter, symbol: string): string {
  const sym = symbol === 'all' ? '' : ` ${symbol}`;
  switch (status) {
    case 'all':
      return symbol === 'all'
        ? 'No trades found.'
        : `No${sym} trades found.`;
    case 'open':
      return `No open${sym} trades found.`;
    case 'closed':
      return `No closed${sym} trades found.`;
    case 'rolled':
      return `No rolled${sym} trades found.`;
    case 'assigned':
      return `No assigned${sym} trades found.`;
  }
}

export function AllTradesTable({
  trades,
  accounts,
  groups,
  stocks,
}: {
  trades: Trade[];
  accounts: CustomAccount[];
  groups: TradeGroup[];
  stocks: StockPosition[];
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [symbolFilter, setSymbolFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date_opened');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const editingTrade = editingId
    ? trades.find((t) => t.id === editingId) ?? null
    : null;
  const deletingTrade = deletingId
    ? trades.find((t) => t.id === deletingId) ?? null
    : null;
  const closingTrade = closingId
    ? trades.find((t) => t.id === closingId) ?? null
    : null;

  // Symbols dropdown is auto-populated from the data, sorted A→Z.
  // refreshKey forces re-derivation on click — useful once Trade data is live.
  const symbols = useMemo(() => {
    const set = new Set<string>();
    for (const t of trades) set.add(t.symbol);
    return ['all', ...Array.from(set).sort()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, refreshKey]);

  const filteredSorted = useMemo(() => {
    const filtered = trades.filter(
      (t) =>
        matchesStatus(t, statusFilter) &&
        (symbolFilter === 'all' || t.symbol === symbolFilter)
    );

    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey, trades);
      const bv = sortValue(b, sortKey, trades);
      // Nulls always sort to the end, regardless of direction.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const c =
        typeof av === 'number'
          ? (av as number) - (bv as number)
          : (av as string).localeCompare(bv as string);
      return sortDir === 'asc' ? c : -c;
    });
  }, [trades, statusFilter, symbolFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'symbol' ? 'asc' : 'desc');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_PILLS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setStatusFilter(p.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                statusFilter === p.id
                  ? 'border-credit bg-credit text-text-on-accent'
                  : 'border-border bg-surface text-text-muted hover:border-border-strong hover:text-text'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-text-faint">
            Symbol
          </label>
          <select
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-surface px-2 text-sm text-text focus-visible:border-credit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-credit"
            aria-label="Filter by symbol"
          >
            {symbols.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All symbols' : s}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setRefreshKey((k) => k + 1)}
            aria-label="Refresh symbol list"
            title="Refresh symbol list"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <SortableTh label="Symbol" col="symbol" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left" />
              <th className={cn(TH, 'text-right')}>Contracts</th>
              <SortableTh label="Strike" col="strike" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
              <SortableTh label="Premium" col="premium" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
              <th className={cn(TH, 'text-left')}>Action</th>
              <th className={cn(TH, 'text-left')}>Type</th>
              <SortableTh label="Date Opened" col="date_opened" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left" />
              <SortableTh label="Date Closed" col="date_closed" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left" />
              <SortableTh label="Exp Date" col="exp_date" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left" />
              <th className={cn(TH, 'text-right')}>Cash Required</th>
              <th className={cn(TH, 'text-right')}>Return %</th>
              <th className={cn(TH, 'text-right')}>% OTM</th>
              <SortableTh label="P&L" col="pl" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
              <th className={cn(TH, 'text-left')}>Status</th>
              <th className={cn(TH, 'text-left')}>Info</th>
              <th className={cn(TH, 'text-left')}>Ref</th>
              <th className={cn(TH, 'text-left')}>Account</th>
              <th className={cn(TH, 'text-left')}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSorted.length === 0 ? (
              <tr>
                <td
                  colSpan={18}
                  className="px-4 py-12 text-center text-sm text-text-muted"
                >
                  {emptyMessage(statusFilter, symbolFilter)}
                </td>
              </tr>
            ) : (
              filteredSorted.map((t) => (
                <Row
                  key={t.id}
                  t={t}
                  allTrades={trades}
                  onEdit={() => setEditingId(t.id)}
                  onDelete={() => setDeletingId(t.id)}
                  onClose={() => setClosingId(t.id)}
                />
              ))
            )}
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

      <DeleteTradeModal
        trade={deletingTrade}
        groups={groups}
        stocks={stocks}
        open={deletingTrade !== null}
        onOpenChange={(next) => {
          if (!next) setDeletingId(null);
        }}
      />

      <CloseTradeModal
        trade={closingTrade}
        open={closingTrade !== null}
        onOpenChange={(next) => {
          if (!next) setClosingId(null);
        }}
      />
    </div>
  );
}

function SortableTh({
  label,
  col,
  sortKey,
  sortDir,
  onClick,
  align,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
  align: 'left' | 'right';
}) {
  const active = sortKey === col;
  return (
    <th
      className={cn(
        TH,
        align === 'right' ? 'text-right' : 'text-left',
        'cursor-pointer select-none hover:text-text'
      )}
      onClick={() => onClick(col)}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={cn('text-[10px]', active ? 'text-text' : 'text-text-faint')}>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </span>
    </th>
  );
}

// Returns the comparable value for a sort key. Returns null when the field is
// genuinely missing (e.g. date_closed on an open trade) so the sort can pin
// nulls to the end regardless of direction.
function sortValue(
  t: Trade,
  key: SortKey,
  allTrades: Trade[]
): string | number | null {
  switch (key) {
    case 'symbol':
      return t.symbol;
    case 'date_opened':
      return t.date_opened;
    case 'date_closed':
      return t.date_closed;
    case 'exp_date':
      return t.exp_date;
    case 'strike':
      return t.strike;
    case 'premium':
      return t.premium;
    case 'pl':
      return calculatePL(t, allTrades);
  }
}

function Row({
  t,
  allTrades,
  onEdit,
  onDelete,
  onClose,
}: {
  t: Trade;
  allTrades: Trade[];
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const cash = calculateCashRequired(t);
  const ret = calculateReturnPercent(t);
  const otm = calculateOTM(t);
  const pl = calculatePL(t, allTrades);
  const isSynthetic = t.action === 'assignment' || t.action === 'called-away';
  const isClosingLeg = t.is_closing_trade;

  // Audit-log row tints: assignment / called-away rows are stock events
  // (amber); buy-to-close legs are roll-context (also amber but lighter).
  // Hover state still reads cleanly because the base tint is alpha-blended.
  const rowTone = isSynthetic
    ? 'bg-assignment-bg-strong'
    : isClosingLeg
      ? 'bg-roll-bg'
      : '';

  return (
    <tr className={cn('transition-colors hover:bg-surface-hover', rowTone)}>
      <td className={TD}>
        <span className="inline-flex items-center gap-2">
          <a href="#" className="font-semibold text-text hover:text-credit">
            {t.symbol}
          </a>
          {t.is_rolled && <RolledBadge />}
        </span>
      </td>
      <td className={cn(TD, TD_NUM)}>{t.contracts || '—'}</td>
      <td className={cn(TD, TD_NUM)}>
        {isSynthetic ? '—' : fmtUSD(t.strike)}
      </td>
      <td className={cn(TD, TD_NUM)}>
        {t.premium > 0 ? fmtUSD(t.premium) : '—'}
      </td>
      <td className={TD}>
        <ActionBadge action={t.action} />
      </td>
      <td className={TD}>
        <TypeBadge type={t.type} />
      </td>
      <td className={TD}>{fmtDate(t.date_opened)}</td>
      <td className={TD}>{fmtDate(t.date_closed)}</td>
      <td className={TD}>{fmtDate(t.exp_date)}</td>
      <td className={cn(TD, TD_NUM)}>
        {cash > 0 ? fmtUSD(cash, { cents: false }) : '—'}
      </td>
      <td className={cn(TD, TD_NUM, sign(ret))}>
        {isSynthetic ? '—' : fmtSignedPct(ret)}
      </td>
      <td className={cn(TD, TD_NUM, sign(otm))}>
        {isSynthetic || t.price_at_action == null ? '—' : fmtSignedPct(otm)}
      </td>
      <td className={cn(TD, TD_NUM, pl > 0 && 'text-credit', pl < 0 && 'text-debit')}>
        {pl === 0 && isSynthetic ? '—' : fmtSignedUSD(pl)}
      </td>
      <td className={TD}>
        <StatusBadge status={t.status} />
      </td>
      <td className={cn(TD, 'max-w-[220px] text-text-muted')}>
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
          {t.status === 'open' && !isSynthetic && (
            <>
              <button className={cn(ROW_ACTION, ACTION_HOVER.roll)}>Roll</button>
              <button className={cn(ROW_ACTION, ACTION_HOVER.close)} onClick={onClose}>
                Close
              </button>
            </>
          )}
          <button className={cn(ROW_ACTION, ACTION_HOVER.delete)} onClick={onDelete}>
            Delete
          </button>
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
