'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { parseActionCode } from '@/lib/import/action-codes';
import {
  type CanonicalField,
  DEFAULTED_FIELDS,
} from '@/lib/import/synonyms';
import type { DetectedFile } from '@/lib/import/detected-file';
import type { MappingState } from './column-mapper';
import { cn } from '@/lib/utils';

// Step 3 of the import wizard. Applies the mapping to the file's sample
// rows and renders a side-by-side preview of canonical fields the user
// will get. Per-row validation runs alongside (action codes via
// parseActionCode, numeric coercion, date format checks). Errors render
// inline with red row tints so the user sees exactly which rows are bad
// before committing.
//
// Errors are advisory in the preview — they're auto-skipped on submit
// (per the per-row-validation policy: never abort on first; collect and
// surface). The user can go back and fix the mapping or the file.

export interface PreviewedRow {
  // Canonical-field-keyed object built by applying the mapping.
  values: Partial<Record<CanonicalField, string | number | boolean | null>>;
  errors: string[];
  // Original row index (1-based for human display).
  sourceRow: number;
}

export interface PreviewResult {
  rows: PreviewedRow[];
  validCount: number;
  errorCount: number;
}

// Build the preview from the file's sampleRows + mapping.
export function buildPreview(
  detected: DetectedFile,
  mapping: MappingState
): PreviewResult {
  const headerIdx = new Map<string, number>();
  detected.headers.forEach((h, i) => headerIdx.set(h, i));

  // Reverse: canonical field → source column index
  const fieldToCol: Partial<Record<CanonicalField, number>> = {};
  for (const [src, tgt] of Object.entries(mapping.bySource)) {
    if (tgt && headerIdx.has(src)) {
      fieldToCol[tgt] = headerIdx.get(src)!;
    }
  }

  let validCount = 0;
  let errorCount = 0;
  const rows: PreviewedRow[] = detected.sampleRows.map((sourceRow, idx) => {
    const errors: string[] = [];
    const values: PreviewedRow['values'] = {};

    function readCanonical(field: CanonicalField): string | undefined {
      const col = fieldToCol[field];
      if (col === undefined) return undefined;
      const v = sourceRow[col];
      return v === undefined || v === null ? undefined : String(v).trim();
    }

    // Symbol — required, uppercased.
    const sym = readCanonical('symbol');
    if (!sym) errors.push('symbol is required');
    else values.symbol = sym.toUpperCase();

    // Action — required, parsed via action-code helper.
    const actRaw = readCanonical('action');
    if (!actRaw) {
      errors.push('action is required');
    } else {
      const parsed = parseActionCode(actRaw);
      if (!parsed) errors.push(`unrecognized action "${actRaw}"`);
      else values.action = parsed;
    }

    // Type — defaulted to 'put' if unmapped.
    const typeRaw = readCanonical('type');
    if (typeRaw == null) {
      if (DEFAULTED_FIELDS.includes('type')) values.type = 'put';
    } else {
      const t = typeRaw.toLowerCase();
      if (t === 'put' || t === 'p') values.type = 'put';
      else if (t === 'call' || t === 'c') values.type = 'call';
      else if (t === 'stock' || t === 's') values.type = 'stock';
      else errors.push(`unrecognized type "${typeRaw}"`);
    }

    // Strike — required, numeric.
    const strikeRaw = readCanonical('strike');
    if (!strikeRaw) errors.push('strike is required');
    else {
      const n = parseFloat(strikeRaw.replace(/[$,]/g, ''));
      if (Number.isNaN(n)) errors.push(`strike not numeric: "${strikeRaw}"`);
      else values.strike = n;
    }

    // Premium — required, numeric.
    const premiumRaw = readCanonical('premium');
    if (!premiumRaw) errors.push('premium is required');
    else {
      const n = parseFloat(premiumRaw.replace(/[$,]/g, ''));
      if (Number.isNaN(n)) errors.push(`premium not numeric: "${premiumRaw}"`);
      else values.premium = n;
    }

    // Contracts — defaulted to 1 if unmapped.
    const contractsRaw = readCanonical('contracts');
    if (contractsRaw == null) {
      if (DEFAULTED_FIELDS.includes('contracts')) values.contracts = 1;
    } else {
      const n = parseInt(contractsRaw, 10);
      if (Number.isNaN(n) || n < 1)
        errors.push(`contracts not a positive integer: "${contractsRaw}"`);
      else values.contracts = n;
    }

    // Date opened — required, structurally parsable. We're permissive on
    // format here in the preview; deep validation happens in the import
    // pipeline before bulkImport.
    const dateOpenedRaw = readCanonical('date_opened');
    if (!dateOpenedRaw) errors.push('date_opened is required');
    else values.date_opened = dateOpenedRaw;

    // Optional fields — passed through as strings.
    for (const optional of [
      'date_closed',
      'exp_date',
      'price_at_action',
      'account',
      'trade_ref',
      'info',
      'closing_notes',
      'status',
      'close_price',
    ] as CanonicalField[]) {
      const raw = readCanonical(optional);
      if (raw != null) values[optional] = raw;
    }

    if (errors.length === 0) validCount++;
    else errorCount++;
    return { values, errors, sourceRow: idx + 1 };
  });

  return { rows, validCount, errorCount };
}

