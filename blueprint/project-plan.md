# Project Plan - Reserve Rooms+

> Drafted from `CONTEXT.md` (Fernwick Library Systems case study) and honed in
> an `/explore` session. All company data, customers and numbers are mock
> content; treat them as real. `CONTEXT.md` stays the detailed source for the
> evidence, sizing and rejected alternatives.

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

**Reserve Rooms+** is an add-on to Fernwick Reserve that adds room check-in,
automatic no-show release and conflict-free booking. In production, general
booking stays in Reserve; this MVP is its own app with a thin booking flow so
check-in and release can be shown end to end.

**This build is a self-contained demo** submitted for a job application. The
reviewers will open the deployed URL on their own, days after submission, with
nobody to explain it. Everything they need to understand and try the product
must be inside the app.

## 2. Users - Who is this for?

- **Library director / branch manager (the buyer):** pays for the add-on. Needs
  proof it works: fewer no-shows, rooms reused, zero double bookings.
- **Front-desk staff (the operator):** uses the staff board on a desktop all
  day. Needs one clear view of today's rooms and their status, conflict-free desk
  bookings, and no more chasing no-shows.
- **Patron (the end user):** on a phone. Browses rooms, books quickly, checks in
  at the room. No account, no app install. Includes older adults, people with low
  digital literacy and people with disabilities.
- **Demo reviewer (the evaluator of this build):** opens the app cold on a
  desktop, needs to grasp what it is in seconds and see check-in and no-show
  release happen without waiting real time.

The staff board is what the library pays for; patron check-in is the engine.

## 3. Features - What does the MVP need?

**Patron side (mobile-first web):**

- Browse rooms by branch with type, capacity, location and amenities, and
  whether each is free now
- Pick a room, a day and an open time slot; slots already taken are not
  selectable
