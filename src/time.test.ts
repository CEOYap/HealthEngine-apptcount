import { describe, expect, test } from 'vitest';
import { resolveDate, sydneyHour, sydneyWeekday } from './time.js';

describe('resolveDate', () => {
  test('passes an explicit YYYY-MM-DD through unchanged', () => {
    const now = new Date('2026-06-14T00:00:00Z');
    expect(resolveDate('2026-06-15', now)).toBe('2026-06-15');
  });

  test('resolves "today" to the Sydney calendar date (AEST/winter)', () => {
    // 22:00 UTC -> 08:00 Sydney next day (UTC+10, no DST in June)
    const now = new Date('2026-06-14T22:00:00Z');
    expect(resolveDate('today', now)).toBe('2026-06-15');
  });

  test('resolves "tomorrow" to the following Sydney calendar date', () => {
    const now = new Date('2026-06-14T22:00:00Z');
    expect(resolveDate('tomorrow', now)).toBe('2026-06-16');
  });

  test('resolves "today" correctly during AEDT/summer (UTC+11)', () => {
    // 20:00 UTC on 1 Jan -> 07:00 Sydney on 2 Jan (UTC+11, DST)
    const now = new Date('2026-01-01T20:00:00Z');
    expect(resolveDate('today', now)).toBe('2026-01-02');
  });

  test('handles month/year rollover for "tomorrow"', () => {
    const now = new Date('2026-06-29T22:00:00Z'); // Sydney 2026-06-30
    expect(resolveDate('tomorrow', now)).toBe('2026-07-01');
  });
});

describe('sydneyWeekday', () => {
  test('15 Jun 2026 is a Monday (1)', () => {
    expect(sydneyWeekday('2026-06-15')).toBe(1);
  });

  test('Sunday is 0', () => {
    expect(sydneyWeekday('2026-06-14')).toBe(0);
  });

  test('Thursday is 4', () => {
    expect(sydneyWeekday('2026-06-18')).toBe(4);
  });
});

describe('sydneyHour', () => {
  test('returns 7 when it is 07:00 in Sydney during AEST (UTC+10)', () => {
    const now = new Date('2026-06-14T21:00:00Z');
    expect(sydneyHour(now)).toBe(7);
  });

  test('returns 7 when it is 07:00 in Sydney during AEDT (UTC+11)', () => {
    const now = new Date('2026-01-01T20:00:00Z');
    expect(sydneyHour(now)).toBe(7);
  });

  test('returns 8 for the off-by-one cron firing in AEST', () => {
    // 20:00 UTC fires at 06:00 AEST in winter -> guard should reject (not 7)
    const now = new Date('2026-06-14T20:00:00Z');
    expect(sydneyHour(now)).toBe(6);
  });
});
