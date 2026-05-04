import { Button } from '@/components/ui/button';
import { fmtDate, fmtSignedUSD, fmtUSD } from '@/components/trades/format';
import { TypeBadge } from '@/components/trades/badges';
import { cn } from '@/lib/utils';
import type { StockPosition, Trade } from '@/types/trade';

// Premium fields (original_put.premiumCollected and covered_calls[].premium)
// are stored in DOLLARS per the seed/schema spec — sum directly, no contract
// multiplier.
function computeRunningPL(s: StockPosition): {
  putPremium: number;
  callPremiums: number;
  callCount: number;
  total: number;
} {
  const putPremium = s.original_put.premiumCollected;
  const callPremiums = s.covered_calls.reduce((sum, c) => sum + c.premium, 0);
  return {
    putPremium,
    callPremiums,
    callCount: s.covered_calls.length,
    total: putPremium + callPremiums,
  };
}

// Find still-open covered calls for this stock by linked_stock_id. If multiple
// are open (rare), the LOWEST strike is the one that would be exercised first
// when the stock rallies — so the projection uses that strike.
function findCalledAwayProjection(
  s: StockPosition,
  trades: Trade[]
): { callStrike: number; projectedPL: number } | null {
  const openCcs = trades.filter(
    (t) =>
      t.is_covered_call &&
      t.linked_stock_id === s.id &&
      t.status === 'open' &&
      t.action === 'sell' &&
      t.type === 'call'
  );
  if (openCcs.length === 0) return null;

  const callStrike = openCcs.reduce(
    (lo, t) => Math.min(lo, t.strike),
    Number.POSITIVE_INFINITY
  );
  if (!Number.isFinite(callStrike)) return null;

  const { total: runningPL } = computeRunningPL(s);
  const stockGain = (callStrike - s.cost_basis) * s.shares;
  return { callStrike, projectedPL: runningPL + stockGain };
}

export function StockPositionCard({
  stock,
  trades,
  onSellCall,
  onCalledAway,
}: {
  stock: StockPosition;
  trades: Trade[];
  onSellCall?: () => void;
  onCalledAway?: () => void;
}) {
  const breakdown = computeRunningPL(stock);
  const projection = findCalledAwayProjection(stock, trades);
  const tone =
    breakdown.total > 0 ? 'credit' : breakdown.total < 0 ? 'debit' : 'muted';

  return (
    <details
      className="overflow-hidden rounded-lg border border-border bg-surface"
      open
    >
      <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-3 border-l-[3px] border-l-assignment border-b border-border bg-surface-raised px-5 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-md font-semibold">{stock.symbol}</span>
          <span className="rounded-sm border border-assignment bg-assignment-bg px-2 py-[2px] text-xs font-semibold uppercase tracking-wider text-assignment">
            Holding · {stock.shares} sh
          </span>
          {stock.account && (
            <span className="text-xs text-text-faint">{stock.account}</span>
          )}
        </div>
        <div className="flex items-baseline gap-4 text-sm tabular-nums">
          <span className="text-text-muted">
            Basis {fmtUSD(stock.cost_basis)}/sh ·{' '}
            {fmtUSD(stock.total_cost, { cents: false })} total
          </span>
          <span
            className={cn(
              'font-semibold',
              tone === 'credit' && 'text-credit',
              tone === 'debit' && 'text-debit',
              tone === 'muted' && 'text-text-muted'
            )}
          >
            Running {fmtSignedUSD(breakdown.total)}
          </span>
        </div>
      </summary>

      <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
        <RunningPLBreakdown
          breakdown={breakdown}
          projection={projection}
        />
        <OriginalPutPanel stock={stock} />
      </div>

      <CoveredCallsTable stock={stock} trades={trades} />

      <div className="flex justify-end gap-2 border-t border-border bg-surface-raised px-5 py-2">
        <Button size="sm" variant="secondary" onClick={onSellCall}>
          Sell Call
        </Button>
        <Button size="sm" variant="secondary" onClick={onCalledAway}>
          Called Away
        </Button>
        <Button size="sm" variant="ghost" disabled>
          Delete
        </Button>
      </div>
    </details>
  );
}

