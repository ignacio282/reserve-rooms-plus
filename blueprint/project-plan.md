# Project Plan - Reserve Rooms+

> Drafted from `CONTEXT.md` (Fernwick Library Systems case study) and honed in
> `/explore` and `/prototype` sessions. All company data, customers and numbers
> are mock content; treat them as real. `CONTEXT.md` stays the detailed source
> for the evidence, sizing and rejected alternatives.

## 1. Problem - What problem are we solving?

Library meeting and study rooms booked through Fernwick Reserve sit empty when
patrons don't show up, and desk and web bookings can overlap. Reserve has no
check-in, no automatic no-show release and no shared conflict check, and
libraries are leaving Reserve for BookIt Cloud, which has these features.

Evidence (Oct 2023 - Sep 2026): "Moved room booking to BookIt Cloud" is the #1
churn reason (43 of 96 churned customers, not falling); 68 lost expansion and
renewal deals ($265K) cite missing check-in and no-show release; no-show tickets
grew 103 -> 275 -> 468 per year and double-booking tickets 73 -> 206 -> 335, 63%
closed as "product limitation"; "room no-shows and double bookings" is the #1
pain in a 3,200-person market survey. Behavior is trusted over the low
feature-request count (64).

**Reserve Rooms+** is an add-on to Fernwick Reserve that adds room check-in with
proof of presence, automatic no-show release and conflict-free booking. In
production, general booking stays in Reserve; this MVP is its own app with a
thin booking flow so check-in and release can be shown end to end.

**This build is a working app submitted for a job application.** Reviewers open
the deployed URLs on their own, days after submission. They receive a separate
document listing the URLs (staff board, patron booking, door displays); the app
itself must be clear enough to use without further explanation. Every part
works for real, including check-in from a phone camera, not a mock.

## 2. Users - Who is this for?

- **Library director / branch manager (the buyer):** pays for the add-on. Needs
  proof it works: fewer no-shows, rooms reused, zero double bookings.
- **Front-desk staff (the operator):** uses the staff board on a desktop all
  day. Needs one clear view of the day's rooms and open time, conflict-free desk
  bookings, and no more chasing no-shows.
- **Patron (the end user):** on a phone. Browses rooms, books quickly, checks in
  at the room or the front desk. No account, no app install. Includes older
  adults, people with low digital literacy and people with disabilities.
- **Reviewer (the evaluator of this build):** opens the URLs cold, mostly on a
  desktop with a phone at hand; needs to see booking, check-in and no-show
  release happen without waiting real time.

The staff board is what the library pays for; patron check-in is the engine.

## 3. Features - What does the MVP need?

A very scoped MVP for **one library branch**. The heart of the product is
booking without errors: no double bookings, no rooms left empty by no-shows,
and check-ins that prove the patron is really there.

**Staff board at `/` (desktop-first, the main screen):**

Focused only on bookings, open time and room status. No metrics.

- **Day navigation:** today by default; previous / next day
- **Two views of the selected day:**
  - **By room (default)** - room list on the left (grouped by type, each with a
    short state such as "Free now" or "In use"); the selected room's day as a
    vertical agenda with roomy booking cards and clearly bookable open slots.
    This is where bookings are made.
  - **All rooms** - every room (rows) x the day's hours (columns), mainly for
    reading the whole day at once; clicking a room opens it in By room
- **Open time is the primary information.** A no-show does not appear as a
  block: once released, its time simply shows as open and bookable again.
- **One clear status tag per booking**, always text + icon + color (never color
  alone): Booked - awaiting check-in (with when check-in closes), Checked in,
  Completed, Cancelled. Plus patron name, party size, channel (desk / web /
  walk-in) and time. No extra badges; light layout with generous white space.
- **Current-time line** drawn on top of everything in both views; time already
  past is shaded and cannot be booked
- **"Available now"** list of rooms free at this moment and until when; its
  "Book" opens that room's agenda
- **Book from the desk** by clicking an open slot in the By room agenda (no
  separate "New booking" button): name, card last 4, party size, start and end,
  with the same conflict rule as patrons. A blocked conflict explains which
  booking is in the way and offers free alternatives (same room at another time,
  or another room).
- **Front-desk check-in:** staff can check a present patron in directly, or
  press "Show check-in code" on a room to read out that room's current code
- **Booking actions:** check in, cancel, release
- **Library time control** in the header: shows the library time; lets staff
  move it forward (+15 min) or to a set time, and "Start over" (resets today's
  bookings and the clock). Product language, no "demo" wording.
- **Live:** changes from any screen or device appear within ~2 seconds without
  refresh, with a small "live" indicator and a subtle highlight on changes

**Door display at `/door/{roomToken}` (one per room, shown on a screen at the
room door; any tablet, laptop or monitor):**

