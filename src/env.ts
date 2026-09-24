/** Bindings, vars and secrets available to the Worker. Mirrors `wrangler.toml`. */
export interface Env {
  // Vars (see wrangler.toml [vars]).
  AVAILABILITY_URL: string;
  PRACTICE_ID: string;
  DOCTOR_ID: string;
  TIMEZONE: string;
  SEND_HOUR: string;
  SANITY_THRESHOLD: string;
  WORKING_DAYS: string;

  // Secrets (set via `wrangler secret put`).
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  TRIGGER_TOKEN: string;
}

/** Parsed, validated tunables derived from the raw string vars. */
export interface Settings {
  sendHour: number;
  sanityThreshold: number;
  workingDays: Set<number>;
}

export function readSettings(env: Env): Settings {
  return {
    sendHour: parseIntOr(env.SEND_HOUR, 7),
    sanityThreshold: parseIntOr(env.SANITY_THRESHOLD, 0),
    workingDays: new Set(
      (env.WORKING_DAYS ?? '1,2,4,5')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n)),
    ),
  };
}

function parseIntOr(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
