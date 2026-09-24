/**
 * Builds the day's roster from a pattern instead of a fixed list:
 *
 *   every SLOT_MINUTES slot from the day's start to the last published slot,
 *   minus the half-hourly BREAK_MINUTES blocks.
 *
 * The finishing time is not fixed, so the end of the day is taken from the feed itself:
 * the last available slot. Booked slots after that are invisible to the public feed and
 * are not counted (the Telegram message states the cut-off time).
 */

import { BREAK_MINUTES, DAY_START, DEFAULT_DAY_START, SLOT_MINUTES } from './config.js';

export interface RosterRules {
  start: string;
  slotMinutes: number;
  breakMinutes: number[];
}

export function rulesForWeekday(weekday: number): RosterRules {
  return {
    start: DAY_START[weekday] ?? DEFAULT_DAY_START,
    slotMinutes: SLOT_MINUTES,
    breakMinutes: BREAK_MINUTES,
  };
}

/**
 * The expected slot times for a day given what the feed is publishing. Returns `[]` when
 * nothing is available (the sanity guard handles that case).
 *
 * Available times that are off the slot grid are deliberately left out, so they trip the
 * stale guard: that means the appointment length changed and the rules need updating.
 */
export function buildRoster(available: string[], rules: RosterRules): string[] {
  const onGrid = available.map(toMinutes).filter((m) => m % rules.slotMinutes === 0);
  if (onGrid.length === 0) return [];

  const availableSet = new Set(onGrid);
  const first = Math.min(toMinutes(rules.start), ...onGrid);
  const last = Math.max(...onGrid);
  const breaks = new Set(rules.breakMinutes);

  const roster: string[] = [];
  for (let m = first; m <= last; m += rules.slotMinutes) {
    if (breaks.has(m % 60) && !availableSet.has(m)) continue;
    roster.push(toHHmm(m));
  }
  return roster;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHmm(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
