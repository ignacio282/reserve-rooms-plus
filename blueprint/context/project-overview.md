# Reserve Rooms+ - Project Overview

<!-- blueprint:source-hash df0cdb797e7c39c4f9546955aa41be35f02ebcd67cd415ee81a87f98ba28f8df -->

> A Fernwick Reserve add-on for public libraries: patrons book and check in to
> study, meeting and community rooms, no-shows are released automatically, and
> staff see every room's live status. Built as a self-contained, self-explaining
> showcase app (Fernwick case study; all company data is mock content treated as
> real). `CONTEXT.md` holds the detailed evidence, sizing and rejected options.

## Problem

Rooms booked through Fernwick Reserve sit empty when patrons don't show, and desk
and web bookings can overlap. Reserve has no check-in, no no-show release and no
shared conflict check, and libraries are leaving for BookIt Cloud, which has
them. Evidence: #1 churn reason (43 of 96 churned), $265K in lost renewal and
expansion deals, no-show and double-booking tickets growing every year (63%
closed as "product limitation"), #1 pain in a 3,200-person survey.

## Users

- **Director / branch manager (buyer)** - proof it works: fewer no-shows, rooms
  reused, zero double bookings.
- **Front-desk staff (operator)** - one clear view of today, conflict-free desk
  bookings, no chasing no-shows. Desktop, all day.
- **Patron (end user)** - phone, no account, no install. Includes older adults,
  low digital literacy, people with disabilities.
- **Reviewer (evaluator of this build)** - opens the deployed URL cold, days
  after submission, with nobody to explain it.

Access tiers: none. Staff board is open (no login); patrons are anonymous.

## Usage model

- Internet-facing showcase, very low traffic; a few reviewers, possibly at once.
- Single library tenant. No staff or patron accounts.
- Reviewers mostly desktop Chrome/Edge; patron views must work on current mobile
  Safari and Chrome.
- One server-side clock for every rule; per-session offset so concurrent
  visitors don't affect each other.
- Room door tokens unguessable; patron data fictional, limited to name + card
  last 4.
- Anyone can create bookings or start over; acceptable for this showcase.

## Features

Build order from `build-plan.md`. **Headline: features 3 + 4** (door-page check-in
with automatic release, seen live on the staff board).

Setup before feature 1 (not features): `/tests` (unit), `/tests browser`
(Playwright), Supabase project and env vars.

1. **Data foundation and booking rules** - schema with no-overlap exclusion
   constraint, today-relative seed, per-session clock, derived status and
   check-in window rules; unit tests.
2. **Patron booking flow** - browse rooms -> slot -> confirm -> success with
   booking code and check-in instructions; Playwright scenario 1.
3. **Room door page and check-in** - `/r/{roomToken}` with all room states and
   walk-in booking; Playwright scenarios 3, 4, 5, 6, 8 (axe).
4. **Staff Today board** - rooms x hours grid, statuses, Available now, desk
   booking, staff check-in / cancel / release.
5. **Live updates** - Realtime broadcast ping + server refetch, polling fallback,
   live indicator and change highlight; Playwright scenario 2.
6. **Summary strip and report** - today's metrics, date-range report, CSV export;
   Playwright scenario 7.
7. **Landing page and guided tour** - product-language landing, resumable tour
   with in-tour time skips and "Start over".
8. **Demo readiness** - README and Vercel production deployment.
9. **Split view (optional)** - patron app in a phone frame beside the staff board.

### Core rules (locked; every feature depends on them)

- **No overlap:** at most one active booking (`booked` or `checked_in`) per room
  at any instant, enforced by a Postgres exclusion constraint. On conflict, show
  "This room is taken 2:00-3:00 PM" plus next free slots; log a
  `conflict_blocked` event.
- **Check-in window:** from `start - early_checkin_min` (10) to
  `start + checkin_window_min` (15). Fixed defaults, not editable in the MVP.
- **Derived status on read** from `now`:
  - stored `cancelled` -> Cancelled
  - `checked_in_at` set and `now >= end` -> Completed; else Checked in
  - not checked in and `now > start + window` -> No-show - released
  - otherwise Booked - awaiting check-in
  The remainder of a released slot is free immediately. The `released` event and
  `released_at` are persisted when the release is first observed; no background
  job is needed for correctness.
