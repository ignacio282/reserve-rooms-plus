# Feature: Patron booking flow

**From build-plan:** feature 3
**Build attempt:** 1
**Branch:** feature/patron-booking-flow
**Status:** verified

## Goal

Give patrons a mobile-first way to book a room at `/book` with no account: browse
rooms (type, capacity, location, amenities, free now), pick a room, a day and an
open time, confirm with name, card last 4 and party size, and land on a success
screen with the booking code, the check-in window and how to check in. Bookings
use the same database rules as the desk, so a slot lost a second before
confirming shows a friendly message with the next free times.

## Design reference

- Tokens and components from the staff board (`app/globals.css`, `Icon`, status
  colors). No patron prototype exists; follow the plan's UI rules: mobile-first,
  one main action per screen, big buttons (targets >= 44x44 px), plain language,
  generous white space.

## In scope

- `/book`: room list with a type filter, each room's details and whether it is
  free now.
- `/book/[roomId]`: room details, day choice, open start times and length.
- `/book/[roomId]/confirm`: summary plus name, card last 4, party size; submit.
- `/book/done/[bookingId]`: success screen with room, day, time, booking code,
  check-in window and how to check in.
- Slot lost at confirm: friendly message with the next free times.
- Loading, empty, invalid, unexpected-error and not-found states for these routes.
- Playwright coverage on a phone-sized viewport.

## Out of scope

- Check-in, walk-in, door display (feature 4); live updates (feature 5).
- Cancelling or changing a booking as a patron; accounts; email/SMS.
- Changes to the staff board beyond moving a shared helper.

## Build loop

`workflow.stepReview` is `feature` and `workflow.checkpointCommits` is
`disabled`: build all steps in order on `feature/patron-booking-flow`, running
each step's checks before moving on, with no per-step review stop and no
checkpoint commits. Stop for review after the last step. `/complete` creates the
feature commit.

## Build steps

- [x] **1. Patron schedule logic and data loading.**
  Pure additions to `lib/schedule.ts`: `bookingDays(today, count)` (today plus
  the next `count - 1` days as `YYYY-MM-DD`), `startSlots(open, busy, now,
  timeZone)` (every 30-minute start inside opening hours, with `available`
  false when it is past, inside a busy interval, or has less than 30 minutes
  before the next busy start or closing) and `lengthOptions(start, busy, close,
  maxMinutes)` (30-minute steps up to the room maximum, closing and the next
  busy start). New `lib/server/patron.ts` (`server-only`) that loads rooms, a
  day's busy intervals per room (times only, never patron data) and each room's
  state now (reusing `roomStateAt`). Move the conflict-alternatives helper from
  `app/actions.ts` to `lib/server/alternatives.ts` so both action files share it.
  Read the Next 16 docs on dynamic route `params` and `searchParams` (Promises
  under Cache Components), `redirect` from Server Actions and `notFound` before
  step 2.
  **Done when:** `npm test` passes with the new tests in Testing; the staff board
  browser tests still pass.

- [x] **2. Room list at `/book`.**
  `app/book/layout.tsx` (patron header: library name and "Book a room"; no staff
  controls) and `app/book/page.tsx`. Type filter as links (`?type=study|meeting|
  community`, default all) with `aria-current`. One card per active room: name,
  type, "Up to N people", location, amenity pills, and a state line with a dot
  and text ("Free now until 3:00 PM", "In use until 3:00 PM", "Booked now",
  "Closed now"). Each card is one link to `/book/<id>`. Empty filter result: "No
  rooms of this type." Request-time data inside `<Suspense>` with a loading line;
  `app/book/error.tsx` with "Try again".
  **Done when:** at a phone width the page shows the eight seeded rooms in one
  column and the filter narrows them; build and lint pass.

- [x] **3. Day and time at `/book/[roomId]`.**
  Room heading and details; a day choice for today and the next 6 days (links,
  `?date=`, labelled "Today", "Tomorrow", then "Fri, Nov 20"); the day's start
  times as large buttons in a grid. Unavailable times show the word "Taken" or
  "Past" (not color alone) and cannot be selected. Choosing a start
  (`?start=HH:MM`, server-rendered) reveals its length options ("30 min",
  "1 hour", "1 hour 30 min", "2 hours", only those that fit) as links to the
  confirm page. No open time that day: "No open times on this day. Try another
  day." with the next day's link. Unknown or inactive room id: `notFound()`;
  invalid or out-of-range date: today.
  **Done when:** taken and past times on the seeded day are disabled, a free
  start shows only lengths that fit before the next booking; build passes.

- [x] **4. Confirm, create and success.**
  `/book/[roomId]/confirm?date=&start=HH:MM&end=HH:MM` shows room, day and time
  plus a form (name, card last 4, party size 1..capacity) and one main button
  "Book this room". Server action `createWebBooking` (`app/book/actions.ts`)
  validates with `validateDeskBooking`, calls `create_booking` with
  `channel = 'web'` and `created_by = 'patron'`, and on success redirects to
  `/book/done/<bookingId>`. On a conflict the page keeps the typed values and
  shows "Sorry, someone just booked this time." with up to 3 next free times in
  this room and other free rooms as links that reopen the confirm page with
  those values. Invalid query values show "This time is no longer available.
  Choose another time." with a link back. `/book/done/[bookingId]` shows a
  success heading, room, day, time, the booking code in large mono characters,
  "Check in between 1:50 and 2:15 PM or the room is released.", "To check in,
  scan the code on the room's door display, or ask at the front desk." and a
  "Book another room" link. If the booking is no longer active it says so
  plainly ("This booking was cancelled." / "This booking was released.").
  **Done when:** booking a free slot lands on the success screen with a
  6-character code and the right window; the staff board shows it with channel
  "Web"; a forced conflict shows the friendly message; build passes.

