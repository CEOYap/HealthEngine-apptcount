/**
 * Effective roster = static config (src/config.ts) UNION the self-learning set stored
 * in KV. Each working day we union the observed available times into KV, so the roster
 * converges to the true full set over time and the stale-roster guard self-corrects.
 */

import { STATIC_ROSTER } from './config.js';

const KEY_PREFIX = 'roster:';

/** KV key holding the learned union of slot times for a Sydney weekday. */
function key(weekday: number): string {
  return `${KEY_PREFIX}${weekday}`;
}

async function readLearned(kv: KVNamespace, weekday: number): Promise<string[]> {
  const raw = await kv.get(key(weekday));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function union(...lists: string[][]): string[] {
  return [...new Set(lists.flat())].sort();
}

/**
 * The full roster for a weekday: static seed ∪ KV-learned ∪ any extra times passed in
 * (used by the pipeline to fold today's observation into the comparison set).
 */
export async function getEffectiveRoster(
  kv: KVNamespace,
  weekday: number,
  extra: string[] = [],
): Promise<string[]> {
  const learned = await readLearned(kv, weekday);
  return union(STATIC_ROSTER[weekday] ?? [], learned, extra);
}

/** Union today's observed available times into the learned set for this weekday (never shrinks). */
export async function learnSlots(
  kv: KVNamespace,
  weekday: number,
  observed: string[],
): Promise<void> {
  if (observed.length === 0) return;
  const learned = await readLearned(kv, weekday);
  const merged = union(learned, observed);
  if (merged.length === learned.length && merged.every((t, i) => t === learned[i])) return;
  await kv.put(key(weekday), JSON.stringify(merged));
}