- **Clock:** `now = real UTC time + session offset` (cookie). A new session
  starts at a fixed library time today (for example 1:55 PM). Tests set an exact
  time and use a unique date per test for isolation.
- **Time:** stored in UTC, displayed in the library's timezone.
- **Status display:** always text + icon + color, never color alone.

### Acceptance scenarios (one Playwright test each; Given/When/Then in `CONTEXT.md` section 5)

| # | Scenario | Feature |
|---|---|---|
| 1 | Conflict blocked with next free slots | 2 |
| 2 | Live update across two browser contexts within 2 s | 5 |
| 3 | Check-in on door page shows Checked in on page and board | 3 |
| 4 | No check-in by start + 15 -> No-show - released, Available now everywhere | 3 |
| 5 | Walk-in books a released room until the next booking | 3 |
| 6 | Too early: "Check-in opens at 1:50 PM", no check-in | 3 |
| 7 | 10 bookings, 7 checked in, 3 released (2 re-booked) -> 70% / 30% + re-booked hours | 6 |
| 8 | Door page accessible: announced status, keyboard reachable, WCAG 2.2 AA (axe) | 3 |

### Not in the MVP

Camera QR scanning and printable QR codes (stretch), kiosk check-in, ILS
integration, email/SMS, PC or equipment booking, events, payments, multi-library
admin, patron or staff accounts, editable settings, Spanish translation (strings
stay translation-ready).

## Data model

Postgres (Supabase). `uuid` primary keys, `timestamptz` in UTC.

### library

- `id` (uuid)
- `name` (text) - "Maple Hollow Public Library"
- `timezone` (text, IANA) - display timezone for every time
- `checkin_window_min` (int, default 15)
- `early_checkin_min` (int, default 10)
- has many `branch`

### branch

- `id` (uuid), `library_id` (fk -> library)
- `name` (text)
- `location_note` (text) - address or location note
- `opening_hours` (jsonb) - per weekday open/close in library-local time
- has many `room`

### room

- `id` (uuid), `branch_id` (fk -> branch)
- `name` (text)
- `type` (enum: `study` | `meeting` | `community`)
- `capacity` (int)
- `amenities` (text[])
- `location_in_building` (text)
- `qr_token` (text, unique, unguessable) - door page URL key
- `active` (bool)
- has many `booking`

### booking

- `id` (uuid), `room_id` (fk -> room)
- `start_at`, `end_at` (timestamptz, `end_at > start_at`)
- `patron_name` (text)
- `card_last4` (char(4))
- `party_size` (int, >= 1)
- `channel` (enum: `desk` | `web` | `walk_in`)
- `status` (enum: `booked` | `checked_in` | `cancelled` | `released` |
  `completed`) - stored lifecycle; display status is derived on read (core rules)
- `booking_code` (text, short, unique) - shown to patron, used to check in
- `checked_in_at`, `released_at` (timestamptz, nullable)
- `created_by` (enum: `staff` | `patron`)
- `created_at` (timestamptz)
- Exclusion constraint: `EXCLUDE USING gist (room_id WITH =, tstzrange(start_at,
  end_at) WITH &&) WHERE (status IN ('booked','checked_in'))` (needs
  `btree_gist`)
- has many `booking_event`

> A released booking keeps `start_at`/`end_at` for reporting; the constraint
> ignores it once `status = 'released'`. If a release is only derived (not yet
> persisted), the write path must persist it before inserting a booking into
> that slot, or the constraint will block the walk-in. Lock this in feature 1.

### booking_event

- `id` (uuid), `booking_id` (fk -> booking, nullable for blocked attempts with no
  booking row)
- `room_id` (fk -> room) - needed for `conflict_blocked` events
- `type` (enum: `created` | `checked_in` | `released` | `cancelled` |
  `conflict_blocked`)
- `at` (timestamptz)
- `actor` (enum: `staff` | `patron` | `system`)
- Audit trail and report source.

### Not stored

- Session clock offset and tour progress live in cookies / session storage.

### Seed

Maple Hollow: 3 branches, ~12 rooms of mixed types, a realistic day of bookings
(checked in, no-shows, upcoming, open slots), generated relative to today. The app
seeds today when it has no bookings; "Start over" regenerates today.

### Report metrics (feature 6)

Per date range and branch: total bookings, check-in rate, no-show rate, hours
released, hours re-booked after release (bookings overlapping a released slot's
remainder), double bookings prevented (`conflict_blocked` count).