- Confirm with name, last 4 of library card and party size
- Success screen: room, time, short booking code, the check-in window ("check in
  between 1:50 and 2:15 PM or the room is released") and how to check in (open
  the room's door page, enter the booking code or card last 4)

**Room door page** at `/r/{roomToken}` (the URL a door QR code would open; QR
scanning itself is out of scope, the staff board and landing page link to each
door page). Shows the room's current state with one main action:

- Booking waiting for check-in -> "Check in", confirmed with booking code or card
  last 4; anyone in the group can do it
- Too early -> "Check-in opens at 1:50 PM", no check-in
- Too late -> "This booking was released"
- In use -> "In use until 3:00 PM" + next free time
- Free now -> "Available now until 4:30 PM" -> walk-in books from now until the
  next booking
- Taken, not yours -> next free time + other rooms free now at this branch

**Staff board (desktop-first):**

- Rooms (rows) x today's hours (columns), branch filter; each booking shows
  patron name, party size, channel (desk / web / walk-in) and status
- Statuses always as text + icon + color: Booked - awaiting check-in, Checked in,
  No-show - released, Cancelled, Completed; open time shown as available
- "Available now" list
- Book from the desk by clicking an open slot, with the same conflict rule
- Staff check-in, cancel and manual release
- Today summary strip: bookings, check-in rate, no-show rate, hours released,
  hours re-booked after release, double bookings prevented
- Report for a date range and branch with the same metrics and CSV export
- Live: changes from any screen appear within ~2 seconds without refresh, with a
  small "live" indicator and a subtle highlight on changed bookings

**Guided tour (makes the app self-explanatory):**

The app presents itself as the product, never as a "demo". No "demo", "mock" or
"test" wording in the UI. Guidance comes from a guided tour that feels like
product onboarding.

- Landing page at `/`: introduces Reserve Rooms+ as a product (what it does for
  libraries, one line on the problem it solves) with clear entries for patrons
  ("Book a room") and staff ("Staff board"), and a "Take the tour" start
- Guided tour: a short sequence of steps across the real screens, for example:
  book Study Room A at 2 PM -> see it on the staff board -> skip ahead past the
  check-in window -> see No-show - released -> open the room's door page and book
  it as a walk-in. Each step says what to look at and offers the one action that
  moves it forward. The tour can be dismissed, resumed and restarted, and remembers
  its step for the session.
- Time controls live inside the tour, framed as part of the walkthrough ("Skip
  ahead 15 minutes to see what happens when nobody checks in"), not as a
  permanent debug bar. A small, unobtrusive way to reopen the tour and its time
  and "start over" controls stays reachable on every page.
- "Start over" restores today's bookings to a fresh state
- Each browser session starts at a fixed library time on today's date (for
  example 1:55 PM) so rooms are open whatever time the visitor arrives; the
  library time is shown naturally where the product needs it (staff board header,
  door page)
- Optional: split view with the patron app in a phone-sized frame next to the
  staff board, to show live sync on one screen

**Core rules:**

- No overlapping active bookings (booked or checked in) per room, enforced by a
  Postgres exclusion constraint, not only the UI. A slot lost a second before
  confirming shows a friendly message with the next free slots.
- Check-in window from 10 min before to 15 min after start (fixed defaults in
  the MVP).
- Status is derived on read from the clock: not checked in by start + window ->
  No-show - released, and the rest of the slot is free everywhere at once. No
  background job is needed for correctness; the `released` event is recorded
  when the release is first observed.
- One server-side clock for every rule: real time plus the session's demo
  offset. The demo time lives in a cookie per browser session, so reviewers
  using the demo at the same time don't affect each other.
- Times stored in UTC, shown in the library's timezone.

**Acceptance scenarios** (each is a Playwright test; full Given/When/Then in
`CONTEXT.md` section 5): 1 conflict blocked, 2 live update across two browser
contexts, 3 check-in, 4 no-show release, 5 walk-in uses a released room, 6 too
early, 7 report math, 8 accessible door page (axe scan plus keyboard and
screen-reader checks).

**Not in the MVP:** camera QR scanning and printable QR codes (stretch), kiosk
check-in, ILS integration, email or SMS notifications, PC or equipment booking,
events and program registration, payments or room fees, multi-library admin,
real patron or staff accounts, editable settings, Spanish translation (strings
stay translation-ready).

## 4. Data - What are we storing?

- `library` - name, timezone, check-in window, early check-in
- `branch` - name, address or location note, opening hours
- `room` - branch, name, type (study / meeting / community), capacity,
  amenities, location in building, unique unguessable `qr_token`, active
- `booking` - room, start, end, patron name, card last 4, party size, channel
  (desk / web / walk-in), status, short booking code, checked-in time, released
  time, created by
- `booking_event` - booking, type (created / checked_in / released / cancelled /
  conflict_blocked), time, actor (staff / patron / system); audit trail and
  report source

The session clock offset is not stored in the database; it is a per-session cookie.

Patron data stays minimal (name + last 4 of card) and fictional. Seed data:
"Maple Hollow Public Library" with 3 branches and ~12 rooms of mixed types, plus
a realistic day of bookings (checked in, no-shows, upcoming, open slots). Seed
bookings are generated relative to today: the app seeds today when it has no
bookings, and "Start over" regenerates them, so the board looks alive whenever
it is opened.

## 5. Tech - What stack are we using?

- Next.js 16 (App Router, TypeScript strict), React 19, npm
- Supabase Postgres with `btree_gist` for the no-overlap exclusion constraint on
  `tstzrange(start, end)` for active bookings
- Data access only on the server (server components and Server Actions) with the
  service-role key; patron data never goes to the browser through a public key
- Live updates: Supabase Realtime broadcast used only as a "something changed"
  ping on a bookings channel, after which each screen refetches its view from
  the server; short polling as fallback. Booking rows are not streamed to clients.
- Tailwind CSS v4 + accessible primitives (shadcn/ui / Radix) customized with our
  own tokens
- Testing: unit tests for booking rules (overlap, window, derived status, report
  math); Playwright end-to-end tests mapped one-to-one to the 8 acceptance
  scenarios, written with the feature they cover, using a settable session clock
  and a unique date per test for isolation; `@axe-core/playwright` for the
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
renewal. The staff summary strip and report show these numbers.

## 7. UI/UX - How should this look and feel?

- Two surfaces, two densities: staff board desktop-first (dense, scannable,
  calm); patron side mobile-first (one main action per screen, big buttons, plain
  language)
- Self-explanatory for a cold visitor: the landing page and guided tour answer
  "what is this and what do I do" without outside help, in product language
  (no "demo" wording)
- The tour is unobtrusive: a non-blocking panel or callout, keyboard reachable
  and screen-reader friendly, never a full-screen overlay that hides the product
- Plain, consistent status vocabulary everywhere ("Available now", "Check in",
  "Released - nobody checked in")
- WCAG 2.2 AA: contrast, visible focus, full keyboard use, targets >= 24x24 px
  (aim 44x44 on mobile), screen-reader labels, respects reduced motion
- Patron trust and speed: no login, no install, fast on weak connections, clear
  success and error states, always offer the next free slot or another room
- Warm, welcoming civic/library feel, not corporate: neutral base + one accent,
  strong type hierarchy, designed rather than templated. The board feels live:
  subtle highlight when a booking changes state and a small "live" indicator.
  The tour panel matches the product's look while staying clearly secondary.

## 8. Deployment - Where and how will this ship?

- Vercel, one production URL used as the demo the reviewers open; preview
  deployment per PR
- Build `npm run build`, start `npm run start`
- Supabase project: Postgres (schema, `btree_gist`, exclusion constraint) and
  Realtime broadcast. No cron job required.
- Env vars by name (final names set in feature 1): Supabase URL, Supabase anon
  key (Realtime only), Supabase service-role key (server only), demo mode flag
- README: what it is, the live URL, how to run locally, run unit and Playwright
  tests, seed or reset data, use the tour and its time controls, and direct door-page
  links for each room

## 9. Usage model and constraints (optional)

- Internet-facing demo with very low traffic: a few reviewers, possibly at the
  same time, opening it days after submission without guidance
- Single library tenant. The staff board has no login (open demo access);
  patrons are anonymous
- Reviewers mostly on desktop Chrome/Edge; patron views must also work on
  current mobile Safari and Chrome
- Time correctness matters: one server-side clock for all rules, with the
  per-session demo offset
- Room door tokens are unguessable; patron data is fictional and limited to name
  and card last 4
- Anyone can create bookings or start over; acceptable for this showcase, and
  "Start over" restores a clean, alive state
