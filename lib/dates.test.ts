import {
  eachWeekBetween,
  getWeekEnd,
  getWeekStart,
  isSameWeek,
  parseExcelSerial,
} from './dates';

// =============================================================================
// Pin TZ to America/New_York for every assertion. The wheel trades in NY
// market hours; v1's Sunday/DST bugs were specific to that zone.
// =============================================================================
beforeAll(() => {
  process.env.TZ = 'America/New_York';
});

// Helpers — construct local-time dates explicitly. `new Date('2026-04-15')`
// would parse as UTC midnight which shifts under TZ; we use the local-time
// constructor to stay unambiguous.
function localDate(
  y: number,
  m: number,
  d: number,
  hh = 0,
  mm = 0,
  ss = 0
): Date {
  return new Date(y, m - 1, d, hh, mm, ss);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

// =============================================================================
// getWeekStart — Monday at 00:00 local
// =============================================================================
describe('getWeekStart', () => {
  // Anchor week: 2026-04-13 (Monday) through 2026-04-19 (Sunday)
  test('Monday input → same Monday at 00:00', () => {
    const d = getWeekStart(localDate(2026, 4, 13, 9, 30));
    expect(ymd(d)).toBe('2026-04-13');
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
  });

  test('Wednesday input → that week\'s Monday', () => {
    expect(ymd(getWeekStart(localDate(2026, 4, 15)))).toBe('2026-04-13');
  });

  test('Friday input → that week\'s Monday', () => {
    expect(ymd(getWeekStart(localDate(2026, 4, 17)))).toBe('2026-04-13');
  });

  test('Saturday input → that week\'s Monday (NOT next Monday)', () => {
    expect(ymd(getWeekStart(localDate(2026, 4, 18)))).toBe('2026-04-13');
  });

  test('Sunday input → PREVIOUS Monday (v1 bug guard)', () => {
    // 2026-04-19 is Sunday. Previous Monday is 2026-04-13, NOT 2026-04-20.
    expect(ymd(getWeekStart(localDate(2026, 4, 19)))).toBe('2026-04-13');
  });

  test('non-zero hours → still returns 00:00:00 of that Monday', () => {
    const d = getWeekStart(localDate(2026, 4, 16, 14, 27, 38));
    expect(ymd(d)).toBe('2026-04-13');
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });

  test('year boundary: 2026-01-01 (Thursday) → 2025-12-29 (Monday)', () => {
    expect(ymd(getWeekStart(localDate(2026, 1, 1)))).toBe('2025-12-29');
  });

  test('DST forward (March): 2026-03-09 (Mon after spring-forward) → same Mon at 00:00', () => {
    // DST forward in 2026 is Sunday 2026-03-08. Monday 2026-03-09 is the
    // first day of the post-DST week.
    const d = getWeekStart(localDate(2026, 3, 9, 10));
    expect(ymd(d)).toBe('2026-03-09');
    expect(d.getHours()).toBe(0);
  });

  test('DST back (November): 2026-11-02 (Mon after fall-back) → same Mon at 00:00', () => {
    // DST back in 2026 is Sunday 2026-11-01. Monday 2026-11-02 is post-DST.
    const d = getWeekStart(localDate(2026, 11, 2, 10));
    expect(ymd(d)).toBe('2026-11-02');
    expect(d.getHours()).toBe(0);
  });

  test('Sunday during DST-back week stays in the prior week', () => {
    // 2026-11-01 is Sunday post-fall-back. Should map to 2026-10-26 (Mon).
    expect(ymd(getWeekStart(localDate(2026, 11, 1)))).toBe('2026-10-26');
  });
});

// =============================================================================
// getWeekEnd — Friday at 23:59:59.999 local
// =============================================================================
describe('getWeekEnd', () => {
  function endShouldBe(input: Date, expectedFriday: string) {
    const e = getWeekEnd(input);
    expect(ymd(e)).toBe(expectedFriday);
    expect(e.getHours()).toBe(23);
    expect(e.getMinutes()).toBe(59);
    expect(e.getSeconds()).toBe(59);
    expect(e.getMilliseconds()).toBe(999);
  }

  test('Monday input → that Friday EOD', () => {
    endShouldBe(localDate(2026, 4, 13), '2026-04-17');
  });

  test('Wednesday input → that Friday EOD', () => {
    endShouldBe(localDate(2026, 4, 15), '2026-04-17');
  });

  test('Friday input → that Friday EOD', () => {
    endShouldBe(localDate(2026, 4, 17), '2026-04-17');
  });

  test('Saturday input → Friday of the SAME week, not next', () => {
    endShouldBe(localDate(2026, 4, 18), '2026-04-17');
  });

  test('Sunday input → Friday of the PREVIOUS week (Sun belongs to prior Mon-Fri)', () => {
    endShouldBe(localDate(2026, 4, 19), '2026-04-17');
  });

  test('year boundary: 2026-01-01 (Thu) → 2026-01-02 (Fri)', () => {
    endShouldBe(localDate(2026, 1, 1), '2026-01-02');
  });

  test('DST forward Monday → Friday of same week', () => {
    endShouldBe(localDate(2026, 3, 9), '2026-03-13');
  });

  test('DST back Monday → Friday of same week', () => {
    endShouldBe(localDate(2026, 11, 2), '2026-11-06');
  });
});

// =============================================================================
// isSameWeek
// =============================================================================
describe('isSameWeek', () => {
  test('Mon and Fri of the same week → true', () => {
    expect(isSameWeek(localDate(2026, 4, 13), localDate(2026, 4, 17))).toBe(true);
  });

  test('Sat and Mon of the same week → true', () => {
    expect(isSameWeek(localDate(2026, 4, 18), localDate(2026, 4, 13))).toBe(true);
  });

  test('Sun (which belongs to prior week) and prior Mon → true', () => {
    expect(isSameWeek(localDate(2026, 4, 19), localDate(2026, 4, 13))).toBe(true);
  });

  test('Sun and following Mon → false (different weeks)', () => {
    expect(isSameWeek(localDate(2026, 4, 19), localDate(2026, 4, 20))).toBe(false);
  });
});

// =============================================================================
// eachWeekBetween — used for empty-week fill on finite ranges
// =============================================================================
describe('eachWeekBetween', () => {
  test('returns each Monday inclusive', () => {
    const start = getWeekStart(localDate(2026, 4, 13));
    const end = getWeekStart(localDate(2026, 5, 4));
    const weeks = eachWeekBetween(start, end);
    expect(weeks.map(ymd)).toEqual([
      '2026-04-13',
      '2026-04-20',
      '2026-04-27',
      '2026-05-04',
    ]);
  });

  test('start === end → single bucket', () => {
    const start = getWeekStart(localDate(2026, 4, 13));
    const weeks = eachWeekBetween(start, start);
    expect(weeks.map(ymd)).toEqual(['2026-04-13']);
  });

  test('crosses DST forward boundary cleanly', () => {
    const start = getWeekStart(localDate(2026, 3, 2));   // pre-DST Mon
    const end = getWeekStart(localDate(2026, 3, 16));    // post-DST Mon
    const weeks = eachWeekBetween(start, end);
    expect(weeks.map(ymd)).toEqual(['2026-03-02', '2026-03-09', '2026-03-16']);
  });
});

// =============================================================================
// parseExcelSerial
// =============================================================================
describe('parseExcelSerial', () => {
  test('Excel serial number → YYYY-MM-DD via XLSX.SSF.parse_date_code', () => {
    // Excel serial 45000 = 2023-03-15 (1900 date system)
    expect(parseExcelSerial(45000)).toBe('2023-03-15');
  });

  test('Excel serial 1 → 1900-01-01 (Excel epoch)', () => {
    expect(parseExcelSerial(1)).toBe('1900-01-01');
  });

  test('ISO string "2026-05-01" → returned unchanged', () => {
    expect(parseExcelSerial('2026-05-01')).toBe('2026-05-01');
  });

  test('US format "5/1/2026" → "2026-05-01"', () => {
    expect(parseExcelSerial('5/1/2026')).toBe('2026-05-01');
  });

  test('US format with 2-digit month/day "05/01/2026" → "2026-05-01"', () => {
    expect(parseExcelSerial('05/01/2026')).toBe('2026-05-01');
  });

  test('US format month=12 → preserved', () => {
    expect(parseExcelSerial('12/31/2025')).toBe('2025-12-31');
  });

  test('JS Date object → ISO date string (no time)', () => {
    const d = new Date(2026, 3, 15, 10, 30); // April 15, 2026 10:30 local
    expect(parseExcelSerial(d)).toBe('2026-04-15');
  });

  test('garbage string → returned unchanged (v1 fallback)', () => {
    expect(parseExcelSerial('not a date')).toBe('not a date');
  });

  test('null → returned unchanged', () => {
    expect(parseExcelSerial(null)).toBe(null);
  });

  test('undefined → returned unchanged', () => {
    expect(parseExcelSerial(undefined)).toBe(undefined);
  });

  test('invalid Date instance → returned unchanged', () => {
    const bad = new Date('not a date');
    expect(parseExcelSerial(bad)).toBe(bad);
  });

  test('US format with invalid month=13 → returned unchanged', () => {
    expect(parseExcelSerial('13/1/2026')).toBe('13/1/2026');
  });
});
