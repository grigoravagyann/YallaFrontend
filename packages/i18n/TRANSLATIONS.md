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
- `admin` — the diner app listing and table pins on the Public page
  (2026-09-14), provisional and **not** reviewed: `publicPage.listing.*`
  (cuisine, about, the four price-level names, website, the five amenity
  names — which must match the diner app's `place.amenity.*` wording — the map
  pin fields and the gallery manager) and `publicPage.markers.*` (placing
  tables on the cover photo). `publicPage.markers.noCover` must keep saying
  the cover has to be **saved** first. Added with the review fixes, also
  **not** reviewed: `publicPage.listing.location.notANumber` and `outOfRange`
  (which must say both ranges), `publicPage.markers.selectedUnplaced`,
  `placeInMiddle` and `refused`. Added when a cover change started taking the
  pins off (2026-09-14), **not** reviewed: `publicPage.markers.discarded`,
  which must say it was the **unsaved** pin changes that were dropped.
- `diner` — the real-data review fixes (2026-09-14), provisional and **not**
  reviewed: `place.review.loadFailed`, `orders.signedOut.*` (orders live on
  the account — never phrase it as the order being gone) and
  `tables.notOnPhoto`.
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
   empty string value. It also fails when:
   - a `diner` key is defined but nothing in `apps` or `packages` references it
     (as a quoted key, or under a template literal such as
     `` `waiter.${reason}` ``). A key added before the screen that renders it
     goes in `scripts/pending-diner-keys.json`, saying who renders it; delete
     the entry once the screen uses the key (the check prints a note);
   - an amenity name in `diner` `place.amenity.*` differs from `admin`
     `publicPage.listing.amenities.*` in the same language;
   - a `hy` or `ru` string glues `-ը`, `-ն` or `-ին` onto an interpolation
     (`{{name}}-ը`). `staff` is exempt until its floor-screen copy is
     rephrased.
4. `pnpm --filter @yalla/i18n test` proves each of those rules still fails when
   it is broken.

`pnpm i18n:check` deliberately does not let you "fill in later" with `""` — an
empty value renders as blank rather than falling back, which reads as a broken
screen.

- `diner` — the diner redesign (2026-09-12), provisional and **not** reviewed:
  `explore.freeLead_*` and `explore.inPlaces_*` (the lead line under the city:
  "38 tables free" + "in 12 places nearby" — the two halves are separate keys
  so a language can reorder them), `venue.openAcross_*`, `branches.opensAt`,
  `floorPlan.pickFor`, `table.pickAnother`, `settle.remainingOf`,
  `settle.nothingPaidYet`.
- `diner` — the reference-design redesign (2026-09-13), provisional and **not**
  reviewed. New sections: `place.*` (type, content badges `popular`/`new`,
  the `open`/`closed` availability pills — which must stay availability words,
  never category words — `todayHours`, `distanceKm`, `rating`, the four action
  tiles, the About/Menu/Reviews tabs, `bookTable`, `amenity.*`), `tables.*`
  (the photo table view: `status.*` and `legend.*` carry the same three words
  on purpose, `capacity`, `capacityOne`, `book`, `notBookable`, zoom and
  fullscreen controls, `floorPlan`), `map.*` (`locationFallback` must keep
  saying the centre is being shown _because_ location was not allowed),
  `book.*` (the booking screen; `partySizeMore_*` is the "5+" chip),
  `orders.*` (statuses, `kind.*`, `tableAndParty_*`, the two empty states and
  the detail labels), `favorites.*`, and the Profile rows (`profile.settings`,
  `.myBookings`, `.myOrders`, `.favorites`, `.notifications`, `.help`,
  `.about`, `.logOut`, `.guest`). Also `tabs.orders`,
  `explore.mapButton`, `explore.filter.popular`/`.new`,
  `explore.empty.nearby.*`, and `explore.searchPlaceholder` rewritten to name
  cuisine as a third thing to search for.
