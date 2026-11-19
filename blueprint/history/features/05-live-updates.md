# Feature: Live updates

**From build-plan:** feature 5
**Build attempt:** 1
**Branch:** feature/live-updates
**Status:** verified

## Goal

Every open screen (staff board, patron booking pages, booking page, door display,
`/r` check-in page) reflects a change made anywhere within 2 seconds, without a
manual reload. A successful mutation sends a "something changed" Supabase
Realtime broadcast ping. Each screen then refetches from the server. If Realtime
is unavailable, screens fall back to short polling. A small "Live" indicator
shows the connection state, and a subtle highlight marks what just changed.
Acceptance: Playwright scenario 2 (two browser contexts).

## In scope

- Server-side ping after every successful mutation in the existing Server Actions.
- One client subscription per browser tab, mounted in the root layout. It
  refreshes the current route through `router.refresh()`, coalescing repeated
  refreshes.
- A polling fallback when the subscription is not connected, or when the public
  Supabase env vars are missing in the browser.
- A slow periodic refresh while connected, so clock-driven changes such as
  no-show releases and the current-time line also appear. These changes send no
  ping.
- A refresh when a hidden tab becomes visible again.
- A "Live" indicator on the staff board header, the patron header and the door
  display.
- A change highlight on keyed elements whose content changed or that appeared
  after a live refresh.
- Playwright scenario 2, plus a polling-fallback check.
- Staff board agenda card redesign (added at the user's request during the
  build, step 5).

## Out of scope

- Streaming booking rows or any booking data to clients. The ping carries no
  booking data.
- Database triggers, `postgres_changes`, private channels or Realtime RLS
  policies, unless the step 2 check proves the project requires them. That
  outcome becomes a user decision (see Notes).
- Pings from render-time side effects (`ensureTodaySeeded`, `releaseOverdue`).
  The periodic refresh covers them.
- Optimistic UI, toasts for remote changes, and announcing remote changes to
  screen readers.
- README and deployment (feature 6).

## Build loop

`workflow.stepReview` is `feature`: build all steps in order and keep each step
working (lint, typecheck, `npm test` green). Then stop once for the feature
review before `/check`. `workflow.checkpointCommits` is `disabled`: no commits
during the build. `/complete` creates the single feature commit on
`feature/live-updates`.

## Build steps

- [x] **1. Server ping after mutations.** Add `lib/server/live.ts` (`server-only`)
  with `notifyChange(): Promise<void>`. It creates the channel `library-changes`
  on `supabaseAdmin()`, calls `httpSend("changed", {})` (REST, no subscribe),
  and always calls `removeChannel` in a `finally`. A failed or rejected send is
  logged with `console.error` and resolves without throwing, because the
  mutation already committed and polling covers a missed ping. Schedule the ping
  with `after(() => notifyChange())` from `next/server` so it never delays the
  action's response. Read `node_modules/next/dist/docs/` for `after` in Server
  Actions first, and confirm it runs after the action body. Call it on every
  success path that changes data:
  - `app/actions.ts`: create, check in, cancel, release, move, advance clock,
    set time, Start over.
  - `app/book/actions.ts`: `createWebBooking`, `checkInFromBookingPage`. A
    wrong-code attempt changes no visible data, so it sends no ping.
  - `app/r/actions.ts`: `checkInAtRoom`, `walkIn`.

  Paths that already call `refresh()` after a state change are the starting
  list. Confirm each against the action body. A failure, validation error or
  conflict sends no ping. Add `lib/server/live.test.ts`, mocking
  `@/lib/server/supabase`, to cover three cases: the event name `changed` with
  an empty payload is sent on `library-changes`; the channel is removed after
  success and after failure; and a `{ success: false }` result or a thrown error
  is logged and does not reject.
  **Done when:** `npm test` passes including `live.test.ts`; `npm run lint` and
  `npx tsc --noEmit` pass; every listed success path calls the ping exactly
  once, and no error path calls it (shown by diff review).