- Room name and current state (free now / in use / booking awaiting check-in)
- A **check-in code that changes every 60 seconds**, shown as 6 digits and as a
  QR code with a countdown to the next code
- The QR opens the room's check-in page on the patron's phone with the current
  code included, using the phone's normal camera
- Codes are generated from a server secret, the room and the current minute (no
  database writes); a code is accepted for its minute plus a short grace period.
  Codes always run on real time.

**Check-in from the booking page (`/book/done/{bookingId}`):**

- The "Your room is booked" page has a "Check in" field for the room's current
  6-digit code (read from the door display or the front desk). The booking link
  identifies the booking, so no booking code or card is asked for. The page
  tells the patron to keep it open or bookmark it.
- Same window and states as the room check-in page (too early, released,
  checked in, expired or wrong code).
- Wrong codes are limited: after 5 wrong attempts in 10 minutes for a booking,
  check-in is paused and the patron is sent to the door QR or the front desk.

**Room check-in page at `/r/{roomToken}` (opened from the door QR or typed):**

- The fallback for patrons without their booking page (closed it, booked by
  phone or at the desk, or walk-ins). Check-in requires **a current room code**
  (from the QR, typed from the door display, or read out by the front desk)
  **plus** the booking code or last 4 of the library card. The same wrong-attempt
  limit applies per room. A saved link or photo stops working within ~2 minutes,
  so nobody can check in from home.
- States, one main action each:
  - Booking waiting for check-in -> "Check in"; anyone in the group can do it
  - Too early -> "Check-in opens at 1:50 PM", no check-in
  - Too late -> "This booking was released - nobody checked in by 2:15 PM"
  - In use -> "In use until 3:00 PM" + next free time
  - Free now -> "Available now until 4:30 PM" -> walk-in books from now until
    the next booking (also requires the current room code)
  - Taken, not yours -> next free time + other rooms free now
  - Expired or missing code -> "Scan the code on the room's door display"

**Patron booking at `/book` (mobile-first web):**

- Browse rooms with type, capacity, location in the building and amenities, and
  whether each is free now
