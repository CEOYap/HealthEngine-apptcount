/**
 * Worker entry.
 *  - scheduled(): fires from the two daily cron triggers; the DST-aware guard means
 *    only the firing that lands on 07:00 Sydney on a working day actually sends.
 *  - fetch(): the token-guarded /run debug endpoint for manual runs and dry-runs.
 */

import type { Env, Settings } from './env.js';
import { readSettings } from './env.js';
import { runPipeline } from './pipeline.js';
import { formatMessage, sendError, sendMessage } from './telegram.js';
import { resolveDate, sydneyHour, sydneyWeekday } from './time.js';

/** Should the scheduled job send right now? 07:00 Sydney local AND a working weekday. */
export function shouldRunNow(settings: Settings, now: Date = new Date()): boolean {
  if (sydneyHour(now) !== settings.sendHour) return false;
  const weekday = sydneyWeekday(resolveDate('today', now));
  return settings.workingDays.has(weekday);
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const settings = readSettings(env);
    if (!shouldRunNow(settings)) return; // wrong hour (DST off-by-one) or non-working day
    ctx.waitUntil(runAndSend(env, settings));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/run') {
      return new Response('Not found', { status: 404 });
    }
    if (!isAuthorised(request, url, env)) {
      return new Response('Unauthorised', { status: 401 });
    }

    const settings = readSettings(env);
    const dateSpec = url.searchParams.get('date') ?? 'today';
    const send = url.searchParams.get('send') !== 'false';
    const debug = url.searchParams.get('debug') === '1';

    try {
      const result = await runPipeline(env, settings, dateSpec);
      const message = formatMessage(result);
      let sent = false;
      if (send) {
        await sendMessage(env, message);
        sent = true;
      }
      if (debug) {
        return json({ ok: true, sent, message, ...result });
      }
      return new Response(`guard=${result.guard} booked=${result.count} sent=${sent}\n`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (send) await sendError(env, reason);
      if (debug) return json({ ok: false, error: reason }, 500);
      return new Response(`error: ${reason}\n`, { status: 500 });
    }
  },
};

/** Scheduled path: run the pipeline and send the daily message, alerting on failure. */
async function runAndSend(env: Env, settings: Settings): Promise<void> {
  try {
    const result = await runPipeline(env, settings, 'today');
    await sendMessage(env, formatMessage(result));
  } catch (err) {
    await sendError(env, err instanceof Error ? err.message : String(err));
  }
}

function isAuthorised(request: Request, url: URL, env: Env): boolean {
  const fromQuery = url.searchParams.get('token');
  const auth = request.headers.get('authorization');
  const fromHeader = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  const token = fromQuery ?? fromHeader;
  return !!env.TRIGGER_TOKEN && token === env.TRIGGER_TOKEN;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