- [x] **2. Client subscription, refresh, fallback and indicator.** Add
  `app/_components/LiveProvider.tsx` (`"use client"`) and wrap `children` with
  it in `app/layout.tsx`. The provider:
  - Creates one browser Supabase client from `NEXT_PUBLIC_SUPABASE_URL` and
    `NEXT_PUBLIC_SUPABASE_ANON_KEY`, used for Realtime only, and subscribes to
    broadcast event `changed` on `library-changes`. It cleans up on unmount.
  - Refreshes on each ping through `startTransition(() => router.refresh())`.
    A ping that arrives during a refresh queues exactly one follow-up refresh.
  - Keeps a mode derived from the subscription status. `SUBSCRIBED` means
    `live`. Connecting, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`, or missing env
    vars mean `fallback`. Polling runs every 10 s in `fallback` and every 60 s
    in `live`. It also refreshes on `visibilitychange` to visible.
  - Exposes the mode through context.

  Put the pure mapping in `lib/live.ts` as `liveMode(status, hasConfig)`
  returning `{ mode, pollMs }`, with `lib/live.test.ts`. Add
  `app/_components/LiveIndicator.tsx`:
  - `live`: "Live" in the accent color, with the prototype's pulsing dot
    (`prototypes/staff-board.html`, `.live` and `.live-dot`). The dot is
    `aria-hidden`, and the pulse is off under `prefers-reduced-motion`.
  - `fallback`: the text "Reconnecting" in muted text with a static dot.
  - The text always carries the state, never color alone. Render it inside a
    `role="status"` element so mode changes are announced politely.

  Place the indicator in the board header (`app/_components/Board.tsx`), in
  `PatronHeader` (`app/book/_components/patron.tsx`), and in the door display
  header (`app/door/[roomToken]/page.tsx`). Check whether `/r/[roomToken]` and
  `/book/done/[bookingId]` render `PatronHeader`. If they do not, add the
  indicator to their header area. The existing per-minute door refresh in
  `DoorCode` stays.
  **Check:** with `npm run dev`, confirm that the subscription reaches
  `SUBSCRIBED` with the anon key on a public channel. If the project allows only
  private channels, stop and report it as a user decision. Do not add RLS
  policies inside this step.
  **Done when:** `npm test` passes including `lib/live.test.ts`; lint and
  typecheck pass. In two manually opened tabs, booking on the board updates the
  patron slot page without a reload, and the indicator reads "Live". Blocking
  the Realtime connection makes it read "Reconnecting", and changes still arrive
  within about 10 s.

- [x] **3. Change highlight.** Server markup adds `data-live-key` (a stable id)
  and `data-live-version` (a string of the fields that matter) to these
  elements:
  - staff board booking blocks and cards (`OpenPanelButton` or its wrapper),
    with version = status + start + end + room;
  - open-slot buttons (`OpenSlotButton`), with key `open:<roomId>:<startISO>`;
  - "Available now" entries;
  - patron start-time slots on `/book/[roomId]`, with key
    `slot:<roomId>:<value>` and version = state;
  - the patron room list's availability line, if it has one (check
    `app/book/page.tsx`);
  - the door display and `/r` status headline, with version = the headline text.

  Add `changedLiveKeys(before, after): string[]` to `lib/live.ts`. It returns
  the keys that are new or whose version changed, and ignores removed keys. An
  empty `before` (first render) returns nothing. Add unit tests for these cases.
  `LiveProvider` snapshots `[data-live-key]` just before a live or poll refresh.
  When the transition ends (the `isPending` true -> false effect), it sets
  `data-live-changed` on the changed elements and removes it after 2.4 s. A
  refresh triggered by the user's own action has no snapshot, so it highlights
  nothing. Add the CSS in `app/globals.css` using the existing
  `--changed-glow` token: a single 2.4 s glow, adapted from the prototype's
  `.changed` (play it once, not on infinite loop). Under
  `prefers-reduced-motion` show a static 2px accent outline for the same time
  instead of the animation. The highlight is supplementary. All state is
  already conveyed in text.
  **Done when:** `npm test` passes including the `changedLiveKeys` cases; lint
  and typecheck pass. Manually, a remote booking briefly highlights the new
  block on a second board tab and the newly taken slot on the patron page. The
  acting tab shows no highlight.

- [x] **4. Playwright scenario 2 and fallback.** Add `e2e/live-updates.spec.ts`
  using `e2e/support.ts` helpers (`setLibraryTime`, `freshWeekday`,
  `staffPage`). Each test uses its own date and restores with Start over in
  `afterAll`, as `staff-board.spec.ts` does. Confirm Room A's exact seeded name
  and the board's booking helper before reusing them.
  - **Scenario 2:** a patron context opens `/book/<Room A id>?date=<day>` and
    sees the 4:00 PM link. A staff context books Room A at 4:00 PM from the
    board. Without reload, the patron page shows 4:00 PM as "Taken" (no link)
    within `{ timeout: 2000 }`. The patron indicator reads "Live".
  - **Fallback:** in the patron context, `context.routeWebSocket` closes the
    Realtime socket (match the Supabase realtime URL). The indicator reads
    "Reconnecting". A staff booking appears on the patron page within 15 s.
  **Done when:** `npm run test:browser` passes `live-updates.spec.ts` and the
  existing specs still pass on one worker.

- [x] **5. Agenda card redesign (user request).** On the staff board's By room
  agenda (`app/_components/RoomAgenda.tsx`), booking cards take the All rooms
  block look: a rounded, status-tinted box with a full status-colored border,
  and the status as icon plus colored text. There is no status pill and no
  thick left stroke. Share the block styles between `AllRoomsGrid` and the
  agenda instead of duplicating them. Cards keep their time position but grow
  to fit their content (min-height = duration, no clipping). Desktop lays
  each card out as one wrapping row: name, time range, party and channel,
  status, then actions at the end. "Check in" stays a visible primary button.
  Move, Release and Cancel go behind a "More actions" button, which opens a
  popover (`popover="auto"`: light dismiss and Esc). The popover holds a
  plain button group, not an ARIA menu. On desktop it is anchored under the
  trigger with CSS anchor positioning. On narrow screens, and in browsers
  without anchor positioning, it is a bottom sheet. Choosing an action closes
  the popover. Confirm dialogs and the Move dialog return focus to the
  "More actions" button. The hour column is narrower on mobile, with short
  "10 AM" labels. The booking side panel (`BookingPanel`) keeps its full
  button row.
  **Done when:** lint, typecheck and `npm test` pass. The full browser suite
  passes, with existing agenda tests updated to open "More actions" where they
  used Cancel, Release or Move directly. A phone-sized screenshot shows the
  cards uncut, with the bottom sheet open.

## Files / areas

- New: `lib/server/live.ts`, `lib/server/live.test.ts`, `lib/live.ts`,
  `lib/live.test.ts`, `app/_components/LiveProvider.tsx`,
  `app/_components/LiveIndicator.tsx`, `e2e/live-updates.spec.ts`.
- Changed: `app/layout.tsx`, `app/actions.ts`, `app/book/actions.ts`,
  `app/r/actions.ts`, `app/_components/Board.tsx`,
  `app/_components/OpenPanelButton.tsx`, `app/_components/OpenSlotButton.tsx`
  (or the server markup wrapping them), `app/book/_components/patron.tsx`,
  `app/book/[roomId]/page.tsx`, possibly `app/book/page.tsx`,
  `app/door/[roomToken]/page.tsx`, `app/r/_components/RoomCheckIn.tsx` or
  `app/r/[roomToken]/page.tsx`, `app/globals.css`.
- No migrations. No new dependencies: `@supabase/supabase-js` 2.119 already
  provides `channel().httpSend()` and broadcast subscribe.

## Data / contracts

- **Channel:** `library-changes` (public broadcast channel). **Event:**
  `changed`. **Payload:** `{}`. Clients ignore the payload. Any `changed` event
  only triggers a server refetch.
- **Trust:** the anon key is public, so anyone could send a fake ping. The only
  effect is a coalesced refetch from the server, and no data is trusted from the
  message. The service-role key stays in `lib/server/` only. The browser client
  uses only `NEXT_PUBLIC_*` vars.
- **Timing:** ping -> refresh well under 2 s (scenario 2). Fallback poll is
  10 s, connected poll is 60 s, and the highlight lasts 2.4 s. These are
  internal, reversible values kept as named constants in `lib/live.ts`.
- **Mode mapping** (`liveMode`): `SUBSCRIBED` + config -> `{ mode: "live",
  pollMs: 60000 }`. Anything else -> `{ mode: "fallback", pollMs: 10000 }`.

## Testing

- Vitest (gate on): `lib/server/live.test.ts` (ping shape, channel cleanup,
  failure swallowed and logged) and `lib/live.test.ts` (`liveMode`,
  `changedLiveKeys`).
- Playwright: `e2e/live-updates.spec.ts`, covering scenario 2 within 2 s across
  two browser contexts, plus the polling fallback with the socket blocked. It
  needs a real Supabase project with Realtime enabled, read from `.env.local`.
- UI evidence: the indicator in both modes and the highlight, checked in the dev
  server during `/check`. No visual evidence is claimed in this spec.

## Notes for the AI

- Read the Next 16 docs in `node_modules/next/dist/docs/` for `after`,
  `router.refresh` and `useTransition` before using them. The project already
  uses `refresh()` from `next/cache` in actions; keep those calls.
- `router.refresh()` keeps client state, so open dialogs, form inputs and focus
  survive a live refresh. Do not remount or key the provider on refresh.
- Never render the ping payload. Never stream booking rows.
- No "demo", "mock" or "test" wording in the UI.
- If Realtime turns out to require private channels (step 2 check), stop and
  ask before adding RLS on `realtime.messages`. That is a security-boundary
  choice.

## Build notes

Decisions made during the build that differ from or settle the steps above:

- **Browser key name (user decision).** The browser reads
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase's current name, already set
  in `.env.local`), not `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `.env.example` is
  updated to match. Feature 6 sets the same name in Vercel.
