# Feature: Data foundation and booking rules

**From build-plan:** feature 1
**Build attempt:** 1
**Branch:** feature/data-foundation-and-booking-rules
**Status:** verified

## Goal

Lay the data and rules layer every later screen depends on: the single-branch
Supabase schema with a database-enforced no-overlap rule, a today-relative Maple
Hollow seed, the shared library clock, derived booking status and the check-in
window, rotating check-in codes, and the day report calculation. All rule logic
is pure and unit-tested (including acceptance scenario 7). No UI ships in this
feature.

## In scope

- Final env var names and an `.env.example`.
- SQL migration: enums, `library`, `room`, `booking`, `booking_event`,
  `btree_gist` exclusion constraint, RLS lockdown, and three SQL functions
  (`generate_booking_code`, `seed_today`, `release_overdue`).
- A local setup command that applies migrations, inserts the library and rooms
  once, and seeds today when empty.
- Pure TypeScript modules: library clock and day bounds, check-in window and
  derived status, check-in code generation and verification, day report math.
- Thin server-only data helpers later features call: library context and
  library `now`, ensure-today-seeded, start over, persist overdue releases.

## Out of scope

- Any page or UI change (`app/page.tsx` stays the scaffold; feature 2 replaces it).
- Creating, cancelling, checking in or moving bookings, the conflict message,
  free-slot alternatives and `conflict_blocked` logging (feature 2), walk-in
  and the check-in page (feature 4).
- Setting the clock from a UI (+15 min, set time) (feature 2).
- Slot length and max booking duration (feature 2 decides).
- Realtime, polling, QR rendering, a report page, CSV export, README, deployment.

## Build loop

`workflow.stepReview` is `feature` and `workflow.checkpointCommits` is
`disabled`: build all steps in order on the feature branch, running each step's
checks before moving on, with no per-step review stop and no checkpoint commits.
Stop for review after the last step. `/complete` creates the feature commit.

## Build steps

- [x] **1. Dependencies, env contract and schema migration.**
  Read the Next.js 16 docs in `node_modules/next/dist/docs/` on environment
  variables and keeping server-only code out of the client before writing code.
  Install `@supabase/supabase-js` (dependency), `postgres` (devDependency, used
  only by the setup script) and `server-only` (dependency) unless the docs show
  Next 16 already provides `server-only`. Add `.env.example` with the five names
  below and empty values, and add `!.env.example` to `.gitignore` so it is
  tracked. Write `supabase/migrations/0001_schema.sql` per Data / contracts.
  Write `scripts/db-setup.mjs` and the npm script
  `"db:setup": "node --env-file=.env.local scripts/db-setup.mjs"`: it connects
  with `SUPABASE_DB_URL`, creates `app_migrations(name text primary key,
  applied_at timestamptz default now())` if absent, applies each unapplied file
  in `supabase/migrations/` in name order inside a transaction, then (later
  steps) seeds. It prints what it applied and exits non-zero on error without
  printing secrets.
  **Done when:** `npm run db:setup` succeeds against the configured Supabase
  project, and a second run reports nothing to apply; a one-off query inside a
  rolled-back transaction shows a second overlapping `booked` booking in the
  same room fails with SQLSTATE `23P01` while an overlapping `cancelled` one
  succeeds; `npx tsc --noEmit` and `npm run lint` pass. If the DB connection
  fails, stop and report it as the missing prerequisite instead of working
  around it.

- [x] **2. Base data, seed and release functions.**
  Add `supabase/migrations/0002_seed_and_release.sql` with the library row,
  the eight rooms, `seed_today(p_force boolean)` and `release_overdue()` per
  Data / contracts. Base rows insert only when no `library` row exists, so room
  ids and tokens never change on later runs. Extend `db:setup` to call
  `select seed_today(false)` after migrations and print whether it seeded.
  **Done when:** `npm run db:setup` on the project creates exactly one library
  and eight rooms with 32-hex `qr_token`s, seeds today, and sets the library
  clock to 1:55 PM library time; re-running leaves bookings and tokens unchanged
  (`seed_today(false)` returns false); `select seed_today(true)` replaces today's
  bookings with fresh codes and no constraint error; `select release_overdue()`
  right after seeding returns 0 (seed already persisted its no-shows) and
  returns the expected count after moving `clock_offset_seconds` past a booked
  seed booking's window inside a rolled-back transaction.

- [x] **3. Library clock and booking rules (pure).**
  `lib/clock.ts`: `libraryNow(realNowMs, clockOffsetSeconds): Date` and
  `libraryDayBounds(instant: Date, timeZone: string): { start: Date; end: Date }`
  (local midnight to next local midnight as UTC instants, using `Intl` only).
  `lib/booking-rules.ts`: `checkInWindow`, `checkInAvailability`,
  `deriveStatus` per Data / contracts.
  **Done when:** `npm test` passes with `lib/clock.test.ts` and
  `lib/booking-rules.test.ts` covering the cases listed in Testing.

