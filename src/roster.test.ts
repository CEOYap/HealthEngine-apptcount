import { describe, expect, test } from 'vitest';
import { buildRoster, type RosterRules } from './roster.js';

const rules: RosterRules = { start: '09:00', slotMinutes: 10, breakMinutes: [20, 50] };

describe('buildRoster', () => {
  test('grid from start to the last available slot, skipping :20/:50 blocks', () => {
    expect(buildRoster(['09:30', '10:10'], rules)).toEqual([
      '09:00', '09:10', '09:30', '09:40', '10:00', '10:10',
    ]);
  });

  test('end of day follows the feed, so a later finish needs no config change', () => {
    const early = buildRoster(['09:00', '15:10'], rules);
    const late = buildRoster(['09:00', '16:40'], rules);
    expect(early.at(-1)).toBe('15:10');
    expect(late.at(-1)).toBe('16:40');
  });

  test('a break-minute slot that is published is treated as a normal slot', () => {
    expect(buildRoster(['09:00', '09:20', '09:30'], rules)).toEqual(['09:00', '09:10', '09:20', '09:30']);
  });

  test('an available slot before the configured start extends the day earlier', () => {
    expect(buildRoster(['08:40', '09:00'], rules)).toEqual(['08:40', '09:00']);
  });

  test('off-grid times are left out (so the stale guard fires)', () => {
    expect(buildRoster(['09:00', '09:15'], rules)).toEqual(['09:00']);
  });

  test('nothing available -> empty roster', () => {
    expect(buildRoster([], rules)).toEqual([]);
  });
});
