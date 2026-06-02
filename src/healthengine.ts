/**
 * HealthEngine availability access — the ONLY module that depends on the upstream
 * shape.
 *
 * The web plugin does NOT expose a separate JSON endpoint: the availability data is
 * embedded in the page HTML as an inline JavaScript object:
 *
 *   practice_data = {"General Practice":{"doctors":{"137074":{"dates":{
 *     "2026-06-15":[{"time":33000,"length":10,"appt_id":...,"date_time":"...+10:00"}, ...]
 *   }}}}};
 *
 * `time` is seconds-since-midnight in practice-local (Sydney) wall-clock. One fetch
 * returns every published date (~4 weeks ahead) for every doctor, so we pick the date
 * and doctor in-process rather than per-request.
 */

import type { Env } from './env.js';

const SYDNEY_TZ = 'Australia/Sydney';

/** Thrown when the upstream payload cannot be parsed — triggers the "bot broke" alert. */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

interface RawSlot {
  time?: number; // seconds since midnight, local
  length?: number; // minutes
  date_time?: string; // ISO with offset, e.g. 2026-06-15T09:10:00+10:00
}

/** Substitute `__DATE__`/`__DOCTOR__` tokens if a captured URL uses them (otherwise a no-op). */
export function buildUrl(template: string, date: string, doctorId: string): string {
  return template.replaceAll('__DATE__', date).replaceAll('__DOCTOR__', doctorId);
}

/** Fetch the web plugin page HTML (which carries the inline `practice_data`). */
export async function fetchAvailability(
  env: Env,
  date: string,
  doctorId: string,
): Promise<{ url: string; html: string }> {
  const url = buildUrl(env.AVAILABILITY_URL, date, doctorId);
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/html' },
  });
  if (!res.ok) {
    throw new ParseError(`Availability fetch failed: HTTP ${res.status} for ${url}`);
  }
  return { url, html: await res.text() };
}

/**
 * Extract and parse the inline `practice_data = {...}` object from page HTML.
 * Uses a string-aware balanced-brace scan so braces inside string values don't
 * truncate the object (the legacy `let practice_data = ({.*?})` regex did).
 */
export function extractPracticeData(html: string): unknown {
  const marker = html.search(/practice_data\s*=\s*\{/);
  if (marker === -1) throw new ParseError('practice_data not found in page HTML');

  const start = html.indexOf('{', marker);
  const json = sliceBalancedObject(html, start);
  if (json === null) throw new ParseError('practice_data object is not balanced');

  try {
    return JSON.parse(json);
  } catch (e) {
    throw new ParseError(`practice_data is not valid JSON: ${(e as Error).message}`);
  }
}

/** The `dates` map for a doctor, searched across every practice category. */
export function findDoctorDates(practiceData: unknown, doctorId: string): Record<string, RawSlot[]> {
  if (practiceData && typeof practiceData === 'object') {
    for (const category of Object.values(practiceData as Record<string, unknown>)) {
      const doctors = (category as { doctors?: Record<string, unknown> })?.doctors;
      const doctor = doctors?.[doctorId] as { dates?: Record<string, RawSlot[]> } | undefined;
      if (doctor?.dates) return doctor.dates;
    }
  }
  throw new ParseError(`Doctor ${doctorId} not found in practice_data`);
}

/** Available slot start-times ("HH:mm", sorted & deduped) for a doctor on a Sydney date. */
export function slotsForDate(practiceData: unknown, date: string, doctorId: string): string[] {
  const dates = findDoctorDates(practiceData, doctorId);
  const slots = dates[date] ?? []; // absent date == nothing published that day
  const times: string[] = [];
  for (const slot of slots) {
    const hhmm = slotToHHmm(slot);
    if (hhmm !== null) times.push(hhmm);
  }
  return [...new Set(times)].sort();
}

function slotToHHmm(slot: RawSlot): string | null {
  if (typeof slot.time === 'number') return secondsToHHmm(slot.time);
  if (typeof slot.date_time === 'string') return isoToSydneyHHmm(slot.date_time);
  return null;
}

function secondsToHHmm(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${pad(h)}:${pad(m)}`;
}

function isoToSydneyHHmm(iso: string): string | null {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: SYDNEY_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ts));
}

/** Return the JSON substring for a balanced `{...}` starting at `open`, or null. */
function sliceBalancedObject(s: string, open: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return s.slice(open, i + 1);
    }
  }
  return null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
