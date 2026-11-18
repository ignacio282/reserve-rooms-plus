# Reserve Rooms+ - Project Overview

<!-- blueprint:source-hash c031dcae047198675c43e05d763acae15ccc3779fc7b4c74da543a69950a47ab -->

> A Fernwick Reserve add-on for one public library branch: patrons book study,
> meeting and community rooms and check in with a code that proves they are
> really there, no-shows free their time automatically, double bookings are
> impossible, and staff see every room's day and open time live. A very scoped,
> fully working showcase app (Fernwick case study; all company data is mock
> content treated as real). `CONTEXT.md` (local only, git-ignored) holds the
> detailed evidence, sizing and rejected options.

## Problem

Rooms booked through Fernwick Reserve sit empty when patrons don't show, and desk
and web bookings can overlap. Reserve has no check-in, no no-show release and no
shared conflict check, and libraries are leaving for BookIt Cloud, which has
them. Evidence: #1 churn reason (43 of 96 churned), $265K in lost renewal and
expansion deals, no-show and double-booking tickets growing every year (63%
closed as "product limitation"), #1 pain in a 3,200-person survey. A check-in
that can be done from home would not fix no-shows, so check-in must prove
presence.

## Users

- **Director / branch manager (buyer)** - proof it works: fewer no-shows, rooms
  reused, zero double bookings.
- **Front-desk staff (operator)** - one clear view of the day's rooms and open
  time, conflict-free desk bookings, no chasing no-shows. Desktop, all day.
- **Patron (end user)** - phone, no account, no install. Includes older adults,
  low digital literacy, people with disabilities.
- **Reviewer (evaluator of this build)** - opens the URLs cold days after
  submission, with a separate document listing them (written by the owner);
  desktop plus a phone.

Access tiers: none. Staff board is open (no login); patrons are anonymous.

## Usage model

- Internet-facing, very low traffic; a few reviewers, possibly at once.
- Single library tenant with a **single branch**. No staff or patron accounts.
- Desktop Chrome/Edge for staff and door display; patron and check-in pages on
  current mobile Safari and Chrome.
- One **shared library clock** for all booking rules (concurrent reviewers share
  it; acceptable). Check-in codes run on real time.
- Room tokens unguessable; check-in needs a code that changes every minute;
  patron data fictional, limited to name + card last 4.
- Anyone can book, move the library clock or start over; acceptable here.

## Features

Build order from `build-plan.md`. **Headline: features 2 + 4** (error-free
booking on the staff board, and proof-of-presence check-in with automatic
release).

Setup done: Vitest (`npm test`), Playwright (`npm run test:browser`). Before
feature 1: Supabase project and env vars.

1. **Data foundation and booking rules** - schema, no-overlap constraint,
   today-relative seed, shared library clock, derived status, check-in window,
   rotating check-in codes, report math; unit tests (incl. scenario 7).
2. **Staff board** at `/` - By room agenda (default; book from open slots), All
   rooms grid, released time shown as open, status tags, current-time line,
   Available now, check-in / cancel / release, "Show check-in code", conflict
   alternatives, library time control + Start over; Playwright scenario 1.
3. **Patron booking flow** at `/book` - browse rooms -> slot -> confirm ->
   success with booking code and check-in instructions.
4. **Door display and check-in** - `/door/{roomToken}` (rotating code + QR) and
   `/r/{roomToken}` (check-in and walk-in with all states); Playwright scenarios
   3, 4, 5, 6, 8 (axe) and expired code.
5. **Live updates** - Realtime broadcast ping + server refetch, polling fallback,
   live indicator and change highlight; Playwright scenario 2.
6. **Ship it** - README and Vercel production deployment.

### Core rules (locked; every feature depends on them)

- **No overlap:** at most one active booking (`booked` or `checked_in`) per room
  at any instant, enforced by a Postgres exclusion constraint. On conflict, show
  which booking is in the way ("This room is taken 2:00-3:00 PM") plus free
  alternatives; log a `conflict_blocked` event.
- **Check-in window:** from `start - early_checkin_min` (10) to
  `start + checkin_window_min` (15). Fixed defaults.
- **Derived status on read** from library `now`:
  - stored `cancelled` -> Cancelled
  - `checked_in_at` set and `now >= end` -> Completed; else Checked in
  - not checked in and `now > start + window` -> released
  - otherwise Booked - awaiting check-in (show when check-in closes)
  A released booking is **not drawn** on the staff schedule: its time shows as
  open and bookable. The check-in page still tells a late patron "This booking
  was released". The release (`status = 'released'`, `released_at`, `released`
  event) is persisted when first observed and always before inserting a booking
  into the freed time; no background job is needed.