- **Confirm page skips live refresh (user decision).** A live refresh on
  `/book/[roomId]/confirm` replaced the half-filled form with "no longer
  available" and dropped feature 3's free alternatives. `isLivePaused` (in
  `lib/live.ts`, unit-tested) skips refreshes there, checked against
  `window.location.pathname`. `PatronHeader live={false}` hides the indicator on
  that page. Every other page stays live. `usePathname()` was not used because,
  in the root layout, it blocks prerendering under this project's Next 16
  config.
- **Indicator is not a live region.** `role="status"` was dropped. A second
  status region on every page competed with the real status messages (toasts,
  check-in results) for screen readers and broke a dozen existing
  `getByRole("status")` tests. The state is shown as visible text: "Live",
  "Connecting" (first load only) and "Reconnecting".
- **Board open-slot buttons are not keyed for highlight.** The first open slot
  starts at "now", so its key changed on every poll and would glow
  constantly. New and changed booking blocks and cards, Available now entries,
  patron start-time slots (key includes the date), the patron room list, and
  the door and `/r` status are keyed.
- **Realtime check (step 2).** An anon/publishable-key subscriber on the public
  `library-changes` channel reached `SUBSCRIBED` and received the server's REST
  ping in 158 ms. No private channel or RLS was needed.
- **Existing test adjusted.** `staff-board.spec.ts` "toasts confirm success and
  explain failures" tests a deliberately stale board. Live refresh now prevents
  that state, so the test blocks the Realtime socket and pauses the page clock
  before the other tab's Start over. The assertions are unchanged.
