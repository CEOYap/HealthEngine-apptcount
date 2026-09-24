/**
 * Pattern-based roster settings. Rather than a fixed list of slot times per weekday,
 * the roster for a day is generated from these rules plus the day's published slots
 * (see src/roster.ts), so a variable finishing time never needs a config change.
 *
 * Dr Brandon Lee works Mon, Tue, Thu, Fri (Sydney weekday 0=Sun .. 6=Sat).
 */

/** Length of one appointment slot on the HealthEngine feed, in minutes. */
export const SLOT_MINUTES = 10;

/**
 * Minutes past the hour that are blocked "Unavailable" in the practice software every
 * half hour (e.g. 09:20, 09:50, 10:20 ...). These are never counted as bookings. If one
 * of them is published as available on a given day it is simply treated as a normal slot.
 */
export const BREAK_MINUTES: number[] = [20, 50];

/**
 * First bookable slot (`HH:mm`) per working weekday. Slots from here up to the day's
 * last published slot are counted; anything missing from the feed is a booking. If the
 * feed publishes a slot earlier than this, the day simply starts earlier.
 */
export const DAY_START: Record<number, string> = {
  1: '09:00', // Monday
  2: '09:00', // Tuesday
  4: '09:00', // Thursday
  5: '09:00', // Friday
};

/** Used for a weekday not listed in DAY_START. */
export const DEFAULT_DAY_START = '09:00';