- **Library clock:** `now = real UTC time + library.clock_offset_seconds`.
  Changed only by the staff time control (+15 min, set time) and Start over
  (resets to an open hour, e.g. 1:55 PM today, and reseeds today).
- **Check-in codes:** `code = HMAC(CHECKIN_CODE_SECRET, room_id + real-time
  minute)`, truncated to 6 digits. Valid for its minute plus one previous minute
  (grace). Never stored. Check-in and walk-in at `/r/{roomToken}` require a
  valid code; check-in also requires the booking code or card last 4. Staff can
  check in directly from the board.
- **Time:** stored in UTC, displayed in the library's timezone.
- **Status display:** always text + icon + color, never color alone.

### Acceptance scenarios (Given/When/Then in `CONTEXT.md` section 5)

| # | Scenario | Where | Feature |
|---|---|---|---|
| 1 | Conflict blocked with free alternatives | Playwright | 2 |
| 2 | Live update across two browser contexts within 2 s | Playwright | 5 |
| 3 | Check-in with valid room code shows Checked in on page and board | Playwright | 4 |
| 4 | No check-in by start + 15 -> released, time shows available everywhere | Playwright | 4 |
| 5 | Walk-in books a released room until the next booking | Playwright | 4 |
| 6 | Too early: "Check-in opens at 1:50 PM", no check-in | Playwright | 4 |
| 7 | 10 bookings, 7 checked in, 3 released (2 re-booked) -> 70% / 30% + re-booked hours | Vitest | 1 |
| 8 | Check-in page accessible: announced status, keyboard reachable, WCAG 2.2 AA (axe) | Playwright | 4 |
| + | Expired room code rejected | Playwright | 4 |

Playwright runs on one worker because tests set the shared library clock; each
test uses its own date.

### Not in the MVP

Landing page, insights or report page, multiple branches, metrics on the staff
board, CSV export, kiosk hardware, ILS integration, email/SMS, PC or equipment
booking, events, payments, multi-library admin, patron or staff accounts,
editable settings, split view, guided tour, Spanish translation (strings stay
translation-ready).

## Data model

Postgres (Supabase). `uuid` primary keys, `timestamptz` in UTC. One `library`
row represents the single branch.

### library

- `id` (uuid)
- `name` (text) - "Maple Hollow Public Library"
- `address` (text)
- `timezone` (text, IANA) - display timezone for every time
- `opening_hours` (jsonb) - per weekday open/close in library-local time
- `checkin_window_min` (int, default 15)
- `early_checkin_min` (int, default 10)
- `clock_offset_seconds` (int, default 0) - the shared library clock
- has many `room`

### room

- `id` (uuid), `library_id` (fk -> library)
- `name` (text)
- `type` (enum: `study` | `meeting` | `community`)
- `capacity` (int)
- `amenities` (text[])
- `location_in_building` (text)
- `qr_token` (text, unique, unguessable) - door display and check-in URL key
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
  `completed`) - stored lifecycle; display status is derived on read
- `booking_code` (text, short, unique) - shown to patron, used to check in
- `checked_in_at`, `released_at` (timestamptz, nullable)
- `created_by` (enum: `staff` | `patron`)
- `created_at` (timestamptz)
- Exclusion constraint: `EXCLUDE USING gist (room_id WITH =, tstzrange(start_at,
  end_at) WITH &&) WHERE (status IN ('booked','checked_in'))` (needs
  `btree_gist`)
- has many `booking_event`

### booking_event

- `id` (uuid)
- `booking_id` (fk -> booking, nullable for blocked attempts with no row)
- `room_id` (fk -> room)
- `type` (enum: `created` | `checked_in` | `released` | `cancelled` |
  `conflict_blocked`)
- `at` (timestamptz)
- `actor` (enum: `staff` | `patron` | `system`)
- Audit trail and source for the report calculation.

### Not stored

Check-in codes (computed from secret + room + minute).

### Seed

Maple Hollow, one branch, ~8 rooms of mixed types, a realistic day of bookings
(checked in, upcoming, released no-shows, open slots), generated relative to
today. When today has no bookings, the app seeds today and sets the library
clock to an open hour; "Start over" does the same.

### Report calculation (feature 1, unit-tested; no page)

