# Translation status

## Armenian and Russian copy here is PROVISIONAL

The `hy` and `ru` files contain only the handful of strings the placeholder app
shells need to boot. They were written to get the shells rendering, **not** by a
native speaker, and they have not been reviewed.

They exist at all for one structural reason: `hy` is the fallback language. A key
missing from `hy` has nothing to fall back to and renders as its raw key path in
production, so the fallback bundle cannot be left empty the way `ru` or `en`
could be.

**Before launch, a native Armenian speaker and a native Russian speaker must
review every string in `src/locales/hy` and `src/locales/ru`.**

### What is currently provisional

- `common` — the app shell, table-state legend and connection states.
- `diner` — the whole browse flow: Explore header and filters, venue cards,
  branch rows, the booking bar and the floor plan screen. Added with the browse
  flow and **not** reviewed.
- `diner` — the reservation flow: the table sheet, phone verification, the
  confirmation screen and the bookings tab. **Not** reviewed.
- `diner` — scanning in and the shared tab: the scan screen, pending approval,
  the tab, invites, host controls, the menu and the call-waiter presets. **Not**
  reviewed, and this set needs it most: the host-controls copy explains a
  permission rule, and a translation that blurs "the table total" into "your
  total" would tell a guest the opposite of what the feature does.
- `diner` — the diner-flow fixes (2026-09-11), all provisional and **not**
  reviewed. Browse: `venue.noneFreeNow` (present tense on purpose — "none free
  right now", never "fully booked tonight"), `venue.notFound.*`,
  `branches.openNow`, `branches.freeNow_*`. Removed with the distance and
  table-total they described: `venue.fullyBooked`, `branches.distanceKm`,
  `branches.distanceAndHours`, `branches.availability`. Reservations: the
  booking name field and the confirm states (`confirm.nameLabel`,
  `confirm.namePlaceholder`, `confirm.loading`, `confirm.tableError`,
  `confirm.tableMissing`, `confirm.phoneMissing`, `confirm.verifyNumber`,
  `confirm.checkAgain`), the refusals the server now names
  (`confirm.error.tableOccupied`, `.busy`, `.commandInUse`,
  `.branchUnavailable`, `.unknownOutcome` — which must keep saying the outcome
  is _not known_, never "nothing was booked"), the dated deadline
  (`table.freeCancellationOn`, `table.freeCancellationPassed`), the code copy
  (`verify.error.wrongCodeNoCount`, `.codeSpent`, `.rateLimitedNoTime`),
  `booking.tomorrow`, `booking.noTimesLeft`, `booking.notFound.*`, the
  statuses the server keeps apart (`bookings.status.seated`,
  `.cancelledByDiner`, `.cancelledByVenue`, `.unknown`), `bookings.signedOut.*`,
  `bookings.detail.until`, and the keep-my-table refusals
  (`push.actions.holdNotActive`, `.extensionsNotOffered`, `.keepTableHint`).
  Removed: `confirm.error.network` (it promised "nothing was held" after a
  dropped connection that may have booked) and `bookings.status.cancelled`.
  The shared tab: `tab.accessEnded.*` (the server cannot say whether the tab
  closed or the person was taken off, so the copy must keep covering both),
  `tab.hostCannotLeave`, `invite.notHost` (the server lets only the host make
  an invitation, so it must never read as "try again"), `tab.loadError`,
  `tab.closingBanner`,
  `order.blocked.*`, `pending.endedTitle`, `pending.endedBody`,
  `people.permissionsUnknown`, `people.savePermissions`,
  `scan.error.notEnabled`, `.branchUnavailable`, `.uncertain`,
  `join.error.expired`, `tray.lockedHint`, `tray.failed.uncertain`,
  `.uncertainHint`, `.checkAgain`, `.forbidden`, `.notSent` (the uncertain copy
  must keep saying the outcome is _not known_), `tray.sent.replayed`,
  `bill.paid`, `bill.remaining`, `bill.removedBy`, `bill.removedNoReason`,
  `bill.serviceChargeRate`, `bill.serviceChargeApplies`, `bill.sharedWays_*`,
  `bill.adjustment.*`, `settle.mode.notHost`, `.closing`, `.failed`,
  `settle.shares.paid`, `waiter.rateLimited_*`, `waiter.rateLimitedNoWindow`.
  Rewritten: `tab.leaveHostBody`, `settle.shares.hidden` (it pointed at items
  "above" that are not on that screen), `scan.manualBody`,
  `scan.manualPlaceholder`. Removed with the surfaces that only the mock ever
  answered: every `*.notWired`, `pending.rejected*`, `pending.removed*`,
  `people.defaultsTitle`, `people.defaultsBody`.
- `diner` — opening the tab from a booking (2026-09-12), all provisional and
  **not** reviewed. Rewritten: `scan.manualBody` and `scan.manualPlaceholder`,
  which now name the three things that can be typed — the long code printed
  under the QR, a booking code, a link from the host — and no longer show
  "ABC-DEF", a shape neither code has ever had. New, and each needing care:
  `scan.error.bookingNotFound` (it must never drift back into "that is not a
  table", which is the answer this whole flow exists to stop giving somebody
  sitting at the table they booked); `scan.error.bookingTooEarly` and its
  timeless twin `scan.error.bookingTooEarlyNoTime` — the scan screen has no
  branch in hand to read a time in, and translating the second as though it had
  one would put the phone's own zone in front of a diner who has just flown in;
  `scan.error.bookingEnded`; `scan.error.bookingNotActive`; and
  `scan.error.signInNeeded`, which has to keep saying that the code _on the
  table_ still needs no account, because that is the flow the product lives on.
  The action itself: `booking.atTable.action`, `.hint`, `.working`, and
  `success.atTableHint` on the confirmation screen, which tells a diner what
  their booking code is for once they are standing in the venue.
- `diner` — the same flow, second pass (2026-09-12), also provisional.
  `scan.error.bookingTooEarlyOnDay` is `bookingTooEarly` with the date as well,
  for a booking that is not today: the button is offered days ahead, and a bare
  "from 19:10" there reads as tonight. `scan.error.bookingNotActive` kept its
  general wording but now only catches the states this build does not know;
  `scan.error.bookingPending`, `.bookingCancelledByYou`, `.bookingCancelledByVenue`
  and `.bookingNoShow` say the rest, and the two cancellations must not collapse
  into one — who cancelled is the whole of what the reader wants to know.
  `scan.confirmNumber` is the button that takes a diner to verification, which
  used to happen to them without a tap. Reworded: `scan.error.bookingEnded` no
  longer says "scan the code on your table", because in that window the scan
  cannot work either and the answer really is a member of staff; and
  `scan.error.empty`, `scan.deniedBody` and `scan.unavailableBody` stop calling
  the field the code under the QR, which it has not been since the first pass.
- `admin` — the whole web console: the platform venues list and venue detail,
  the create-venue flow, the four role names, the branch switcher, the refusal
  page, the password page a sign-in link opens, and the staff screen's sign-in
  badges, address prompt and link dialog. **Not** reviewed, and the sign-in
  copy was written ungendered on purpose ("Awaiting password", "Ждёт пароль")
  because the badge names a state, not a person — keep it that way. The
  policy tab's "awaiting approval" panel (`admin.approvals.*`: the reasons a
  booking waits, the decline prompt and its reason field) is in the same
  state: written to get the panel rendering, **not** reviewed.
