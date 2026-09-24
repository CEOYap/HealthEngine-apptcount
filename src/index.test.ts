import { describe, expect, test } from 'vitest';
import { shouldRunNow } from './index.js';
import type { Settings } from './env.js';

const settings: Settings = { sendHour: 7, sanityThreshold: 0, workingDays: new Set([1, 2, 4, 5]) };

describe('shouldRunNow (DST + working-day cron guard)', () => {
  test('true at 07:00 Sydney on a working Monday (AEST/winter)', () => {
    // 21:00 UTC -> 07:00 Sydney next day = Mon 2026-06-15
    expect(shouldRunNow(settings, new Date('2026-06-14T21:00:00Z'))).toBe(true);
  });

  test('true at 07:00 Sydney on a working Monday (AEDT/summer)', () => {
    // 20:00 UTC -> 07:00 Sydney = Mon 2026-01-05
    expect(shouldRunNow(settings, new Date('2026-01-04T20:00:00Z'))).toBe(true);
  });

  test('false for the off-by-one cron firing (06:00 Sydney in winter)', () => {
    expect(shouldRunNow(settings, new Date('2026-06-14T20:00:00Z'))).toBe(false);
  });

  test('true at 07:00 Sydney on a working Friday', () => {
    // 21:00 UTC -> Fri 2026-06-19 07:00 Sydney
    expect(shouldRunNow(settings, new Date('2026-06-18T21:00:00Z'))).toBe(true);
  });

  test('false on Sunday even at 07:00', () => {
    // 21:00 UTC -> Sun 2026-06-21 07:00 Sydney
    expect(shouldRunNow(settings, new Date('2026-06-20T21:00:00Z'))).toBe(false);
  });

  test('false on a non-working day even at 07:00 (Wednesday)', () => {
    // 21:00 UTC -> Wed 2026-06-17 07:00 Sydney
    expect(shouldRunNow(settings, new Date('2026-06-16T21:00:00Z'))).toBe(false);
  });
});
