/**
 * Telegram delivery: clean HTML formatting + thin send wrappers.
 * `formatMessage` / `formatError` are pure (unit-tested); `sendMessage` / `sendError`
 * post to the Bot API.
 */

import type { Env } from './env.js';
import type { PipelineResult } from './pipeline.js';

/** Build the daily HTML message for Telegram, branching on which guard fired. */
export function formatMessage(r: PipelineResult): string {
  const label = formatDateLabel(r.date);

  if (r.guard === 'stale') {
    const unknown = r.available.filter((t) => !r.roster.includes(t));
    return (
      `⚠️ <b>Roster looks outdated — ${escapeHtml(label)}</b>\n\n` +
      `HealthEngine is publishing time(s) not in your roster: <b>${escapeHtml(unknown.join(', '))}</b>.\n` +
      `Please update the roster for this weekday; today's count is unreliable.`
    );
  }

  if (r.guard === 'sanity') {
    return (
      `⚠️ <b>${escapeHtml(label)}</b>\n\n` +
      `No open slots are showing. You are likely on leave or fully booked — ` +
      `the public feed cannot tell these apart, so please check.`
    );
  }

  if (r.count === 0) {
    return `📋 <b>${escapeHtml(label)}</b>\n\nNo patients booked yet today.`;
  }

  return (
    `📋 <b>${escapeHtml(label)}</b>\n\n` +
    `<b>${r.count}</b> patient${r.count === 1 ? '' : 's'} booked.\n` +
    `Times: ${escapeHtml(r.booked.join(', '))}`
  );
}

/** Build the "bot broke" error alert. */
export function formatError(reason: string): string {
  return `🚨 <b>Booking bot broke</b>\n\nThe daily check failed:\n${escapeHtml(reason)}`;
}

/** Post an HTML message to the configured chat. */
export async function sendMessage(env: Env, html: string): Promise<void> {
  await post(env, html);
}

/** Post the "bot broke" alert; never throws (best-effort). */
export async function sendError(env: Env, reason: string): Promise<void> {
  try {
    await post(env, formatError(reason));
  } catch {
    // Swallow — we are already on the failure path.
  }
}

async function post(env: Env, html: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: html,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`Telegram sendMessage failed: HTTP ${res.status} ${await res.text()}`);
  }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format `YYYY-MM-DD` as e.g. "Mon 15 Jun 2026" (calendar date, timezone-independent). */
function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[dow]} ${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
