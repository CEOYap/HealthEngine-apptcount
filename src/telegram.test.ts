import { describe, expect, test } from 'vitest';
import { formatError, formatMessage } from './telegram.js';
import type { PipelineResult } from './pipeline.js';

function result(over: Partial<PipelineResult>): PipelineResult {
  return {
    date: '2026-06-15',
    weekday: 1,
    url: 'https://x',
    roster: ['09:00', '09:15', '09:30'],
    available: ['09:15'],
    booked: ['09:00', '09:30'],
    count: 2,
    guard: 'none',
    raw: null,
    ...over,
  };
}

describe('formatMessage', () => {
  test('normal count lists the date, count and booked times', () => {
    const msg = formatMessage(result({}));
    expect(msg).toContain('Mon 15 Jun 2026');
    expect(msg).toContain('<b>2</b>');
    expect(msg).toContain('09:00');
    expect(msg).toContain('09:30');
  });

  test('zero bookings reads cleanly, not "0 ... Times:"', () => {
    const msg = formatMessage(result({ booked: [], count: 0, available: ['09:00', '09:15', '09:30'] }));
    expect(msg).toContain('No patients booked');
    expect(msg).not.toContain('Times:');
  });

  test('sanity guard sends the leave/fully-booked warning', () => {
    const msg = formatMessage(result({ guard: 'sanity', available: [], booked: ['09:00', '09:15', '09:30'], count: 3 }));
    expect(msg).toMatch(/leave|fully booked/i);
    expect(msg).toContain('check');
  });

  test('stale guard sends the outdated-roster warning', () => {
    const msg = formatMessage(result({ guard: 'stale', available: ['12:00'] }));
    expect(msg).toMatch(/roster/i);
    expect(msg).toMatch(/outdated|update/i);
  });
});

describe('formatError', () => {
  test('wraps the failure reason in a "bot broke" alert', () => {
    const msg = formatError('HTTP 500 for https://x');
    expect(msg).toMatch(/broke|error|failed/i);
    expect(msg).toContain('HTTP 500');
  });

  test('escapes HTML-special characters in the reason', () => {
    expect(formatError('bad <tag> & "x"')).toContain('bad &lt;tag&gt; &amp;');
  });
});