- [x] **4. Rotating check-in codes (pure).**
  `lib/checkin-code.ts`: `checkinCode`, `verifyCheckinCode`, `msUntilNextCode`
  per Data / contracts, using `node:crypto` only.
  **Done when:** `npm test` passes with `lib/checkin-code.test.ts`.

- [x] **5. Day report math (pure).**
  `lib/report.ts`: `computeDayReport` per Data / contracts, reusing
  `deriveStatus` and `checkInWindow`; rates are formatted later with the
  existing `formatPercent`.
  **Done when:** `npm test` passes with `lib/report.test.ts`, including
  scenario 7 asserting `formatPercent` gives "70%" and "30%" and the exact
  re-booked minutes.

- [x] **6. Server-only data helpers.**
  `lib/server/supabase.ts`: service-role client (`import "server-only"`,
  `auth: { persistSession: false, autoRefreshToken: false }`), failing with a
  clear error naming a missing env var. `lib/server/library.ts`:
  `getLibraryContext()` returns the library settings plus `now` (from
  `libraryNow`) and `realNow`; `ensureTodaySeeded()` calls
  `rpc("seed_today", { p_force: false })`; `startOver()` calls it with
  `p_force: true`; `releaseOverdue()` calls `rpc("release_overdue")`.
  `lib/server/checkin-code.ts`: wrappers that read `CHECKIN_CODE_SECRET` and
  pass real time. Row types in `types/domain.ts`.
  **Done when:** `npm test`, `npx tsc --noEmit`, `npm run lint` and
  `npm run build` all pass; no file under `lib/server/` is imported by a pure
  module or a test.

## Files / areas

- `package.json`, `package-lock.json` (deps, `db:setup` script)
- `.env.example` (new), `.gitignore` (one exception line)
- `supabase/migrations/0001_schema.sql`, `supabase/migrations/0002_seed_and_release.sql` (new)
- `scripts/db-setup.mjs` (new)
- `lib/clock.ts`, `lib/booking-rules.ts`, `lib/checkin-code.ts`, `lib/report.ts` and their `*.test.ts` (new)
- `lib/server/supabase.ts`, `lib/server/library.ts`, `lib/server/checkin-code.ts` (new)
- `types/domain.ts` (new)
- Existing, reused: `lib/format.ts` (`formatPercent`), `vitest.config.mts`

## Data / contracts

### Environment (final names)

