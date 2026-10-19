# Floor tablet redesign: handoff

Everything a fresh session needs to implement the approved floor tablet
redesign (`/staff`: the waiter's floor and the kitchen screen) in `apps/web`,
plus the three backend gaps in the `Yalla` repo. The design was made on
2026-10-19 and went through two ui-ux review rounds on real 1280×800 renders,
the second a scripted audit (contrast, target size, naming, spacing, focus).
The artboards are the spec for look and flow; section 3 says where the code's
rules win over them.

Read `../console/HANDOFF.md` first for the shared visual system, accessibility
rules and working rules (section 7 there). This document only adds what the
tablet does differently. The tablet does **not** share the console shell: it
has its own top bar and no sidebar, but the same tokens, type and colour rules.

## 1. Where the design lives

| What | Where |
|---|---|
| Live design (canvas, clickable) | https://claude.ai/artifact/3yC3gKSzFPmvtHfoznY2Fu (version 12). Read it with the Artifact tool, `action: "read"`. |
| Same files, local | `artboards/*.dc.html` + `artboards/canvas.json` |
| Behaviour check | `node vcheck.cjs artboards/Table.dc.html` renders the logic for every tweak value and verifies every template hole |
| Dish photos | `/_blob/<id>` assets of that artifact; the app uses the real menu photos |

Each `.dc.html` carries the interaction spec in its `class Component extends
DCLogic` script: states, messages, disabled rules, toasts, timers. Read it
instead of guessing. Tweaks in `data-props` are design-time switches the app
derives from real data: `state` on Table and Pin, `connection` on Main and
Order.

## 2. Screens

All artboards are 1280×800 landscape, a 10–11" tablet in a stand. One top bar
everywhere: brand, venue and branch, Սրահ / Խոհանոց view tabs (Խոհանոց carries
the count of tickets waiting), the connection chip, the conflicts chip when
there are any, and the signed-in person (tap → PIN gate to switch).

| Artboard | Screen | Existing code (`apps/web/src/staff/`) |
|---|---|---|
| Main | Floor: room filter chips, legend, table grid (4 columns, state in text and border, not colour alone), right rail "Հիմա" with approvals (live countdown, approve / decline), calls ("Գնում եմ" acknowledges), ready orders, things to resolve | `FloorRoute.tsx`, `StaffHeader.tsx`, `TableList.tsx`, `ApprovalPanel.tsx`, `OrderQueuePanel.tsx` |
| Table | 560px panel over the dimmed floor. Free: seat walk-in with a party stepper, seat the booking that is due, hold, out of service. Occupied / over turn: order, tab, cash, free with confirm. Held: seat, extend 15 min, release as no-show or as cancelled. Out of service: the bookings it stranded | `TableActionPanel.tsx`, `seatedMinutes.ts` |
| Order | Categories with counts, search with an empty state, dish grid with photos and sold-out badge, draft lines with stepper, per-line "who" (table-shared or a named guest) and note, send → confirmation; offline queues it and says so | `OrderEntry.tsx`, `useCachedMenu.ts` |
| Tab | Lines with status pills, void with a reason, comp per line or % off the whole tab with a reason, bill request from the app (whole bill / my share, pre-fills Cash), totals with the 10 % service charge, mark unpaid with typed ԿՈՐՈՒՍՏ | `TabPanel.tsx`, `billRequestText.ts` |
| Cash | Amount owed, app-request prefill, amount + tip, quick amounts, keypad, overpay → change, partial → what is left, done card | `CashKeypad.tsx` |
| Kitchen | Counts new / waiting / late (late ≥ 12 min, and the badge says "ուշ" in words), sort by age or table, horizontal snap board with a "ևս N" hint, notes and allergen warnings per line, one action: Պատրաստ է | `KitchenRoute.tsx`, `chime.ts` |
| Pin | Gate over the blurred floor: people list, "Ուրիշ մեկը" with staff ID, 4 dots, keypad, wrong / locked / offline states | `auth/PinScreen.tsx`, `StaffRoute.tsx` |
| Conflicts | One card per command the server refused after reconnecting (discard, or send anyway where it is safe), the sync queue, offline note | `ConflictList.tsx`, `commands/*`, `live/*` |

## 3. Settled rules (the code wins; do not reopen)

- **Landscape tablet only.** No phone layout.
- **Staff sizes, not console sizes:** 18px base text, running text at least 13px (12px only for count badges), primary actions 56–64px tall, every target at least 44×44 with 8px between neighbours, pressed state instead of hover. Use `min-height` on buttons: a fixed `height` with `flex: 1` collapsed to 28px inside a column in the review.
- **Money controls stay manager-only.** `isTabManager` in `TabPanel.tsx` (owner, general manager, manager) gates void, comp, discount, cash and mark-unpaid, matching the server's `ManagerOrAbove`. The artboards show a manager signed in. For a waiter, render the lines, totals and the bill request read-only and put one line in place of the controls: "Գումարի հետ կապված գործողությունները՝ մենեջերը". Do not loosen the server policy without the user's decision (section 6).
- **Kitchen moves InKitchen → Ready only.** Serving is the waiter's.
- **Release as no-show vs cancelled** is the existing `onRelease(id, 'noShow' | …)` path in `TableActionPanel.tsx`; keep its explanation text, the design only restyles it.
- **Offline:** every mutation goes through the command queue as today; the design's offline states are the existing ones, restyled. PIN sign-in needs the network and says so.
- **Red only for real failures** (late ticket, conflict, wrong PIN, allergen). Waiting is amber.

## 4. What the backend already has (`Yalla` repo)

- Floor: `GET /api/branches/{id}/tables/floor`, `…/tables/changes`; transitions `POST …/tables/{id}/seat-walk-in|seat-reservation|hold|release-hold|seat-held-party|free|out-of-service|return-to-service` (out-of-service returns `affectedReservations`)
- Approvals: `GET …/reservations/awaiting`, `POST /api/reservations/{id}/approve|reject`
- Tabs: `POST /api/tables/{id}/open-tab`, staff view, `…/lines/{lineId}/void`, `…/adjustments` (Discount or Comp, percent or amount, line or whole tab, reason required), `POST /api/tab-adjustments/{id}/void`, `…/payments/cash` (amount, tip, who paid), `POST /api/tabs/{id}/abandon`
- Orders: `POST …/staff-orders` (items with `isShared` and `note`, order-level `onBehalfOfParticipantId`), `GET /api/branches/{id}/orders`, `POST /api/orders/{id}/status`
- Calls and bill requests: `GET /api/branches/{id}/service-requests` (presets Napkins, Water, TheBill, Other; a bill request carries `billScope` WholeBill / MyShare and the amount), `POST /api/service-requests/{id}/acknowledge`
- Staff sign-in: `GET /api/auth/staff/roster`, `POST /api/auth/staff/pin` with server-side lockout; a manager clears it with `POST …/staff/{id}/clear-pin-lockout`
- Shifts: `StaffShift` (date, from, to) with CRUD under the staff endpoints, built for the venue console

Hooks are in `packages/api/src/react`; the staff gateway and mock sit next to
the console ones.

## 5. Backend gaps (red-first tests, contract types regenerated)

1. **Who is on shift, on the PIN gate.** `GET /api/auth/staff/roster` ignores shifts. Add `onShiftNow` (and today's `startsAt` / `endsAt`) to each `StaffRosterEntry`, from `StaffShift` in the branch's time zone, overnight shifts included. The gate lists people on shift first; everyone else the roster already allows stays reachable under "Ուրիշ մեկը". It must not narrow who may sign in.
2. **Who sent a kitchen ticket.** `KitchenOrderView` has no sender. Add `placedByName`: the staff member's display name, or null when a diner ordered from the app (the ticket then says "Հավելվածից").
3. **"Who" per line, not per order.** `PlaceOrderRequest.onBehalfOfParticipantId` is order-wide; the design assigns each line. Add an optional `participantId` to `OrderItemRequest` that overrides the order-level one, validated against the tab's approved participants, so one send stays one kitchen ticket.

## 6. Open for the user

- **Should waiters take cash?** Today only a manager or above may record cash, comp or void. If the user wants waiters to take cash (common in Yerevan), it is one policy change on `…/payments/cash` plus a test that comp, void and abandon stay manager-only. Until the user decides, follow section 3.

## 7. Suggested order

1. Top bar, tokens and the Main floor with the rail (no backend change).
2. Table panel and Pin gate, with gap 1.
3. Order with gap 3, Tab and Cash (role rule from section 3).
4. Kitchen with gap 2, Conflicts.

Ship each phase as a PR pair when backend changes are involved; working rules
are in `../console/HANDOFF.md` section 7.
