'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { autoMapColumns, type ColumnMapping } from '@/lib/import/auto-map';
import {
  type CanonicalField,
  DEFAULTED_FIELDS,
  REQUIRED_FIELDS,
  SYNONYMS,
} from '@/lib/import/synonyms';
import type { DetectedFile } from '@/lib/import/detected-file';
import { cn } from '@/lib/utils';

// Step 2 of the import wizard. Renders one row per detected column with a
// dropdown to pick a canonical field (or skip). Auto-mapper proposes the
// initial mapping; user can override. Single-column-per-field invariant
// is enforced — picking a field already in use elsewhere demotes the
// previous claimant to "Skip".
//
// Required-field gating: import button stays disabled until every
// REQUIRED_FIELDS entry has a column mapped. Defaulted fields (type,
// contracts) get a yellow notice when unmapped, but don't block submit.
//
// Option-description warning: surfaced when a column's sample data looks
// like Fidelity/IBKR's packed "META 05/15/2026 470.00 P" cells. We don't
// auto-parse those in v1; user fixes their file and retries.

const ALL_FIELDS: CanonicalField[] = Object.keys(SYNONYMS) as CanonicalField[];

export interface MappingState {
  // sourceColumn → canonicalField (or null = skip)
  bySource: Record<string, CanonicalField | null>;
}

