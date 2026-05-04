import * as XLSX from 'xlsx';

// =============================================================================
// Week boundaries — Monday → Friday convention.
//
// All math is done in LOCAL time. The trader (Victor) operates in
// America/New_York. Tests pin TZ=America/New_York so DST and year-boundary
// behavior is verifiable. We deliberately do NOT use UTC: the v1 bug came
// from mixing UTC-based getDay() with local calendar dates.
//
// Convention:
//   Mon, Tue, Wed, Thu, Fri  → that same week's Monday
//   Sat                       → that same week's Monday (NOT next)
//   Sun                       → PREVIOUS Monday (the v1 bug source —
//                              Sunday's getDay() === 0, naive math sends
//                              forward by 1 day instead of back by 6)
// =============================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Mon=1, Tue=2, ..., Fri=5, Sat=6, Sun=0 → days back to Monday.
function daysBackToMonday(weekday: number): number {
  if (weekday === 0) return 6; // Sunday: previous Monday is 6 days back
  return weekday - 1;          // Mon=0, Tue=1, ..., Sat=5
}

export function getWeekStart(input: Date): Date {
  const d = new Date(input);
  const back = daysBackToMonday(d.getDay());
  d.setDate(d.getDate() - back);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekEnd(input: Date): Date {
  const monday = getWeekStart(input);
  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);
  return friday;
}

// True iff a and b fall in the same Mon-Fri week per our convention.
export function isSameWeek(a: Date, b: Date): boolean {
  return getWeekStart(a).getTime() === getWeekStart(b).getTime();
}

// Iterate weeks (by Monday) from start to end inclusive. Used for empty-week
// fill on finite ranges in the weekly premium chart.
export function eachWeekBetween(startMon: Date, endMon: Date): Date[] {
  const out: Date[] = [];
  const cursor = new Date(startMon);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= endMon.getTime()) {
    out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

// =============================================================================
// parseExcelSerial — accepts every shape we see in v1 imports.
//
// Behavior matches v1 exactly:
//   - Numeric Excel serial → XLSX.SSF.parse_date_code → 'YYYY-MM-DD'
//   - ISO 'YYYY-MM-DD'     → returned unchanged
//   - 'M/D/YYYY' US format → normalized to 'YYYY-MM-DD'
//   - JS Date              → ISO date string (no time)
//   - Anything else        → returned unchanged (lets the import row
//                            validator surface the bad value to the user)
// =============================================================================

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function parseExcelSerial(value: unknown): unknown {
  // ---- Date instance ----
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatYMD(value);
  }

  // ---- Numeric Excel serial ----
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && typeof parsed.y === 'number') {
      return `${pad4(parsed.y)}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
    }
    // Fall through to "unchanged" path below if the serial doesn't decode.
  }

  // ---- Strings ----
  if (typeof value === 'string') {
    if (ISO_DATE.test(value)) return value;

    const m = value.match(US_DATE);
    if (m) {
      const month = parseInt(m[1], 10);
      const day = parseInt(m[2], 10);
      const year = parseInt(m[3], 10);
      if (
        month >= 1 && month <= 12 &&
        day >= 1 && day <= 31
      ) {
        return `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
      }
    }
  }

  // ---- Anything else: pass through unchanged ----
  return value;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function pad4(n: number): string {
  return n.toString().padStart(4, '0');
}
function formatYMD(d: Date): string {
  return `${pad4(d.getFullYear())}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// =============================================================================
// Misc
// =============================================================================

// Days from `today` to `target`, in calendar days (timezone-aware via Date).
export function daysBetween(target: Date, from: Date = new Date()): number {
  const a = new Date(from);
  a.setHours(0, 0, 0, 0);
  const b = new Date(target);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}
