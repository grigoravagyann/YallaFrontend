# Public page redesign: handoff

Everything a fresh session needs to implement the approved public page
redesign (the diner-facing web page at `yalla.am/{venue}/{branch}`, the branch
chooser and the manage-booking link) in `apps/web/src/public`, plus the one
backend gap in the `Yalla` repo. The user approved the design on 2026-10-20
after two ui-ux review rounds on real 390px and 1440px renders. The artboards
are the spec for look and flow; section 3 says where the code's rules win.

Read `../console/HANDOFF.md` for the working rules (section 7 there). This page
does not share the console shell: no sidebar, its own top bar, mobile first.
It shares the colour and type tokens.

## 1. Where the design lives

| What | Where |
|---|---|
| Live design (canvas, clickable) | https://claude.ai/artifact/TZr4N2tu1XYH6vQfS8zyV2 (version 10). Read it with the Artifact tool, `action: "read"`. |
| Same files, local | `artboards/*.dc.html` + `artboards/canvas.json` |
| Behaviour check | `node vcheck.cjs artboards/Main.dc.html` |
| Photos | `/_blob/<id>` assets of that artifact; the app uses the branch's real cover, gallery, room and menu photos |

Each `.dc.html` carries the interaction spec in its `class Component extends
DCLogic` script: states, messages, which button is enabled when, defaults.
Tweaks in `data-props` (`bookings`, `open`, `step`, `state`) are switches the
app derives from real data. The small grey buttons at the top of Book, Manage,
Venue and States are design-only state switchers; do not build them.

## 2. Screens

| Artboard | What to build | Existing code (`apps/web/src/public/`) |
|---|---|---|
| Main | The branch page in this order: photos (cover 4:3 on a phone, four thumbs, the last opens a gallery dialog), name, branch + "all N branches" link, type · cuisine, rating (count) · district · price level, the open status card with tables free now, call / address / share (share uses the Web Share API, falling back to copy); the booking card; the room ("Ընտրեք սեղանը") with room tabs showing free counts, Photo/List switch, pins, legend, and the booking bar that appears under the room once a table is chosen (phone only, the sticky card does it on desktop); menu by category with sold-out; about + amenities + website; reviews (summary, distribution, newest first, owner replies, "see all"); hours with today marked and special days; how to find | `BranchRoute.tsx`, `LiveCount.tsx`, `RoomSection.tsx`, `RoomPhotos.tsx`, `MenuSection.tsx`, `BranchDetails.tsx`, `slots.ts`, `public.css` |
| Desktop | Same page at ≥960px: two columns, booking card sticky on the right, gallery as 2×2 beside the cover | `public.css` |
| Book | The sheet: progress (Սեղան · Հեռախոս · Անուն); table step with the hold window and the free-by checkbox; taken step listing free tables at the same time; phone step with Telegram first and SMS code second, error under the field; Telegram waiting; code; name + optional note; done (code, calendar, manage link with copy), pending (countdown), declined | `BookingSheet.tsx`, `PhoneVerification.tsx`, `BookingDone.tsx`, `calendarFile.ts` |
| Manage | Code, status badge, summary, free-by promise, cancellation deadline, calendar / map / change time / call / cancel with an inline confirm; cancelled, declined, past and gone states | `ManageBookingRoute.tsx` |
| Venue | Branch cards with photo, address · district, open state and free count; unavailable branches listed but not links; empty state | `VenueRoute.tsx` |
| States | Skeleton, not found, unavailable (with call), offline and error (with retry) | `PageStates.tsx` |

## 3. Rules that stay (the code wins; do not reopen)

- **Mobile first.** Designed at 390px; two columns from 960px. Inputs at least 16px so iOS does not zoom; every target 44px.
- **Times come from the server's day slots** (`slots.ts`): 15-minute steps, a full sitting must fit before closing, lead time drops early slots, full slots stay visible and struck, on-request slots say so. The user decided on 2026-10-20 to keep the time chips as designed.
- **Default time:** the first slot that confirms at once; fall back to the first on-request slot only when there is no other. (This changes `slots.ts`'s default, which takes the first slot past the lead time.)
- **A table is still chosen on the room.** "Ընտրել ինձ համար" only picks for the visitor on the client: the smallest free table that fits the party, current room first, then the others. No new endpoint.
- **Phone proof before booking** stays. Telegram becomes the first button because SMS is not live; the code path stays for when it is.
- **One client command id per booking attempt**, the free-by checkbox when the table has a limit, and late cancelling never blocked: all as today.
- **Nothing in browser storage; language in `?lang=`;** no app-store badge unless `VITE_APP_URL` is set.
- **Money with `formatDram`** ("1 400 ֏"), never hand-formatted.
- **Red only for real failures** (taken table, wrong code, cancel). Waiting is blue, needs-attention is amber.

## 4. What the backend already has (`Yalla` repo)

Everything on the page except one action is already served:

- `GET /api/public/branches/{venueSlug}/{branchSlug}` → `PublicBranchPage`: names, type, address, lat/lng, time zone, hours, special days, open now, free and total tables, floor plan, phone, `AcceptsWebBookings`, **`BookingWindowDays`** (bound the date picker with it), reservation policy, cover photo
- `GET /api/public/branches/{branchId}` → `PublicBranchDetail`: the listing card (**cuisine, price level, rating, review count, district**, badges, cover) plus **about, website, amenities, gallery**, recent reviews with owner replies, rooms. The web page does not call it yet.
- `GET /api/public/branches/{branchId}/reviews` → `PublicReviewPage` (rating, count, paged reviews, each with an optional `Reply`), for "see all"
- `GET …/menu`, `…/rooms`, `…/availability`, `…/availability/slots`, `…/meta`
- `POST` reservation with `CreateReservationRequest`, which **already has `Note`** (send the optional note) and `AcceptsFreeByUtc`
- `GET /api/public/bookings/{token}`, `POST /api/public/bookings/{token}/cancel`
- The branch chooser keeps the data `VenueRoute.tsx` already loads; the district per branch is on `PublicBranchListing.District` if the card needs it

## 5. Backend gap (red-first tests, contract types regenerated)

1. **Change a booking from its manage link.** Manage has "Փոխել ժամը կամ հյուրերին". The diner app reschedules with `POST /api/reservations/{id}/reschedule` (diner token); there is no token route. Add `POST /api/public/bookings/{token}/reschedule` with the same rules (a confirmed party that does not grow stays confirmed, otherwise it goes back to approval; same command id with a different change is 409 `client-command-id-in-use`), and let the page reuse the booking card with the current values filled in.

## 6. Suggested order

1. Tokens and layout (`public.css`): new colours, the two-column breakpoint, top bar, page states.
2. Main header and details: call `PublicBranchDetail` for rating, cuisine, price, district, about, amenities, website, gallery dialog, reviews with replies and "see all", share, all-branches link.
3. Booking card and room: day chips, stepper, time chips with the new default, Photo/List switch, "pick for me", the phone booking bar.
4. Book sheet: progress, taken alternatives, Telegram first, phone error, note, done/pending/declined.
5. Manage with the reschedule gap; Venue.

Ship each phase as a PR (a pair when phase 5 touches the backend). Keep the
existing tests green and add one per new behaviour.
