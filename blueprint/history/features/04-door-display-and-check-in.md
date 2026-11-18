# Feature: Door display and check-in

**From build-plan:** feature 4
**Build attempt:** 1
**Branch:** feature/door-display-and-check-in
**Status:** verified

## Goal

Patrons prove they are at the room before a booking counts as used. Each room
gets a door display (`/door/{roomToken}`) with a 6-digit code and QR that change
every 60 s. Patrons check in from their booking page by typing the current room
code (primary), or from the room check-in page `/r/{roomToken}` (QR target,
fallback) with the room code plus their booking code or card last 4. That page
also handles too early, released, in use, free now + walk-in, taken and expired
code. Repeated wrong codes pause check-in (5 per 10 min). Covered by Playwright
scenarios 3, 4, 5, 6, 8 (axe) and expired code.

## In scope

- `/door/{roomToken}`: room name, location, current state (Free now until X /
  In use until X / Booking awaiting check-in, check-in closes at X / Closed), the
  current 6-digit code in large type, a QR of
  `{origin}/r/{roomToken}?code={code}`, and a countdown to the next code. The
  code and QR refresh at each minute boundary without a page reload. No patron
  names.
- Booking page check-in on `/book/done/{bookingId}`: a "Check in" form with one
  field for the room's 6-digit code. Results: checked in (the page switches to
  "You are checked in"), too early ("Check-in opens at 1:50 PM", no check-in),
  released ("This booking was released - nobody checked in by 2:15 PM"),
  already checked in, cancelled/ended, wrong or expired code, paused. Updated
  instructions: enter the code from the door display here, keep this page open
  or bookmark it; fallback: scan the door QR, or ask at the front desk.