const DISPLAY_FIELDS: CanonicalField[] = [
  'symbol',
  'action',
  'type',
  'strike',
  'premium',
  'contracts',
  'date_opened',
  'exp_date',
  'trade_ref',
];

export function MappingPreview({
  detected,
  mapping,
  onBack,
  onConfirm,
  isPending = false,
}: {
  detected: DetectedFile;
  mapping: MappingState;
  onBack: () => void;
  onConfirm: () => void;
  isPending?: boolean;
}) {
  const result = useMemo(() => buildPreview(detected, mapping), [detected, mapping]);

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-md font-semibold">Preview</h3>
        <p className="text-xs text-text-muted">
          Showing {result.rows.length} of {detected.totalRowCount} rows
          {' · '}
          <span className={result.validCount > 0 ? 'text-credit' : 'text-text-muted'}>
            {result.validCount} valid
          </span>
          {' · '}
          <span className={result.errorCount > 0 ? 'text-debit' : 'text-text-muted'}>
            {result.errorCount} with errors
          </span>
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="border-b border-border bg-surface-raised px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-faint">
                Row
              </th>
              {DISPLAY_FIELDS.map((f) => (
                <th
                  key={f}
                  className="border-b border-border bg-surface-raised px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-faint"
                >
                  {f}
                </th>
              ))}
              <th className="border-b border-border bg-surface-raised px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-faint">
                Errors
              </th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr
                key={row.sourceRow}
                className={cn(
                  'border-b border-border last:border-0 align-top',
                  row.errors.length > 0 && 'bg-debit-bg/40'
                )}
              >
                <td className="px-3 py-2 text-text-muted">{row.sourceRow}</td>
                {DISPLAY_FIELDS.map((f) => {
                  const v = row.values[f];
                  return (
                    <td key={f} className="px-3 py-2 tabular-nums">
                      {v === undefined || v === null || v === '' ? (
                        <span className="text-text-faint">—</span>
                      ) : (
                        String(v)
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-xs text-debit">
                  {row.errors.length === 0 ? (
                    <span className="text-text-faint">—</span>
                  ) : (
                    row.errors.join('; ')
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-border bg-surface-raised p-3 text-xs text-text-muted">
        Errors are auto-skipped on import. Adjust the mapping or fix your
        file if you want them included. Total rows in file:{' '}
        <span className="font-semibold text-text">{detected.totalRowCount}</span>;
        preview shows the first {result.rows.length}.
      </div>

      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={onBack} disabled={isPending}>
          Back to mapping
        </Button>
        <Button variant="primary" onClick={onConfirm} disabled={isPending}>
          {isPending
            ? 'Importing…'
            : `Import ${detected.totalRowCount} row${detected.totalRowCount === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  );
}
