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

Before feature 1 (setup, not features): run `/tests` for unit tests and
`/tests browser` for Playwright, and create the Supabase project and env vars.

- [ ] 1. **Data foundation and booking rules** - Supabase schema with `btree_gist` no-overlap constraint, today-relative Maple Hollow seed, per-session demo clock, derived status and check-in window rules, with unit tests
- [ ] 2. **Patron booking flow** - mobile-first browse rooms (capacity, location, amenities) -> slot -> confirm -> success with booking code and check-in instructions; Playwright scenario 1 (conflict blocked)
- [ ] 3. **Room door page and check-in** - `/r/{roomToken}` states (check in, too early, released, in use, free now with walk-in, taken with other rooms free now); Playwright scenarios 3, 4, 5, 6 and 8 (axe)
- [ ] 4. **Staff Today board** - rooms x hours grid with branch filter, text + icon + color statuses, Available now list, desk booking, staff check-in, cancel and release
- [ ] 5. **Live updates** - Supabase Realtime broadcast ping plus server refetch (polling fallback), live indicator and change highlight; Playwright scenario 2 (two browser contexts)
- [ ] 6. **Summary strip and report** - today's check-in rate, no-show rate, hours released and re-booked, conflicts prevented; date-range report with CSV export; Playwright scenario 7
- [ ] 7. **Landing page and guided tour** - product-language landing page (no "demo" wording) with patron and staff entries, a resumable guided tour across the real screens with in-tour time skips and "Start over"
- [ ] 8. **Demo readiness** - README (live URL, run, tests, start over, tour and time skips, door-page links) and Vercel production deployment
- [ ] 9. **Split view (optional)** - patron app in a phone-sized frame beside the staff board to show live sync on one screen
