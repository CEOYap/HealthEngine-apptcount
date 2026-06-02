# HealthEngine → Telegram daily booking-count bot

A Cloudflare Worker that, on each working morning, sends Dr Brandon Lee a Telegram
message with how many patients are booked under him that day at practice `101936`
(doctor `137074`).

HealthEngine's public web plugin only publishes **available** slots — a booked slot
simply disappears — so bookings are inferred by subtraction:

```
booked(today) = roster(weekday) − available(today)
```

The availability data is **embedded directly in the web-plugin page HTML** as an inline
`practice_data = {...}` object (it is *not* a separate JSON/XHR endpoint), shaped like:

```jsonc
practice_data = { "General Practice": { "doctors": { "137074": {
  "apptcount": 374,
  "dates": {
    "2026-06-15": [ { "time": 33000, "length": 10, "date_time": "2026-06-15T09:10:00+10:00" }, ... ]
  }
}}}}
```

`time` is seconds-since-midnight in Sydney local time (33000 → 09:10). A single fetch
returns every published date (~4 weeks ahead) for every doctor, so **no DevTools capture
is required** — `AVAILABILITY_URL` is just the web-plugin URL.

- **Stack:** TypeScript, Cloudflare Workers + Cron Triggers + KV, pnpm, Vitest.
- **Timezone:** Australia/Sydney, **DST-aware** (AEST UTC+10 / AEDT UTC+11). The send
  time and roster weekday are both Sydney-local.
- **Outbound-only:** the Worker calls HealthEngine and Telegram; the only inbound
  route is the token-guarded `/run` debug endpoint.

---

## How scheduling stays correct across DST

Cloudflare cron is UTC-only and cannot express a DST-aware local time. 07:00 Sydney is
**20:00 UTC** in summer (AEDT) or **21:00 UTC** in winter (AEST), so the Worker fires at
*both* times every day (`wrangler.toml` → `crons`). Inside `scheduled()` it computes
the real Sydney local hour via the `Intl` API and only the firing that lands on exactly
07:00 local on a working weekday actually sends — the other (06:00/08:00 local)
returns immediately. Result: exactly one message per working morning, no DST drift.

Working days default to **Mon, Tue, Thu, Sun** (`WORKING_DAYS = "0,1,2,4"`, where
0=Sun).

---

## Setup

### 1. Install

```bash
pnpm install
```

### 2. Create a Telegram bot and get your chat id

1. In Telegram, message **@BotFather** → `/newbot` → follow prompts → copy the
   **bot token** (looks like `123456:ABC-DEF...`).
2. Send any message to your new bot (so it can message you back).
3. Get your **chat id**:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates"
   ```
   Find `"chat":{"id":<number>...}` in the JSON. That number is `TELEGRAM_CHAT_ID`.

### 3. Set the secrets

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
wrangler secret put TRIGGER_TOKEN      # any long random string; guards /run
```

### 4. Create the KV namespace (self-learning roster)

```bash
wrangler kv namespace create ROSTER_KV
```

Paste the printed `id` into `wrangler.toml` under `[[kv_namespaces]]`, replacing
`REPLACE_WITH_KV_NAMESPACE_ID`.

---

## The availability source (already wired)

No endpoint capture is needed — [`src/healthengine.ts`](src/healthengine.ts) fetches the
web-plugin page, extracts the inline `practice_data` object (a string-aware balanced-brace
scan, robust to braces inside strings), and reads
`practice_data[category].doctors[DOCTOR_ID].dates[date]`. It searches **all** practice
categories for the doctor, so it isn't tied to the "General Practice" label.

This is the single module that depends on the upstream shape. If HealthEngine ever
changes it, you'll get a "bot broke" alert and only need to adjust
[`src/healthengine.ts`](src/healthengine.ts) (and its tests).

Inspect live data any time via the debug endpoint:

```bash
pnpm dev
# dump available dates + the raw slot objects for a known future date:
curl "http://localhost:8787/run?token=<TRIGGER_TOKEN>&date=2026-06-15&send=false&debug=1"
```

The `debug=1` JSON includes `raw.availableDates`, `raw.slots`, and the resolved
`roster`/`available`/`booked`.

> ⚠️ Confirm doctor id **137074** maps to **Dr Brandon Lee**: the public widget for
> `id=101936` may display a different practice name, but `practice_data` keys doctors by
> id, which is what we match on.
>
> **Appointment-type note:** new-vs-existing or standard-vs-long appointment types may
> expose different slot sets. The roster capture and daily reads both use the same page,
> so they stay consistent.

---

## Seeding the roster

Edit [`src/config.ts`](src/config.ts) → `STATIC_ROSTER`. For each working weekday, list
the full set of slot start-times you work as `"HH:mm"`. **Capture these from the feed
on a zero-booking day** (e.g. an empty future Monday such as **2026-06-15**) so times
and granularity match the feed exactly.

