import { looksLikeOptionDescription } from './action-codes';
import {
  type CanonicalField,
  REQUIRED_FIELDS,
  SYNONYMS,
} from './synonyms';

// Auto-mapping outcome for a single source column.
export interface ColumnMapping {
  sourceColumn: string;
  // null = "Skip this column"
  target: CanonicalField | null;
  // High = exact match on field name or canonical synonym.
  // Low = substring match (user should verify).
  confidence: 'high' | 'low' | 'none';
}

export interface AutoMapResult {
  // One entry per detected column, in source order.
  mappings: ColumnMapping[];
  // Columns flagged as option-description-style (Fidelity / IBKR pack
  // SYMBOL/EXP/STRIKE/TYPE into one cell). v1 doesn't parse these; the
  // mapper UI surfaces a warning when present.
  optionDescriptionColumns: string[];
  // Required canonical fields that have no mapping. UI uses this to
  // disable the submit button + show "missing required" highlights.
  unmappedRequired: CanonicalField[];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // keep spaces between words
    .replace(/\s+/g, ' ')
    .trim();
}

// Build a reverse index from normalized synonym → canonical field for O(1)
// exact-match lookup. Computed once per call (cheap; the table is small).
function buildSynonymIndex(): Map<string, CanonicalField> {
  const idx = new Map<string, CanonicalField>();
  for (const [field, syns] of Object.entries(SYNONYMS) as [
    CanonicalField,
    string[],
  ][]) {
    for (const syn of syns) {
      idx.set(normalize(syn), field);
    }
  }
  return idx;
}

function findExactMatch(
  normalized: string,
  index: Map<string, CanonicalField>
): CanonicalField | null {
  return index.get(normalized) ?? null;
}

function findSubstringMatch(
  normalized: string,
  index: Map<string, CanonicalField>
): CanonicalField | null {
  // Look for any synonym entry that is contained within `normalized` OR
  // contains `normalized`. Substring direction matters: "strike px (per share)"
  // contains "strike", but "str" doesn't make a useful match.
  let bestField: CanonicalField | null = null;
  let bestLen = 0;
  for (const [syn, field] of index.entries()) {
    if (syn.length < 3) continue; // avoid noise from 1-2 char synonyms
    if (normalized.includes(syn) || syn.includes(normalized)) {
      // Prefer the LONGEST match — "strike price" > "strike" when the
      // header is "strike price (per share)".
      if (syn.length > bestLen) {
        bestField = field;
        bestLen = syn.length;
      }
    }
  }
  return bestField;
}

// Three-tier match: exact field name → canonical synonym → substring
// fallback. Confidence drops at each tier so the UI can render warnings.
function matchOne(
  header: string,
  index: Map<string, CanonicalField>
): { target: CanonicalField | null; confidence: 'high' | 'low' | 'none' } {
  const normalized = normalize(header);

  // Tier 1+2 collapsed into one map lookup since the index already
  // includes both canonical field names and their synonyms.
  const exact = findExactMatch(normalized, index);
  if (exact) return { target: exact, confidence: 'high' };

  const partial = findSubstringMatch(normalized, index);
  if (partial) return { target: partial, confidence: 'low' };

  return { target: null, confidence: 'none' };
}

export function autoMapColumns(
  headers: string[],
  sampleRows: string[][]
): AutoMapResult {
  const index = buildSynonymIndex();

  // First pass: per-column suggestions, no de-duplication.
  const candidate: { mapping: ColumnMapping; columnIndex: number }[] = [];
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const { target, confidence } = matchOne(header, index);
    candidate.push({
      mapping: { sourceColumn: header, target, confidence },
      columnIndex: i,
    });
  }

  // Second pass: collision resolution. For each canonical field claimed
  // by 2+ columns, keep the highest-confidence claimant. Ties broken by
  // first occurrence in source order (deterministic and stable).
  const claimedBy = new Map<CanonicalField, number>(); // field → winning candidate index
  for (let i = 0; i < candidate.length; i++) {
    const m = candidate[i].mapping;
    if (m.target == null) continue;
    const incumbent = claimedBy.get(m.target);
    if (incumbent == null) {
      claimedBy.set(m.target, i);
      continue;
    }
    const incumbentConf = candidate[incumbent].mapping.confidence;
    if (
      m.confidence === 'high' &&
      (incumbentConf === 'low' || incumbentConf === 'none')
    ) {
      // Demote the incumbent.
      candidate[incumbent].mapping = {
        ...candidate[incumbent].mapping,
        target: null,
        confidence: 'none',
      };
      claimedBy.set(m.target, i);
    } else {
      // Demote this one.
      candidate[i].mapping = { ...m, target: null, confidence: 'none' };
    }
  }

  // Detect option-description-style columns from the sample data, even
  // when the auto-mapper picks a target for them. Surface as a warning
  // so the user fixes their file before importing.
  const optionDescriptionColumns: string[] = [];
  for (let col = 0; col < headers.length; col++) {
    const colSamples = sampleRows.map((row) => row[col] ?? '');
    if (looksLikeOptionDescription(colSamples)) {
      optionDescriptionColumns.push(headers[col]);
    }
  }

  // Required-field gating.
  const unmappedRequired: CanonicalField[] = [];
  for (const req of REQUIRED_FIELDS) {
    if (!claimedBy.has(req)) unmappedRequired.push(req);
  }

  return {
    mappings: candidate.map((c) => c.mapping),
    optionDescriptionColumns,
    unmappedRequired,
  };
}
