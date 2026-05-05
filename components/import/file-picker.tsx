'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { DetectedFile } from '@/lib/import/detected-file';

// Step 1 of the import wizard. Accepts a file via input, hands it to the
// caller's parser. The parser is injected so Phase 6/7 can swap in real
// Excel/CSV parsing without changing the UI. For Phase 5 development, the
// import page injects a mock parser that returns canned DetectedFile data.
export function FilePicker({
  parseFile,
  onDetected,
}: {
  parseFile: (file: File) => Promise<DetectedFile>;
  onDetected: (detected: DetectedFile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedOver, setDraggedOver] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const detected = await parseFile(file);
      onDetected(detected);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-8">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Import trades</h2>
        <p className="mt-1 text-sm text-text-muted">
          Upload an Excel (.xlsx) or CSV (.csv) file. Format auto-detected
          from the file extension.
        </p>
      </div>

      <div
        className={
          'rounded-lg border-2 border-dashed p-12 text-center transition-colors ' +
          (draggedOver
            ? 'border-credit bg-credit-bg'
            : 'border-border hover:border-border-strong')
        }
        onDragOver={(e) => {
          e.preventDefault();
          setDraggedOver(true);
        }}
        onDragLeave={() => setDraggedOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDraggedOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <p className="text-sm text-text-muted">
          Drag and drop a file here, or click to choose.
        </p>
        <Button
          variant="secondary"
          className="mt-4"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Reading file…' : 'Choose file'}
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-debit bg-debit-bg p-3 text-sm text-debit">
          {error}
        </div>
      )}
    </div>
  );
}
