// Locked contract: every Phase 6/7 parser (Excel, CSV) produces this shape.
// The mapper UI consumes it without caring about the source format. Adding
// fields is a contract change — bump a version constant or migrate
// downstream consumers in lockstep.

export interface DetectedFile {
  format: 'csv' | 'excel';
  filename: string;

  // Header row, in source order. Pre-trimmed; otherwise as-typed.
  headers: string[];

  // First N data rows, parallel-indexed to `headers`. Used for the preview
  // step. Cells are stringified (parsers do not infer numeric/date types
  // here — that happens after column mapping in row-validation).
  sampleRows: string[][];

  // Full row count in the source (sampleRows.length when source is small,
  // or sampleRows.length < totalRowCount for paginated previews).
  totalRowCount: number;

  // Top-level parse failures (file unreadable, no header row, sheet missing,
  // etc.). When non-empty, the mapper UI shows these and disables submit.
  // Per-cell validation errors live elsewhere (see RowError in schema.ts).
  errors: string[];

  // Bytes hash of the original file content. Used by Phase 9 for per-file
  // re-import detection (warn user if they re-upload an already-imported
  // file). Hex SHA-256.
  contentHash: string;
}
