# Feature: Staff board

**From build-plan:** feature 2
**Build attempt:** 1
**Branch:** feature/staff-board
**Status:** verified

## Goal

Replace the scaffold home page with the front-desk staff board at `/`: one calm
desktop view of a day's rooms where open time is the most visible thing, staff
book from open slots without ever creating a double booking (a blocked conflict
names the booking in the way and offers free alternatives), act on bookings
(check in, cancel, release, show the room's check-in code), and move the shared
library clock or start over. Ends with Playwright acceptance scenario 1.

## Design reference

- Layout: `prototypes/staff-board.html` (header, day nav + view toggle, room rail
  + vertical agenda, All rooms grid, Available now aside, booking dialog).
- Tokens: `prototypes/theme.css`, ported into `app/globals.css` in step 1.
- Follow the plan, not the mockup, where they differ: no-shows are not drawn
  (their time shows as open), no "Insights" nav link, add the library time
  control and "Show check-in code", no "demo" wording, rooms are the seeded eight.

## In scope

- Theme port, app metadata, header (library name, library time control, Start over).
- Day navigation (today by default; previous/next) and the two views of the
  selected day, kept in the URL.
- By room view: rail grouped by type with each room's state, agenda with booking
  cards, bookable open slots, cancelled list, current-time line, past shading.
- All rooms grid; clicking a room opens it in By room.
- Available now panel (today only) with "free until" and "Book".
- Desk booking dialog with validation, the database conflict rule, the conflict
  message, free alternatives and a `conflict_blocked` event.
- Booking actions: check in, cancel, release (cancel and release confirm first);
  "Show check-in code" per room with a countdown.
- Library time control: +15 min, set date and time; Start over.
- Loading, empty, past-day, error and stale-action states.
- Playwright scenario 1; the existing smoke test updated to the new page.
- Booking management (added in review): search bookings by patron name or card
  last 4 on the All rooms view, a booking panel with details and actions, and
  staff moving a booking to another room or time.

## Out of scope

- Live updates, polling, live indicator, change highlight (feature 5).
- `/book`, `/door/*`, `/r/*` and walk-in (features 3, 4); the board does not link
  to door pages yet.
- Metrics, report page, settings, accounts, Insights nav.
- Ending a checked-in booking early. Editing patron details. Patron-initiated moves.

## Build loop

`workflow.stepReview` is `feature` and `workflow.checkpointCommits` is
`disabled`: build all steps in order on `feature/staff-board`, running each
step's checks before moving on, with no per-step review stop and no checkpoint
commits. Stop for review after the last step. `/complete` creates the feature
commit.

## Build steps

- [x] **1. Theme, shell and data loading.**
  Read the Next 16 docs first: `01-app/01-getting-started/06-fetching-data.md`,
  `07-mutating-data.md`, `08-caching.md`, `09-revalidating.md`,
  `10-error-handling.md`. `next.config.ts` has `cacheComponents: true`, so
  request-time data must render inside `<Suspense>` (or after `connection()`)
  as those docs describe. Port every token from `prototypes/theme.css` into
  `app/globals.css` (`:root` vars plus `@theme inline` mappings for Tailwind
  utilities), drop the dark-mode block and the Arial body font, keep Geist via
  `next/font`. Set metadata title "Reserve Rooms+" and a description. Replace
  `app/page.tsx` with a server page that, inside Suspense, calls
  `ensureTodaySeeded()`, `releaseOverdue()` and `getLibraryContext()`, then
  loads active rooms and the selected day's bookings (`start_at` within
  `libraryDayBounds`) through a new `lib/server/board.ts`. Render the header
  (library name, library time such as "Wed, Nov 18 - 1:55 PM"), the h1 "Rooms"
  and day navigation (previous / date label / next, plus a "Today" link when not
  on today) driven by `?date=YYYY-MM-DD` (invalid or missing -> library today).
  Add `app/loading.tsx` ("Loading rooms...") and `app/error.tsx` (plain message
  plus "Try again" calling `reset`). Update `e2e/smoke.spec.ts` to assert the
  h1 "Rooms" and the library name.
  **Done when:** `npm run build` and `npm run lint` pass;
  `npm run test:browser -- e2e/smoke.spec.ts` passes against the dev server that
  Playwright starts.

