# Venue console redesign: handoff

Everything a fresh session needs to implement the approved venue console
redesign (owner, general manager, branch manager) in `apps/web`, plus the
backend gaps in the `Yalla` repo. The design was approved by the user on
2026-10-19 after two ui-ux review rounds, the second one on real 1440px
renders. The artboards are the spec; section 6 says what wins when they
disagree with the code.

Read `../console/HANDOFF.md` first: the platform-admin handoff holds the visual
system, the accessibility rules and the working rules, and this document only
adds what differs. Both consoles share one shell (sidebar, cards, dialogs,
toasts), so build the shell once.

## 1. Where the design lives

| What | Where |
|---|---|
| Live design (canvas, clickable) | https://claude.ai/artifact/XCRUhudjStx4n1iteyk8uL (version 12). Read it with the Artifact tool, `action: "read"`. |
| Same files, local | `artboards/*.dc.html` + `artboards/canvas.json` |
| Behaviour check | `node vcheck.cjs artboards/Menu.dc.html` renders the logic for all three roles and verifies every template hole |
| Photos | the artboards reference `/_blob/<id>` assets of that artifact; for the app use the real photo pipeline, never these files |

Each `.dc.html` carries the interaction spec in its `class Component extends
DCLogic` script: states, validation messages, which button is disabled when,
toast texts, undo. Read it instead of guessing. The `role` tweak in
`data-props` (owner / generalManager / manager) must be reproduced from the
signed-in user's role.

## 2. Screens

The venue nav has four groups: Այսօր (Ամփոփում), Վայրը (Ճաշացանկ, Սրահներ և
սեղաններ, Աշխատաժամեր, Ամրագրման կանոններ, Հանրային էջ), Թիմ (Աշխատողներ),
Արդյունքներ (Կարծիքներ, Հաշվետվություններ). Իմ հաշիվը opens from the person
block at the bottom of the sidebar. Nav badges show live counts: pending
approvals, incomplete dishes, reported reviews.

| Artboard | Screen | Existing code (`apps/web/src/console/venue/`) |
|---|---|---|
| Main | Overview: approvals with a live 15-minute countdown and decline-with-reason, today's KPIs (bookings, in room, open tabs, revenue), load by hour with a capacity line, today's bookings with a ⋮ menu per row, "worth a look", onboarding checklist (tweak `setup`) | `VenueOverviewScreen.tsx`, `OnboardingChecklist.tsx`; approvals from `policy/AwaitingApprovalPanel.tsx` |
| Menu | Categories (reorderable), dishes with in/sold-out switch and reorder arrows, incomplete filter, dish drawer with every required field, bulk photos | `menu/*` |
| Rooms | Rooms, 4:3 photos, table pins (arrow keys too), QR, out-of-service tables, sticky save bar, conflict banner | `rooms/RoomsEditorScreen.tsx` |
| Hours | Week with split day, copy to days, overnight "(next day)", overlap check, special days, live "what a diner sees", unsaved guard on branch switch | `hours/*` |
| Policy | Five groups, steppers with defaults and reset, live diner example per group, affected-bookings result after save | `policy/ReservationPolicyScreen.tsx` |
| Public | Page + listing saved separately, live app-card preview; address and map pin read-only for non-owners | `public/*` |
| Reviews | Filters, owner replies, hide with a required reason, Yalla-hidden reviews locked | `reviews/*` |
| Staff | Grouped by role, today's shift line, "above your role" lock, 4-step add, PIN and sign-in link shown once, unlock PIN, deactivate, own PIN, tablets with one-time enrolment code and revoke | `staff/*` |
| Reports | Range presets + custom (max 92 days), branch / all-branches scope, summary deltas, revenue line with previous period and table toggle, per-section CSV, reservations funnel, lead time, turn-time distribution with policy marker, menu rankings, voids | `reports/*` |
| Account | Name, password, tablet PIN, language, sessions, sign out | new (`nav.settings`) |

## 3. Settled decisions (do not reopen)

