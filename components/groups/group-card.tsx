import { ActionBadge, RolledBadge, StatusBadge, TypeBadge } from '@/components/trades/badges';
import { fmtDate, fmtSignedPct, fmtSignedUSD, fmtUSD } from '@/components/trades/format';
import { cn } from '@/lib/utils';
import type { GroupStats } from '@/lib/group-stats';

export function GroupCard({ stats }: { stats: GroupStats }) {
  const { group, trades, netPL, cashBasis, returnPct, hasOpenLeg, hasFullWheel } = stats;
  const tone = netPL > 0 ? 'credit' : netPL < 0 ? 'debit' : 'muted';

  return (
    <details
      className="overflow-hidden rounded-lg border border-border bg-surface"
      open
    >
      <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-3 border-b border-border bg-surface-raised px-5 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-md font-semibold">{group.name}</span>
          {hasFullWheel && (
            <span className="rounded-sm border border-assignment bg-assignment-bg px-2 py-[2px] text-xs font-semibold uppercase tracking-wider text-assignment">
              Full Wheel
            </span>
          )}
          {hasOpenLeg && (
            <span className="rounded-sm border border-credit bg-credit-bg px-2 py-[2px] text-xs font-semibold uppercase tracking-wider text-credit">
              Has Open Leg
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-4 text-sm tabular-nums">
          <span className="text-text-muted">{trades.length} legs</span>
          {cashBasis > 0 && (
            <span className="text-text-muted">
              Basis {fmtUSD(cashBasis, { cents: false })}
            </span>
          )}
          <span
            className={cn(
              'font-semibold',
              tone === 'credit' && 'text-credit',
              tone === 'debit' && 'text-debit',
              tone === 'muted' && 'text-text-muted'
            )}
          >
            {fmtSignedUSD(netPL)} ({fmtSignedPct(returnPct.toFixed(2))})
          </span>
        </div>
      </summary>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-border px-4 py-2 text-left text-xs uppercase tracking-wider text-text-faint">Symbol</th>
              <th className="border-b border-border px-4 py-2 text-right text-xs uppercase tracking-wider text-text-faint">Strike</th>
              <th className="border-b border-border px-4 py-2 text-right text-xs uppercase tracking-wider text-text-faint">Premium</th>
              <th className="border-b border-border px-4 py-2 text-left text-xs uppercase tracking-wider text-text-faint">Action</th>
              <th className="border-b border-border px-4 py-2 text-left text-xs uppercase tracking-wider text-text-faint">Type</th>
              <th className="border-b border-border px-4 py-2 text-left text-xs uppercase tracking-wider text-text-faint">Date Opened</th>
              <th className="border-b border-border px-4 py-2 text-left text-xs uppercase tracking-wider text-text-faint">Date Closed</th>
              <th className="border-b border-border px-4 py-2 text-left text-xs uppercase tracking-wider text-text-faint">Status</th>
              <th className="border-b border-border px-4 py-2 text-left text-xs uppercase tracking-wider text-text-faint">Info</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id}>
                <td className="border-b border-border px-4 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="font-semibold">{t.symbol}</span>
                    {t.is_rolled && <RolledBadge />}
                  </span>
                </td>
                <td className="border-b border-border px-4 py-2 text-right tabular-nums">
                  {t.action === 'assignment' || t.action === 'called-away'
                    ? '—'
                    : fmtUSD(t.strike)}
                </td>
                <td className="border-b border-border px-4 py-2 text-right tabular-nums">
                  {t.premium > 0 ? fmtUSD(t.premium) : '—'}
                </td>
                <td className="border-b border-border px-4 py-2">
                  <ActionBadge action={t.action} />
                </td>
                <td className="border-b border-border px-4 py-2">
                  <TypeBadge type={t.type} />
                </td>
                <td className="border-b border-border px-4 py-2">{fmtDate(t.date_opened)}</td>
                <td className="border-b border-border px-4 py-2">{fmtDate(t.date_closed)}</td>
                <td className="border-b border-border px-4 py-2">
                  <StatusBadge status={t.status} />
                </td>
                <td className="max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap border-b border-border px-4 py-2 text-text-muted">
                  {t.info ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
