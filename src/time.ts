/**
 * Australia/Sydney date & time helpers.
 *
 * Sydney observes daylight saving (AEST UTC+10 in winter, AEDT UTC+11 in summer),
 * so we never hard-code an offset. All conversions go through `Intl.DateTimeFormat`
 * with `timeZone: 'Australia/Sydney'`, which applies the correct offset for the
 * given instant automatically.
 */

const TIME_ZONE = 'Australia/Sydney';

/** Returns the Sydney wall-clock parts for an instant. */
function sydneyParts(now: Date): { year: number; month: number; day: number; hour: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
  };
}

/** The Sydney calendar date (`YYYY-MM-DD`) for an instant. */
function sydneyDateString(now: Date): string {
  const { year, month, day } = sydneyParts(now);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Resolve a date spec to a Sydney `YYYY-MM-DD` string.
 * Accepts `today`, `tomorrow`, or an explicit `YYYY-MM-DD` (passed through).
 */
export function resolveDate(spec: string, now: Date = new Date()): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(spec)) return spec;
  if (spec === 'today') return sydneyDateString(now);
  if (spec === 'tomorrow') return addDays(sydneyDateString(now), 1);
  throw new Error(`Invalid date spec: "${spec}" (expected today | tomorrow | YYYY-MM-DD)`);
}

/** Day of week for a `YYYY-MM-DD` calendar date: 0=Sun .. 6=Sat. */
export function sydneyWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  // A calendar date's weekday is timezone-independent; anchor at UTC midnight.
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Current Sydney local hour (0-23) for an instant, DST-aware. */
export function sydneyHour(now: Date = new Date()): number {
  return sydneyParts(now).hour;
}

/** Add `n` whole days to a `YYYY-MM-DD` string, handling month/year rollover. */
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + n));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
