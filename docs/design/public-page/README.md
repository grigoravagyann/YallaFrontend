# Public page redesign (yalla.am/{venue}/{branch})

The diner-facing web page in the same visual system as `../console/`, `../venue-console/` and `../floor-tablet/`: cream ground, dark-brown bar, serif titles, the #3A1D0C button the diner app also uses. Made on 2026-10-19 and approved by the user on 2026-10-20 after two ui-ux review rounds on real renders.

- **Live design:** https://claude.ai/artifact/TZr4N2tu1XYH6vQfS8zyV2 (version 10). Read it with the Artifact tool, `action: "read"`.
- **Local copy:** `artboards/*.dc.html` + `artboards/canvas.json`. Each artboard's `DCLogic` script at the bottom is the interaction spec.
- **Check:** `node vcheck.cjs artboards/Book.dc.html` renders every tweak value, calls every handler once, and checks template holes and tag balance.

Mobile first: the page is read on a phone from a link shared in WhatsApp or Telegram. `Main` is one fluid page; at 960px and wider it becomes two columns with the booking card sticky on the right. `Desktop` imports `Main` at 1440px, so there is one source for both.

## Screens and how they map to the code (`apps/web/src/public/*`)

| Artboard | Screen | Existing code |
|---|---|---|
| Main | Branch page: photos (gallery dialog), name, link to all branches, type · cuisine, rating · district · price, open status with tables free now, call / address / share; booking card (day chips + other date, party stepper, day/evening time chips with full and on-request states, chosen table, "pick for me"); room with tabs, photo pins or a list, legend; menu by category; about with amenities; reviews with owner replies; hours with special days; how to find. Tweaks `bookings`, `open` | `BranchRoute.tsx`, `LiveCount.tsx`, `RoomSection.tsx`, `RoomPhotos.tsx`, `MenuSection.tsx`, `BranchDetails.tsx`, `slots.ts` |
| Desktop | The same page at 1440 | same |
| Book | Booking sheet, tweak `step`: table (free-by agreement), taken (alternatives at the same time), phone, telegram, code, name (plus an optional note), done, pending, declined | `BookingSheet.tsx`, `PhoneVerification.tsx`, `BookingDone.tsx`, `calendarFile.ts` |
| Manage | Manage link, tweak `state`: active, pending, cancelConfirm, cancelled, declined, past, gone | `ManageBookingRoute.tsx` |
| Venue | Branch chooser, tweak `state`: list, empty | `VenueRoute.tsx` |
| States | Loading, not found, unavailable, offline, error | `PageStates.tsx` |

## Reviews

**First (2026-10-19, v8).** Rendered at 390 and 1440 and audited. Fixed: the week's opening hours did not render (an `sc-for` inside `<tbody>` is moved out of the table by the HTML parser; now a list); the default time was an on-request slot, so every visitor started on the approval path; the "free now" count changed with the party and time; on a phone the booking button stayed far above the table just tapped (a booking bar now follows the room); table pins 3 and 8 too close; the sticky bar covered anchored headings; contrast of full slots and disabled buttons; the 11px "on request" label; the 44px logo link.

**Second (2026-10-19, v10).** Fixed: money was written "֏ 1 400" while `@yalla/format` writes "1 400 ֏"; day chips' accessible names did not contain the visible "Այսօր" (WCAG 2.5.3); star ratings were `aria-label` on a plain span; the cancel confirm was marked `alertdialog` though it is inline; "+5" photos opened nothing (now a gallery dialog, Escape closes, focus goes to Close); the phone step had a silently disabled button (now an error under the field); a design-only hint left in the code step. Added: share, all-branches link, more reviews, an optional note to the venue. After the fixes 22 states audit clean.

The user decided on 2026-10-20 to keep the time chips as they are (no typed time, no two-step hour/minute picker).