export function ColumnMapper({
  detected,
  onContinue,
}: {
  detected: DetectedFile;
  onContinue: (mapping: MappingState) => void;
}) {
  // Compute initial mapping once per file.
  const initial = useMemo(
    () => autoMapColumns(detected.headers, detected.sampleRows),
    [detected.headers, detected.sampleRows]
  );

  const [bySource, setBySource] = useState<Record<string, CanonicalField | null>>(
    () => {
      const m: Record<string, CanonicalField | null> = {};
      for (const c of initial.mappings) m[c.sourceColumn] = c.target;
      return m;
    }
  );

  // Re-seed when a new file is loaded.
  useEffect(() => {
    const m: Record<string, CanonicalField | null> = {};
    for (const c of initial.mappings) m[c.sourceColumn] = c.target;
    setBySource(m);
  }, [initial]);

  // Reverse index: canonical field → source column currently mapped to it.
  const byTarget = useMemo(() => {
    const m: Partial<Record<CanonicalField, string>> = {};
    for (const [src, tgt] of Object.entries(bySource)) {
      if (tgt) m[tgt] = src;
    }
    return m;
  }, [bySource]);

  function setMapping(sourceColumn: string, target: CanonicalField | null) {
    setBySource((prev) => {
      const next = { ...prev };
      // Single-column-per-field: if the new target is already claimed,
      // demote the previous claimant.
      if (target) {
        for (const [src, tgt] of Object.entries(next)) {
          if (tgt === target && src !== sourceColumn) {
            next[src] = null;
          }
        }
      }
      next[sourceColumn] = target;
      return next;
    });
  }

  // Live re-derivation of which required fields are still missing.
  const unmappedRequired = REQUIRED_FIELDS.filter((f) => !byTarget[f]);
  const unmappedDefaulted = DEFAULTED_FIELDS.filter((f) => !byTarget[f]);

  // Confidence map (initial auto-map output, used for indicator dots).
  const confidence = useMemo(() => {
    const m: Record<string, ColumnMapping['confidence']> = {};
    for (const c of initial.mappings) m[c.sourceColumn] = c.confidence;
    return m;
  }, [initial.mappings]);

  const canContinue = unmappedRequired.length === 0;

  return (
    <div className="space-y-5">
      {/* Status bar */}
      <div
        className={cn(
          'rounded-md border p-3 text-sm',
          unmappedRequired.length === 0
            ? 'border-credit bg-credit-bg text-credit'
            : 'border-debit bg-debit-bg text-debit'
        )}
      >
        {unmappedRequired.length === 0 ? (
          <span className="font-semibold">All required fields mapped ✓</span>
        ) : (
          <>
            <span className="font-semibold">
              {unmappedRequired.length} required field
              {unmappedRequired.length === 1 ? '' : 's'} not yet mapped:
            </span>{' '}
            <span>{unmappedRequired.join(', ')}</span>
          </>
        )}
      </div>

      {unmappedDefaulted.length > 0 && (
        <div className="rounded-md border border-assignment bg-assignment-bg p-3 text-sm text-assignment">
          <span className="font-semibold">Heads up:</span>{' '}
          {unmappedDefaulted.includes('type') && (
            <>
              <code className="rounded bg-surface-raised px-1 text-text">type</code>{' '}
              not mapped — will default to{' '}
              <code className="rounded bg-surface-raised px-1 text-text">put</code>{' '}
              for every row.{' '}
            </>
          )}
          {unmappedDefaulted.includes('contracts') && (
            <>
              <code className="rounded bg-surface-raised px-1 text-text">contracts</code>{' '}
              not mapped — will default to{' '}
              <code className="rounded bg-surface-raised px-1 text-text">1</code>{' '}
              for every row.{' '}
            </>
          )}
          Verify imported rows after the import completes.
        </div>
      )}

      {initial.optionDescriptionColumns.length > 0 && (
        <div className="rounded-md border border-assignment bg-assignment-bg p-3 text-sm text-assignment">
          <span className="font-semibold">Detected option-description-style column
          {initial.optionDescriptionColumns.length === 1 ? '' : 's'}:</span>{' '}
          {initial.optionDescriptionColumns.map((c) => `"${c}"`).join(', ')}.
          Wheel Tracker can&rsquo;t auto-parse multi-field columns like{' '}
          <code className="rounded bg-surface-raised px-1 text-text">
            META 05/15/2026 470.00 P
          </code>
          . Split your file&rsquo;s strike / exp / type into separate columns
          before importing.
        </div>
      )}

      {/* File summary */}
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-md font-semibold">Map columns</h3>
        <p className="text-xs text-text-muted">
          {detected.filename} · {detected.totalRowCount} row
          {detected.totalRowCount === 1 ? '' : 's'} · {detected.headers.length} columns
        </p>
      </div>

      {/* Mapping table */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="border-b border-border bg-surface-raised px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-faint">
                Source column
              </th>
              <th className="border-b border-border bg-surface-raised px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-faint">
                Sample
              </th>
              <th className="border-b border-border bg-surface-raised px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-faint">
                Maps to
              </th>
            </tr>
          </thead>
          <tbody>
            {detected.headers.map((h, i) => {
              const tgt = bySource[h] ?? null;
              const conf = confidence[h];
              const isRequiredAndMissing =
                tgt === null && false; // see below: column-level missing-required flagging is implicit through the status bar
              const sample = detected.sampleRows[0]?.[i] ?? '';
              const dotColor =
                tgt && conf === 'high'
                  ? 'bg-credit'
                  : tgt && conf === 'low'
                    ? 'bg-assignment'
                    : 'bg-text-faint';
              return (
                <tr key={h} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full', dotColor)} />
                      <span className="font-semibold text-text">{h}</span>
                    </div>
                  </td>
                  <td className="max-w-[260px] truncate px-4 py-2.5 font-mono text-xs text-text-muted">
                    {sample || <span className="text-text-faint">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={tgt ?? ''}
                      onChange={(e) =>
                        setMapping(
                          h,
                          e.target.value === '' ? null : (e.target.value as CanonicalField)
                        )
                      }
                      className={cn(
                        'h-9 w-full rounded-md border bg-surface px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-1',
                        isRequiredAndMissing
                          ? 'border-debit focus-visible:border-debit focus-visible:ring-debit'
                          : 'border-border focus-visible:border-credit focus-visible:ring-credit'
                      )}
                    >
                      <option value="">— Skip this column —</option>
                      {ALL_FIELDS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                          {REQUIRED_FIELDS.includes(f) ? ' *' : ''}
                          {DEFAULTED_FIELDS.includes(f) ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          variant="primary"
          disabled={!canContinue}
          onClick={() => onContinue({ bySource })}
        >
          Continue to preview
        </Button>
      </div>
    </div>
  );
}