- [x] **2. Schedule logic (pure) with tests.**
  Add `zonedTimeToUtc(date, time, timeZone)` and `libraryDateString(instant,
  timeZone)` (`YYYY-MM-DD`) to `lib/clock.ts`, reusing its helpers. New
  `lib/schedule.ts` per Data / contracts. Add `formatTime`, `formatTimeRange`
  and `formatDayLabel` to `lib/format.ts` (library timezone, `en-US`). New
  `lib/booking-input.ts` with the pure `validateDeskBooking`.
  **Done when:** `npm test` passes with the new focused tests listed in Testing.

- [x] **3. By room view and Available now.**
  Server-rendered from step 1 data and step 2 logic. Rail grouped by type
  ("Study rooms", "Meeting rooms", "Community rooms") with each room's state
  (today only); selected room from `?room=<id>` (default first room). Agenda
  over the opening hours: hour labels, booking cards (time range, patron name,
  party size, channel, one status tag), open-slot buttons, current-time line and
  past shading on today, and a "Cancelled (n)" `<details>` list under the
  agenda. Available now aside on today. View toggle (By room / All rooms) as
  links with `aria-current` writing `?view=`; All rooms shows a placeholder
  until step 4. Open-slot buttons render but open nothing until step 5.
  **Done when:** on the seeded today, Study Room A shows the 10:00 Completed
  card, the 2:00-3:00 PM "Booked - awaiting check-in" card with "Check-in
  closes 2:15 PM", and open slots; Study Room B shows no card for the released
  10:30 no-show; Available now lists the rooms free at 1:55 PM with "free until".
  Evidence: Playwright assertions added to `e2e/staff-board.spec.ts` for these
  texts plus a full-page screenshot saved under `test-results/`; build passes.

- [x] **4. All rooms grid.**
  Rows are rooms grouped by type, columns are the day's opening hours in
  30-minute cells; booking blocks show patron name and status tag (released and
  cancelled are not drawn); open time is visibly open; current-time line and
  past shading on today; room names link to `?view=room&room=<id>` keeping
  `date`. Wrap the grid in an `overflow-x: auto` region with an accessible name.
  **Done when:** build and lint pass; a Playwright assertion clicks "All rooms",
  then a room name, and lands on that room's agenda with the same date.

- [x] **5. Desk booking with conflict handling.**
  Add `supabase/migrations/0003_board.sql` with `create_booking`,
  `apply_booking_action`, `set_clock_offset` and `advance_clock` per Data /
  contracts, and apply it with `npm run db:setup`. Server action
  `createDeskBooking` in `app/actions.ts` validates with `validateDeskBooking`,
  calls `rpc("create_booking")`, and on conflict computes alternatives with
  `findAlternatives` from freshly loaded data. Client `BookingDialog` (native
  `<dialog>`, opened from an open slot or from "Book" in Available now, which
  first selects that room) with the fields in Data / contracts,
  `useActionState`, field errors and the conflict panel; on success it closes,
  refreshes the board and moves focus to the new card.
  **Done when:** on seeded today, booking Study Room B 3:30-4:30 PM is blocked
  by the seeded 3:00-4:00 PM booking with "This room is taken 3:00-4:00 PM" and
  alternatives; choosing an alternative fills the dialog and books it; a
  `conflict_blocked` event row exists (one-off read-only query); `npm test` and
  the build pass.

- [x] **6. Booking actions and check-in code.**
  Card actions per Data / contracts: "Check in" (window open), "Cancel"
  (awaiting check-in) and "Release" (awaiting check-in and window open). Cancel
  and Release confirm in a small dialog naming the patron and time. Server
  actions `checkInBooking`, `cancelBooking` and `releaseBooking` call
  `rpc("apply_booking_action")`; a false result shows "This booking changed.
  The board has been refreshed." and refreshes. The agenda header gets "Show
  check-in code": a dialog with the room's current 6-digit code (large, mono,
  grouped "123 456") and "New code in 42 s", fetching a fresh code from
  `getRoomCheckinCode` when the minute rolls over and stopping when closed.
  **Done when:** on seeded today, checking in the Study Room A 2:00 PM booking
  shows "Checked in"; cancelling the Study Room A 4:00 PM booking moves it to the
  Cancelled list and its time becomes an open slot; the code dialog shows 6
  digits and a countdown; build passes.

