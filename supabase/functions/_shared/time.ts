// Timezone helpers — lifted verbatim from ClinicPro _shared/time.ts.
// Default tz for Vaani is 'Asia/Kolkata' but the helper is tz-agnostic.

/**
 * Return the UTC instant corresponding to midnight (00:00) of `now`'s
 * local date in IANA timezone `tz`, as an ISO string suitable for a
 * Postgres `gte` filter on a `timestamptz` column.
 *
 * Correctness: branch on whether the UTC midnight of the local YMD
 * shows the same date or the previous date when rendered in `tz`.
 *
 * Verified across UTC, NY (EST + EDT, including DST boundary days),
 * LA, Tokyo, Kolkata (no DST), and times where now's UTC date differs
 * from the tz date.
 */
export function startOfDayInTzAsUtcIso(now: Date, tz: string): string {
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayYmd = dateFmt.format(now);
  const guess = new Date(`${todayYmd}T00:00:00Z`);
  const guessYmd = dateFmt.format(guess);
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [hh, mm] = timeFmt.format(guess).split(':').map((s) => parseInt(s, 10));
  const offsetMin = hh * 60 + mm;
  const deltaMin = guessYmd === todayYmd ? -offsetMin : 24 * 60 - offsetMin;
  return new Date(guess.getTime() + deltaMin * 60_000).toISOString();
}

/** Returns true if `at` falls within local business hours in `tz`. */
export function isWithinBusinessHours(
  at: Date,
  tz: string,
  windowStartHHMM: string,
  windowEndHHMM: string,
  allowedDays: number[] = [1, 2, 3, 4, 5, 6], // Mon-Sat for India default
): boolean {
  const dowFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  });
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dow = dowMap[dowFmt.format(at)];
  if (!allowedDays.includes(dow)) return false;
  const tFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const now = tFmt.format(at);
  return now >= windowStartHHMM && now < windowEndHHMM;
}

export const INDIA_TZ = 'Asia/Kolkata';
export const DEFAULT_BUSINESS_START = '08:00';
export const DEFAULT_BUSINESS_END = '20:00';
// DOTS adherence calls fire in morning dose window
export const DOTS_BUSINESS_START = '06:30';
export const DOTS_BUSINESS_END = '09:00';
