import { describe, expect, test } from 'vitest';
import { ParseError, buildUrl, extractPracticeData, findDoctorDates, slotsForDate } from './healthengine.js';

describe('buildUrl', () => {
  test('substitutes __DATE__ and __DOCTOR__ tokens when present', () => {
    expect(buildUrl('https://x/__DOCTOR__?d=__DATE__', '2026-06-15', '137074')).toBe(
      'https://x/137074?d=2026-06-15',
    );
  });

  test('leaves a token-free webplugin URL unchanged', () => {
    const u = 'https://healthengine.com.au/webplugin/?id=101936&source=webplugin';
    expect(buildUrl(u, '2026-06-15', '137074')).toBe(u);
  });
});

describe('extractPracticeData', () => {
  test('pulls the practice_data object out of page HTML', () => {
    const html = '<script>var x=1; practice_data = {"General Practice":{"doctors":{}}}; foo();</script>';
    expect(extractPracticeData(html)).toEqual({ 'General Practice': { doctors: {} } });
  });

  test('handles braces inside string values', () => {
    const html = 'practice_data = {"bio":"closes } and opens {","n":1};';
    expect(extractPracticeData(html)).toEqual({ bio: 'closes } and opens {', n: 1 });
  });

  test('tolerates the legacy "let practice_data =" form', () => {
    const html = 'let practice_data = {"a":1};';
    expect(extractPracticeData(html)).toEqual({ a: 1 });
  });

  test('throws ParseError when practice_data is absent', () => {
    expect(() => extractPracticeData('<html>no data here</html>')).toThrow(ParseError);
  });
});

// Real shape: practice_data[category].doctors[id].dates[YYYY-MM-DD] = [{time, length, ...}]
const sample = {
  'General Practice': {
    specialist: 'GP',
    doctors: {
      '137074': {
        apptcount: 3,
        dates: {
          '2026-06-15': [
            { time: 33000, length: 10, date_time: '2026-06-15T09:10:00+10:00' }, // 09:10
            { time: 32400, length: 10, date_time: '2026-06-15T09:00:00+10:00' }, // 09:00
            { time: 33000, length: 10, date_time: '2026-06-15T09:10:00+10:00' }, // dup
          ],
          '2026-06-22': [],
        },
      },
    },
  },
};

describe('slotsForDate', () => {
  test('converts seconds-since-midnight to sorted, deduped HH:mm', () => {
    expect(slotsForDate(sample, '2026-06-15', '137074')).toEqual(['09:00', '09:10']);
  });

  test('returns [] when the date is present but empty (fully booked / no availability)', () => {
    expect(slotsForDate(sample, '2026-06-22', '137074')).toEqual([]);
  });

  test('returns [] when the date is not published at all', () => {
    expect(slotsForDate(sample, '2026-12-25', '137074')).toEqual([]);
  });

  test('finds the doctor under whichever category contains it (not hard-coded)', () => {
    const multi = { Physiotherapy: { doctors: {} }, 'General Practice': sample['General Practice'] };
    expect(slotsForDate(multi, '2026-06-15', '137074')).toEqual(['09:00', '09:10']);
  });

  test('throws ParseError when the doctor id is in no category', () => {
    expect(() => slotsForDate(sample, '2026-06-15', '999999')).toThrow(ParseError);
  });

  test('falls back to the date_time ISO field when time is missing', () => {
    const data = {
      cat: { doctors: { '1': { dates: { '2026-06-15': [{ date_time: '2026-06-15T14:30:00+10:00' }] } } } },
    };
    expect(slotsForDate(data, '2026-06-15', '1')).toEqual(['14:30']);
  });
});

describe('findDoctorDates', () => {
  test('returns the dates map for the doctor', () => {
    const dates = findDoctorDates(sample, '137074');
    expect(Object.keys(dates).sort()).toEqual(['2026-06-15', '2026-06-22']);
  });
});