- [x] **7. Library time control and Start over.**
  Header control showing library date and time with "+15 min", "Set time" (a
  dialog with labelled `<input type="date">` and `<input type="time">`) and
  "Start over" (confirm: "Reset today's bookings and set the time to 1:55 PM?").
  Server actions `advanceLibraryClock`, `setLibraryTime` and `startOverAction`.
  After a change the board shows the library's new current day.
  **Done when:** +15 min moves the header time and, once past 2:15 PM, the
  unchecked 2:00 PM booking disappears from the agenda; Set time to another date
  shows that day; Start over restores the seeded today at 1:55 PM; build passes.

- [x] **8. Playwright scenario 1 and final checks.**
  `e2e/staff-board.spec.ts` per Testing. Set `workers: 1` and
  `fullyParallel: false` in `playwright.config.ts` (shared library clock).
  **Done when:** `npm run test:browser` passes (smoke + staff board), and
  `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` pass.

- [x] **9. UI revisions from review.**
  All rooms: more vertical space in the container and rows; no shadows on main
  surfaces or timeline items; no thick left edge on timeline items; each item
  shows patron name, card last 4, party size and the status as plain colored
  text (no pill), with more vertical space; room column says "Maximum capacity: X".
  Completed bookings use a neutral gray (not gray-blue) everywhere. By room: the
  room header gets a clearer hierarchy (larger name, type and capacity, location)
  and amenities as simple low-color pills; the room rail is wider with more
  spacing and dividers between room types; each room state in the rail is
  colored by meaning (free green, in use blue, awaiting check-in amber, closed
  gray) with a small marker, and keeps its text.
  **Done when:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`
  and `npm run test:browser` pass, and new screenshots of both views are saved
  under `test-results/`.

- [x] **10. Move rule, data and server actions.**
  Migrations `0006_moved_event.sql` (add `moved` to `booking_event_type`) and
  `0007_move_booking.sql` with `move_booking(p_booking_id uuid, p_room_id uuid,
  p_start timestamptz, p_end timestamptz, p_actor booking_actor) returns jsonb`:
  calls `release_overdue()`, then in one transaction updates the room and times
  when the booking is `booked`, or `checked_in` with library now before its end
  and unchanged times; records a `moved` event (`at` = library now); returns
  `{"ok":true}`, `{"ok":false,"reason":"changed"}` when the guard fails, or
  `{"ok":false,"conflict":{..}}` plus a `conflict_blocked` event on overlap.
  Pure `validateMove` in `lib/booking-input.ts`: room capacity >= party size;
  times on boundaries; inside opening hours; max length; a changed start must not
  be in the past (the original start may stay even if past); checked-in
  bookings may change room only. Server actions `getMoveOptions(bookingId)`
  (active rooms with capacity >= party size that are free for the current time)
  and `moveBooking(formData)` with the same result shape and conflict
  alternatives as `createDeskBooking`.
  **Done when:** `npm test` passes with `validateMove` tests; migrations apply.

- [x] **11. Booking search on All rooms.**
  A labelled search field above the grid ("Find a booking", placeholder "Patron
  name or card last 4") writes `?q=` (debounced; the URL stays shareable).
  Matching is case-insensitive on patron name, or a prefix of card last 4 when
  the query is digits. Matching blocks are highlighted (accent ring), the others
  fade, and open time stays visible. Under the field: "2 matches" plus one button
  per match ("Daniel Okafor · Study Room A · 2:00-3:00 PM") that opens its
  panel; "No bookings match" when none. Matching is pure
  (`matchesBookingQuery` in `lib/schedule.ts`) and tested.
  **Done when:** searching a seeded name highlights its block and lists it; tests pass.

- [x] **12. Booking panel and move dialog.**
  Clicking a grid block (now a button) or a match opens a panel (dialog) with
  time, room, patron, card last 4, party size, channel and status, plus the
  existing actions (Check in, Release, Cancel) and "Move booking". By room card
  actions also get "Move booking". The move dialog has room, start and end
  (prefilled with the current values; start and end locked for checked-in
  bookings), quick picks "Free at this time" from `getMoveOptions`, field
  errors, and the conflict panel with alternatives. Success closes it, announces
  "Moved Daniel Okafor to Birch Meeting Room, 2:00-3:00 PM." and refreshes.
  **Done when:** moving a seeded booking to a free room at the same time shows it
  in the new room and the old room's time becomes open; build passes.

- [x] **13. Browser coverage and final checks.**
  Playwright: search by name and by card last 4 highlights and lists the
  booking; move a booking to another room from the All rooms panel; a move into
  a taken time shows the conflict message.
  **Done when:** `npm run test:browser`, `npm test`, `npx tsc --noEmit`,
  `npm run lint` and `npm run build` pass.

- [x] **14. Toast feedback.**
  Replace the message bar with a toast at the bottom center of the screen for
  the outcome of every board action (book, move, check in, cancel, release,
  clock changes, Start over): success toasts with a check icon, error toasts with
  an error icon and the error text. One toast at a time (the newest replaces the
  last), auto-dismiss after 5 s, a labelled close button, announced through one
  `role="status"` region, no motion when reduced motion is preferred. Errors that
  belong to a form field stay inline in their dialog.
  **Done when:** browser tests assert the toast text for a success and an
  error; `npm run test:browser`, `npm test`, `npx tsc --noEmit`, `npm run lint`
  and `npm run build` pass.

## Files / areas

- `app/globals.css`, `app/layout.tsx` (theme, metadata), `app/page.tsx` (replaced)
- `app/loading.tsx`, `app/error.tsx`, `app/actions.ts` (new)
- `app/_components/` (new): `BoardHeader`, `TimeControl`, `DayNav`, `ViewToggle`,
  `RoomRail`, `RoomAgenda`, `AllRoomsGrid`, `AvailableNow`, `BookingDialog`,
  `BookingActions`, `CheckinCodeDialog`, `StatusTag`, `Icon`
- `lib/clock.ts` (+`zonedTimeToUtc`, `libraryDateString`), `lib/format.ts`
  (+time formatters), `lib/schedule.ts`, `lib/booking-input.ts` and their tests
- `lib/server/board.ts` (new: load rooms and a day's bookings)
- `supabase/migrations/0003_board.sql` (new)
- `e2e/smoke.spec.ts` (updated), `e2e/staff-board.spec.ts` (new),
  `playwright.config.ts` (one worker)
- Reused: `lib/booking-rules.ts`, `lib/server/library.ts`,
  `lib/server/checkin-code.ts`, `types/domain.ts`

## Data / contracts

### URL

`/?date=YYYY-MM-DD&view=room|all&room=<room uuid>`. All optional; invalid values
fall back to library today, `room` and the first room. Links keep the other
params. Nothing else is read from the URL.

### Booking rules decided here

- Times on 30-minute boundaries; minimum 30 minutes; maximum by room type:
  study 2 h, meeting 4 h, community 4 h (`MAX_MINUTES_BY_TYPE` in
  `lib/booking-input.ts`).
- Bookable only inside the room's opening hours for that weekday
  (`library.opening_hours`, keys `mon`..`sun`, `HH:MM` library-local).
- Past time is not bookable. On today, when library now is inside an open
  interval and not on a boundary, the first start option is "Now (1:55 PM)",
  which books from library now floored to the minute; later starts are the
  following 30-minute boundaries.
- Past days are read-only (no open-slot buttons, no actions); future days start
  empty and are bookable.
- Party size 1 to room capacity. Name 1-80 characters after trimming. Card last
  4 is exactly 4 digits.
- Desk bookings: `channel = 'desk'`, `created_by = 'staff'`, event actor `staff`.

### Pure schedule logic (`lib/schedule.ts`)

- `openingHoursFor(dateString, library)` -> `{ open: Date; close: Date }` (UTC).
- `activeIntervals(bookings, settings, now)` keeps bookings whose `deriveStatus`
  is booked, checked_in or completed; released and cancelled free their time.
- `freeSlots(open, close, intervals, now)` -> maximal open intervals inside
  opening hours, clipped to start at `now` on today; drops leftovers shorter
  than 30 minutes.
- `roomStateAt(now, intervals, open, close)` -> `closed` | `in_use` (until its
  end) | `awaiting_check_in` (a booked booking whose window is open now) |
  `free` (until the next start or closing).
- `availableNow(...)` -> rooms in state `free`, sorted by "free until" latest
  first, each with `freeUntil`.
- `findAlternatives(...)` -> up to 3 same-room slots of the same length later
  that day (earliest first) and up to 3 other active rooms with capacity >=
  party size free for the same start and end; each `{ roomId, roomName, start,
  end }`.

### Database functions (`0003_board.sql`; service role only, same revoke/grant pattern as 0002)

- `create_booking(p_room_id uuid, p_start timestamptz, p_end timestamptz,
  p_patron_name text, p_card_last4 text, p_party_size int, p_channel
  booking_channel, p_created_by booking_actor) returns jsonb`: calls
  `release_overdue()` first; inserts the booking and a `created` event (`at` =
  library now, actor = `p_created_by`); returns `{"ok":true,"id":..,
  "booking_code":..}`. On `exclusion_violation` it records a `conflict_blocked`
  event (booking_id null, `at` = library now) and returns `{"ok":false,
  "conflict":{"start_at":..,"end_at":..}}` for the earliest active booking
  overlapping the request. One transaction; no partial rows on conflict.
- `apply_booking_action(p_booking_id uuid, p_action text, p_actor
  booking_actor) returns boolean`: calls `release_overdue()`, then one guarded
  update plus its event: `check_in` (status booked and window open at library
  now -> `checked_in`, `checked_in_at` = library now), `cancel` (status booked
  -> `cancelled`), `release` (status booked and library now >= start - early
  -> `released`, `released_at` = library now). Returns false when the guard
  matches no row; an unknown action raises.
- `set_clock_offset(p_seconds int)` and `advance_clock(p_seconds int)` update
  `library.clock_offset_seconds` atomically.

### Server actions (`app/actions.ts`, `"use server"`)

All return `{ success: true, ... } | { success: false, error: string,
fieldErrors?: Record<string, string>, conflict?: { label: string;
alternatives: Alternative[] } }`, re-validate every input on the server, never
trust client-sent times beyond the validated `date`/`HH:MM` fields, and refresh
the board as the Next 16 revalidation docs describe. Unexpected errors are
logged on the server and return "Something went wrong. Try again." with no
internals.

- `createDeskBooking(formData)`: `roomId`, `date`, `start` (`HH:MM` or `now`),
  `end` (`HH:MM`), `patronName`, `cardLast4`, `partySize`. Conflict label:
  "This room is taken 3:00-4:00 PM".
- `checkInBooking(id)`, `cancelBooking(id)`, `releaseBooking(id)`.
- `getRoomCheckinCode(roomId)` -> `{ code, msUntilNext }`.
- `advanceLibraryClock()` (+900 s), `setLibraryTime(date, time)` (offset =
  `zonedTimeToUtc(date, time, tz)` minus real now, in whole seconds; years
  2000-2100 only), `startOverAction()` (calls `startOver()`).

### Display

- Status tag text exactly: "Booked - awaiting check-in", "Checked in",
  "Completed", "Cancelled", each with an icon and its token colors; the awaiting
  tag adds "Check-in closes 2:15 PM" (or "Check-in opens 1:50 PM" before the
  window).
- Card: time range, patron name, "Party of 3", channel ("Desk", "Web",
  "Walk-in"). The All rooms grid also shows the library card last 4 (staff
  view, requested in review); the agenda does not.
- All times in `library.timezone`, `en-US`: "2:00 PM", ranges "2:00-3:00 PM".
- Patron names render as React text only (no `dangerouslySetInnerHTML`).
- Card, block and time-line positions may use `style` with CSS custom properties
  (`--top`, `--span`, `--col`) because they are computed at runtime; this is the
  only allowed inline style.

### States

- Empty day: the agenda shows open slots and "No bookings yet."; the grid shows
  every room open.
- Past day: "This day has passed." with no open-slot buttons or actions.
- Loading: `app/loading.tsx`. Unexpected error: `app/error.tsx` with "Try again".
- Stale action: message in an `aria-live="polite"` status region on the board.

## Testing

- Vitest (`npm test`; gate for steps 2 and 5):
  - `lib/clock.test.ts`: `zonedTimeToUtc` on a normal day, the spring-forward
    gap (02:30 on 2026-03-08 resolves to 03:30 EDT) and the fall-back overlap
    (01:30 on 2026-11-01 resolves to the first occurrence); `libraryDateString`
    near midnight.
  - `lib/schedule.test.ts`: opening hours per weekday; free slots with no
    bookings, back-to-back bookings, released and cancelled freeing time,
    clipping at now; room states at boundaries; available-now ordering;
    alternatives (same room later, other rooms by capacity, none -> empty).
  - `lib/booking-input.test.ts`: every validation rule and message, the "now"
    start, max length per type, outside opening hours, past start.
  - `lib/format.test.ts`: time and range formatting in `America/New_York`.
- Playwright (`npm run test:browser`, one worker):
  - `e2e/smoke.spec.ts`: h1 "Rooms" and "Maple Hollow Public Library" visible.
  - `e2e/staff-board.spec.ts`: scenario 1. Pick a random weekday between 2030
    and 2039, set the library time to that date at 10:00 AM with the time
    control, open Study Room A, book 2:00-3:00 PM from the open slot, then try
    2:30-3:30 PM; expect "This room is taken 2:00-3:00 PM", at least one
    alternative, and still only one card in that range. Also covers the step 3
    texts on the seeded today and the All rooms -> room link. `afterAll`
    presses Start over so the shared clock returns to today.
- No live-update, mobile or visual-fidelity evidence is claimed beyond the step 3
  screenshot.

## Notes for the AI

- Read the Next 16 docs named in step 1 before writing pages, actions or
  revalidation, and follow the `cacheComponents` rules. Note any confusing or
  wrong Next.js behavior for the agent-feedback pass.
- Server components fetch; client components only for the dialogs, the time
  control and anything else that needs interactivity. Keep `lib/server/*` out of
  client bundles.
- Every mutation goes through a SQL function so release-before-insert, the guard
  and its event stay in one transaction. Never compute library now on the client
  for a rule; the client only displays what the server sent.
- Native `<dialog>` with `showModal()`; label every field with `<label for>`, set
  `aria-invalid` and `aria-describedby` on invalid fields, focus the first
  invalid field after a failed submit, clear a field's error when it changes,
  announce the conflict panel with `role="alert"`, and return focus to the opener
  on close. Targets >= 24x24 px, visible focus ring from `--focus-ring`, respect
  `prefers-reduced-motion`.
- Status is always text + icon + color. Product language only.
- No new dependencies. Icons are a small inline SVG component.
- No em dashes in code, comments or UI copy; UI ranges use a hyphen.

## Decisions taken (flag in review)

- Moving a booking: one dialog changes room and/or time, with same-time free
  rooms as quick picks; checked-in bookings can change room only; staff only.
- Booking search matches patron name or card last 4 and highlights rather than
  hides, so open time stays visible.

- 30-minute boundaries; minimum 30 minutes; maximum 2 h for study rooms and 4 h
  for meeting and community rooms.
- Other days start empty and bookable; past days are read-only.
- The "Now" start option on today books from the current minute.
- Staff check-in uses the same 10-before / 15-after window as patrons.
- Manual release sets `released_at` to library now (report math still uses the
  rule time); Release is offered only once the check-in window has opened.
- Cancelled bookings are listed under the agenda, not drawn on the timeline or grid.
- Start over stays "today only"; the Playwright test isolates itself with a
  random far-future date and presses Start over afterwards.

## Implementation notes

- "Book" in Available now opens that room's agenda (the plan's wording) instead
  of opening the booking dialog directly; booking starts from an open slot.
- `0004_clock_updates.sql` adds a `WHERE` to the clock updates because Supabase
  rejects `UPDATE` without one on API requests.
- `getLibraryContext()` now reads library time from the database
  (`library_now()`), so app rules and SQL rules use the same clock even when the
  app server's clock drifts.
- `0005_seed_clock_ceil.sql` rounds the Start over clock offset up, so the
  library time never shows 1:54 PM for a fraction of a second after Start over.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":25739,"specSha256":"d714d0c867c8c85b921d4b700cdcd2184fac85416a200b177302ddd96dd2eb0c","branch":"refs/heads/feature/staff-board","head":"56157970b62a1e8781c6ef6f78afe81214cb271a","baseRef":"refs/heads/main","baseCommit":"56157970b62a1e8781c6ef6f78afe81214cb271a","sourceTree":"bf580afb75685afe2d97c2bafa9476262ace55ad","landing":"local-merge","absentOptional":[]} -->

## Try it now

Run or do:

npm run dev, open http://localhost:3000, choose All rooms, type "okafor" in Find a booking, open the match, press Move booking, pick a room under "Free at this time" and press Move booking.

Expected:

A toast at the bottom says "Moved Daniel Okafor to <room>, 2:00-3:00 PM." and the booking appears in the new room on the grid, with its old time open again.

This proves:

Staff can find a booking by patron name and move it to a free room in one flow, with the no-overlap rule enforced by the database.
