/**
 * Static per-weekday roster: the full list of slot start-times you work each day,
 * keyed by Sydney weekday (0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat).
 *
 * IMPORTANT: capture these from the availability feed on a ZERO-BOOKING day (e.g. an
 * empty future Monday such as 2026-06-15) so the times and granularity match the feed
 * exactly. Daily reads must use the same request shape as the capture.
 *
 * Leave a weekday empty until captured. The KV self-learning roster (src/roster.ts)
 * unions observed available times into these over time, so the stale-roster guard
 * self-corrects even if this seed is incomplete.
 *
 * Dr Brandon Lee works Mon, Tue, Thu, Sun — each with different hours.
 */
export const STATIC_ROSTER: Record<number, string[]> = {
  0: [], // Sunday  — TODO: capture from an empty Sunday
  1: [], // Monday  — TODO: capture from an empty Monday (e.g. 2026-06-15)
  2: [], // Tuesday — TODO: capture from an empty Tuesday
  4: [], // Thursday — TODO: capture from an empty Thursday
};
