# Build Plan

List the features that make up your project, high level and in rough build order.
Keep each item to one line; the details come later in `/feature`.

Plain bullets are fine. When both planning docs are ready, run `/overview`.
It adds tracking numbers and checkboxes to your feature list before generating
the project overview.

Run `/feature` to spec the next unchecked item, or `/feature 2` to pick one.
Keep completed items checked and append new features as the project grows.
Do not renumber completed features; their archived specs refer to those IDs.

Scaffolding the app and prototyping its look are pre-build steps, not features.
Start with your first real slice of functionality.

## Your features

Setup already done: Vitest (`npm test`) and Playwright (`npm run test:browser`).
Before feature 1: create the Supabase project and env vars.

- [x] 1. **Data foundation and booking rules** - single-branch Supabase schema with `btree_gist` no-overlap constraint, today-relative Maple Hollow seed, shared library clock, derived status and check-in window rules, rotating check-in code generation and verification, report math; unit tests (incl. scenario 7)
- [ ] 2. **Staff board** - at `/`: day navigation, By room agenda (default, bookings made from open slots) and All rooms grid, released time shown as open, one status tag per booking, current-time line, Available now, check-in / cancel / release, "Show check-in code", conflict message with alternatives, library time control and Start over; Playwright scenario 1
- [ ] 3. **Patron booking flow** - `/book`, mobile-first: browse rooms (type, capacity, location, amenities) -> slot -> confirm -> success with booking code and check-in instructions
- [ ] 4. **Door display and check-in** - `/door/{roomToken}` with a code and QR that change every 60 s; `/r/{roomToken}` check-in requiring the current room code plus booking code or card last 4, with too early, released, in use, free now with walk-in, taken and expired-code states; Playwright scenarios 3, 4, 5, 6, 8 (axe) and expired code
- [ ] 5. **Live updates** - Supabase Realtime broadcast ping plus server refetch (polling fallback), live indicator and change highlight across screens and devices; Playwright scenario 2 (two browser contexts)
- [ ] 6. **Ship it** - README (live URLs, run, tests, start over, library time control, each room's door display and check-in links) and Vercel production deployment