- Pick a room, a day and an open time slot; taken slots are not selectable
- Confirm with name, last 4 of library card and party size
- Success screen: room, time, short booking code, the check-in window ("check in
  between 1:50 and 2:15 PM or the room is released") and how to check in (scan
  the code on the room's door display, or ask at the front desk)

**Core rules:**

- No overlapping active bookings (booked or checked in) per room, enforced by a
  Postgres exclusion constraint, not only the UI. A slot lost a second before
  confirming shows a friendly message with the next free slots.
- Check-in window from 10 min before to 15 min after start (fixed defaults).
- Status is derived on read from the library clock: not checked in by start +
  window -> released, and the rest of the slot is free everywhere at once. No
  background job is needed for correctness; the release is persisted when first
  observed (and before any booking is inserted into the freed time).
- **One shared library clock** for every booking rule: real time plus a single
  offset stored for the library, changed only by the staff time control. Every
  screen and device agrees on "now". Concurrent reviewers share it, which is
  acceptable at this traffic.
- Check-in codes use real time, independent of the library clock offset.
- Times stored in UTC, shown in the library's timezone.

**Acceptance scenarios** (Given/When/Then in `CONTEXT.md` section 5):

- Playwright end-to-end: 1 conflict blocked, 2 live update across two browser
  contexts, 3 check-in with a valid room code, 4 no-show released (time shows as
  available everywhere), 5 walk-in uses a released room, 6 too early, 8
  accessible check-in page (axe scan plus keyboard and screen-reader checks).
  Added: an expired room code is rejected.
- Unit test: 7 report math (70% check-in, 30% no-show, re-booked hours) as a
  tested calculation; there is no report page in the MVP.

**Not in the MVP:** landing page, insights or report page, multiple branches,
metrics on the staff board, CSV export, kiosk hardware, ILS integration, email or
SMS notifications, PC or equipment booking, events and program registration,
payments or room fees, multi-library admin, real patron or staff accounts,
editable settings, split view, guided tour, Spanish translation (strings stay
translation-ready).

## 4. Data - What are we storing?

- `library` - name (one branch), address, timezone, opening hours, check-in
  window, early check-in, clock offset (the shared library clock)
- `room` - name, type (study / meeting / community), capacity, amenities,
  location in building, unique unguessable `qr_token`, active
- `booking` - room, start, end, patron name, card last 4, party size, channel
  (desk / web / walk-in), status, short booking code, checked-in time, released
  time, created by
- `booking_event` - booking, room, type (created / checked_in / released /
  cancelled / conflict_blocked), time, actor (staff / patron / system); audit
  trail and source for the report calculation

Check-in codes are not stored; they are computed from a server secret, the room
and the current minute.

Patron data stays minimal (name + last 4 of card) and fictional. Seed data:
"Maple Hollow Public Library" (one branch) with ~8 rooms of mixed types, plus a
realistic day of bookings (checked in, upcoming, released no-shows, open
slots). Seed bookings are generated relative to today: the app seeds today when
it has no bookings (and sets the library clock to an open hour, for example
1:55 PM), and "Start over" does the same, so the board looks alive whenever it
is opened.

## 5. Tech - What stack are we using?

- Next.js 16 (App Router, TypeScript strict), React 19, npm
- Supabase Postgres with `btree_gist` for the no-overlap exclusion constraint on
  `tstzrange(start, end)` for active bookings
- Data access only on the server (server components and Server Actions) with the
  service-role key; patron data never goes to the browser through a public key
- Check-in codes: HMAC of a server secret, room and minute, truncated to 6
  digits; QR rendered server-side by a small QR library
- Live updates: Supabase Realtime broadcast used only as a "something changed"
  ping, after which each screen refetches its view from the server; short
  polling as fallback. Booking rows are not streamed to clients.
- Tailwind CSS v4 + accessible primitives (shadcn/ui / Radix) customized with our
  own tokens (from `prototypes/theme.css`)
- Testing: Vitest unit tests for booking rules, code generation and report
  math; Playwright end-to-end tests for the acceptance scenarios, written with
  the feature they cover, run on a single worker because they set the shared
  library clock (each test uses its own date); `@axe-core/playwright` for the
  accessibility scan
- References: Chrome modern web guidance for platform and performance practice

## 6. Monetize - How will this make money?

Add-on to Fernwick Reserve priced **per meeting room per year**, proposed
$180-240 (BookIt Cloud charges $240, SpaceKeeper $310; final price open).

Revenue sources: upsell at renewal to ~392 active Reserve customers (~2,894
meeting rooms, most of the revenue); stop Reserve churn to BookIt Cloud
(~$41K/yr); recover lost expansion and renewal deals (~$88K/yr); new libraries
in covered regions. Base case ~$300K ARR within 18 months of launch. Pod cost
~$320K/yr; must pay back within 18 months, driven mainly by price x adoption
among existing Reserve customers.

Pilot success metrics: no-show rate down vs. baseline, >=70% of bookings checked
in, hours re-booked after release, zero double bookings, add-on adoption at
renewal. The report calculation exists and is tested; a report page comes after
the MVP. Proof-of-presence check-in keeps these numbers honest.

## 7. UI/UX - How should this look and feel?

- Three surfaces: staff board desktop-first (calm, about bookings and open time
  only); patron booking and check-in mobile-first (one main action per screen,
  big buttons, plain language); door display readable from a distance (large
  code, large QR, clear room state)
- Clear enough for a cold visitor: labels, status wording and next actions
  explain each screen, in product language (no "demo" wording)
- Light and calm: generous white space, one status tag per booking, few borders;
  open time is the most visible thing on the schedule
- Plain, consistent status vocabulary everywhere ("Available now", "Check in",
  "Released - nobody checked in")
- WCAG 2.2 AA: contrast, visible focus, full keyboard use, targets >= 24x24 px
  (aim 44x44 on mobile), screen-reader labels, respects reduced motion
- Patron trust and speed: no login, no install, fast on weak connections, clear
  success and error states, always offer the next free slot or another room
- Warm paper + deep green, Geist (from `prototypes/theme.css`); staff board
  layout in `prototypes/staff-board.html`. The board feels live: subtle
  highlight when a booking changes and a small "live" indicator.

## 8. Deployment - Where and how will this ship?

- Vercel, one production URL reviewers open; preview deployment per PR
- Build `npm run build`, start `npm run start`
- Supabase project: Postgres (schema, `btree_gist`, exclusion constraint) and
  Realtime broadcast. No cron job required.
- Env vars by name (final names set in feature 1): Supabase URL, Supabase anon
  key (Realtime only), Supabase service-role key (server only), check-in code
  secret (server only)
- README: what it is, the live URLs, how to run locally, run unit and Playwright
  tests, start over, the library time control, and each room's door display and
  check-in links. The reviewer document with the URLs is written by the owner.

## 9. Usage model and constraints (optional)

- Internet-facing, very low traffic: a few reviewers, possibly at the same time,
  using it days after submission
- Single library tenant with a single branch. The staff board has no login;
  patrons are anonymous
- Reviewers mostly on desktop Chrome/Edge plus a phone; patron and check-in
  pages must work on current mobile Safari and Chrome
- Time correctness matters: one shared library clock for all booking rules;
  check-in codes on real time
- Room tokens are unguessable; check-in requires a code that changes every
  minute, so presence at the room or desk is needed; patron data is fictional
  and limited to name and card last 4
- Anyone can create bookings, move the library clock or start over; acceptable
  for this showcase, and "Start over" restores a clean, alive state
