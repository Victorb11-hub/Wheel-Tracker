'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ColumnMapper, type MappingState } from '@/components/import/column-mapper';
import { FilePicker } from '@/components/import/file-picker';
import { MappingPreview } from '@/components/import/mapping-preview';
import type { DetectedFile } from '@/lib/import/detected-file';

// Phase 5 import page: the full wizard chrome + UI is real, but the
// parser is mocked. Phase 6 plugs in Excel parsing, Phase 7 plugs in CSV
// parsing — both produce DetectedFile, so this page doesn't change.
// Phase 9 swaps the mock confirm-step into a real bulkImport call.
//
// File picker accepts a real file, but for development we expose a "Use
// sample data" button that loads a canned Schwab-style fixture so the
// mapper + preview can be exercised without a real parser.

type Step = 'pick' | 'map' | 'preview';

const SAMPLE_DETECTED: DetectedFile = {
  format: 'csv',
  filename: 'sample-schwab-trades.csv',
  totalRowCount: 4,
  errors: [],
  contentHash: 'mock-hash',
  headers: [
    'Symbol',
    'Trans Code',
    'Quantity',
    'Price',
    'Strike Price',
    'Trade Date',
    'Expiration',
    'Description',
    'Account',
    'Order ID',
  ],
  sampleRows: [
    ['NVDA', 'STO', '1', '5.00', '400', '2026-04-15', '2026-05-22', 'NVDA 05/22/2026 400 P', 'Brokerage', '12345'],
    ['TSLA', 'STO', '1', '4.25', '275', '2026-04-21', '2026-05-22', 'TSLA 05/22/2026 275 C', 'Brokerage', '12346'],
    ['META', 'BTC', '1', '1.50', '480', '2026-03-28', '2026-04-04', 'META 04/04/2026 480 P', 'IRA', '12347'],
    ['NOTAREALSYM', 'WAT', 'oops', 'whoops', 'nope', 'bad-date', '2026-05-22', '', 'Brokerage', '12348'],
  ],
};

async function mockParseFile(file: File): Promise<DetectedFile> {
  return {
    ...SAMPLE_DETECTED,
    filename: file.name,
  };
}

export default function ImportPage() {
  const [detected, setDetected] = useState<DetectedFile | null>(null);
  const [mapping, setMapping] = useState<MappingState | null>(null);
  const [step, setStep] = useState<Step>('pick');

  function handleDetected(d: DetectedFile) {
    setDetected(d);
    setMapping(null);
    setStep('map');
  }

  function handleMappingContinue(m: MappingState) {
    setMapping(m);
    setStep('preview');
  }

  function handleConfirm() {
    // Phase 9 wires this to bulkImport. For Phase 5, just log + reset.
    // eslint-disable-next-line no-console
    console.log('Import confirmed (mock)', { detected, mapping });
    setDetected(null);
    setMapping(null);
    setStep('pick');
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Import</h2>
          <p className="text-sm text-text-muted">
            Upload broker history or a previous Wheel Tracker export.
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link href="/dashboard">← Back to app</Link>
        </Button>
      </div>

      <Stepper step={step} />

      {step === 'pick' && (
        <>
          <FilePicker parseFile={mockParseFile} onDetected={handleDetected} />
          <div className="rounded-md border border-border bg-surface-raised p-3 text-xs text-text-muted">
            <span className="font-semibold text-text">Phase 5 dev hint:</span>{' '}
            real Excel/CSV parsing arrives in Phases 6-7. For now, choose
            any file (the mock parser returns a Schwab-style sample) or use{' '}
            <button
              className="text-credit hover:underline"
              onClick={() => handleDetected(SAMPLE_DETECTED)}
            >
              this sample fixture
            </button>{' '}
            to exercise the mapper.
          </div>
        </>
      )}

      {step === 'map' && detected && (
        <ColumnMapper detected={detected} onContinue={handleMappingContinue} />
      )}

      {step === 'preview' && detected && mapping && (
        <MappingPreview
          detected={detected}
          mapping={mapping}
          onBack={() => setStep('map')}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'pick', label: '1. Choose file' },
    { id: 'map', label: '2. Map columns' },
    { id: 'preview', label: '3. Preview & import' },
  ];
  const idx = steps.findIndex((s) => s.id === step);

  return (
    <ol className="flex flex-wrap gap-3 border-b border-border pb-3 text-sm">
      {steps.map((s, i) => (
        <li
          key={s.id}
          className={
            i === idx
              ? 'font-semibold text-credit'
              : i < idx
                ? 'text-text'
                : 'text-text-faint'
          }
        >
          {s.label}
          {i < steps.length - 1 && <span className="ml-3 text-text-faint">→</span>}
        </li>
      ))}
    </ol>
  );
}
