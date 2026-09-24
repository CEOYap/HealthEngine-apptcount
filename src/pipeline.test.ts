import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Env, Settings } from './env.js';
import { evaluate, runPipeline } from './pipeline.js';

function fakeEnv(): Env {
  return {
    AVAILABILITY_URL: 'https://x/avail?doctor=__DOCTOR__&date=__DATE__',
    PRACTICE_ID: '101936',
    DOCTOR_ID: '137074',
    TIMEZONE: 'Australia/Sydney',
    SEND_HOUR: '7',
    SANITY_THRESHOLD: '0',
    WORKING_DAYS: '1,2,4,5',
    TELEGRAM_BOT_TOKEN: 't',
    TELEGRAM_CHAT_ID: 'c',
    TRIGGER_TOKEN: 'k',
  };
}

const settings: Settings = { sendHour: 7, sanityThreshold: 0, workingDays: new Set([1, 2, 4, 5]) };

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

describe('runPipeline (pattern roster)', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('Thu 24 Sep 2026: counts bookings with a variable finish and half-hourly blocks', async () => {
    // What HealthEngine published that morning (orange slots); the day ran to 16:40.
    const available = [
      '10:30', '11:10', '11:30', '11:40', '12:00', '12:10', '13:10', '13:30', '13:40',
      '14:00', '14:10', '14:30', '14:40', '15:00', '15:10', '15:30', '15:40',
      '16:00', '16:10', '16:30', '16:40',
    ];
    vi.stubGlobal('fetch', mockFetchReturning({ '2026-09-24': available }));
    const r = await runPipeline(fakeEnv(), settings, '2026-09-24', new Date('2026-09-23T21:00:00Z'));
    expect(r.guard).toBe('none');
    expect(r.booked).toEqual([
      '09:00', '09:10', '09:30', '09:40', '10:00', '10:10', '10:40', '11:00', '12:30', '12:40', '13:00',
    ]);
    expect(r.count).toBe(11);
    expect(r.roster.at(-1)).toBe('16:40');
  });

  test('off-grid slot trips the stale guard', async () => {
    vi.stubGlobal('fetch', mockFetchReturning({ '2026-06-15': ['09:00', '09:15'] }));
    const r = await runPipeline(fakeEnv(), settings, '2026-06-15', new Date('2026-06-14T22:00:00Z'));
    expect(r.guard).toBe('stale');
  });

  test('empty availability trips the sanity guard', async () => {
    vi.stubGlobal('fetch', mockFetchReturning({ '2026-06-15': [] }));
    const r = await runPipeline(fakeEnv(), settings, '2026-06-15', new Date('2026-06-14T22:00:00Z'));
    expect(r.guard).toBe('sanity');
  });
});