function RunningPLBreakdown({
  breakdown,
  projection,
}: {
  breakdown: ReturnType<typeof computeRunningPL>;
  projection: { callStrike: number; projectedPL: number } | null;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-raised p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-faint">
        Running P&amp;L
      </div>
      <dl className="space-y-1.5 text-sm tabular-nums">
        <Row label="Put premium collected" value={breakdown.putPremium} />
        <Row
          label={`Covered call premiums (${breakdown.callCount} ${breakdown.callCount === 1 ? 'call' : 'calls'})`}
          value={breakdown.callPremiums}
        />
        <div className="my-2 border-t border-border" />
        <Row
          label="Running P&L"
          value={breakdown.total}
          bold
        />
      </dl>

      {projection && (
        <div className="mt-4 rounded-md border border-roll bg-roll-bg p-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-roll">
            Projection
          </div>
          <div className="mt-1 text-text">
            If called away at{' '}
            <span className="font-semibold tabular-nums">
              {fmtUSD(projection.callStrike)}
            </span>
            : total wheel P&amp;L would be{' '}
            <span
              className={cn(
                'font-semibold tabular-nums',
                projection.projectedPL >= 0 ? 'text-credit' : 'text-debit'
              )}
            >
              {fmtSignedUSD(projection.projectedPL)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  const tone = value > 0 ? 'text-credit' : value < 0 ? 'text-debit' : 'text-text-muted';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn('text-text-muted', bold && 'font-semibold text-text')}>
        {label}
      </dt>
      <dd className={cn(tone, bold && 'text-md font-semibold')}>
        {fmtSignedUSD(value)}
      </dd>
    </div>
  );
}

function OriginalPutPanel({ stock }: { stock: StockPosition }) {
  const p = stock.original_put;
  return (
    <div className="rounded-md border border-border bg-surface-raised p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-faint">
        Original Put
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm tabular-nums">
        <Field label="Strike" value={fmtUSD(p.strike)} />
        <Field label="Premium" value={`${fmtUSD(p.premium)}/sh`} />
        <Field label="Contracts" value={String(p.contracts)} />
        <Field label="Collected" value={fmtUSD(p.premiumCollected)} />
        <Field label="Opened" value={fmtDate(p.dateOpened)} />
        <Field label="Assigned" value={fmtDate(stock.assigned_date)} />
        <Field
          label="Trade Ref"
          value={p.tradeRef ?? '—'}
          muted={!p.tradeRef}
          colSpan
        />
      </dl>
    </div>
  );
}

function Field({
  label,
  value,
  muted,
  colSpan,
}: {
  label: string;
  value: string;
  muted?: boolean;
  colSpan?: boolean;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-2', colSpan && 'col-span-2')}>
      <dt className="text-text-muted">{label}</dt>
      <dd className={cn(muted ? 'text-text-faint' : 'text-text')}>{value}</dd>
    </div>
  );
}

function CoveredCallsTable({
  stock,
  trades,
}: {
  stock: StockPosition;
  trades: Trade[];
}) {
  if (stock.covered_calls.length === 0) {
    return (
      <div className="border-t border-border px-5 py-4 text-sm text-text-faint">
        No covered calls written yet.
      </div>
    );
  }

  // Cross-reference snapshots with trades to mark which calls are still open.
  // Match by (linked_stock_id, expDate, strike) since CC snapshots don't carry
  // a trade id.
  const openCcKeys = new Set(
    trades
      .filter(
        (t) =>
          t.is_covered_call &&
          t.linked_stock_id === stock.id &&
          t.status === 'open'
      )
      .map((t) => `${t.exp_date}-${t.strike}`)
  );

  const sorted = [...stock.covered_calls].sort((a, b) =>
    b.dateOpened.localeCompare(a.dateOpened)
  );

  return (
    <div className="overflow-x-auto border-t border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b border-border px-4 py-2 text-left text-xs uppercase tracking-wider text-text-faint">
              Type
            </th>
            <th className="border-b border-border px-4 py-2 text-right text-xs uppercase tracking-wider text-text-faint">
              Strike
            </th>
            <th className="border-b border-border px-4 py-2 text-right text-xs uppercase tracking-wider text-text-faint">
              Premium
            </th>
            <th className="border-b border-border px-4 py-2 text-left text-xs uppercase tracking-wider text-text-faint">
              Opened
            </th>
            <th className="border-b border-border px-4 py-2 text-left text-xs uppercase tracking-wider text-text-faint">
              Expires
            </th>
            <th className="border-b border-border px-4 py-2 text-left text-xs uppercase tracking-wider text-text-faint">
              Status
            </th>
            <th className="border-b border-border px-4 py-2 text-left text-xs uppercase tracking-wider text-text-faint">
              Notes
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((cc, idx) => {
            const isOpen = openCcKeys.has(`${cc.expDate}-${cc.strike}`);
            return (
              <tr key={`${cc.dateOpened}-${cc.strike}-${idx}`}>
                <td className="border-b border-border px-4 py-2">
                  <TypeBadge type="call" />
                </td>
                <td className="border-b border-border px-4 py-2 text-right tabular-nums">
                  {fmtUSD(cc.strike)}
                </td>
                <td className="border-b border-border px-4 py-2 text-right tabular-nums">
                  {fmtUSD(cc.premium, { cents: false })}
                </td>
                <td className="border-b border-border px-4 py-2 tabular-nums">
                  {fmtDate(cc.dateOpened)}
                </td>
                <td className="border-b border-border px-4 py-2 tabular-nums">
                  {fmtDate(cc.expDate)}
                </td>
                <td className="border-b border-border px-4 py-2">
                  {isOpen ? (
                    <span className="rounded-sm border border-credit bg-transparent px-2 py-[2px] text-xs font-semibold uppercase tracking-wider text-credit">
                      Open
                    </span>
                  ) : (
                    <span className="rounded-sm border border-text-muted bg-transparent px-2 py-[2px] text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Closed
                    </span>
                  )}
                </td>
                <td className="max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap border-b border-border px-4 py-2 text-text-muted">
                  {cc.notes ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