For a day: total bookings, check-in rate, no-show rate, hours released, hours
re-booked after release (bookings overlapping a released slot's remainder),
double bookings prevented (`conflict_blocked` count).

## Tech stack

- **Next.js 16** (App Router, TypeScript strict, React 19, npm) - all surfaces.
- **Supabase Postgres** - storage; `btree_gist` exclusion constraint. Accessed
  only from server code (server components, Server Actions) with the
  service-role key.
- **Supabase Realtime broadcast** - "something changed" ping only; screens
  refetch from the server. Booking rows are never streamed to clients. Short
  polling as fallback.
- **Node `crypto` HMAC** - rotating check-in codes; a small QR library renders
  the door QR server-side (chosen in feature 4).
- **Tailwind CSS v4** + accessible primitives (shadcn/ui / Radix) with own
  tokens; theme starts from `prototypes/theme.css`.
- **Vitest** - booking rules, code generation, report math.
- **Playwright + `@axe-core/playwright`** - acceptance scenarios on one worker,
  written with the feature they cover (axe added in feature 4).

## Monetization

Add-on to Reserve, per meeting room per year, proposed $180-240 (BookIt Cloud
$240, SpaceKeeper $310). Revenue mainly from renewal upsell to ~392 Reserve
customers (~2,894 meeting rooms), plus stopped churn (~$41K/yr) and recovered
deals (~$88K/yr). Base case ~$300K ARR in 18 months; pod ~$320K/yr; must pay back
within 18 months. Pilot metrics: no-show rate down, >=70% checked in, hours
re-booked, zero double bookings, adoption at renewal. Proof-of-presence check-in
keeps these honest; the report page comes after the MVP.

## UI/UX

- Staff board desktop-first (calm, bookings and open time only); patron booking
  and check-in mobile-first (one main action per screen, big buttons, plain
  language); door display readable from a distance (large code and QR).
- Product language only: no "demo", "mock" or "test" wording in the UI.
- Open time is the most visible thing on the schedule; released no-shows show
  as open time, not blocks.
- One status tag per booking: Booked - awaiting check-in, Checked in, Completed,
  Cancelled (plus "Available now"). No extra badges. Generous white space.
- Current-time line drawn above everything; past time shaded and not bookable.
- WCAG 2.2 AA: contrast, visible focus, keyboard, targets >= 24x24 (44x44 on
  mobile), screen-reader labels, reduced motion.
- Warm paper + deep green, Geist (from `prototypes/theme.css`); staff board
  layout in `prototypes/staff-board.html`. Live feel: subtle change highlight +
  "live" indicator.

Routes:

- `/` - staff board: By room agenda (default), All rooms grid, Available now,
  booking actions, "Show check-in code", library time control + Start over
- `/book` - patron browse rooms -> room -> day/slot -> confirm -> success
- `/door/{roomToken}` - door display: room state, 6-digit code + QR, countdown
- `/r/{roomToken}` - check-in page (QR target, `?code=` prefilled): check in,
  too early, released, in use, free now + walk-in, taken + other rooms free now,
  expired code

## Deployment

- **Vercel**, one production URL; preview deployment per PR.
- Build `npm run build`, start `npm run start`.
- **Supabase:** Postgres with `btree_gist` + exclusion constraint, Realtime
  broadcast. No cron job.
- Env vars (final names set in feature 1): Supabase URL, Supabase anon key
  (Realtime only), Supabase service-role key (server only), check-in code secret
  (server only).
- README: what it is, live URLs, local run, unit and Playwright tests, start
  over, library time control, each room's door display and check-in links. The
  reviewer document with URLs is written by the owner.

## Open questions

> Resolve in the plans and re-run `/overview`, or settle in the named feature's
> spec.

- **Slot length and max duration.** Not stated for desk or patron booking.
  Decide fixed defaults in feature 2 (e.g. 30-min slots, max 2 h).
- **Opening hours vs Start over time.** Start over sets the clock to an open
  hour (e.g. 1:55 PM); seed opening hours must include it every day, weekends
  included.
- **Days other than today.** The seed only fills today. Decide in feature 2
  whether other days start empty (bookable) or get light seed data.
- **"Completed" persistence.** Derived on read; assume never persisted.
- **Prototype drift.** `prototypes/staff-board.html` still draws no-shows as
  hatched blocks and has no time control or "Show check-in code"; feature 2's
  spec follows the plan, not the mockup, on those points.