- **Desktop only.** No phone layout work now; the user said so.
- **Room photos are 4:3**, same frame as dish and cover photos. The user chose this over a zoom control.
- **Role rules come from the code**, not the design: branch switcher for owner and GM only (`VenueLayout.tsx`), all-branches reports for owner and GM (`canRollUpVenue`), map pin and address for owner only (`canRelocate`), and who manages whom follows the server's rank check (owner > GM > manager > waiter, kitchen; a manager only in their own branch).
- **PINs and sign-in links are shown once** to copy; never emailed. Closing without copying warns once.
- **Red only for real failures**; not-ready states are amber. Chroma means state or the one action.
- **Hide a review only for a rule violation**, never for a bad rating; the reason is required and the Yalla team sees every hidden review.

## 4. What the backend already has (`Yalla` repo)

- Venue: `GET /api/venues/{id}/manage`; staff `GET/POST /api/venues/{id}/staff`, `PATCH …/{staffId}`, `POST …/{staffId}/pin`, `POST …/{staffId}/sign-in`
- Branch settings: `GET/PUT …/public-profile`, `…/listing`, `…/reservation-policy`, `…/opening-hours`; `GET …/readiness`
- Rooms: `GET/PUT …/floor-plan`, floor areas, `DELETE …/tables/{id}`, `POST /api/tables/{id}/regenerate-qr`
- Menu: `GET …/menu/manage`, categories and items CRUD, `POST …/items/{id}/availability`; categories and items already carry `DisplayOrder`, so reordering needs no new endpoint
- Reservations: `GET …/reservations`, `GET …/reservations/awaiting`, `POST /api/reservations/{id}/approve|reject|cancel|no-show|release|extend-hold`
- Tables (counter session): `POST …/tables/{id}/seat-reservation|seat-walk-in|free|hold…`
- Reviews: `GET …/reviews`, `PUT …/reviews/{id}/visibility`
- Reports: `GET …/reports/occupancy|reservations|revenue|menu|staff`
- Devices: `GET …/devices`, `POST …/devices/enrolment-codes`, `POST …/devices/{id}/revoke`, `POST …/staff/{id}/clear-pin-lockout`
- Account: `POST /api/auth/venue/request-password-reset`, `…/reset-password`, `…/sign-out`; `GET /api/auth/staff/roster`

Hooks live in `packages/api/src/react`, the gateway in
`packages/api/src/http/consoleHttpGateway.ts` (mock: `consoleMock`).

## 5. Backend gaps (red-first tests, contract types regenerated)

1. **Overview numbers**: today's bookings by status, people in the room now, open tabs with unpaid total, today's revenue vs the same weekday last week, booked people per hour for today. One `GET /api/branches/{id}/overview` is enough.
2. **Special opening days** (holidays, closures, different hours on one date) overriding the weekly hours. Needs a model, `GET/PUT …/opening-hours/exceptions`, and the public availability must honour it.
3. **Review replies**: one public reply per review by owner, GM or manager, editable. `PUT …/reviews/{id}/reply`, shown in the diner app too.
4. **Today's shift per staff member**: there is no shift model. Either add a minimal one (date, from, to per staff member) or leave the shift line out until it exists. Ask the user.
5. **Account**: change own name and password while signed in. The reset-by-link flow exists; a signed-in change does not.
6. **Booking row actions from the console**: `no-show`, `release` and `seat-reservation` are counter-session endpoints today. Decide whether the console may call them with a console token, or whether the row menu only offers approve, reject and cancel.

## 6. Decisions for the implementer, ask the user before building

- **Approvals live on Overview in the design**, on the Policy screen in the code. The design is the intended place; confirm, then move the panel.
- **Shift line** (gap 4): build a minimal model or drop the line.
- **Console calling counter endpoints** (gap 6).

## 7. Suggested order

1. Shared shell with both consoles' tokens (one sidebar component with role-driven groups and badges), Account screen.
2. Overview with the overview endpoint and approvals moved in.
3. Menu (reorder via `DisplayOrder`), Rooms (4:3), Hours with special days.
4. Policy, Public, Reviews with replies.
5. Staff with the shift decision, Reports with per-section CSV.

Ship each phase as a PR pair when backend changes are involved. Working rules
(red-first tests, i18n parity hy/ru/en, temp git index, merge when CI is
green, report at the end) are in `../console/HANDOFF.md` section 7.
