import { autoMapColumns } from './auto-map';
import { parseActionCode, looksLikeOptionDescription } from './action-codes';

describe('autoMapColumns', () => {
  test('exact-match canonical field names → high confidence', () => {
    const out = autoMapColumns(
      ['symbol', 'action', 'strike', 'premium', 'date_opened'],
      []
    );
    expect(out.mappings.map((m) => m.target)).toEqual([
      'symbol',
      'action',
      'strike',
      'premium',
      'date_opened',
    ]);
    for (const m of out.mappings) expect(m.confidence).toBe('high');
    expect(out.unmappedRequired).toEqual([]);
  });

  test('synonym match for common broker headers → high confidence', () => {
    const out = autoMapColumns(
      ['Ticker', 'Strike Price', 'Trade Price', 'Quantity', 'Trade Date', 'Expiration'],
      []
    );
    expect(out.mappings[0].target).toBe('symbol');
    expect(out.mappings[1].target).toBe('strike');
    expect(out.mappings[2].target).toBe('premium');
    expect(out.mappings[3].target).toBe('contracts');
    expect(out.mappings[4].target).toBe('date_opened');
    expect(out.mappings[5].target).toBe('exp_date');
    for (const m of out.mappings) expect(m.confidence).toBe('high');
  });

  test('substring fallback → low confidence', () => {
    const out = autoMapColumns(['Strike Px (per share)'], []);
    expect(out.mappings[0].target).toBe('strike');
    expect(out.mappings[0].confidence).toBe('low');
  });

  test('unmapped column → null target, none confidence', () => {
    const out = autoMapColumns(['Some Made-Up Column'], []);
    expect(out.mappings[0].target).toBeNull();
    expect(out.mappings[0].confidence).toBe('none');
  });

  test('collision: two columns suggest same target, highest confidence wins', () => {
    // "Strike" → exact (high), "Strike Price (USD)" → substring (low).
    // High wins; the other gets demoted to null/none.
    const out = autoMapColumns(['Strike', 'Strike Price (USD)'], []);
    const targets = out.mappings.map((m) => m.target);
    expect(targets).toContain('strike');
    expect(targets.filter((t) => t === 'strike').length).toBe(1);
    const demotedIdx = targets.findIndex((t) => t === null);
    expect(demotedIdx).toBeGreaterThan(-1);
  });

  test('collision: same confidence, first-occurrence wins', () => {
    const out = autoMapColumns(['Strike Price', 'Strike'], []);
    // Both are high confidence (synonym + exact). First wins.
    expect(out.mappings[0].target).toBe('strike');
    expect(out.mappings[1].target).toBeNull();
  });

  test('required-field gating: missing → flagged in unmappedRequired', () => {
    const out = autoMapColumns(['Symbol', 'Strike', 'Trade Date'], []);
    // premium and action missing
    expect(out.unmappedRequired).toContain('premium');
    expect(out.unmappedRequired).toContain('action');
    expect(out.unmappedRequired).not.toContain('symbol');
  });

  test('detects option-description column via sample rows', () => {
    const out = autoMapColumns(
      ['Description'],
      [['META 05/15/2026 470.00 P'], ['TSLA 06/19/2026 250 C']]
    );
    expect(out.optionDescriptionColumns).toContain('Description');
  });

  test('Schwab-style headers map cleanly', () => {
    const out = autoMapColumns(
      ['Symbol', 'Trans Code', 'Quantity', 'Price', 'Trade Date', 'Description'],
      []
    );
    // Trans Code → action, Price → premium, Quantity → contracts, Trade Date → date_opened
    expect(out.mappings[0].target).toBe('symbol');
    expect(out.mappings[1].target).toBe('action');
    expect(out.mappings[2].target).toBe('contracts');
    expect(out.mappings[3].target).toBe('premium');
    expect(out.mappings[4].target).toBe('date_opened');
    expect(out.mappings[5].target).toBe('info'); // Description → info
  });
});

describe('parseActionCode', () => {
  test.each([
    ['STO', 'sell'],
    ['STC', 'sell'],
    ['BTO', 'buy'],
    ['BTC', 'buy'],
    ['Sell', 'sell'],
    ['BUY', 'buy'],
    ['s', 'sell'],
    ['B', 'buy'],
    ['  sto  ', 'sell'],
    ['Assignment', 'assignment'],
    ['called-away', 'called-away'],
  ])('"%s" → "%s"', (input, expected) => {
    expect(parseActionCode(input)).toBe(expected);
  });

  test.each([['unknown'], [''], [null], [undefined], [42]])(
    'invalid input "%s" → null',
    (input) => {
      expect(parseActionCode(input)).toBeNull();
    }
  );
});

describe('looksLikeOptionDescription', () => {
  test.each([
    ['META 05/15/2026 470.00 P', true],
    ['TSLA 06/19/2026 250 C', true],
    ['NVDA 12/15/2025 400.5 P', true],
    ['just a regular note', false],
    ['META 05/15/2026', false], // no strike+type
    ['', false],
  ])('"%s" → %s', (sample, expected) => {
    expect(looksLikeOptionDescription([sample])).toBe(expected);
  });

  test('skips blank rows and uses the first non-blank', () => {
    expect(
      looksLikeOptionDescription(['', '', 'META 05/15/2026 470.00 P'])
    ).toBe(true);
  });
});
