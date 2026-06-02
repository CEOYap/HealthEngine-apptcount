import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Env, Settings } from './env.js';
import { evaluate, runPipeline } from './pipeline.js';

function fakeKv(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => void store.set(k, v),
  } as unknown as KVNamespace;
}

function fakeEnv(kv: KVNamespace): Env {
  return {
    ROSTER_KV: kv,
    AVAILABILITY_URL: 'https://x/avail?doctor=__DOCTOR__&date=__DATE__',
    PRACTICE_ID: '101936',
    DOCTOR_ID: '137074',
    TIMEZONE: 'Australia/Sydney',
    SEND_HOUR: '7',
    SANITY_THRESHOLD: '0',
    WORKING_DAYS: '0,1,2,4',
    TELEGRAM_BOT_TOKEN: 't',
    TELEGRAM_CHAT_ID: 'c',
    TRIGGER_TOKEN: 'k',
  };
}

const settings: Settings = { sendHour: 7, sanityThreshold: 0, workingDays: new Set([0, 1, 2, 4]) };

function hhmmToSeconds(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 3600 + m * 60;
}

/** Build web-plugin HTML carrying an inline practice_data for one doctor. */
function pluginHtml(doctorId: string, datesMap: Record<string, string[]>): string {
  const dates: Record<string, unknown[]> = {};
  for (const [date, times] of Object.entries(datesMap)) {
    dates[date] = times.map((t) => ({ time: hhmmToSeconds(t), length: 10 }));
  }
  const practiceData = { 'General Practice': { doctors: { [doctorId]: { dates } } } };
  return `<html><script>practice_data = ${JSON.stringify(practiceData)};</script></html>`;
}

function mockFetchReturning(datesMap: Record<string, string[]>) {
  return vi.fn(async () => new Response(pluginHtml('137074', datesMap), { status: 200 }));
}

describe('evaluate (subtraction + guards)', () => {
  test('normal: booked = roster - available, sorted', () => {
    const r = evaluate(['09:00', '09:15', '09:30', '09:45'], ['09:15', '09:45'], 0);
    expect(r.guard).toBe('none');
    expect(r.booked).toEqual(['09:00', '09:30']);
    expect(r.count).toBe(2);
  });

  test('stale-roster guard: an available time not in the roster', () => {
    const r = evaluate(['09:00', '09:15'], ['09:30'], 0);
    expect(r.guard).toBe('stale');
  });

  test('sanity guard: available at or below the threshold (default 0 = empty)', () => {
    const r = evaluate(['09:00', '09:15'], [], 0);
    expect(r.guard).toBe('sanity');
  });

  test('sanity guard respects a tunable threshold', () => {
    const r = evaluate(['09:00', '09:15', '09:30'], ['09:30'], 1);
    expect(r.guard).toBe('sanity');
  });

  test('stale takes precedence over sanity when an unknown time appears', () => {
    // 1 available, threshold 1 would be sanity, but the time is unknown -> stale wins.
    const r = evaluate(['09:00'], ['12:00'], 1);
    expect(r.guard).toBe('stale');
  });

  test('full roster all available -> 0 booked, no guard (above threshold)', () => {
    const r = evaluate(['09:00', '09:15'], ['09:00', '09:15'], 0);
    expect(r.guard).toBe('none');
    expect(r.count).toBe(0);
    expect(r.booked).toEqual([]);
  });
});

describe('runPipeline (wiring + self-learning)', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('learns a Monday roster, then reports a booked count the next Monday', async () => {
    const kv = fakeKv();
    const env = fakeEnv(kv);
    // 2026-06-15 is a Monday. Day 1: full empty roster published (09:00, 09:15, 09:30).
    vi.stubGlobal('fetch', mockFetchReturning({ '2026-06-15': ['09:00', '09:15', '09:30'] }));
    const day1 = await runPipeline(env, settings, '2026-06-15', new Date('2026-06-14T22:00:00Z'));
    // First sighting: roster was empty, so the new times trip the stale guard once.
    expect(day1.guard).toBe('stale');

    // Day 2 (next Monday 2026-06-22): 09:15 is now booked -> disappears.
    vi.stubGlobal('fetch', mockFetchReturning({ '2026-06-22': ['09:00', '09:30'] }));
    const day2 = await runPipeline(env, settings, '2026-06-22', new Date('2026-06-21T22:00:00Z'));
    expect(day2.guard).toBe('none');
    expect(day2.booked).toEqual(['09:15']);
    expect(day2.count).toBe(1);
  });

  test('empty availability trips the sanity guard', async () => {
    const kv = fakeKv({ 'roster:1': JSON.stringify(['09:00', '09:15']) });
    const env = fakeEnv(kv);
    vi.stubGlobal('fetch', mockFetchReturning({ '2026-06-15': [] }));
    const r = await runPipeline(env, settings, '2026-06-15', new Date('2026-06-14T22:00:00Z'));
    expect(r.guard).toBe('sanity');
  });
});