- `diner` — sign up and log in (2026-09-13), provisional and **not** reviewed:
  `auth.*` (the welcome fork `welcome.*`, `logIn`, `createAccount`,
  `continueAsGuest`; the log-in step `login.*` and the sign-up step
  `signup.*`, whose bodies must keep saying that a code is texted and that
  the name is what the venue asks for at the door; the name and email fields
  `nameLabel`, `namePlaceholder`, `emailLabel`, `emailPlaceholder`,
  `emailHint` — the hint must keep promising the email stays on the phone;
  the after-log-in name step `nameStep.*`, `continue`, `skipForNow`; and the
  three field errors `error.*`). Also `profile.logIn`,
  `profile.createAccount`, and `bookings.signedOut.action` / `.body` reworded
  from "Confirm my number" to "Log in" now that the tab opens the welcome
  screen. `profile.signIn` was removed with the button it labelled.
- `diner` — accounts with a password (2026-09-13), provisional and **not**
  reviewed: `auth.account.*` (the password log-in and sign-up bodies),
  `auth.usernameLabel` / `.usernamePlaceholder` / `.usernameHint`,
  `auth.emailFieldLabel` (the required email, beside the older optional
  `emailLabel`), `auth.identifierLabel` / `.identifierPlaceholder`,
  `auth.passwordLabel` / `.passwordHint`, `auth.showPassword` /
  `.hidePassword`, `auth.codeInstead`, and seven new `auth.error.*`
  (`invalidCredentials` must never say which half was wrong). `profile.editProfile`,
  `.notVerified`, `.verify`. The whole `editProfile.*` section (photo sheet,
  permission and upload refusals per reason, details, password, phone). Also
  `confirm.error.phoneNotVerified` and `confirm.verifyMyNumber`, shown when an
  account whose number has not passed the SMS code tries to book or open a tab.
