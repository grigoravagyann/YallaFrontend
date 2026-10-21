# Floor tablet redesign (waiter + kitchen, `/staff`)

Companion to `../console/` (platform admin) and `../venue-console/` (owner / GM / branch manager), made on 2026-10-19 in the same visual system: cream canvas, dark-brown bar, serif titles, brown CTA, red only for real failures.

- **Live design:** https://claude.ai/artifact/3yC3gKSzFPmvtHfoznY2Fu (v16; v15–16 added `Enrol`). Read it with the Artifact tool, `action: "read"`.
- **Local copy:** `artboards/*.dc.html` + `artboards/canvas.json`. Each artboard's `DCLogic` script at the bottom is the interaction spec.
- **Check:** `node vcheck.cjs artboards/Main.dc.html` renders the logic for every tweak value (`state`, `connection`) and verifies every template hole.

All artboards are 1280×800 landscape (a 10–11" tablet in a stand). The staff surface rules from the code are kept: 18px base, 56px+ primary targets (`--touch-staff`), state carried by text and border as well as colour, pressed state instead of hover, PIN gate rendered over the floor, offline command queue with conflicts.

## Screens and how they map to the code (`apps/web/src/staff/*`)

| Artboard | Screen | Existing code |
|---|---|---|
| Main | Floor: view tabs (Սրահ / Խոհանոց with pending badge), connection chip (tweak `connection`), conflicts chip, who-is-signed-in → PIN; room filter chips, legend, table grid; right rail "Հիմա": approvals with live countdown, waiter calls, ready orders, things to resolve | `FloorRoute.tsx`, `StaffHeader.tsx`, `TableList.tsx`, `ApprovalPanel.tsx`, `OrderQueuePanel.tsx`, `useConnectionState.ts` |
| Table | Table panel over a ghosted floor (tweak `state`: free, bookedSoon, occupied, overTurn, held, outOfService): seat with party stepper, hold, out of service with affected bookings, order / tab / cash, free with confirm; held: seat, extend 15 min, release as no-show or cancelled | `TableActionPanel.tsx`, `seatedMinutes.ts`, `bookingTimes.test.tsx` |
| Order | Categories, search, dish grid with photos, draft lines with stepper, per-line "who" (table-shared / named guest) and note, send → confirmation; offline variant queues the order | `OrderEntry.tsx`, `useCachedMenu.ts` |
| Tab | Lines with status pills (Խոհանոցում / Պատրաստ է / Մատուցված / Չեղարկված), void with reason, comp per line or % discount, bill request from the app (whole / mine), totals with 10 % service, abandon with typed ԿՈՐՈՒՍՏ | `TabPanel.tsx`, `billRequestText.ts`, `tabManager.test.ts` |
| Cash | Owed card, app-request prefill, amount + tip, quick amounts, keypad, overpay / partial messages, record → done card with change | `CashKeypad.tsx` |
| Kitchen | Counts fresh / waiting / late (late ≥ 12 min), sort by age or table, horizontal snap board of tickets with age badge, notes and allergen warnings, the only transition is InKitchen → Ready | `KitchenRoute.tsx`, `chime.ts` |
| Pin | Gate over the blurred floor (tweak `state`: fresh, idleLock, wrong, locked, offline): people on shift, "Ուրիշ մեկը" with staff ID, dots, keypad, attempt counter and lock message | `auth/*`, `StaffRoute.tsx` |
| Conflicts | Conflict cards (discard / "…այնուամենայնիվ"), sync queue, offline note | `ConflictList.tsx`, `commands/*`, `live/*` |
| Enrol | First connection of a tablet (tweak `state`: fresh, filled, wrong, spent, expired, offline, revoked, working, done): steps with progress on the dark side (where the manager makes the code, the 24 h / single-use rule), a 10-character code field grouped `XXXXX-XXXXX` that drops look-alikes (O, I, L, U, 0, 1) and says so, name presets with no default, the refusal under the code field, success with venue · branch → PIN | `auth/EnrolDeviceScreen.tsx`, `StaffRoute.tsx` |

## Review (2026-10-19, v10)

Every artboard was rendered at 1280×800 in a browser (local `http.server` + iframe harness) and measured: no control under 44×44, no horizontal overflow, floor grid fits in 4 rows, panels fit without clipping. Fixes made on the way:

- Table cards were links and inherited an underline; state and subtitle lines now ellipsise instead of wrapping into the next card.
- Legend wraps on its own full-width row; room chips and small buttons raised to 48px; rail widened to 380px.
- Table panel widened to 560px so the held-reservation actions fit on one line each; the ghost floor no longer scrolls behind it.
- `.btn{height:60px;flex:1}` collapsed to 28px inside column stacks (flex-basis 0 in an indefinite-height container) — switched to `min-height` on every artboard.
- Order: columns 184 / 1fr / 420, who-pills 44px, dish rows 112px.
- Tab: right column 460px, bill-request heading split onto two lines.
- Kitchen: 296px tickets with scroll-snap and a "ևս N-ը՝ աջ սահեցնելով" hint when more than four are queued.

## Second review (2026-10-19, v12)

A scripted audit on every rendered artboard (contrast of every visible text run against its real background, text under 13px, icon-only controls without a name, adjacent targets closer than 8px, `:focus-visible` rules, live regions, tabular numerals). Contrast, naming, spacing and focus all passed. Fixed:

- Kitchen late tickets said "14 ր" in red only — now "14 ր · ուշ", so the state is in the text as well as the colour.
- Order search with no match showed an empty grid — now an empty state with the query and a "Մաքրել որոնումը" button.
- Text under 13px raised: tab status pills and avatar initials, order category counts (and their 60 % opacity replaced by the muted token), sold-out and pending badges, table facts and stepper cap, PIN list heading; the in-board state switchers on Table and Pin are 44px.

## Backend

Checked against `Yalla` master on 2026-10-19: call reasons, my-share bill requests, comps and discounts with a reason, no-show vs cancelled release, affected bookings on out-of-service and the server-side PIN lock all exist. Three small gaps remain (on-shift flag on the PIN roster, sender on kitchen tickets, guest per order line) — see `HANDOFF.md` section 5.
