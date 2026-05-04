// Tiny formatting helpers shared by the trade tables.
// Pure functions — no locale surprises (en-US, USD).

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const usdNoCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const pct = new Intl.NumberFormat('en-US', {
  style: 'decimal',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function fmtUSD(n: number, opts: { cents?: boolean } = {}): string {
  return (opts.cents === false ? usdNoCents : usd).format(n);
}

export function fmtSignedUSD(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '' : '';
  return `${sign}${usd.format(n)}`;
}

export function fmtSignedPct(s: string): string {
  const n = parseFloat(s);
  if (Number.isNaN(n)) return '0.00%';
  const sign = n > 0 ? '+' : n < 0 ? '' : '';
  return `${sign}${pct.format(n)}%`;
}

export function fmtDate(s: string | null): string {
  if (!s) return '—';
  return dateFmt.format(new Date(s));
}