- [x] **5. Browser coverage and final checks.**
  `e2e/patron-booking.spec.ts` per Testing, on a phone-sized viewport.
  **Done when:** `npm run test:browser`, `npm test`, `npx tsc --noEmit`,
  `npm run lint` and `npm run build` pass.

## Files / areas

- `app/book/layout.tsx`, `app/book/page.tsx`, `app/book/error.tsx`,
  `app/book/[roomId]/page.tsx`, `app/book/[roomId]/confirm/page.tsx`,
  `app/book/done/[bookingId]/page.tsx`, `app/book/actions.ts`,
  `app/book/_components/` (new)
- `lib/schedule.ts`, `lib/schedule.test.ts` (additions)
- `lib/server/patron.ts`, `lib/server/alternatives.ts` (new); `app/actions.ts`
  (imports the moved helper)
- Reuse `lib/server/board.ts`, `lib/server/library.ts`, `validateDeskBooking`,
  `MAX_MINUTES_BY_TYPE`, the `create_booking` database function
- `e2e/patron-booking.spec.ts` (new)

## Data / contracts

### URLs

- `/book?type=study|meeting|community`
- `/book/<room uuid>?date=YYYY-MM-DD&start=HH:MM`
- `/book/<room uuid>/confirm?date=YYYY-MM-DD&start=HH:MM&end=HH:MM`
- `/book/done/<booking uuid>`

Every query value is re-validated on the server. Room ids must be uuids of active
rooms. Dates outside today..today+6 (library clock) fall back to today on the
room page and are rejected on the confirm page.

### Rules

- Same booking rules as the desk: 30-minute boundaries, opening hours, no past
  start, max length by room type (study 2 h, meeting and community 4 h), party
  size 1..capacity, name 1-80 characters, card last 4 exactly 4 digits.
- Patrons can book today plus the next 6 days (library clock).
- Patron bookings: `channel = 'web'`, `created_by = 'patron'`, event actor `patron`.
- Patron pages never receive other bookings' patron names, cards or codes; only
  busy time ranges.
- Server action results follow the existing shape (`{ success, error,
  fieldErrors?, conflict? }`); unexpected errors log on the server and show
  "Something went wrong. Try again."

### Success screen

- Window text uses the library's `early_checkin_min` and `checkin_window_min`:
  "Check in between <start - 10> and <start + 15> or the room is released."
- The booking id in the URL is an unguessable uuid. The page shows room, day,
  time, booking code and status only; never the card number or name.

## Testing

- Vitest (`npm test`): `lib/schedule.test.ts` additions for `bookingDays` across
  a month end; `startSlots` with past, taken and available times, the "less
  than 30 minutes before the next booking" case and closing; `lengthOptions`
  stopping at the next booking, at closing and at the room maximum.
- Playwright (`npm run test:browser`), `e2e/patron-booking.spec.ts` with a phone
  viewport (`test.use({ ...devices["Pixel 7"] })`):
  - Set the library time to a random weekday between 2030 and 2039 at 10:00 AM
    through the staff board. Then `/book` lists rooms; filter "Meeting rooms";
    choose a room; pick a time; pick "1 hour"; fill the form; "Book this room";
    expect the success heading, a 6-character code and "Check in between".
  - The staff board shows that booking with "Web".
  - Slot lost: open the confirm page for a time, book the same time from the
    staff board in another page, then submit; expect "Sorry, someone just booked
    this time." and at least one alternative link.
  - `afterAll` presses Start over.

## Notes for the AI

- Server components fetch; client components only where interaction needs it
  (the confirm form with `useActionState`). Prefer links and server rendering so
  the flow works on weak connections and back/refresh behave.
- Forms: labelled fields, `inputMode="numeric"` for card last 4, `aria-invalid`
  and `aria-describedby` for errors, focus the first invalid field, clear a
  field's error on change, `role="alert"` for the conflict message. Patron pages
  use inline messages, not toasts.
- Product language only; no em dashes; times in the library timezone.

## Decisions taken (flag in review)

- Patrons can book today and the next 6 days.
- Lengths offered in 30-minute steps up to the room maximum.
- Four screens (rooms -> day and time -> confirm -> done), each with one main
  action, URL-driven so back and refresh work.
- The room list shows free-now state for today (the library clock's day) only.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":10447,"specSha256":"c848403809b8110cf4503b15b1cd6b864281fc51ae56b194a0b924fa9ca24264","branch":"refs/heads/feature/patron-booking-flow","head":"18a775faf6ee1f5bafa38506ee235a95d0a7b81c","baseRef":"refs/heads/main","baseCommit":"18a775faf6ee1f5bafa38506ee235a95d0a7b81c","sourceTree":"1622ed4fab17457cf27471f561c78bd6c0781e68","landing":"local-merge","absentOptional":[]} -->

## Try it now

Run or do:

npm run dev, open http://localhost:3000/book, choose a room, tap a green start time, pick a length, enter a name, card 1234 and party size 2, then tap Book this room.

Expected:

"Your room is booked" with the room, time, a 6-character booking code and "Check in between ... or the room is released" with check-in steps; the staff board at / shows the booking with channel "Web".

This proves:

A patron can book a room on a phone without an account and receives the booking code and check-in instructions.
