'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { ActionBadge, TypeBadge } from '@/components/trades/badges';
import { fmtDate, fmtUSD } from '@/components/trades/format';
import { cn } from '@/lib/utils';
import type { Trade } from '@/types/trade';

// Reusable picker for the Create + Manage Groups modals.
// - Filter by symbol (case-insensitive substring)
// - Two sections: selected (top) / available (bottom). The same set-replacement
//   model as `useSetGroupTradeIds` — caller owns the selectedIds Set and we
//   notify on every toggle.
export function TradePicker({
  trades,
  selectedIds,
  onChange,
  selectedHeading = 'Selected',
  availableHeading = 'Other non-open trades',
}: {
  trades: Trade[];
  selectedIds: Set<string>;
  onChange: (next: Set<string>) => void;
  selectedHeading?: string;
  availableHeading?: string;
}) {
  const [filter, setFilter] = useState('');

  const { selected, available } = useMemo(() => {
    const f = filter.trim().toUpperCase();
    const matches = (t: Trade) => (f === '' ? true : t.symbol.toUpperCase().includes(f));
    const sortByDate = (a: Trade, b: Trade) =>
      (b.date_opened ?? '').localeCompare(a.date_opened ?? '');
    const sel: Trade[] = [];
    const avail: Trade[] = [];
    for (const t of trades) {
      if (selectedIds.has(t.id)) sel.push(t);
      else if (matches(t)) avail.push(t);
    }
    sel.sort(sortByDate);
    avail.sort(sortByDate);
    return { selected: sel, available: avail };
  }, [trades, selectedIds, filter]);

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by symbol…"
        aria-label="Filter trades by symbol"
      />

      <div className="max-h-[420px] overflow-y-auto rounded-md border border-border">
        <Section
          heading={`${selectedHeading} (${selected.length})`}
          rows={selected}
          isSelected={() => true}
          onToggle={toggle}
          empty="None selected yet."
        />
        <Section
          heading={availableHeading}
          rows={available}
          isSelected={() => false}
          onToggle={toggle}
          empty={
            filter.trim()
              ? `No closed trades match "${filter.trim()}".`
              : 'No other closed trades.'
          }
        />
      </div>
    </div>
  );
}

function Section({
  heading,
  rows,
  isSelected,
  onToggle,
  empty,
}: {
  heading: string;
  rows: Trade[];
  isSelected: (t: Trade) => boolean;
  onToggle: (id: string) => void;
  empty: string;
}) {
  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
        {heading}
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-4 text-sm text-text-faint">{empty}</div>
      ) : (
        <ul>
          {rows.map((t) => (
            <li key={t.id}>
              <label
                className={cn(
                  'flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm hover:bg-surface-hover',
                  isSelected(t) && 'bg-credit-bg/40'
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer"
                  checked={isSelected(t)}
                  onChange={() => onToggle(t.id)}
                />
                <span className="w-16 font-semibold">{t.symbol}</span>
                <span className="w-20 tabular-nums text-text-muted">
                  {t.action === 'assignment' || t.action === 'called-away'
                    ? '—'
                    : fmtUSD(t.strike)}
                </span>
                <ActionBadge action={t.action} />
                <TypeBadge type={t.type} />
                <span className="ml-auto tabular-nums text-text-faint">
                  {fmtDate(t.date_opened)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
