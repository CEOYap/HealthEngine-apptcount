/**
 * Core pipeline: resolve date -> fetch -> parse -> subtract -> guards.
 * `evaluate` is the pure decision logic (unit-tested); `runPipeline` wires in IO so
 * the scheduled handler and the /run debug endpoint share exactly one code path.
 */

import type { Env, Settings } from './env.js';
import { extractPracticeData, fetchAvailability, findDoctorDates, slotsForDate } from './healthengine.js';
import { getEffectiveRoster, learnSlots } from './roster.js';
import { resolveDate, sydneyWeekday } from './time.js';

export type Guard = 'none' | 'stale' | 'sanity';

export interface Evaluation {
  guard: Guard;
  booked: string[];
  count: number;
}

/**
 * Decide the outcome from a roster and the day's available slots.
 *
 * Guard order:
 *  1. stale-roster — any available time absent from the roster means the roster is out
 *     of date; report that rather than a wrong/negative count.
 *  2. sanity — available slots <= threshold (default 0). Leave and a fully-booked day
 *     are indistinguishable from the public feed, so flag for a manual check.
 *  3. none — report the count of booked times (roster − available).
 */
export function evaluate(roster: string[], available: string[], sanityThreshold: number): Evaluation {
  const rosterSet = new Set(roster);
  const availableSet = new Set(available);
  const booked = roster.filter((t) => !availableSet.has(t)).sort();

  const hasUnknown = available.some((t) => !rosterSet.has(t));
  if (hasUnknown) return { guard: 'stale', booked, count: booked.length };
  if (available.length <= sanityThreshold) return { guard: 'sanity', booked, count: booked.length };
  return { guard: 'none', booked, count: booked.length };
}

export interface PipelineResult {
  date: string;
  weekday: number;
  url: string;
  roster: string[];
  available: string[];
  booked: string[];
  count: number;
  guard: Guard;
  raw: unknown;
}

/** Full fetch -> parse -> learn -> evaluate run for a Sydney date spec. */
export async function runPipeline(
  env: Env,
  settings: Settings,
  dateSpec: string,
  now: Date = new Date(),
): Promise<PipelineResult> {
  const date = resolveDate(dateSpec, now);
  const weekday = sydneyWeekday(date);

  const { url, html } = await fetchAvailability(env, date, env.DOCTOR_ID);
  const practiceData = extractPracticeData(html);
  const dates = findDoctorDates(practiceData, env.DOCTOR_ID);
  const available = slotsForDate(practiceData, date, env.DOCTOR_ID);
  const raw = { availableDates: Object.keys(dates).sort(), slots: dates[date] ?? [] };

  // Read the roster as it stands BEFORE today's observation (static ∪ previously
  // learned). Evaluating against this lets a newly-appearing slot trip the stale
  // guard exactly once...
  const roster = await getEffectiveRoster(env.ROSTER_KV, weekday);
  const { guard, booked, count } = evaluate(roster, available, settings.sanityThreshold);

  // ...then learn today's slots so the guard self-corrects next time (never shrinks).
  await learnSlots(env.ROSTER_KV, weekday, available);

  return { date, weekday, url, roster, available, booked, count, guard, raw };
}
