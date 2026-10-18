# Venue console redesign (owner, general manager, branch manager)

Approved-style companion to `../console/` (the platform-admin console), made on 2026-10-18.

- **Live design:** https://claude.ai/artifact/XCRUhudjStx4n1iteyk8uL. Read it with the Artifact tool, `action: "read"`.
- **Local copy:** `artboards/*.dc.html` + `artboards/canvas.json`. Each artboard's `DCLogic` script at the bottom is the interaction spec.
- **Check:** `node vcheck.cjs artboards/Menu.dc.html` renders the logic for all three roles and verifies every template hole.

## Screens and how they map to the code (`apps/web/src/console/venue/*`)

| Artboard | Screen | Existing code |
|---|---|---|
| Main | Overview: approvals with live countdown, today's KPIs, load by hour, today's bookings, "worth a look", onboarding checklist (tweak `setup`) | `VenueOverviewScreen.tsx`, `OnboardingChecklist.tsx`, approvals from `policy/AwaitingApprovalPanel.tsx` (moved to Overview) |
| Menu | Categories, dishes with in/sold-out switch, incomplete filter, dish drawer with every required field, bulk photos | `menu/*` |
| Rooms | Rooms, photos, table pins, QR, out-of-service tables | `rooms/RoomsEditorScreen.tsx` |
| Hours | Week, split day, copy to days, overnight "(next day)", overlap check, live "what a diner sees", leave-with-unsaved guard on branch switch | `hours/*` |
| Policy | Five groups, steppers with defaults and reset, live diner example, affected-bookings result | `policy/ReservationPolicyScreen.tsx` |
| Public | Page + listing saved separately, live app-card preview; address and map pin locked for non-owners | `public/*` |
| Reviews | Filters, hide with required reason, Yalla-hidden reviews locked | `reviews/*` |
| Staff | Grouped by role, role-based permissions ("Above your role"), 4-step add, PIN and sign-in link shown once, unlock PIN, deactivate, own PIN, tablets with one-time enrolment code and revoke | `staff/*` |
| Reports | Range presets + custom (max 92 days), branch / all-branches scope for owner and GM, summary deltas, revenue line with previous period and table toggle, reservations funnel, lead time, turn-time distribution with policy marker, menu rankings, voids, CSV export | `reports/*` |
| Account | Name, password, tablet PIN, language, sessions, sign out | new (`nav.settings`) |

## Role rules shown in the design (all from the code)

- **Branch switcher.** An owner or a general manager gets one in the sidebar. A branch manager sees only their fixed branch, as in `VenueLayout.tsx`.
- **All-branches reports.** Only an owner or a general manager can see them (`canRollUpVenue`).
- **Map pin and address.** Only an owner can change them (`canRelocate`).
- **Who manages whom:**
  - An owner manages everyone.
  - A general manager manages branch managers, waiters and kitchen.
  - A branch manager manages waiters and kitchen in their own branch.
  - Everyone else is shown as "Ձեր դերից բարձր" (above your role).

The visual system is the same as the admin console: tokens, type, 40px buttons and dialogs that handle Escape, Tab and focus return.

## Second review (2026-10-19, v12)

Added after rendering every artboard at 1440px: booking row actions on Overview (seat, nudge, no-show, cancel, release), category and dish reordering, special days on Hours, 4:3 room photos, today's shift per staff member, y-axes on every bar chart, per-section CSV, owner replies to reviews, locked-field styling for non-owners.

**Not in the backend yet:** review replies and special opening days need new endpoints. Booking row actions map to the existing reservation endpoints (approve, cancel, no-show, release, seat).