- `diner` + `admin` — the hardening copy pass (2026-09-14, PLAN-90 F0), all
  provisional and **not** reviewed.
  - **hy corrections** from the copy audit: `place.tab.menu` "Ճաշացանկ";
    `place.action.directions` and `map.directions` "Երթուղի";
    `waiter.sending` and `waiter.sentAtTable` (the staff, not a shop's sales
    counter); `tab.leaveHostBody` (it passes to whoever joined earliest);
    `tab.resumeTitle` and `people.activeSection` (no more "հաշվի վրա"
    calque); `bill.shared`; `bookings.status.pendingApproval`;
    `auth.signup.body`, `auth.account.signupBody`, `auth.error.usernameInvalid`;
    `scan.noAccount`. Rephrased so no case ending is glued onto a runtime
    name, item or date: `scan.error.bookingTooEarlyOnDay`, `pending.body`,
    `bill.marker.added`, `.removed`, `.removedNamed`, `tray.failed.soldOut`,
    `people.removeTitle`, and in `admin` `shell.signedInAs`,
    `venue.suspendTitle`, `venue.deleteTitle`, `devices.confirm.title` and
    `devices.confirm.body`. One host term everywhere, "հաշիվը բացողը":
    `tab.host`, `pending.title`, `pending.bodyNoName`, `people.hostOnly` and
    every former "հաշիվ բացողը". The account is "պրոֆիլ", and "հաշիվ" is only
    ever the tab: `orders.signedOut.title`, `profile.createAccount`,
    `auth.createAccount`, `auth.signup.title`, `auth.login.noAccount`,
    `auth.signup.haveAccount`, `auth.error.emailTaken`,
    `auth.error.phoneInUse`, `scan.error.signInNeeded`. Lowercase "ձեզ" in
    `verify.phoneBody` (`table.heldForYou` keeps its capital because it starts
    the sentence). Deliberately **not** changed, left for the native reviewer:
    `booking.done` "Պատրաստ է" and `place.tab.about` "Մասին".
  - **ru corrections:** `success.shareMessage` (no gendered "Забронировал"),
    `settle.host` "открыл(а)", and `pending.endedBody`, `invite.notHost` and
    `order.blocked.notAllowed` (no "его" for a person of unknown gender);
    `bookings.status.confirmed` / `.completed` and
    `bookings.detail.cancelledOn` are feminine now, like the other booking
    statuses; `waiter.body`, `waiter.failed`, `waiter.rateLimited_*` and
    `waiter.rateLimitedNoWindow` (a table does not call; `_other` keeps
    "минуты" for fractional counts); one service-charge term, "Сервисный
    сбор", in `bill.serviceChargeRate` and `bill.serviceChargeApplies`;
    `settle.people`; `people.pendingSection`; `scan.noAccount`;
    `tray.failed.soldOut`; `orders.cancelBody` (payment is cash at the table,
    so nothing is "списано"); `auth.account.signupBody`;
    `editProfile.password.setDone`.
  - **Plural now:** `table.unavailable.tooSmall` (`_one`/`_other`, plus
    `_few`/`_many` in ru). Its caller already passes `count`.
  - **Amenities, one wording per language in both namespaces** (now enforced
    by `i18n:check`): en "Outdoor seating", hy "Բացօթյա նստատեղեր" and
    "Վեգան տարբերակներ", ru "Столики на улице" (never "Летняя веранда").
  - **Reworded for diners:** `net.notAvailable` / `net.notAvailableBody` no
    longer talk about a backend; `push.optIn.explain` / `.granted` say "before
    your booking". Each venue sets how long before, so this copy must never
    name a number.
  - **Removed, because nothing renders them:** `menu.pricesOnly`,
    `tab.orders.placeholder`, `floorPlan.comingSoon`, and leftovers of earlier
    flows: `explore.city`, `explore.placesNearby_*`, `explore.freeLead_*`,
    `explore.inPlaces_*`, `venue.branchCount_*`, `venue.typeAndBranches`,
    `venue.freeNow_*`, `venue.closedNow`, `venue.noneFreeNow`,
    `venue.notFound.*`, `venue.openAcross_*`, `branches.openUntil`,
    `branches.closed`, `branches.noneFree`, `branches.empty.*`,
    `branches.loading`, `branches.openNow`, `branches.freeNow_*`,
    `branches.opensAt`, `bookings.tableAt`, `confirm.cancellation`,
    `success.done`, `scan.result.*`, `tab.orders.title`,
    `pending.approvedTitle`, `menu.title`, `menu.updated`,
    `push.actions.hint`, `.cancelled`, `.unknown`, `push.actions.stale.*`,
    `tables.zoom`, `orders.kind.dineIn`.
  - **New `diner` keys.** `scripts/pending-diner-keys.json` names the screen
    that renders each one. `place.reviews.seeAll_*`, `reviews.*`,
    `place.menu.empty` / `.error`; `place.review.postedAs` (must say the
    review is **public**), `.needsVisit` (must keep the 180 days and both kinds
    of visit), `.hidden`; `place.review.report.*` (five reasons, the note,
    `own`, `failed`); `place.bookingsOff.*`; `booking.note.*` (the hint must
    keep saying the **venue** sees it); `profile.deleteAccount.*` (the body
    must keep saying what is deleted and that venues keep their booking and
    order records); `auth.sessionRevoked.*`; `tab.name.*`; `notifications.*`,
    where `kind.*` holds a title and body per notification kind and uses only
    `{{place}}`; `help.*`, whose answers describe what the app really does
    (booking needs a confirmed number, the table code needs no account,
    reviews need a visit within 180 days, what deleting the account removes,
    favorites saved to the account when logged in) and must change when that
    behaviour does, and whose contact lines render only when a support email
    or phone is configured; and `about.*`. The About screen reads `about.*`;
    `profile.about` stays the Profile row label.
  - **New `admin` keys:** `onboarding.steps.acceptsWebBookings` and
    `.acceptsWebBookingsOptional` (must say it is optional);
    `onboarding.blockers.*`, one per readiness blocker the server reports;
    `publicPage.markers.coverChanged`; `publicPage.listing.address.*`;
    `publicPage.listing.relocateOwnerOnly`; `publicPage.listing.errors.*`, one
    per field and bound a listing save can refuse; `floorPlan.conflict.*`;
    `platform.reviews.*`; `platform.venue.publicPageLink` / `.reviewsLink`;
    `reservations.note`; `reviews.*` (a venue's review moderation, including
    `platformHidden`); and `nav.reviews`.