You don't have to be exhaustive: the **KV self-learning** roster
([`src/roster.ts`](src/roster.ts)) unions every observed available time into the stored
set per weekday, so the roster converges over time and the stale-roster guard
self-corrects. The first time an unseen slot appears you'll get a one-off
"roster outdated" message; after that it's learned.

---

## The guards

| Guard | Trigger | Message |
|-------|---------|---------|
| **Stale-roster** | an available time is **not** in the roster (`available ⊄ roster`) | "Roster looks outdated — update it" (avoids a wrong/negative count) |
| **Sanity** | available slots `≤ SANITY_THRESHOLD` (default 0) | "Likely on leave or fully booked — please check" (the feed can't tell these apart) |
| **Error** | fetch/parse failure | "🚨 Booking bot broke …" instead of silent failure |

---

## The `/run` debug endpoint

Guarded by `TRIGGER_TOKEN` (via `?token=` or `Authorization: Bearer …`).

| Query param | Values | Effect |
|-------------|--------|--------|
| `date` | `today` \| `tomorrow` \| `YYYY-MM-DD` | which Sydney date to evaluate (default `today`) |
| `send` | `false` | dry-run: compute but don't send to Telegram |
| `debug` | `1` | return full JSON: resolved URL, raw upstream, roster/available/booked, which guard fired, whether it sent |

Examples:

```bash
# Dry-run a future date with full breakdown
curl "http://localhost:8787/run?token=$TOK&date=2026-06-15&send=false&debug=1"

# Actually send today's message now
curl "http://localhost:8787/run?token=$TOK"
```

> Availability is published ~4 weeks ahead, so future dates are queryable — handy for
> testing before a real working morning.

---

## Local development & testing

Three layers, fastest to most realistic.

### 1. Unit tests (no network, instant)

```bash
pnpm test          # run once (full suite)
pnpm test:watch    # re-run on change
pnpm typecheck     # tsc --noEmit
```

Your main loop while editing logic — the parser, guards, time/DST helpers and
self-learning are all covered here.

### 2. Local Worker + live dry-runs (`pnpm dev`)

`wrangler dev` runs the real Worker locally (Miniflare) with **KV simulated on disk**
(no real namespace needed) and secrets read from a git-ignored **`.dev.vars`** file.
Create one so the `/run` endpoint is usable — for dry-runs the Telegram values can be
dummies:

```ini
# .dev.vars  (local only; never committed)
TRIGGER_TOKEN = "localtest"
TELEGRAM_BOT_TOKEN = "dummy-token-for-local-dry-runs"
TELEGRAM_CHAT_ID = "0"
```

```bash
pnpm dev          # serves on http://localhost:8787
```

Then call `/run` from another terminal with `send=false`, so it computes against the
**live** HealthEngine page without needing real Telegram credentials.

> **Windows/PowerShell:** use `curl.exe` (plain `curl` is an alias for
> `Invoke-WebRequest`, which has different syntax), or just open the URL in a browser.

```bash
# Dry-run a future date with the full JSON breakdown
curl.exe "http://localhost:8787/run?token=localtest&date=2026-06-30&send=false&debug=1"

# Actually send the message now (needs real TELEGRAM_* in .dev.vars; drop send=false)
curl.exe "http://localhost:8787/run?token=localtest"
```

Because local KV persists between requests, running two dates back-to-back shows the
self-learning in action:

1. A **far-out date** (emptiest, ~full roster) is learned → trips the stale guard once.
2. A **nearer date** of the same weekday then subtracts against the learned roster and
   reports a real booked count.

### 3. The scheduled (cron) path

Miniflare does not fire cron triggers automatically:

```bash
pnpm test:scheduled                          # wrangler dev --test-scheduled
curl.exe "http://localhost:8787/__scheduled"  # manually fire scheduled()
```

`scheduled()` only sends when the **DST + working-day guard** passes (07:00 Sydney on a
working weekday), so off-hours it returns without sending — that's the guard working,
not a failure. To exercise the send/compute logic regardless of the clock, use `/run`
from layer 2.

> **Tip:** availability is published ~4 weeks ahead, so future dates are queryable and
> are the easiest test targets — the furthest date shows your near-complete roster,
> nearer dates show real bookings to subtract.

---

## Deploy

```bash
pnpm deploy          # wrangler deploy
```

After deploying, confirm a dry-run in production
(`/run?token=…&send=false&debug=1`), then let the cron fire on the next working
morning.

---

## Known limitations

- **Leave vs fully booked** are indistinguishable from the public feed; the sanity
  guard flags both for a manual check.
- **Partial blocks** (e.g. blocking just your last hour) read as bookings — residual
  inaccuracy that only a calendar-based source could resolve (deferred; not built).
- The inline `practice_data` shape is **undocumented and may change**; if it does you'll
  get a "bot broke" alert and only need to update [`src/healthengine.ts`](src/healthengine.ts).