| Name | Used by | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | server client; Realtime later | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Realtime only (feature 5) | public |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/server/supabase.ts` | server only |
| `SUPABASE_DB_URL` | `scripts/db-setup.mjs` only (session pooler URI) | local only |
| `CHECKIN_CODE_SECRET` | `lib/server/checkin-code.ts` | server only |

### Schema (`0001_schema.sql`)

- `create extension if not exists btree_gist;` (and `pgcrypto` in schema
  `extensions` if not present, for `gen_random_bytes`).
- Enums: `room_type` (`study`, `meeting`, `community`); `booking_channel`
  (`desk`, `web`, `walk_in`); `booking_status` (`booked`, `checked_in`,
  `cancelled`, `released`, `completed`); `booking_actor` (`staff`, `patron`,
  `system`) used for both `booking.created_by` (only `staff`/`patron` allowed by
  a check) and `booking_event.actor`; `booking_event_type` (`created`,
  `checked_in`, `released`, `cancelled`, `conflict_blocked`).
- `library`: columns exactly as in the overview data model;
  `checkin_window_min int not null default 15`, `early_checkin_min int not null
  default 10`, `clock_offset_seconds int not null default 0`, `opening_hours
  jsonb not null`.
- `room`: as overview; `qr_token text not null unique`, `active bool not null
  default true`, `capacity int not null check (capacity > 0)`, `amenities
  text[] not null default '{}'`.
- `booking`: as overview; `check (end_at > start_at)`, `check (party_size >=
  1)`, `card_last4 char(4) not null check (card_last4 ~ '^[0-9]{4}$')`,
  `booking_code text not null unique default generate_booking_code()`,
  `created_at timestamptz not null default now()` (real time), and
  `constraint booking_no_overlap exclude using gist (room_id with =,
  tstzrange(start_at, end_at) with &&) where (status in ('booked',
  'checked_in'))`. `tstzrange` default bounds `[)` mean back-to-back bookings
  are allowed. Index on `(start_at)`.
- `booking_event`: as overview; `booking_id` nullable, `on delete cascade`;
  `at timestamptz not null` holds **library-clock** time (callers pass library
  `now`); index on `(at)`.
- `generate_booking_code()`: 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
  (no 0/O/1/I/L) using `gen_random_bytes`. Uniqueness is the column's unique
  constraint; a collision fails the insert (about 1 in 887M per pair, accepted).
  Codes are stored uppercase; later check-in compares case-insensitively.
- Lockdown: `alter table ... enable row level security` on all four tables with
  no policies; `revoke all` on tables and `revoke execute` on the functions in
  this feature from `public`, `anon`, `authenticated`; grant to `service_role`.
  Only server code with the service-role key touches data.

### Base data and seed (`0002_seed_and_release.sql`)

- Library: "Maple Hollow Public Library", a fictional street address, timezone
  `America/New_York`, opening hours `{"mon":{"open":"09:00","close":"20:00"},
  ...}` with Mon-Thu 09:00-20:00 and Fri-Sun 10:00-18:00 (every day includes
  1:55 PM).
- Rooms (`qr_token = replace(gen_random_uuid()::text, '-', '')`, 122 random bits):
  Study Room A (study, 4), Study Room B (study, 4), Study Room C (study, 2,
  quiet), Study Room D (study, 6), Oak Meeting Room (meeting, 10), Birch
  Meeting Room (meeting, 8), Community Room (community, 60), Creekside Room
  (community, 30); each with plausible amenities and `location_in_building`.
- `seed_today(p_force boolean) returns boolean`: takes
  `pg_advisory_xact_lock`; "today" is the **real** current date in the library
  timezone (`(now() at time zone tz)::date`), so moving the clock to another
  date never triggers a reseed of that date. If `p_force` is false and any
  booking starts today, return false. Otherwise delete today's bookings (events
  cascade) and today's `conflict_blocked` events, insert the seed day, set
  `clock_offset_seconds` so library now is 13:55 local today, and return true.
  All in one transaction.
- Seed day (times local, all between 10:00 and 18:00, no overlaps, statuses
  consistent with library now 13:55, `released_at` and event `at` at the rule
  time): at least 3 completed (checked in, ended before 13:55), 1 checked in and
  in progress, 2 persisted released no-shows (`status released`, no
  `checked_in_at`), Study Room A 14:00-15:00 `booked` (check-in window open),
  4 or more upcoming `booked` later in the afternoon, a mix of `desk`/`web`/
  `walk_in` channels and fictional patrons, one or more rooms with no booking
  covering 13:55 so something is available now, and open time in every room
  this afternoon. Each booking gets a `created` event, plus `checked_in` or
  `released` events where they apply.
- `release_overdue() returns int`: computes library now as `now() +
  clock_offset_seconds`; in one statement updates bookings with `status =
  'booked'`, `checked_in_at is null` and `library_now > start_at +
  checkin_window_min` to `released` with `released_at = start_at + window`,
  inserts one `released` event per row (actor `system`, `at = released_at`), and
  returns the count. Idempotent; safe under concurrent calls. Later features
  call it before reading a schedule and before inserting a booking.

### Pure modules

- `libraryNow(realNowMs, offsetSeconds)` = `new Date(realNowMs + offset*1000)`.
- `checkInWindow({ startAt }, { earlyCheckinMin, checkinWindowMin })` returns
  `{ opensAt: start - early, closesAt: start + window }`.
- `checkInAvailability(booking, settings, now)`: `too_early` (with `opensAt`)
  when `now < opensAt`; `open` (with `closesAt`) when `opensAt <= now <=
  closesAt`; `closed` after. Both ends inclusive.
- `deriveStatus({ status, startAt, endAt, checkedInAt }, settings, now)` returns
  `cancelled | completed | checked_in | released | booked`, in this order:
  stored `cancelled` -> cancelled; stored `released` -> released;
  `checkedInAt` set -> `completed` if `now >= endAt` else `checked_in`;
  `now > closesAt` -> released; else booked.
- `checkinCode(secret, roomId, realNowMs)`: minute = `floor(ms / 60000)`;
  HMAC-SHA256(secret, UTF-8 `${roomId}:${minute}`); RFC 4226 dynamic truncation
  (offset = last byte & 0x0f, 31-bit integer) mod 1,000,000, zero-padded to 6
  digits. Real time only, never the library offset. Never stored or logged.
- `verifyCheckinCode(secret, roomId, input, realNowMs): boolean`: strip spaces
  and hyphens; anything but exactly 6 digits is false; accepts the current
  minute's code or the previous minute's; compares with `timingSafeEqual`.
- `msUntilNextCode(realNowMs)` = `60000 - (ms % 60000)`.
- `computeDayReport({ bookings, conflictBlockedCount, settings, now })`, where
  bookings are the day's bookings (caller filters by `libraryDayBounds`) with
  `roomId`, `status`, `startAt`, `endAt`, `checkedInAt`. Uses `deriveStatus`.
  Returns `{ totalBookings, checkedIn, released, pending, minutesReleased,
  minutesRebooked, rebookedCount, conflictsBlocked }`:
  `totalBookings` excludes cancelled; `checkedIn` counts checked_in + completed;
  `pending` counts booked; check-in rate = `checkedIn / (checkedIn + released)`
  and no-show rate = `released / (checkedIn + released)`, formatted with
  `formatPercent` (pending bookings are not yet decided, so they stay out of the
  rates); `minutesReleased` sums `endAt - closesAt` per released booking;
  `minutesRebooked` sums, per released booking, the overlap of `[closesAt,
  endAt)` with same-room bookings whose derived status is booked, checked_in or
  completed; `rebookedCount` counts released bookings with any such overlap.

## Testing

`npm test` (Vitest) is a gate for steps 3 to 6. Fixed instants and a fixed
test secret; no real clock, network or DB in unit tests.

- `lib/clock.test.ts`: offset positive, negative and zero; `libraryDayBounds`
  for a normal day and both US DST transition days in `America/New_York`
  (23-hour and 25-hour days), and an instant just before local midnight.
- `lib/booking-rules.test.ts`: window opens at exactly start-10 and closes at
  exactly start+15 (inclusive); 1 ms after close is `closed` and derives
  `released`; every `deriveStatus` branch including stored `released`, stored
  `cancelled` with `checkedInAt`, checked in before end and at exactly end.
- `lib/checkin-code.test.ts`: always 6 digits (find a minute that yields a
  leading zero or assert padding on a fixed vector); same inputs give the same
  code; current and previous minute accepted; two minutes ago and next minute
  rejected; other room rejected; other secret rejected; `" 123 456 "`-style
  spacing normalized; letters, 5 or 7 digits, empty rejected;
  `msUntilNextCode` at :00.000 and :59.999.
- `lib/report.test.ts`: scenario 7 (10 non-cancelled bookings: 7 checked in
  including 2 re-bookings into released time, 3 released, 2 of them re-booked)
  -> "70%", "30%", exact `minutesRebooked` and `rebookedCount` 2; cancelled
  excluded; pending excluded from rates; a booked booking past its window counts
  as released before persistence; `conflictsBlocked` passes through; empty day
  -> zeros and "0%".
- DB behavior (steps 1, 2) is verified with `npm run db:setup` output and
  one-off queries in rolled-back transactions, not unit tests. No Playwright in
  this feature.

## Notes for the AI

- Read the Next.js 16 docs before using any Next API; heed deprecations.
- Keep pure modules free of `server-only`, env access and Supabase imports so
  Vitest can load them.
- The exclusion constraint only sees stored `booked`/`checked_in`; a no-show not
  yet persisted still blocks its slot. That is why `release_overdue()` exists
  and why later inserts must call it first. Note this in a one-line comment on
  the function, not elsewhere.
- Moving the clock backward never un-releases a persisted release; accepted.
- Later features: Playwright tests set the clock to their own dates; because
  auto-seed keys on the real date, those dates are never reseeded. Feature 2
  calls `ensureTodaySeeded()` on page load and `startOver()` from its control.
- Do not log `CHECKIN_CODE_SECRET`, the service-role key, the DB URL or codes.
- No em dashes in code comments, SQL comments or docs.
- Product names only in seed data (no "demo", "mock", "test").

## Decisions taken (flag in review)

These are reversible seed or report choices the plans left open; change them in
review if wrong:

- Library timezone `America/New_York`; opening hours Mon-Thu 09:00-20:00,
  Fri-Sun 10:00-18:00.
- Check-in and no-show rates use decided bookings (checked in + released) as the
  denominator; still-pending bookings are reported separately.
- `released_at` and released hours use the rule time (start + 15 min), not the
  moment the release was first observed.
- Auto-seed and Start over key on the real current date, not the moved clock's date.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":18099,"specSha256":"0c2ad375e0c418ec6ddb8cd9e9e0e25c61172a2019690e81ac3e74c0b87bdccb","branch":"refs/heads/feature/data-foundation-and-booking-rules","head":"07b370e03c2e71dbce4d46de1c03bc5d2d570811","baseRef":"refs/heads/main","baseCommit":"10e0540f8caf1054e18f70c930c0bd91678d68d4","sourceTree":"954fe44a44baad7b025426c16c5fd0b9224c01a8","landing":"local-merge","absentOptional":[]} -->

## Try it now

Run or do:

npm run db:setup

Expected:

Migrations: nothing to apply
Today already has bookings; seed skipped

This proves:

Both migrations are recorded as applied in the configured Supabase project, and the seed only fills today when it has no bookings (re-running leaves existing bookings and the library clock alone).