- **Manual two-tab checks** in steps 2 and 3 were covered by the Playwright
  specs (scenario 2 checks both the update and the highlight on the patron
  page). The highlight on the board and door display was not checked visually.
- **Phone testing in dev.** A phone opening the dev server at the machine's LAN
  address stayed on "Connecting": Next 16's dev server blocks its scripts for
  hostnames other than `localhost`, so the page never hydrated. `next.config.ts`
  now sets `allowedDevOrigins` to this machine's LAN IP (dev only; update it if
  the IP changes).

- **Agenda redesign (step 5).** The block look is shared as `STATUS_BLOCK` in
  `StatusTag.tsx` (the old `CARD_EDGE` is gone). `BookingActions` takes
  `layout="menu"` on agenda cards and keeps the full row in `BookingPanel`.
  The popover styles live in `globals.css` (`.action-sheet`). Screenshots
  were taken of the production build (`next start` on port 3100 with a
  temporary Playwright config): phone bottom sheet, and a desktop menu that
  flips above its button near the window edge. The long-running dev server
  never served the new stylesheet after Next.js restarted it for the
  `next.config.ts` change, so restart `npm run dev` to see it locally.
- **Agenda timeline grows with its cards (user request).** The agenda is a CSS
  grid with one row per 5 minutes (`minmax(hour/12, auto)`), so a card that
  needs more room grows its rows, and hour lines, open slots and the time line
  move down instead of being covered. `gridRows` in `lib/schedule.ts`
  (unit-tested) maps times to grid lines, rounding start and end the same way
  so neighbours never share a row. The current-time line uses explicit
  columns, because an auto-placed item would be pushed beside the card in
  its row. The sheet item now reads "Cancel booking" (also in the side
  panel).
- **"Testing tools" label (user request).** The staff board header groups
  +15 min, Set time and Start over under a small "Testing tools" label
  (`role="group"`, labelled). This is a deliberate exception to the
  overview rule against "test" wording in the UI: these controls are not
  part of the product, and the README (feature 6) will say so.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":18444,"specSha256":"7260a5104034221b869ba8258bb1d60a20bb28198a37ccaa6547be187c7a769d","branch":"refs/heads/feature/live-updates","head":"58a3714f3c2eb18813ac257e476fad069daea11e","baseRef":"refs/heads/main","baseCommit":"58a3714f3c2eb18813ac257e476fad069daea11e","sourceTree":"dffc025bf3db828a24c68d131a15bb5a6890b59c","landing":"local-merge","absentOptional":[]} -->

## Try it now

Run or do:

With `npm run dev` running, open the staff board at http://localhost:3000 in
one browser window and http://localhost:3000/book in another (or on a phone on
the same network). In the patron window, open Study Room A and keep its start
times showing. On the board, book Study Room A from an open slot later today.

Expected:

Within about 2 seconds, without reloading, the patron window shows that start
time crossed out as "Taken", with a short green glow. Both windows show "Live"
in the header.

This proves:

A staff booking reaches another open screen live through the Realtime ping and
server refetch, with the change highlighted.
