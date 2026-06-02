import { beforeEach, describe, expect, test } from 'vitest';
import { getEffectiveRoster, learnSlots } from './roster.js';

// Minimal Map-backed KV fake (only get/put are used).
function fakeKv(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => void store.set(key, value),
  } as unknown as KVNamespace;
}

describe('getEffectiveRoster', () => {
  test('returns the static roster when KV has nothing learned', async () => {
    const kv = fakeKv();
    // Monday static seed is empty in config; inject via learned to keep test self-contained.
    expect(await getEffectiveRoster(kv, 1)).toEqual([]);
  });

  test('unions static config with KV-learned times, sorted & deduped', async () => {
    const kv = fakeKv({ 'roster:1': JSON.stringify(['09:00', '13:00']) });
    const result = await getEffectiveRoster(kv, 1, ['09:00', '08:30']);
    expect(result).toEqual(['08:30', '09:00', '13:00']);
  });
});

describe('learnSlots', () => {
  let kv: KVNamespace;
  beforeEach(() => {
    kv = fakeKv();
  });

  test('stores observed times on first sighting', async () => {
    await learnSlots(kv, 1, ['09:00', '09:15']);
    expect(JSON.parse((await kv.get('roster:1'))!)).toEqual(['09:00', '09:15']);
  });

  test('unions new observations into existing learned set', async () => {
    await learnSlots(kv, 1, ['09:00']);
    await learnSlots(kv, 1, ['10:00', '09:00']);
    expect(JSON.parse((await kv.get('roster:1'))!)).toEqual(['09:00', '10:00']);
  });

  test('never shrinks: previously learned times survive a day they are not observed', async () => {
    await learnSlots(kv, 1, ['09:00', '17:00']);
    await learnSlots(kv, 1, ['09:00']); // 17:00 booked/absent today
    expect(JSON.parse((await kv.get('roster:1'))!)).toEqual(['09:00', '17:00']);
  });

  test('writes nothing when there are no times to learn', async () => {
    await learnSlots(kv, 1, []);
    expect(await kv.get('roster:1')).toBeNull();
  });
});