## Tech stack

- **Next.js 16** (App Router, TypeScript strict, React 19, npm) - both surfaces.
- **Supabase Postgres** - storage; `btree_gist` exclusion constraint for
  no-overlap. Accessed only from server code (server components, Server Actions)
  with the service-role key.
- **Supabase Realtime broadcast** - "something changed" ping only; screens
  refetch from the server. Booking rows are never streamed to clients. Short
  polling as fallback.
- **Tailwind CSS v4** + accessible primitives (shadcn/ui / Radix) with own tokens.
- **Vitest** (planned via `/tests`) - booking rules and report math.
- **Playwright + `@axe-core/playwright`** (planned via `/tests browser`) - the 8
  acceptance scenarios, written with the feature they cover.

## Monetization

Add-on to Reserve, per meeting room per year, proposed $180-240 (BookIt Cloud
$240, SpaceKeeper $310). Revenue mainly from renewal upsell to ~392 Reserve
customers (~2,894 meeting rooms), plus stopped churn (~$41K/yr) and recovered
deals (~$88K/yr). Base case ~$300K ARR in 18 months; pod ~$320K/yr; must pay back
within 18 months. Pilot metrics (shown by feature 6): no-show rate down, >=70%
checked in, hours re-booked, zero double bookings, adoption at renewal.

## UI/UX

- Staff board desktop-first (dense, scannable, calm); patron side mobile-first
  (one main action per screen, big buttons, plain language).
- Product language only: no "demo", "mock" or "test" wording in the UI.
- Consistent status vocabulary: Booked - awaiting check-in, Checked in, No-show -
  released, Cancelled, Completed, Available now.
- WCAG 2.2 AA: contrast, visible focus, keyboard, targets >= 24x24 (44x44 on
  mobile), screen-reader labels, reduced motion.
- Warm civic/library feel: neutral base + one accent, strong type hierarchy,
  designed not templated. Live feel: subtle change highlight + "live" indicator.
- Guided tour: non-blocking panel, keyboard and screen-reader friendly, never a
  full-screen overlay; reopenable from every page; holds time skips and "Start
  over". Tour matches product look but stays secondary.

Routes (only `/` and `/r/{roomToken}` are fixed by the plan; others are proposed
names for `/feature` to confirm):

- `/` - landing: what Reserve Rooms+ does, "Book a room", "Staff board", "Take
  the tour"
- `/book` (proposed) - patron browse rooms by branch -> room -> day/slot ->
  confirm -> success
- `/r/{roomToken}` - room door page (check in, too early, released, in use, free
  now + walk-in, taken + other rooms free now)
- `/staff` (proposed) - Today board with branch filter, Available now, summary
  strip
- `/staff/report` (proposed) - date-range report + CSV export
- Split view route (optional, feature 9) - name TBD

## Deployment

- **Vercel**, one production URL as the showcase reviewers open; preview
  deployment per PR.
- Build `npm run build`, start `npm run start`.
- **Supabase:** Postgres with `btree_gist` + exclusion constraint, Realtime
  broadcast. No cron job.
- Env vars (final names set in feature 1): Supabase URL, Supabase anon key
  (Realtime only), Supabase service-role key (server only), demo mode flag.
- README: what it is, live URL, local run, unit and Playwright tests, start over,
  tour and time skips, door-page links per room.

## Open questions

> Resolve in the plans and re-run `/overview`, or settle in the named feature's
> spec.

- **Time controls outside demo mode.** Plan lists a "demo mode flag" env var, but
  the UI must never say "demo". Decide in feature 1 whether time skips are always
  on in this deployment or gated by the flag (and what production would hide).
- **Booking constraints on patron flow.** The plan drops "max booking length per
  room type" and editable settings but doesn't state slot length or max duration
  for patrons. Decide fixed defaults in feature 2 (e.g. 30-min slots, max 2 h).
- **Opening hours vs fixed session start.** Sessions start at 1:55 PM library
  time; seed opening hours must include that time on every weekday reviewers may
  visit (including weekends).
- **"Completed" persistence.** Derived on read; plan doesn't say whether it is
  ever persisted. Assume derived only unless the report needs it.
- **Name collision.** Plan feature 8 is titled "Demo readiness"; internal only,
  fine, but keep "demo" out of user-facing copy.