- `admin` — the staff screen redesign (2026-09-11): the role chips and
  groups (`staff.filter.all`, `staff.filter.searchPlaceholder`, `staff.group.*`),
  the card's "You" and "More" (`staff.card.you`, `staff.action.more`,
  `staff.action.moreFor`), the add dialog's steps, role descriptions and notes
  (`staff.wizard.*`, `staff.roleInfo.*`), and the tablet cards (`devices.seen`,
  `devices.enrolledOn`, and `devices.title`, now "Tablets" / "Պլանշետներ" /
  "Планшеты"). Provisional, **not** reviewed. The Russian role question is
  worded around "сотрудник" to stay ungendered, like the badges.
- `admin` + `staff` — the staff id and the tablet roster (2026-09-11): the
  edit dialog's ID row (`staff.staffId.label`, `staff.staffId.help`,
  `staff.staffId.copy`), the PIN screen's roster fallback note
  (`pin.rosterFailed`) and the reworded `pin.staffIdWhy`, which now points at
  Staff → Edit → Copy staff ID. Provisional, **not** reviewed; if the console's
  "Staff" or "Edit" labels are retranslated, `pin.staffIdWhy` must follow.
- `admin` — changing your own PIN (2026-09-11): the own card's action and its
  dialog (`staff.action.changeOwnPin`, `staff.ownPin.*`). Provisional, **not**
  reviewed.
- `admin` — the Public page tab (2026-09-12): `nav.public` and `publicPage.*` —
  the intro, the cover photo's title and help (it must keep saying the crop is
  the same 4:3 frame as a dish, because that is why the picker looks like the
  menu's), the phone label and help, the bookings switch and its help (which
  must keep saying the page still shows the room, menu and hours while it is
  off — that is the whole reassurance), and the save states. Provisional,
  **not** reviewed.
- `admin` — the tier control on the platform venue page (2026-09-12):
  `venue.tier.toPaid`, `venue.tier.toFree` and the refusal `venue.tier.notReady_*`,
  which quotes how many dishes are unfinished and must keep pointing at the
  menu rather than reading as "cannot upgrade". Provisional, **not** reviewed.
- `staff` — the kitchen screen (2026-09-11): its header title `kitchen.title`
  ("Kitchen" / "Խոհանոց" / "Кухня"). Provisional, **not** reviewed.
- `staff` — the floor screen: connection and sync states, the order and seating
  panel frames, and the install prompt. **Not** reviewed, and this set matters
  most of all: it is read by a waiter at arm's length during a rush, in Armenian
  far more often than in anything else.

The Russian bundle carries four plural categories (`one`/`few`/`many`/`other`)
where Armenian and English carry two. That is correct CLDR, not duplication, and
`pnpm i18n:check` verifies each language has exactly the categories
`Intl.PluralRules` says it needs — no more, no fewer.

No string beyond the shell set has been machine-translated, and none should be.
An empty file is a visible gap; a plausible-looking wrong translation is an
invisible one that never gets revisited.

## Adding a key

1. Add it to `src/locales/hy/<namespace>.json` first — `hy` is the reference
   bundle that `pnpm i18n:check` compares the others against.
2. Add the same key path to `ru` and `en`.
3. Run `pnpm i18n:check`. It fails on a key present in one language and absent
   in another, on a key present in a translation but not in `hy`, and on any
   empty string value.

`pnpm i18n:check` deliberately does not let you "fill in later" with `""` — an
empty value renders as blank rather than falling back, which reads as a broken
screen.
- `diner` — the diner redesign (2026-09-12), provisional and **not** reviewed:
  `explore.freeLead_*` and `explore.inPlaces_*` (the lead line under the city:
  "38 tables free" + "in 12 places nearby" — the two halves are separate keys
  so a language can reorder them), `venue.openAcross_*`, `branches.opensAt`,
  `floorPlan.pickFor`, `table.pickAnother`, `settle.remainingOf`,
  `settle.nothingPaidYet`.