- `/r/{roomToken}` (`?code=` prefills the room-code field):
  - On load: room name, location and current state, plus room-level hints:
    "In use until 3:00 PM - free next at 3:00 PM"; for an upcoming booking whose
    window is not open, "Check-in for the 2:00 PM booking opens at 1:50 PM".
    No `?code=` shows "Scan the code on the room's door display" with a typed
    code field.
  - Check-in form: room code + "Booking code or last 4 of library card" ->
    Check in. Outcomes: checked in, too early, released, already checked in,
    taken, not yours (when the room is next free + other rooms free now), no
    booking found for this room today, expired or wrong code ("That code has
    changed. Scan the code on the room's door display."), paused.
  - Free now: "Available now until 4:30 PM" with a walk-in form (room code,
    name, card last 4, party size) as the main action. The check-in form stays
    as a secondary "Have a booking?" section.
- Walk-in: books the room from library `now` (truncated to the minute) until
  the earliest of the next active booking, closing time, or now + the room
  type's max length (`MAX_MINUTES_BY_TYPE`). It is created already checked in
  (channel `walk_in`, created by `patron`). Success shows the room, the end
  time and the booking code. A race with another booking shows the taken state.
- Wrong-attempt limit: a failed room-code check (wrong or expired) is recorded.
  Five failures in the last 10 real-time minutes pause check-in and walk-in for
  that subject (the booking on the booking page, the room on `/r`). A paused
  subject refuses even a correct code until the oldest failure ages out. The
  message points to the door QR (booking page) or the front desk (both).
  Start over clears all recorded failures.
- QR library (`qrcode`) chosen and installed; `@axe-core/playwright` installed.
- Root `app/not-found.tsx` with product copy for invalid room links.

## Out of scope

- Realtime push, live indicator, change highlight (feature 5). The door display
  refreshes its state when the code rotates, and other pages show changes on
  reload.
- README door and check-in link list, deployment (feature 6).
- Door display links on the staff board, staff unlock of a paused room, and
  editable limits.
- Changes to staff check-in on the board (it needs no code).

## Build loop

`workflow.stepReview` is `feature`: build all steps, then stop once for review
at the end. `workflow.checkpointCommits` is `disabled`: no commits per step;
`/complete` makes the feature commit. Work on branch
`feature/door-display-and-check-in`. The uncommitted planning edits on `main`
(build plan, project plan, overview: booking-page check-in and the attempt
limit) are this feature's contract. Carry them onto the branch and commit them
with the feature.

## Build steps

- [x] **1. Pure check-in rules (`lib/checkin.ts`).** Add, with
  `lib/checkin.test.ts`:
  - `parseIdentifier(input)`: trimmed; 4 digits -> `{ kind: "card" }`;
    6 characters from the booking-code alphabet, case-insensitive ->
    `{ kind: "code" }` (uppercased); else invalid.
  - `bookingCheckInOutcome(booking, settings, now)` -> `open` | `too_early
    { opensAt }` | `released { closesAt }` | `checked_in` | `cancelled` |
    `completed`. Built on `deriveStatus` and `checkInAvailability`.
  - `matchBooking(bookings, identifier, settings, now)`: among one room's
    bookings for the library day, the matches by code or card in priority
    order: window open > nearest upcoming booked > current checked in > most
    recently released. Returns null when nothing matches.
  - `roomCheckInView(now, bookings, settings, open)`: `roomStateAt` plus the
    next free time and the next booking's check-in opening when not yet open.
  - `walkInEnd(now, freeUntil, maxMinutes)`.
  - `isPaused(recentFailureCount)` with constants `MAX_FAILURES = 5` and
    `FAILURE_WINDOW_MIN = 10`.
  Tests cover window edges (exactly opensAt/closesAt), released vs checked in,
  card matching several bookings, a free room with an upcoming booking, walk-in
  end capped by each bound, and pause at 4 vs 5.
  **Done when** `npm test` passes with the new tests and `npx tsc --noEmit` is
  clean.

- [x] **2. Database: failures table and walk-in.** Add
  `supabase/migrations/0008_checkin.sql`:
  - Table `checkin_failure (id uuid pk default gen_random_uuid(), scope text not
    null check (scope in ('booking','room')), subject_id uuid not null, at
    timestamptz not null default now())`, indexed on `(scope, subject_id, at)`.
    Use real `now()`, not the library clock. Use the same RLS, revoke and grant
    pattern as `0001_schema.sql`.
  - `create_walk_in(p_room_id, p_end, p_patron_name, p_card_last4,
    p_party_size) returns jsonb`. It runs `release_overdue()` first and sets
    start = `date_trunc('minute', library_now())`. It returns `{ok:false,
    reason:'ended'}` when `p_end <= start`. It inserts a `walk_in`/`patron`
    booking with `status='checked_in'` and `checked_in_at = library_now()`, and
    writes `created` and `checked_in` events. On `exclusion_violation` it logs
    `conflict_blocked` and returns `{ok:false, reason:'taken'}`; success returns
    `{ok:true, id, booking_code, end_at}`. Execute is granted to service_role
    only.
  - `startOver()` in `lib/server/library.ts` also deletes all `checkin_failure`
    rows.
  Apply with `npm run db:setup` (shared Supabase DB, additive migration).
  **Done when** `npm run db:setup` reports `Applied 0008_checkin.sql`,
  typecheck passes, and Start over still works on the board.

- [x] **3. Server check-in services (`lib/server/checkin.ts`, server-only).**
  Add `loadRoomByToken(token)` (validates `/^[0-9a-f]{32}$/`, active rooms only),
  `recentFailures(scope, id)`, `recordFailure(scope, id)`, `loadRoomDay(room,
  library, now)` (that room's library-day bookings, reusing
  `loadBookingsStartingBetween`/`toBoardBooking`), `doorCode(roomId,
  origin)` -> `{ code, msUntilNext, qrDataUrl, checkInUrl }`, and
  `requestOrigin()` from `headers()` (`x-forwarded-proto` default `http`,
  `host`). The QR is an SVG data URI from `qrcode`'s `toString({ type: "svg"
  })`, rendered as an `<img>` and never injected as HTML. Install `qrcode` and
  `@types/qrcode`.
  **Done when** typecheck and lint pass.

- [x] **4. Door display `/door/[roomToken]`.** Add a server page (Suspense
  pattern as in `app/book/done/[bookingId]/page.tsx`) that renders room
  name/location and the state from `roomCheckInView`. Add a client
  `DoorCode` component that calls a `getDoorCode(roomToken)` Server Action
  (`app/door/actions.ts`) at mount and at each `msUntilNext`. It calls
  `router.refresh()` on rotation and retries after 10 s on error, keeping the
  last code dimmed with "Reconnecting". The countdown ticks each second but is
  not a live region; the code has a spaced `aria-label`. The page is readable
  from a distance in landscape and portrait, with text + icon for state. Add
  root `app/not-found.tsx` ("This room link is not valid. Ask at the front
  desk.").
  **Done when** `/door/{token}` shows the code, the QR (it decodes to
  `/r/{token}?code=` + the code) and a countdown that rolls over without
  reload. A bad token shows the not-found page. Typecheck, lint and build pass.

- [x] **5. Booking page check-in.** Add a `checkInFromBookingPage(prev,
  formData)` Server Action in `app/book/actions.ts`. It validates the UUID,
  loads the booking and returns the `bookingCheckInOutcome` message without
  checking the code unless the outcome is `open`. Then: paused -> paused
  message; an invalid code -> `recordFailure('booking')`, returning the
  wrong/expired message or the paused message on the 5th failure; a valid code
  -> `apply_booking_action(check_in, actor 'patron')`, and on `false`
  recompute the outcome. It calls `refresh()` on success. Results are
  `{ success, message | error, kind }`. Add a client `CheckInForm`
  (`useActionState`) with a labeled field (`inputMode="numeric"`,
  `autoComplete="off"`, `maxLength` 7, hyphen/space accepted), error linked by
  `aria-describedby`, messages in a `role="status"`/`role="alert"` region that
  receives focus, field cleared after a wrong code, and a 44 px button. Rewrite
  the done-page instructions per In scope.
  **Done when** a booking in its window checks in with the code from the
  board's "Show check-in code" dialog and the page shows "You are checked in".
  Too early, wrong code and pause behave as specified (manual run against the
  dev server; Playwright in step 7). Typecheck and lint pass.

- [x] **6. Room check-in page `/r/[roomToken]` with walk-in.** Add a server page
  that renders the `roomCheckInView` state and the forms per In scope. Add
  Server Actions in `app/r/actions.ts`:
  - `checkInAtRoom`: token -> room; check the pause (scope `room`), then
    verify the code (on failure: record and return expired/paused), then
    `parseIdentifier`, then `matchBooking` over today's bookings. For the
    outcome `open`, call `apply_booking_action`. Otherwise return too early,
    released, already checked in, or not found. When the room is taken by
    someone else, return taken with the next free time and
    `availableNow` other rooms.
  - `walkIn`: pause, then code, then name/card/party validation (reuse or
    extract the patron-field rules in `lib/booking-input.ts` with tests), then
    `walkInEnd` from the current free-until, then `create_walk_in`.
  Never echo other patrons' names or booking codes; user text renders as React
  text only. Accessibility as in step 5. "Other rooms free now" are links to
  their `/book/{roomId}` pages.
  **Done when** each state renders from a seeded day plus the time control.
  A walk-in on a free room shows the end time and appears on the board as
  Checked in. Typecheck, lint and build pass.

- [x] **7. Playwright acceptance (`e2e/checkin.spec.ts`).** Install
  `@axe-core/playwright`. Add a helper `e2e/support.ts` that loads `.env.local`
  (`process.loadEnvFile`). It looks up a room's id/token via supabase-js with
  the service-role key and computes codes with `lib/checkin-code.ts`, where
  expired = the code for 3 minutes ago. Each test sets its own library date
  (as in `e2e/patron-booking.spec.ts`), books through `/book` or the board, and
  uses the time control. Start over in `afterAll`. Tests:
  - Scenario 3: check-in via the booking page with the code read from
    `/door/{token}` -> "You are checked in", and the board shows Checked in.
    Plus check-in via `/r/{token}?code=` with the booking code.
  - Scenario 4: no check-in by start + 15 -> the board, `/book` (free now) and
    `/r` show it available, and the booking page and `/r` lookup show
    "released".
  - Scenario 5: walk-in on the released room books until the next booking.
  - Scenario 6: too early on `/r` (load hint and submit) and on the booking
    page; nothing is checked in.
  - Expired code rejected on `/r` and the booking page.
  - Scenario 8: axe (WCAG 2.2 AA tags) has no violations on `/r` (load and
    after a result), the booking page check-in, and `/door`. The status is in a
    live region, and the main action is reachable by keyboard.
  **Done when** `npm run test:browser` passes in full (existing specs
  included), and `npm test`, `npm run lint` and `npm run build` pass.

## Files / areas

- New: `lib/checkin.ts`, `lib/checkin.test.ts`, `lib/server/checkin.ts`,
  `supabase/migrations/0008_checkin.sql`, `app/door/[roomToken]/page.tsx`,
  `app/door/actions.ts`, `app/door/_components/DoorCode.tsx`,
  `app/r/[roomToken]/page.tsx`, `app/r/actions.ts`, `app/r/_components/*`
  (check-in and walk-in forms), `app/book/_components/CheckInForm.tsx`,
  `app/not-found.tsx`, `e2e/checkin.spec.ts`, `e2e/support.ts`.
- Changed: `app/book/actions.ts`, `app/book/done/[bookingId]/page.tsx`,
  `lib/server/library.ts` (`startOver`), possibly `lib/booking-input.ts`
  (shared patron-field validation), `types/domain.ts` (CheckinFailure if
  needed), `package.json`/`package-lock.json`.
- Reused: `lib/checkin-code.ts`, `lib/server/checkin-code.ts`,
  `lib/booking-rules.ts`, `lib/schedule.ts` (`roomStateAt`, `activeIntervals`,
  `availableNow`), `lib/server/board.ts`, `lib/server/patron.ts`
  (`loadPatronDay`, `loadBookingById`), `apply_booking_action`,
  `app/book/_components/patron.tsx` (header, loading, `UUID_RE`).

## Data / contracts

- `checkin_failure`: one row per failed room-code check. `scope` is
  `'booking'` (subject = booking id, booking page) or `'room'` (subject = room
  id, `/r`, check-in and walk-in). `at` is real DB time. Paused = count of rows
  with `at > now() - 10 min` >= 5. Rows are never read by clients, never
  purged except by Start over, and contain no patron data. Count-then-insert
  is not atomic: concurrent bursts may get a few extra tries. This is
  accepted, since the HMAC code space is 10^6 and valid for 2 minutes.
- What counts as a failure: only a room code that fails `isValidCheckinCode`
  (wrong, expired, or malformed after stripping spaces/hyphens). An empty
  field is a validation error, not a failure. A wrong booking code or card is
  not counted (the room code already proves presence).
- `create_walk_in` result: `{ok:true, id, booking_code, end_at}` |
  `{ok:false, reason:'taken'|'ended'}`.
- QR target: `{origin}/r/{roomToken}?code={6 digits}`. The origin comes from
  request headers; on localhost the QR only works on the same machine or LAN.
- `?code=` on `/r` is only prefilled, never verified on load, so a GET is not
  an unlimited code oracle.
- Codes always use real time; windows and states use the library clock
  (`getLibraryContext().now`). Room tokens: 32 lowercase hex, active rooms
  only.
- Action result shape follows the repo: `{ success: true, message, ... } |
  { success: false, error, kind? }`; unexpected errors are logged and return
  "Something went wrong. Try again."

## Testing

- Vitest: `lib/checkin.test.ts` (step 1). Add patron-field validation tests if
  extracted in step 6.
- Playwright: `e2e/checkin.spec.ts` (step 7) with axe. It needs `.env.local`
  with the service-role key and `CHECKIN_CODE_SECRET`, and runs on one worker
  as configured.
- Final gate: `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`,
  `npm run test:browser`.

## Notes for the AI

- Read `node_modules/next/dist/docs/` for Server Actions, `headers()`,
  `refresh()`, `notFound()` and `useActionState` in Next 16 before writing
  routes. Follow the Suspense-wrapped page pattern already used.
- Mobile-first for `/r` and the booking page: one main action, big buttons,
  plain language, 44x44 targets, visible focus, text + icon + color for every
  state, reduced motion (no animated countdown). The door display uses the
  `theme.css` tokens already in `app/globals.css`.
- Product language only; no "demo"/"test" wording.
- Example times in copy come from the data via `formatTime`/the library
  timezone, never hard-coded.
- Do not add Realtime; feature 5 owns it.
- For manual checks, a room token comes from `select name, qr_token from
  room` or the e2e helper.

## Open questions

None blocking. The spec makes these choices; change any before Implement if you
disagree:
- Walk-ins are created already checked in, and capped at the room type's max
  length as well as the next booking and closing time.
- Only room-code failures count toward the limit, the window uses real time,
  and Start over clears it.
- A `/r` lockout is per room, so repeated wrong codes can pause a room's
  fallback page for up to 10 minutes. The booking page (per booking) and the
  front desk still work.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":17314,"specSha256":"b09c8cb2c7b811ed9af4ed043ccfa5154a42b9d44f721a268bb3cbc731dafaf4","branch":"refs/heads/feature/door-display-and-check-in","head":"d876001b197173b7bc32ccbc89326ba339d77ce1","baseRef":"refs/heads/main","baseCommit":"d876001b197173b7bc32ccbc89326ba339d77ce1","sourceTree":"5c3a50152a016059f1d566d5275cc6acb5495382","landing":"local-merge","absentOptional":[]} -->

## Try it now

Run or do:

With `npm run dev` running, press Start over on the staff board at http://localhost:3000 (library time becomes 1:55 PM). Book any room with an open 2:00 PM slot at /book and stay on the "Your room is booked" page. On the board, open that room, press Show check-in code, type that code into Room code on the booking page and press Check in.

Expected:

"You are checked in. The room is yours until ..." appears, the heading changes to "You are checked in", and the staff board shows that booking as Checked in.

This proves:

A patron checks in from their booking page with the room's current rotating code.
