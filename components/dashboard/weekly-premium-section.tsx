'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  bucketWeeklyPremium,
  type Range,
} from '@/lib/weekly-premium';
import { fmtSignedUSD, fmtUSD } from '@/components/trades/format';
import type { Trade } from '@/types/trade';
import { cn } from '@/lib/utils';

interface RangePreset {
  key: string;
  label: string;
  range: Range;
}

const PRESETS: RangePreset[] = [
  { key: 'p4n4', label: 'Previous 4 & Next 4', range: { kind: 'prev-and-next', prev: 4, next: 4 } },
  { key: 'n4',   label: 'Next 4 weeks',         range: { kind: 'next', n: 4 } },
  { key: 'n8',   label: 'Next 8 weeks',         range: { kind: 'next', n: 8 } },
  { key: 'n12',  label: 'Next 12 weeks',        range: { kind: 'next', n: 12 } },
  { key: 'l4',   label: 'Last 4 weeks',         range: { kind: 'last', n: 4 } },
  { key: 'l8',   label: 'Last 8 weeks',         range: { kind: 'last', n: 8 } },
  { key: 'l12',  label: 'Last 12 weeks',        range: { kind: 'last', n: 12 } },
  { key: 'l6m',  label: 'Last 6 Months',        range: { kind: 'last-months', months: 6 } },
  { key: 'ly',   label: 'Last Year',            range: { kind: 'last-year' } },
  { key: 'all',  label: 'All Time',             range: { kind: 'all-time' } },
];

type Display = 'chart' | 'table' | 'cards';

export function WeeklyPremiumSection({ trades }: { trades: Trade[] }) {
  const [presetKey, setPresetKey] = useState('p4n4');
  const [display, setDisplay] = useState<Display>('chart');

  const range = PRESETS.find((p) => p.key === presetKey)!.range;

  const buckets = useMemo(() => {
    return bucketWeeklyPremium(trades, range);
  }, [trades, presetKey]);

  const chartData = useMemo(
    () =>
      buckets.map((b) => ({
        weekLabel: b.weekStart.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        total: Math.round(b.total),
      })),
    [buckets]
  );

  const grandTotal = buckets.reduce((sum, b) => sum + b.total, 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Weekly Premium Collected</h3>
          <p className="text-sm text-text-muted">
            Total over range:{' '}
            <span className={cn('font-semibold', grandTotal >= 0 ? 'text-credit' : 'text-debit')}>
              {fmtSignedUSD(grandTotal)}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={presetKey}
            onChange={(e) => setPresetKey(e.target.value)}
            className="h-9 rounded-md border border-border bg-surface-raised px-3 text-sm text-text"
          >
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <DisplayToggle value={display} onChange={setDisplay} />
        </div>
      </div>

      {buckets.length === 0 ? (
        <p className="py-12 text-center text-sm text-text-muted">
          No data in the selected range.
        </p>
      ) : display === 'chart' ? (
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="weekLabel"
                stroke="var(--color-text-faint)"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
              />
              <YAxis
                stroke="var(--color-text-faint)"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                cursor={{ fill: 'var(--color-surface-hover)' }}
                content={<ChartTooltip />}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.total >= 0 ? 'var(--color-credit)' : 'var(--color-debit)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : display === 'table' ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="border-b border-border bg-surface-raised px-4 py-2 text-left text-xs uppercase tracking-wider text-text-faint">
                  Week of
                </th>
                <th className="border-b border-border bg-surface-raised px-4 py-2 text-right text-xs uppercase tracking-wider text-text-faint">
                  Net Premium
                </th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.weekStart.toISOString()}>
                  <td className="border-b border-border px-4 py-2">
                    {b.weekStart.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td
                    className={cn(
                      'border-b border-border px-4 py-2 text-right tabular-nums',
                      b.total > 0 && 'text-credit',
                      b.total < 0 && 'text-debit',
                      b.total === 0 && 'text-text-faint'
                    )}
                  >
                    {b.total === 0 ? '—' : fmtSignedUSD(b.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {buckets.map((b) => (
            <div
              key={b.weekStart.toISOString()}
              className="rounded-md border border-border bg-surface-raised p-3"
            >
              <div className="text-xs text-text-faint">
                {b.weekStart.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
              <div
                className={cn(
                  'mt-1 text-md font-semibold tabular-nums',
                  b.total > 0 && 'text-credit',
                  b.total < 0 && 'text-debit',
                  b.total === 0 && 'text-text-faint'
                )}
              >
                {b.total === 0 ? '—' : fmtSignedUSD(b.total)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Custom tooltip — Recharts default renders item color from the bar's `fill`,
// which collides with the Cell credit/debit fills (green/red) on a dark
// surface. Owning the markup lets us use semantic tokens (works in both
// themes) and apply credit/debit tint to the value, not all of it.
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const value = Number(payload[0].value);
  const sign = value > 0 ? '+' : value < 0 ? '' : '';
  const display =
    value === 0 ? '—' : `${sign}${fmtUSD(value, { cents: false })}`;
  return (
    <div className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm shadow-md">
      <div className="text-xs text-text-faint">{label}</div>
      <div
        className={cn(
          'font-semibold tabular-nums',
          value > 0 && 'text-credit',
          value < 0 && 'text-debit',
          value === 0 && 'text-text-muted'
        )}
      >
        {display}
      </div>
    </div>
  );
}

function DisplayToggle({
  value,
  onChange,
}: {
  value: Display;
  onChange: (v: Display) => void;
}) {
  const tab = (key: Display, label: string) => (
    <button
      key={key}
      onClick={() => onChange(key)}
      className={cn(
        'h-9 px-3 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md',
        value === key
          ? 'bg-credit-bg-strong text-credit'
          : 'bg-surface-raised text-text-muted hover:text-text'
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      {tab('chart', 'Chart')}
      {tab('table', 'Table')}
      {tab('cards', 'Cards')}
    </div>
  );
}
