# Translation status

## Armenian and Russian copy here is PROVISIONAL

The `hy` and `ru` bundles now cover every screen of the diner app, the staff
tablet and both consoles. The platform-admin console's `hy` copy is the approved
artboards' (`docs/design/console`), so the user has read it; every other `hy`
string, and all of `ru`, was written by the team, **not** by a native speaker,
and has not been reviewed. The sections below say which is which.

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
- `admin` — the rooms editor (2026-10-16), provisional and **not** reviewed:
  every `rooms.*` key except `rooms.qr.*` (moved unchanged from
  `floorPlan.qr.*`), and `nav.floorplan`, now "Rooms" / "Սրահներ" / "Залы".
  Written ungendered. `rooms.warning.unpinned_*` must keep saying diners can
  neither **see nor book** the table; `rooms.delete.deactivateBody` must keep
  saying the table is **kept** for its records. hy avoids gluing suffixes onto
  interpolated names (`«{{name}}» սրահը`). Removed with the drawn floor plan
  and the cover-photo pins: every other `floorPlan.*` key and
  `publicPage.markers.*`, so the `publicPage.markers.*` notes above describe
  keys that no longer exist.
- Rooms on the staff floor and the public page (2026-10-16), provisional and
  **not** reviewed: `staff` `floor.legend.label` and `floor.noRoom`
  (`floor.legend.booked` went with the floor tablet redesign, which keys held
  apart from booked soon); `public`
  `room.rooms`, `room.photoOf`, `room.previous`, `room.next`, `room.pin`,
  `room.status.*` (lower case, read after the table number: "Table 4, free")
  and `room.legend.*`. Written ungendered; ru `room.status.*` agree with
  `стол`, and hy `room.photoOf` writes "{{index}} / {{count}}" rather than
  gluing a suffix onto a number. Removed with the drawn floor plan: `public`
  `room.loading` and `common` `floorPlan.overview`, `.otherTables`,
  `.freeCount_*` and `.areaFree_*`.
- `diner` — the real-data review fixes (2026-09-14), provisional and **not**
  reviewed: `place.review.loadFailed`, `orders.signedOut.*` (orders live on
  the account — never phrase it as the order being gone) and
  `tables.notOnPhoto`.
- `diner` — verifying through the Telegram bot (2026-10-15), provisional and
  **not** reviewed: `verify.telegramButton`, `.telegramWaitingTitle`,
  `.telegramWaitingBody` (must keep saying the screen updates **by itself** —
  nobody is meant to press anything after sharing their contact),
  `.telegramOpenAgain`, `.telegramUseCode`, `.telegramNotInstalled` (ends in
  the punctuation that introduces the link printed under it), `.telegramExpired`
  (the link expired, not a code — there was none), `.telegramTryAgain` and
  `.telegramUnavailable`. Written ungendered, in the polite plural, like the
  rest of `verify.*`.
- `diner` — the delete-account refusals (2026-09-14), provisional and **not**
  reviewed: `profile.deleteAccount.wrongPassword` and `.wrongCode` (both must
  keep saying **nothing was deleted**) and `.tooManyAttempts`.
- Review round 2 (2026-09-15), provisional and **not** reviewed:
  - `diner` `profile.deleteAccount.codeLabel`, `.sendCode` and `.codeSent`,
    reworded so none promises an SMS (no backend sends one yet), and the new
    `.noCodeHint`, which must name the Edit profile screen where a password is
    set. `booking.note.hint` now says the venue sees the note only while the
    booking waits for its approval; widen it again once venue screens show
    notes on confirmed bookings.
  - `admin` `reviews.hiddenReasonLine` and `platform.reviews.hiddenReasonLine`,
    the recorded reason as one line (hy joins with `՝`, not a colon);
    `floorPlan.conflict.body` in hy now uses `պահպանել` and `կկորչեն`; ru
    `publicPage.listing.save` / `.saved` / `.failed` say `карточка`, keeping
    `описание` for the About field alone.
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
- `diner` — a booked table another party is still seated at (2026-09-15),
  provisional and **not** reviewed. `scan.error.bookingTableOccupied` (keeps
  `{{label}}`, the table) and its label-less twin
  `scan.error.bookingTableOccupiedNoLabel`. Both must keep sending the diner to
  a member of staff to free the table, and must never read as "wait for the
  host": the host there is a stranger, which is the bug this answer replaced.
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
- `admin` — editing a venue and adding a branch on the platform venue page
  (2026-10-16): `venue.edit.*` and `venue.addBranch.*`. The fields reuse the
  create form's `create.*` labels, so the two forms cannot drift apart. hy keeps
  `վայր` for venue, as everywhere else in the console. Provisional, **not**
  reviewed.
- `diner` — a new password after proving the phone (2026-10-16), provisional
  and **not** reviewed: `auth.newPassword.*` (the step "Forgot your password?"
  now ends on — its body must keep saying the number is already confirmed),
  `editProfile.password.currentNeeded` (the server's refusal when the current
  password was needed: it must keep offering logging in again with a code as
  the other way) and `editProfile.password.provedRecently` (why the current
  password field is missing). Ungendered, in the polite plural, like the rest
  of `auth.*`.
- `admin` — the general manager and the branch manager (2026-10-16), provisional
  and **not** reviewed: `role.generalManager` ("General manager" / "Գլխավոր
  մենեջեր" / "Главный менеджер"), `staff.group.generalManager`,
  `staff.roleInfo.generalManager` and `staff.field.branchVenueWide`, which must
  keep saying a general manager works at **every** branch — it is why the form
  shows no branch picker. `role.manager` and `staff.group.manager` now name the
  **branch** manager in all three ("Մասնաճյուղի մենեջեր", "Менеджер филиала");
  the generic "a manager" in the tablet copy still means whoever manages, and
  stays. The PIN help (`staff.pin.help`, "no shared PINs") is unchanged and now
  true: the server refuses a PIN somebody on the same tablet already uses.
- `staff` — the kitchen screen (2026-09-11): its header title `kitchen.title`
  ("Kitchen" / "Խոհանոց" / "Кухня"). Provisional, **not** reviewed.
- `staff` — the floor screen: connection and sync states, the order and seating
  panel frames, and the install prompt. **Not** reviewed, and this set matters
  most of all: it is read by a waiter at arm's length during a rush, in Armenian
  far more often than in anything else.
- The QA sweep fixes (2026-10-16), provisional and **not** reviewed. `public`
  `page.opensOn` (the next opening on another day — the weekday comes from
  `hours.day.*`), `page.closedNow` (replaces `closedToday`, which was a guess)
  and `booking.closedNotice` (now one short sentence under the status line).
  `common` `floorPlan.table_*`, the accessible name of a table on every floor
  plan ("Table 4, 2 seats, free" — label, seats, then the legend's own state
  word). `staff` `table.noTab` / `table.noTabWhy` and `order.noTab` /
  `order.noTabWhy`, which must keep saying the **guest** opens the tab by
  scanning and that **this tablet cannot**; `connection.pollingHint` and
  `connection.refreshQueue` (the kitchen refreshes orders, not a floor);
  `panel.orders.awaitingWaiter`. Removed: `connection.notWired`,
  `connection.notWiredHint`, `order.tabWillOpen` — each promised something the
  screen could not do.
- `admin` — the platform-admin console redesign, phase 1 (2026-10-18): the
  shell, the shared error states, sign-in and the password page. The `hy`
  copy is the approved artboards' (`docs/design/console`), so the user has
  read it; `ru` and `en` were written from it and are **not** reviewed.
  - New: `nav.home`, `nav.settings`, `shell.mainNav`, `shell.skipToContent`,
    `toast.undo`, the whole `errors.*` section (404, 403, offline, session
    ended, server error; `errors.forbidden.*` replaces `forbidden.*`, and its
    body must keep saying the page **either does not exist or is not yours** —
    it is also what an unknown address shows, and must never tell the two
    apart), `settings.title` and `settings.language.*` (`changed` is written
    in its own language in each bundle: it is said after the switch).
  - Sign-in: `signIn.emailPlaceholder`, `.submitting`, `.locked` and
    `.lockedFor_*` (too many attempts; `_*` takes the minutes from the
    server's Retry-After, and the plain one must never name a number),
    `.emailRequired`, `.emailInvalid`, `.passwordRequired`, `.capsLock`,
    `.showPassword` / `.hidePassword` (shared with the password page),
    `.forgot`, `.noAccount`, `.welcomeTitle` / `.welcomeBody` /
    `.welcomeGo`, `.claim` / `.claimSub` (the sentence on the photo) and
    `signIn.forgotPage.*`. `forgotPage.body` says **1 hour** because that is
    `PasswordResetToken.Lifetime`; `forgotPage.sent` must keep not saying
    whether the address has an account. Rewritten from the artboards:
    `signIn.body`, `.submit` (hy "Մուտք"), `.failed`, and hy `.expired`
    ("Սեսիան", the Errors artboard's word).
  - The password page: `resetPassword.match`, `.ruleMet` / `.ruleNotMet`
    (read after each rule by a screen reader), `.strength.*`, `.saving`,
    `.linkNote`, `.claim` / `.claimSub`, `.invalidSignIn`,
    `.backToConsole`. `tooShort` lost its full stop (it is a rule line now)
    and `mismatch` was removed with the error it labelled. `invalidBody` and
    `linkNote` deliberately name no lifetime: the page spends both an
    invitation (24 hours) and a forgotten-password link (1 hour), and the
    token does not say which. Rewritten from the artboards in hy: `body`,
    `goToSignIn`, `invalidTitle`, `signedInBody`.
  - Changed in hy to the artboards' words: `role.platformAdmin`
    ("Պլատֆորմի ադմին") and `shell.signOut` ("Դուրս գալ").
- `admin` — the platform-admin console redesign, phase 2 (2026-10-18): the
  venues list, its plan / delete / create dialogs and the sign-in link shown
  once. `hy` is the Venues artboard's copy, with one deliberate change: the
  artboard glues suffixes onto names ("Sunset Lounge-ը կասեցվեց"), which
  `i18n:check` refuses, so every such line reads `«{{name}}» վայրը …`. `ru` and
  `en` were written from it and are **not** reviewed.
  - New under `venues.*`: `deletedCount_*`, `shownCount_*`, `footOf`,
    `deletedHidden`, `list`, `loading`, `filter.*` (search, the five status
    choices — `statusLive` is the default and must keep saying **active and
    suspended**, never "all" — and the four plan choices), `column.*`,
    `rating`, `ratingSr_*` (read instead of the star line), `noRating`,
    `issue.*` (the amber readiness line; `atBranch` appends the branch),
    `tierSummary.mixed` ("Mixed · 1/2": paid branches / all branches),
    `tierSummary.none`, `tierButton`, `menu.*` (hy uses "Վերականգնել" for both
    resume and restore, as the artboard does), `toast.*`, `empty.*`,
    `tierDialog.*`, `deleteDialog.*`, `add.*` and `once.*`.
  - `tierDialog.lead` must keep saying the change applies to **every branch**:
    the list's button switches all of them. `tierDialog.notReady_*` is the
    server's `branch-not-ready` refusal and `tierDialog.openTabs` its refusal
    to go Free with tabs open; both are read after the branch's name
    (`tierDialog.atBranch`).
  - `deleteDialog.typeName` carries a `<b>` around the name (rendered with
    `Trans`); keep the tag. `deleteDialog.body` must keep saying the venue
    can be **restored** from the Deleted filter.
  - `add.ownerLead` must keep saying the owner is **optional** and the link
    is shown, not sent. `once.body` must keep saying the link is shown **now
    and never again**; `once.help` takes the link's own expiry (`{{when}}`)
    rather than naming a lifetime. `once.pinHelp` exists because the server
    requires a tablet PIN of every staff member, so one is drawn for the owner.
  - Removed: `venues.search`, `venues.column.branches`, `venues.error`, and
    the old create page's `create.title`, `.lead`, `.venueSection`,
    `.branchSection`, `.namePlaceholder`, `.slugPlaceholder`, `.submit`,
    `.submitting`, `.cancel`, `create.error.branchRequired` and
    `create.error.generic`. The other `create.*` keys stay for the venue
    page's edit and add-branch forms (phase 3).
- `admin` — the platform-admin console redesign, phase 3 (2026-10-18): the
  venue page. `hy` is the VenueDetail artboard's copy, with the same
  deliberate change as phase 2 (no suffix glued onto a name: "Մուտք՝
  {{name}}" for the artboard's "{{name}}-ի մուտքը", "«{{name}}» վայրը" for
  "{{name}}-ը"). `ru` and `en` were written from it and are **not** reviewed.
  - New: the whole `venuePage.*` section — `crumbs`, `banner.*` (suspended,
    with or without a date, and deleted), `edit` / `suspend` / `delete`,
    `tabs.*`, `kpi.*`, `branches.*` (the branch table; `planButton` names the
    plan and the branch), `readiness.*` (the five lines; `ready` / `notReady`
    are read before each line by a screen reader), `facts.*`, `staff.*`,
    `wizard.*` (the four steps), `issue.*`, `once.*`, `bookings.*`,
    `editDialog.*`, `suspendDialog.*`, `branchDialog.*` and `toast.*`; and
    under `venues.tierDialog`, the one-branch `branchTitlePaid` /
    `branchTitleFree` / `branchRefusedPaid` / `branchRefusedFree` /
    `branchLead`.
  - `bookings.privacy` must keep saying the totals are all the platform
    sees: guests' names and phones are the restaurant's alone.
    `bookings.ofPast` and the two shares ("came", "no-shows") are of the
    bookings already past, never of those still ahead.
  - `issue.helpKeepsPassword` must keep saying the password works **until
    the new link is opened**; `issue.helpChangesAddress` that the new
    address takes over **from the moment the link is made**.
  - `wizard.phone` is required although the artboard drew it optional: the
    server refuses a staff member with no phone.
  - Removed with the old venue page: `venue.branches`, `.branchTables_*`,
    `.openTabs_*`, `.noBranches`, `.staff`, `.noStaff`, `.slug`, `.created`,
    `.suspendedOn`, `.suspend`, `.resume`, `.delete`, `.openConsole`,
    `.suspendTitle`, `.suspendBody`, `.suspendConfirm`, `.deleteTitle`,
    `.deleteBody`, `.deleteTypeName`, `.deleteConfirm`, `.cancel`,
    `.working`, `.staffFailed`, `venue.blocked.*` but `table` and `unknown`,
    `venue.tier.*`, `venue.edit.*`, `venue.addBranch.*`, and every `create.*`
    key but `typeCafe`, `typeRestaurant` and `typeBar`.
- `admin` — the platform-admin console redesign, phase 4 (2026-10-18): a
  branch's three pages. `hy` is the BranchPublic, BranchRooms and Reviews
  artboards' copy, with the same deliberate change as phases 2 and 3: the
  artboard's "{{name}}-ի կարծիքը թաքցվեց" reads "Կարծիքը թաքցվեց (հեղինակ՝
  {{name}})", and the hidden-by line names who hid it ("Թաքցրել է
  պլատֆորմը" / "… ռեստորանը") rather than a person, which the server does
  not send. `ru` and `en` were written from it and are **not** reviewed.
  - New: `branchPage.*` (the switcher's label, the sub-tabs and the app
    card's preview — `preview.live` must keep saying the preview follows the
    typing **before** anything is saved), `rooms.saveBar.*` (the rooms page's
    sticky bar; `clean` is the artboard's "all changes are saved") and the
    whole `branchReviews.*` section: the filters, `reports_*` (also read on
    the Reviews sub-tab), `stars_*` (read instead of the star line), the hide
    form and its five `reasons.*`, `reasonHelp` (must keep saying the
    **guest** does not see the reason and the review can be shown again),
    `toast.*`, the empty states, `summary.*` and `rules.*` (`lowRating` must
    keep saying a low rating alone is no reason to hide).
  - `empty.hiddenBody` is new copy: the artboard reuses the "nobody has
    written yet" line under the Hidden filter, which is untrue there.
  - `toast.dismissed` must keep saying the review **stays visible**.
  - Removed with the old platform reviews page: the whole `platform.reviews.*`
    section (`title`, `hide`, `unhide`, `reason`, `hiddenReasonLine`,
    `reasonRequired`, `hiddenBadge`, `empty`, `failed`). The venue console's
    own `reviews.*` are unchanged.
- `admin` — the platform-admin console redesign, phase 5 (2026-10-18): Home
  and Settings. `hy` is the Main and Settings artboards' copy, with the same
  deliberate change as before (no suffix glued onto a name: the feed's
  "Luna Cafe-ը դարձրեց վճարովի" reads "«{{target}}» մասնաճյուղը դարձրեց
  վճարովի", a person is "{{target}} աշխատողին"). `ru` and `en` were written
  from it and are **not** reviewed.
  - New: the whole `home.*` section — `sub`, `outbox.*` (the alert counts
    the **last 24 hours** and must never offer to resend: there is no retry,
    by decision; `outbox.type.*` names the five outbox message types),
    `kpi.*`, `drill.*`, `chart.*` (`bar_*` / `barToday_*` are read for each
    bar instead of its height), `notReady.*`, `recent.*` and `activity.*`
    (one sentence per audited action, read after the actor's name; none may
    name a guest, and the log has none to name). `activity.role.*` is the
    role as it reads inside a sentence (ru in the genitive after "в роли").
  - Settings: `settings.sub`, `settings.sections.*`, `settings.profile.*`
    (`cap` must keep saying the email is **changed in the server's
    configuration**, not here) and `settings.password.*` (`cap` and
    `changed` must keep saying the **other devices** are signed out;
    `currentWrong` is shown under the field, the session stays).
  - The server's `VenueStatus.Inactive`: `status.inactive` and
    `venues.filter.statusInactive` ("switched off" — not suspended, not
    deleted). `venuePage.branches.today` is the branch table's "Bookings
    today" column, as the VenueDetail artboard has it.
- `admin` — the console redesign, review fixes (2026-10-18), provisional and
  **not** reviewed in `ru`/`en`; `hy` follows the artboards where they have
  the line.
  - **Changed, not listed before:** `venues.column.tier` "Tier" → "Plan"
    (the artboard's word, in all three); `venues.empty.title` / `.body`
    rewritten to the artboard's ("No venue matches that search", "Try another
    name, or clear the filters"); `venue.notFound` removed with the old venue
    page in phase 3 — `errors.notFound.*` says it now.
  - **Changed now:** `venuePage.bookings.statusUpcoming` reads "Confirmed"
    (hy "Հաստատված", ru "Подтверждены"): the window looks back, so what is
    still ahead of it is confirmed, not upcoming. The key kept its name.
    `menu.category.confirmWithItems` has plural forms (`_one` names one dish;
    ru keeps its neutral "блюда ({{count}})" for the rest).
  - **New:** `errors.notFound.pageTitle` / `.pageBody` (an address nothing
    answers to) and `.branchTitle` / `.branchBody`; `errors.stillFailingError`
    (after a server error: must **not** promise a retry by itself — only a lost
    connection is retried alone, `errors.stillFailing`);
    `venues.tierDialog.checkingTabs`; `venues.add.linkFailed` (must keep
    saying the owner **was added** with the PIN shown);
    `home.activity.action.staffCreateNoRole` (no role on record: guess none);
    `settings.password.changedPlain` (said when the server renewed no session:
    claims nothing about other devices), `settings.password.tooMany_*` (the
    wait from `Retry-After`, in minutes) and `.tooManyNoWindow` (no number).
- Short-notice bookings waiting for the floor (2026-10-18), provisional and
  **not** reviewed. `staff` `approvals.*` — the floor tablet's requests panel:
  the header count, the countdown (`leftLabel`, `answerWithin`), the context
  lines (`before_*`, `sittingNow*`, `next_*`, written so the time stands alone:
  hy "սկսած {{time}}", never a suffix glued onto it), Call, Approve / Decline
  and the optional reason, the notices, `tooLate` and the screen-reader line
  `arrived_*`; and (review round) `previousStatus.*` — the word after the
  earlier booking on the "Before" line, lower case, read after the guest's
  name ("seated now", "finished", "didn't come") — `doneApproved`,
  `doneDeclined` and `answeredElsewhere`, which must say **someone else**
  answered, never that the tap failed. `admin` `approvals.because.shortNotice`, `leftToAnswer`,
  `timeUp`, `tooLate`, and `approvals.body` reworded to say short-notice
  bookings land here too. `diner` `booking.approval.*` (`waiting` must keep the
  time as a countdown, "answer within 12:41"), `booking.declined.*` — the
  `noAnswer` pair must **apologise** (the venue failed to answer, not the diner),
  the `byVenue` pair must not blame the diner — `bookings.status.declined`
  ("Not confirmed", never "cancelled": it was never confirmed) and
  `notifications.kind.bookingExpired.*`, the feed's apology for the same.
  Added with the declined-change rules (2026-10-18), **not** reviewed:
  `notifications.kind.bookingChangeKept*.*` — a change the venue did not
  confirm, the booking **standing at its old time** ({{time}}); the `Expired`
  pair apologises — and `bookingChangeEnded*.*`, the same change when the old
  time had gone too and the booking **ended**; `book.changeError.approvalExpired`
  ("too late to change"), which must not read as a table rule. hy writes the
  requested time in brackets ("(ժամը {{requestedTime}})") rather than gluing a
  suffix onto it.
- `diner` — the host's join banner (2026-10-18), provisional and **not**
  reviewed: `tab.joinRequest.*`, the card at the top of the host's bill when
  somebody scanned the table and waits to be let on. `one` keeps the name
  first and joins with `՝` in hy rather than gluing `-ն` onto it; `several_*`
  is only ever said for two or more. `waitingOne` / `waitingSeveral` address
  the host in the polite plural (`Ձեր`, `вашего`). `rejected` names nobody and
  ru keeps it impersonal ("В счёт не добавили"), so it never needs a gender.
  hy says `ցանկանում է/են միանալ`, the formal verb the host's push uses. The
  buttons show `people.approve` and `people.reject`; `approveNamed` and
  `rejectNamed` are what a screen reader hears for one person, and must keep
  the visible label in them. `notAll` follows what went through with "the
  rest are still waiting", the people the banner still shows.
- `diner` — QA round 2 (2026-10-18), provisional and **not** reviewed:
  `bookings.detail.chooseAnotherTime` (the way forward from a declined booking:
  the same place, day and party), `bookings.detail.codeDeclined` (the code of a
  booking that was **never confirmed** — not "cancelled"),
  `push.optIn.declinedPending` (no reminder, said of a request still waiting —
  it must **not** say the table is held), `booking.freeBy.promisedNote` (the
  earlier guest's own promise, "You said you'll leave by {{time}} — the table is
  booked after you"; hy joins the two halves with `․`),
  `booking.approval.waitingVenueEarlierGuest` / `checkingVenueEarlierGuest` /
  `venueAsksEarlierGuest` (the floor checking with a guest before who cannot
  answer in the app: the **venue** asks, with the same two-hour countdown as
  `waitingEarlierGuest`), `tables.pin.requestEarlierGuest` / `requestVenue` (a
  table booked just before that can be had by asking — never "reserved") and
  `tables.legend.request` ("On request", short: a legend entry),
  `confirm.error.overlapsOwn` / `overlapsOwnPlain` (the diner's own booking at
  the same place and time; hy writes "ժամը {{time}}" and "(սեղան {{table}})",
  as `public` does, rather than a suffix glued onto either) and
  `overlapsOwnOn` / `overlapsOwnOnPlain` (the same, with the day, when the
  booking held is on another day than the one being booked).
- Booking times and table sequencing (2026-10-18), provisional and **not**
  reviewed. `diner` `book.wheel.*` — the time wheel: `snapped` ("No free table
  at {{busy}} — {{time}} suggested"; hy writes "Ժամը {{busy}}" rather than a
  suffix glued onto the time), `nothing` (no time can be had that day), `none`
  (nothing chosen — a change whose own time is gone), `hint` (the screen
  reader's "swipe up or down"); `book.quick.*` — the quick chips, `soon` keeps
  the minutes and the clock time ("In {{minutes}} min · {{time}}");
  `book.freeBy.*` — the question before sending a booking the next one cuts
  short: `question` must name **both** the next booking's start and the time to
  free the table by, and must stay a question the diner answers (hy
  `Կազատե՞ք`, ru `Вы освободите … ?`); `yes` repeats the time, `no` offers
  another table or time, `agree` is the web page's checkbox, `other` /
  `otherNoTimes` follow a no. `table.mustFreeBy`, `table.requestable.earlierGuest`
  (the guest before **is asked** — never that the table is free),
  `booking.approval.waitingEarlierGuest` (keeps the countdown, like `waiting`)
  and `checkingEarlierGuest`; `booking.declined.earlierGuest*` — the guest
  before said no, or did not answer in time; both offer **another time or
  table** and neither blames the diner; `booking.freeBy.promised`;
  `booking.tableRequest.*` — the earlier guest's card and the push's two
  buttons: `question` keeps the later guest **anonymous** ("someone") and asks
  whether they will have left by {{freeBy}}; the formal `Ձեր` / `Вы`; `yes` /
  `no` are also the lock-screen buttons, so keep them short;
  `confirm.error.freeByRequired*`; `booking.tableRequest.title` ("A request
  for your table") must not repeat the question under it. The feed's
  `notifications.kind.tableRequest`, `tableRequestAccepted` and
  `tableRequestDeclined` (the earlier guest's question and what their answer
  did; the place goes in brackets in hy), and `bookingDeclinedEarlierGuest` /
  `bookingDeclinedEarlierGuestNoAnswer` (the later guest told — another time or
  table, never blame). `public` `booking.timeOnRequest` (a time
  select option, "{{time}} · on request"). `staff`
  `approvals.because.earlierGuestConsent` ("The guest before can't be asked in
  the app — call them": the floor decides, after ringing them; a badge, so
  short), `approvals.askBefore` (ring them: hy puts the
  name in brackets rather than declining it, ru keeps the verb impersonal —
  "освободится ли стол"), `approvals.leavesBy`, `table.mustFreeBy` (lower case,
  after the next booking's time on the floor and on the card),
  `approvals.awaitingEarlierGuest` (a booking the guest before answers **in
  the app**: not the floor's to approve or decline — it is decided when they
  answer, or declined if they do not; said on such a card in place of the
  buttons, and when the server refuses a decision for one). `admin`
  `approvals.because.earlierGuestConsent` and `approvals.awaitingEarlierGuest`
  (the same sentence in the console). `diner`
  `booking.approval.venueWillConfirm` (the floor's own question to the guest
  before, for another day: **no clock** — so no time in it, and the venue,
  not the guest before, is who answers).

- `staff`, `admin` and `public` — QA round 2 (2026-10-18), provisional and
  **not** reviewed. `staff` `approvals.approvedNoticeOn` / `declinedNoticeOn` /
  `arrivedOn_*` (a booking request **not for the branch's today**, dated — "on
  Tue 20 Oct at 19:45"; hy and ru put the date between commas rather than
  after a preposition, and keep "ժամը" / "в" before the time like the undated
  sentences); `billRequest.pickTitle` (the table **asked for the bill** in the
  app — nobody pays in the app). `admin` `home.activity.action.reviewRestore`
  ("put back the reports on a review", the undo of `reviewDismiss`) and
  `home.activity.action.other` (now a neutral "made a change", **never** the
  raw action code); `venues.tierDialog.noReturn` / `noReturnVenue` (going Free:
  the branch can't come back to Paid until its menu is finished — a warning,
  not a refusal; the reasons follow as a list); `venues.tierDialog.paid2`,
  `free2` and `venuePage.facts.planPaid` (no payment in the app: guests ask for
  the bill in the app and pay the waiter); `venuePage.kpi.bookings30` (the
  **past** 30 days by start, not the next 30). `public` `booking.overlapsOwn` /
  `overlapsOwnPlain` (the visitor's own booking at the same place and time,
  with its time and table; formal `Դուք`), and `overlapsOwnOn` /
  `overlapsOwnOnPlain` (the same, when that booking is on another day — last
  night's 23:30 — so the date comes first).
- `admin` — the venue console redesign, phase 1 (2026-10-19): the shared
  sidebar and My account. The `hy` copy is the approved artboards'
  (`docs/design/venue-console`, Main and Account), so the user has read it,
  except where marked; `ru` and `en` were written from it and are **not**
  reviewed.
  - The sidebar: `shell.brandSub` (the small "console" beside the brand),
    `nav.group.*` (the four headings), `nav.account` (the line under the
    person at the foot, which opens My account) and `nav.badge.*_*`, the
    sentence a screen reader hears in place of a count on a link — pending
    approvals, unfinished dishes, reported reviews. The badges' `hy` was the
    artboards' aria-labels; `reportedReviews` adds "կարծիք" the artboard left
    implied. Changed in `hy` to the artboards' words: `nav.overview`
    ("Ամփոփում"), `nav.floorplan` ("Սրահներ և սեղաններ") and `nav.staff`
    ("Աշխատողներ"); `ru` and `en` keep theirs. `branchSwitcher.onlyOne` now
    says "{{name}} branch" in every language (hy "{{name}} մասնաճյուղ", the
    artboard's), since it stands alone in the sidebar.
  - My account (`account.*`): the title and `sub` (role · venue),
    `signOutDialog.*` (the body must keep saying the **tablet PIN does not
    change**), `profile.emailByTeam` / `emailByOwner` (who changes the email:
    the Yalla team for an owner, the owner for everybody else),
    `password.title`, `pin.*` and `sessions.*`. The name, password and
    language cards reuse `settings.profile.*`, `settings.password.*` and
    `settings.language.*`, the platform admin's, unchanged. Not in the
    artboard, so **not** read by the user even in `hy`: `pin.taken` (somebody
    on the same tablet has that PIN), `pin.changing`, `pin.failed`,
    `sessions.cap` (must keep saying Yalla records **no devices or places**),
    `sessions.thisBrowser`, `sessions.other`, `sessions.activeNow`,
    `sessions.lastActive`, `sessions.today`, `sessions.onDay`,
    `sessions.signingOut`, `sessions.endedNone`, `sessions.loadFailed` and
    `sessions.failed`; `pin.repeat` is "Կրկնեք PIN-ը" where the artboard's
    label was a bare "Կրկնեք". `sessions.ended_*` counts the **other**
    sign-ins ended (the artboard's "Մյուս 2 սարքերից դուրս եկաք"). Formal
    `Դուք` throughout.
  - Review fixes: `home.activity.action.signOutOthers` (Home's feed line for a
    venue person's "sign out everywhere else", **not** in an artboard); the
    feed's `account.rename` and `account.password-change` lines reuse
    `home.activity.action.rename` / `.password`. `nav.floor` is kept: a
    branch manager's sidebar still links the floor screen, which the
    artboards do not draw. Removed with the old sidebar, nothing renders them:
    `shell.title`, `shell.signedInAs`, `shell.openMenu` and `shell.closeMenu`.
  - `account.sessions.signInUnknown` and `.signInAgain` (2026-10-19, **not**
    in an artboard): "sign out everywhere else" refused with 409
    `sign-in-unknown` because the token predates sign-ins being named. Must
    keep saying **nothing was signed out** and that signing in again is the
    fix; the button signs this browser out to the sign-in page.

- `admin` — the venue console redesign, phase 2 (2026-10-19): Overview. The
  `hy` copy is the approved Main artboard's (`docs/design/venue-console`),
  except where marked; `ru` and `en` were written from it and are **not**
  reviewed. Formal `Դուք` throughout.
  - New `overview.*`: the greeting by the branch's clock (`greeting.*`, with
    a `*Plain` form when the name is not known), `sub`, the hours pill
    (`hours.*`), the four numbers (`kpi.*`), today's bookings
    (`bookings.*`: filters, columns, channels, statuses, the row menu's
    `action.*` and its toasts `done.*`), the load chart (`load.*`) and
    "worth a look" (`attn.*`). Not in the artboard, so **not** read by the
    user even in `hy`: `noBranch`, `hours.openNextDay`, `.openNow`,
    `.closedOpensAt`, `.closedToday`, `kpi.nothingUnpaid`, `.noLastWeek`,
    `.sameAsLastWeek`, `bookings.status.completed` / `.cancelled`,
    `bookings.done.noShowKept` (a no-show whose table somebody else sits at),
    `.finishedOwed`, `bookings.failed`, `.offline`, `bookings.nudged` /
    `.nudgeAt` (the backend has no manual "are you coming?", so a late row
    says when the app asked — must keep saying it is **the app** that asks),
    `bookings.empty*`, `bookings.truncated` (more than 200 today), `load.hour*`,
    `load.nextDay` (an hour past midnight of the service day), `load.peakNoSeats`, `load.empty`,
    `attn.device*`, `attn.bookingsOff*` and `attn.empty`. `kpi.vsLastWeek`
    says "the same day last week" rather than the artboard's weekday, which
    would need a case per weekday. The `hy` toasts that name a guest or a
    table put the name after a colon or leave the case ending off
    (`i18n:check` refuses a suffix glued to a value).
  - The approvals moved from the policy screen to Overview: `approvals.*`
    `title`, `body`, `empty`, `party_*` ("հոգի"), `leftToAnswer`, `timeUp`,
    `reasonLabel` and `reasonHint` now carry the artboard's `hy`; new
    `dismiss`, `approved`, `declined` (toasts) and `minutesLeft_*` (the
    clock's screen-reader label, **not** in the artboard).
  - The setup card: `checklist.title`, `.body`, `.progress` and four
    `checklist.step.*` take the artboard's `hy`; new `progressLabel`, `done`,
    `todo`. Removed, nothing renders them any more: `checklist.finish`,
    `.elsewhere`, `onboarding.blockers.*` and
    `onboarding.steps.acceptsWebBookingsOptional` (online bookings switched
    off is now a "worth a look" line).
  - Review fixes (2026-10-19), **not** in an artboard, so not read by the user
    even in `hy`: the row refusals `overview.bookings.refused.*` (one sentence
    per refusal the routes document — `moved`, `tableTaken`, `sittingChanged`,
    `tableCannot`, `forbidden`, `gone`, `offline`, `generic`; the server's
    English is never shown; they replace `bookings.failed` and `.offline`);
    the undo of a no-show or a cancellation, `bookings.held.*`, `.heldNote`
    (must keep saying it is sent **unless undone**) and `.undone` (must keep
    saying **nothing was sent**); `bookings.done.replay` (a repeat that had
    already landed, with the booking's status); `bookings.status.changeRequested`
    and `.changeNote` (a confirmed booking whose change waits — answered in the
    approvals card, not from its row); `bookings.status.unknown`;
    `bookings.nudgeAt` now says the app **will** ask; `kpi.bookingsFootChanges`;
    `kpi.revenueSince` (the takings counted from the first opening);
    `load.onlyPending` and `load.pendingLegend` (requests drawn on top of the
    bars); `load.aria` now names the hour now; `attn.device` / `.deviceOn` /
    `.deviceBody` say "not heard from since", never "lost its connection" — a
    tablet's last-seen moves only on a sign-in or a renewal.
  - QA fix (2026-10-19), **not** in an artboard: `overview.bookings.tableTaken`
    and `.tableOutOfService`, the reason under a disabled "Mark seated" in the
    row menu when the booking's table is occupied or out of service, and the
    sentence for the server's `invalid-table-transition` on a seat. `hy` names
    the table without a glued case ending ("Սեղան 1 հիմա զբաղված է").

- `admin` and `public` — the venue console redesign, phase 3 (2026-10-19):
  Menu, Rooms and Hours with special days. The `hy` copy is the approved
  artboards' (`docs/design/venue-console`, Menu, Rooms and Hours), except where
  marked; `ru` and `en` were written from it and are **not** reviewed. Formal
  `Դուք` throughout. Where an artboard glued a case ending onto a name
  ("{name}-ը պահպանվեց", "Սեղան {n}-ը"), the `hy` puts the name in «» or after
  a colon instead (`i18n:check` refuses a glued suffix).
  - Menu (`menu.*`): the header line (`sub`, `dishCount_*`, `inCategories_*`),
    the banners (`incomplete.title_*` / `.body`, `allReady.*`), the category
    card (`category.cap`, `.missingAria_*`, `.rename`, `.delete`,
    `.deleteBody_*`, `.deleteEmpty`, `.orderSaved`, `.added`, `.renamed`,
    `.deleted`), the search (`search.*`), the table (`column.dish` /
    `.status`, `gap.*` — the six fields a guest would otherwise ask, in the
    drawer's order — `dish.availableAria`, `.noDescription`), the drawer
    (`dish.*`: titles, the to-do box, `nameRequired`, `priceInvalid`,
    `noAllergens`, `saveDraft`, the save and delete toasts) and bulk photos
    (`bulk.*`). Not in the artboard, so **not** read by the user even in `hy`:
    `category.restored`, `.saveFailed`, `dish.restored`, `.deleteFailed`,
    `.saveFailed`, `.availabilityFailed`, `.deactivatedInstead` (a dish on an
    order is kept and marked sold out — must keep saying it was **not
    deleted**), `orderFailed`, `undoFailed`, `empty.noCategoryBody`,
    `bulk.chooseFor`, `bulk.attachOne`, `bulk.done_*`, `photo.alt`,
    `photo.remove`, `field.allergensOther` (now "Other allergens", shown only
    for text typed before the boxes existed). `photo.accepted` now ends with
    the 4:3 sentence, as the drawer's help does. "No allergens" is stored as
    `none`, so `diner` reads it with its own `menu.noAllergens`.
  - Rooms (`rooms.*`): nearly every key, rewritten from the Rooms artboard
    (`intro`, `stage.*`, `pin.*` — now how a table is booked, not its live
    state — `field.*`, `table.*`, `unpinned.*`, `inactive.*`, `delete.*`,
    `qr.*`, `saveBar.*`, `conflict.*`). Not in the artboard, so **not** read by
    the user even in `hy`: `room.menu`, `.rename`, `.renameTitle`, `.renamed`
    (the artboard has no rename; it moved to a ⋮ menu on the room),
    `photos.menu`, `.addTitle`, `.addBody`, `.moveEarlier`, `.moveLater`,
    `delete.undone` (a delete's undo puts the table back **as an unsaved
    change**), `conflict.reloadFailed`, `list.duplicate` (from the artboard's
    logic, not its markup). Removed, nothing renders them: `rooms.newTable.*`,
    `table.inRoom`, `.notPinned`, `unpinned.noRoom`, `.hint`, `inactive.body`,
    `photos.title`, `.add`, `.full`, `rooms.unsaved`.
  - Hours (`hours.*`): the week (`sub`, `week`, `zone`, `today`, `openAria`,
    `split` — "+ Ընդմիջում" — `copy*`, `fromAria` / `toAria`, `removeSpan`),
    the save bar and its toasts, "what a guest sees now" (`now.*`), the page
    summary (`summaryTitle`) and special days (`special.*`). Not in the
    artboard, so **not** read by the user even in `hy`: `special.past`,
    `.tooFar`, `.noteTooLong`, `.badHours`, `.failed`, `.restored`,
    `.affected_*` (bookings on a saved date that no longer fit its hours —
    must keep saying they were **not changed**). `special.closedDay` and
    `.otherHours` name a day with no note; the note itself is shown to
    diners. `public` `hours.special` heads the list on the public page.
  - The branch switcher's question over unsaved work (`unsavedChanges.switch*`,
    `.stay`), from the Hours artboard, now asked in the console's dialog
    rather than the browser's.

- `admin` — the venue console phase 3 review round (2026-10-19), **not** in an
  artboard, so not read by the user even in `hy`: `hours.special.now` (last
  night's special day, still running past midnight, read-only),
  `hours.special.superseded` (the list moved twice while one change was
  re-applied — must keep saying the **newer list is loaded** and nothing of
  theirs was overwritten), `menu.dish.photoRemoved` (must keep saying guests
  **do not see** the dish without a photo), `menu.dish.photoRemoveFailed`,
  `rooms.delete.undoGone` (a delete's undo pressed after leaving Rooms or
  during a save — must keep saying the table was **not** put back), and
  `unsavedChanges.leaveTitle` / `.leaveConfirm`: the console's own dialog for
  a link clicked over unsaved work, which replaced the browser's confirm.

- `admin` and `diner` — the venue console redesign, phase 4 (2026-10-19):
  Policy, Public and Reviews with replies. The `hy` copy is the approved
  artboards' (`docs/design/venue-console`, Policy, Public and Reviews), except
  where marked; `ru` and `en` were written from it and are **not** reviewed.
  Formal `Դուք` throughout. Where an artboard glued a case ending onto a name
  or a time ("Lilit Sargsyan-ը", "19:10-ին", "Լուսանկար 3-ը", "դիմեք
  Aram Hakobyan-ին"), the `hy` puts it after a colon or rephrases
  (`i18n:check` refuses a glued suffix).
  - Policy (`policy.*`): the header line (`sub`, `changedCount_*`,
    `allDefault`), the groups and every field's label and sentence
    (`group.*`, `field.*` — `minLeadMinutes.why` is followed by `lead.*`,
    which says what the number means for a 19:00 table), the stepper
    (`decrease`, `increase`, `default`, `reset`, `changed`, `defaultOn` /
    `Off`, `outOfBounds`), what a guest sees per group (`guestSees`,
    `example.*`), the result after a save (`result.*` — must keep saying the
    bookings were **not changed or cancelled**) and the save bar (`saveBar`,
    `bar.*`, `discard`, `discarded`, `fixFirst`, `noChanges`). Not in the
    artboard, so **not** read by the user even in `hy`: `atLeast` (the two
    counts with no ceiling), `refused` (the server refused a value this form
    thought fine), `tocLabel`, `tocChanged_*`, `example.approvalAll` (no
    party-size threshold), `bar.unreviewed` (a policy nobody has confirmed
    yet: saving it unchanged confirms it, which is what ticks "policy
    reviewed"). Removed, nothing renders them: `policy.shipped`,
    `.serviceChargeNote` (folded into the service charge's sentence, as the
    artboard does) and `policy.affected.*`.
  - Public (`publicPage.*`): `sub`, `page.*`, the cover, phone and booking
    switch's help, `phone.invalid`, `unsaved`, `saved`, and in `listing.*`
    the intro, the helps, the map pin's errors, `address.*`,
    `relocateOwnerOnly` (now says to contact the owner — never names them),
    `gallery.*` (every photo control now says its number) and the saves'
    lines and toasts. Not in the artboard, so **not** read by the user even
    in `hy`: `page.capPlatform` and `listing.introPlatform` (the platform's
    branch page, which does not say "your"), `cover.changed`'s wording,
    `gallery.removed` (a photo taken out of the gallery — must keep saying
    to **save** for guests to see it), `listing.checkFields`. Removed:
    `publicPage.intro`, `listing.gallery.empty`.
  - Reviews (`reviews.*`): `sub`, `reasonHelp`, `platformHidden`, `empty`,
    `hiddenByYalla`, `hiddenByName`, `hiddenByVenue`, the reply (`reply.*`:
    the signature "name, role", the form, its help — which must keep saying
    the reply is **public** and signed — `published`), `summary.up` /
    `.down` and `rules.lowRating` (the venue's version: Yalla can bring back
    hides without a reason). Not in the artboard, so **not** read by the user
    even in `hy`: `reply.edited`, `reply.updated` (an edit notifies nobody, so
    it must not say the guest will be told), `reply.hidden`,
    `hiddenByVenue`. The filters, the hide form, the summary and the rules
    are the platform's `branchReviews.*`, shared. Removed:
    `reviews.filter.*`, `.hiddenBadge`, `.hide`, `.unhide`,
    `.hiddenReasonLine`, `.reasonRequired`, `.reports_*`.
  - The diner app (`diner`): the venue's reply under a review
    (`place.review.reply.*`; the role names are lower case, read after the
    name) and the feed row for it (`notifications.kind.reviewReplied`, the
    first reply only). Written by the team, **not** reviewed.

- `admin` and `diner` — the venue console phase 4 review round (2026-10-19),
  **not** in an artboard, so not read by the user even in `hy`:
  `branchReviews.reply.*` (the platform takes a venue's reply down — the
  confirm must keep saying it **cannot be undone**, because only the venue
  writes replies), `home.activity.action.reviewRemoveReply`,
  `reviews.reply.reviewEditedAfter` and `diner` `place.review.reply.reviewEditedAfter`
  (the guest changed the review after the answer), `diner`
  `place.review.reply.roleOnly` (the role signs alone when the server drops a
  name that looks like contact details), and `reviews.reply.hidden` reworded
  to fit a review hidden by the venue **or** by Yalla.

- `admin` — the venue console redesign, phase 5 (2026-10-19): Staff and
  Reports. The `hy` copy is the approved artboards' (`docs/design/venue-console`,
  Staff and Reports) where they have it, with a glued suffix rephrased after a
  colon (`Ավելացվեց՝ {{name}}`, `PIN-ը ապակողպվեց՝ {{name}}`); `ru` and `en`
  were written from it and are **not** reviewed. Formal `Դուք` throughout.
  - Staff (`staff.*`, `devices.*`, `venuePage.wizard.branchFixed`): the
    header's `onShift_*`, the row's words (`action.notYours` is now "above
    your role", `action.unlock`, `.reactivate`, `.issueSignIn`, `.sendNewLink`,
    `status.pinLocked`), `empty.noMatch*`, `once.*`, `toast.*` (deactivated —
    the toast carries an Undo), `ownPin.changedToast`, and the tablets'
    `code.title`, `.lead` (must keep saying the code works **once** and until
    when), `.label`, `revokeNamed`, `revokedToast`, `confirm.*` (must keep
    saying a revoke is **permanent**). Not in the artboard, so **not** read by
    the user even in `hy`: the shift editor (`staff.shift.*`, `action.shift`),
    which HANDOFF section 6 asked for as "a small editor" without drawing it —
    `shift.error.overlap` must keep saying the overlap is checked at **any
    branch**, `shift.lead` names the branch the shifts are planned at;
    `devices.codeFailed`, `revokeFailed`.
  - Reports (`reports.*`): every section's title and caption, the range line
    (`range.line_*`, `incomplete`, `chooseValid`), the deltas (`delta.change`
    with `upWord` / `downWord` for a screen reader — the arrow is not read),
    the summary's six numbers, the revenue line and its table (`revenue.*`),
    the funnel and lead-time buckets (`reservations.*`, `lead.*`), turn time
    and the walk-in split (`occupancy.*`), the menu rankings and voids
    (`menu.*`), and the CSV toasts (`export.*`). `occupancy.overPolicy` /
    `.withinPolicy` keep their meaning; only the wording moved to the
    artboard's. Removed with the old screens: `staff.signIn.*` (but
    `tooManyRequests`, `emailTooLong`, `copied`, `selectAndCopy`),
    `staff.wizard.*` (but `branchLabel`, `coOwnerNote`), `staff.field.*` (but
    `name`, `phone`, `branchFixed`, `branchVenueWide`), `staff.form.title` /
    `.create`, `staff.status.*` (but `pinLocked`), `staff.pin.help` /
    `.shownOnceBody` / `.neverShared`, `devices.regenerate`, `.neverSeen`,
    `.code.instructions`, `.code.expires`, and the old reports' `intro`,
    `comparedWith`, `chart.*`, `range.showing`, `export.failed`,
    `summary.covers` / `.tablesTurned` and the section blurbs.
  - Review round 1 (2026-10-19), **not** in an artboard: `reports.export.readyAll`
    is one sentence now ("Export everything" writes **one** file), and
    `venues.once.pinNag` warns once before "Try again" closes a dialog that
    shows a PIN (it must keep saying the PIN will **not** be seen again).
    Removed: `reports.occupancy.sittings_*`.

- `staff` — the floor tablet redesign, phase 1 (2026-10-19): the top bar, the
  floor grid and the "Now" rail. The `hy` copy is the approved Main artboard's
  (`docs/design/floor-tablet`) where it has it; `ru` and `en` were written from
  it and are **not** reviewed. From the artboard: `views.label`,
  `connection.chip.live` / `.offlinePending_*` / `.stale_*`, `floor.rooms.*`,
  `floor.tables`, `floor.card.*` (the card's state line — `seated_*` and
  `seatedLong_*` use "ր", the artboard's short minute — and the line under
  it), `floor.pendingMark` ("չի ուղարկվել"), `rail.label`, `rail.title`,
  `rail.occupied_*`, `rail.minutes_*`, `rail.calls.reason.*` (read after the
  table: "Սեղան 4 խնդրում է հաշիվ"), `rail.calls.ackNotice`, `rail.ready.*`,
  `rail.unresolved.line`, `unresolved.body` / `.settle`, and in `hy` only
  `approvals.title`, `approvals.empty`, `approvals.answerWithin` ("մնաց",
  before the clock), `panel.calls.title`, `panel.orders.advance.served` and
  `queue.conflicts_*`. Not in the artboard, so **not** read by the user even
  in `hy`: `views.kitchenWaiting_*` (the Kitchen tab's count: orders new or
  cooking), `connection.chip.livePending_*` and `.offline`,
  `session.switchPerson` (the person button's name — must keep saying a tap
  signs out and hands the tablet over), `floor.card.heldFor`, `.walkInOnly`
  and `.debt`, and `rail.toSend.title` (orders nobody has sent to the kitchen
  stay on the rail, because only a waiter can send them). Removed with the
  old header and panel: `approvals.headerCount_*`, `queue.pending_*`,
  `.synced`, `.syncing`, `.offline`, `session.signedInAs`, `.handOverHint`,
  `panel.calls.line_*` and `panel.calls.reason.*`.
  - Review round 1 (2026-10-19), **not** in an artboard: `views.floorWaiting_*`
    (the Floor tab's count while the kitchen shows: bookings to answer and
    calls), `connection.chip.waiting_*` (the queue's count beside a failing or
    connecting state — it must keep saying the actions are **waiting**, not
    lost), `connection.chip.name` (the chip's accessible name: its words, then
    what a tap refreshes; hy ends the first with "։"), `rail.calls.ackQueued`
    (offline "On my way" — it must keep saying the guest sees it only **when
    the connection returns**), and `rail.ready.placed_*` (the age on a rail
    order counts from when it was **ordered**). Reworded: hy
    `floor.rooms.label` "Սրահներ" (it named the same thing as the Floor tab),
    hy `floor.card.walkInOnly` "միայն առանց ամրագրման" (it read as "nobody
    booked it"), ru `connection.chip.stale_*` "Данные устарели на … мин".

- `staff` — the floor tablet redesign, phase 2 (2026-10-19): the table panel
  and the PIN gate. The `hy` copy is the approved Table and Pin artboards'
  where they have it; `ru` and `en` were written from it and are **not**
  reviewed. From the artboards: `table.close`, `table.fact.*`,
  `table.overSeats_*`, `table.billAsked_*`, `table.warn.bookedAt` / `.freeBy`,
  `table.action.seatBooking` / `.cash` / `.seatHeld`, `table.free.title` /
  `.owed` (must keep saying the tab stays **open** and goes to "Needs
  resolving"), `table.held.title`, `table.release.ask` / `.why` /
  `.noShowTitle` / `.noShowNote` / `.cancelledTitle` / `.cancelledNote` /
  `.confirm`, `table.affected.count_*`, `pin.onShift`, `pin.byId`,
  `pin.promptSub`, `pin.promptSubTyping`, `pin.connected` / `.noConnection`,
  `pin.foot`, `pin.otherKey` / `.otherKeyName`, `pin.keypad`, and in `hy` only
  the reworded `table.offlineNote`, `table.action.holdLate` / `.takeOrder` /
  `.outOfService` / `.returnToService`, `table.affected.release`, and
  `pin.lockedByIdle` / `.whoTitle` / `.rosterFailed` / `.staffId` /
  `.staffIdWhy` / `.prompt` / `.promptNamed` (the first name now) / `.wrong` /
  `.locked` / `.offline`. Not in an artboard, so **not** read by the user even
  in `hy`: `table.subRoom`, `table.cashNeedsOnline`, `table.warn.long` /
  `.longNext` / `.longPromised`, `table.held.body` (the hold has no expiry a
  tablet can read — it must not promise a time), `pin.someoneElseMore_*`,
  `pin.byStaffId`, `pin.until` / `.from` / `.meta`, `pin.role.*` (short role
  names for the PIN rows) and `notice.acted.*` (what a table action just did;
  `.queued` must keep saying it is sent **when the connection returns**).
  Reworded: `table.release.difference` names the new choices ("They didn't
  come" / "They let us know") and must keep saying only the first goes on the
  diner's record; `pin.askManager` now names the console's Staff → Unlock PIN.
  Removed: `table.seatsHint_*`, `table.warn.balance`, `table.release.noShow` /
  `.cancelled` and `pin.submit`.
  - Review and live QA (2026-10-19), **not** in an artboard: `table.late.body`
    and `table.held.body` now say how late (`table.lateFor_*`,
    `table.lateForHours`: "20 min late", "1 h 39 min late") instead of
    "held until", which used a time that meant something else; `table.held.kept`
    (a hold with nothing due — it must not say anybody failed to arrive);
    `floor.card.late` (a booking past its time, on the card). Reworded:
    `table.release.difference` quotes the full second choice; hy
    `pin.staffIdWhy` has the console's Edit step back; hy
    `table.affected.body` says «սպասարկումից» like the actions; ru
    `table.affected.release` means "our doing" like hy and en.
    `notice.releaseNotDue` (the server refused a no-show before the booking's
    start — it must keep saying **nothing was released**).
    And `admin` `overview.bookings.refused.notStarted`, the console row menu's
    sentence for the same refusal (must keep saying **nothing was changed**).

- `staff` — the floor tablet redesign, phase 3 (2026-10-19): order entry, the
  tab and cash. The `hy` copy is the approved Order, Tab and Cash artboards'
  where they have it; `ru` and `en` were written from it and are **not**
  reviewed. From the artboards: `order.title` / `.back` / `.tabOpen` /
  `.offline` / `.searchPlaceholder` / `.menuFromCache` / `.noMatch` /
  `.clearSearch` / `.soldOut` / `.soldOutNotice` / `.draft` / `.draftEmpty` /
  `.emptyDraft` / `.less` / `.more` / `.whoTable` / `.whoGuest` / `.noteLabel` /
  `.noteDone` / `.whoExplained` / `.send_*` / `.sendNothing` / `.sentTitle_*` /
  `.savedTitle_*` / `.sentBody` / `.savedBody` (must keep saying the kitchen
  **cannot see it yet**) / `.addMore` / `.toFloor`; `tab.ordered`, `tab.lines_*`,
  `tab.lineStatus.*`, `tab.whoShared`, `tab.voidLine`, `tab.compLine`,
  `tab.voidWhy`, `tab.voidReason.*`, `tab.reasonPlaceholder`, `tab.pickReason`,
  `tab.compTitle`, `tab.discountWhole`, `tab.compSeen`, `tab.compReason.*`,
  `tab.discountSize`, `tab.compGive`, `tab.discountApplyPercent`,
  `tab.markUnpaid*` (the typed word is `ԿՈՐՈՒՍՏ`; `en` LOSS, `ru` УБЫТОК; the
  warning must keep the amount and **cannot be undone**), `tab.dishes`,
  `tab.serviceCharge`, `tab.toPay`, `tab.takeCash*`, `tab.addDish`,
  `tab.sharesStaffBlind`, `tab.notice.voided`; `cash.heading`, `.back`,
  `.takenBy`, `.breakdown`, `.amount`, `.all`, `.half`, `.noTip`, `.over`,
  `.partial` (must keep saying the tab **stays open**), `.applied`, `.tipLine`,
  `.tipNone`, `.change`, `.left`, `.keypadAmount` / `.keypadTip`, `.clear`,
  `.recordAmount` / `.recordWithTip` / `.recordEmpty` / `.recordOffline`,
  `.paidAll`, `.recordedTitle`, `.changeCaption`, `.closedBody` (the table
  stays **occupied**), `.tipBody`, `.openBody`, `.freeTable`, `.notAReceipt`
  (hy reworded); `billRequest.pickTitle` / `.pickNote` / `.prefilled` /
  `.askedAgo_*` and `tab.managerOnly` (HANDOFF §3: "Զեղչ և չվճարված հաշիվ՝
  մենեջերը"). Not in an artboard, so **not** read by the user even in `hy`:
  `order.backName`, `.people_*`, `.live`, `.categoryName_*`, `.menu`,
  `.searchLabel`, `.tileSoldOut`, `.tileInOrder`, `.dishes_*`, `.who`,
  `.sendingTitle_*`, `.sendingBody`, `.refusedTitle`, `.refused.*` (each must
  keep saying **nothing was sent**), `.backToOrder`; `tab.openSince`,
  `tab.tableAttributed`, `tab.lineActions`, `tab.reason`, `tab.discountAmount` /
  `.discountAmountLabel`, `tab.enterAmount`, `tab.discountApplyAmount`,
  `tab.dishesAfter`, `tab.adjusted`, `tab.notice.*` except `.voided`
  (`.lineAlreadyPaid` and `.failed` must keep saying **nothing changed**);
  `cash.backName`, `.typing`, `.quick`, `.recording`, `.backToTab`, and hy
  `cash.delete` («Ջնջել վերջին թիվը»). Removed: `order.unavailable`, `.shared`,
  `.sharedExplained`, `.tableDefaultCost`, `.offlineNote`, `.sent_*`, `.empty`,
  `.search`, `.quantity`; `tab.openedAt`, `.void`, `.voidTitle`,
  `.voidConfirm`, `.voidDetail`, `.comp`, `.compConfirm`, `.compWhole`,
  `.percentOff`, `.compReasonSeen`, `.voidReasonSeen`, `.adjustments`,
  `.adjustmentsUnknown`, `.items`, `.sharedWith_*`, `.abandon*` (now
  `markUnpaid*`; `abandonReason` stays), `.remaining`, `.addItems`; `cash.remaining`,
  `.tipNote`, `.confirmLine`, `.overpaying`, `.record`, `.recorded`, `.closed`.
  - Review and live QA (2026-10-19), **not** in an artboard: `cash.unknown` (a
    payment whose answer was lost: it must **not** say nothing was taken, and
    must say to check the tab first), `tab.voidAfterPayment`, `order.guestGone`,
    `order.refused.guest.*` (names the guest; each keeps **nothing was sent**),
    `order.refused.tab.*` (bill asked for / paid and closed / written off) and a
    general `order.refused.notAccepting`. hy `tab.whoShared` is now «Սեղանը ·
    կիսվող» like the Order screen, and hy `tab.adjustmentKind.comp` «Նվեր
    ռեստորանից» like the line menu. Removed: `tab.linesLoading`.
- `staff` — the floor tablet redesign, phase 4 (2026-10-19): the kitchen board
  and the conflicts screen. The `hy` copy is the approved Kitchen and Conflicts
  artboards' where they have it; `ru` and `en` were written from it and are
  **not** reviewed. From the artboards: `kitchen.counts.*` (late says
  «ուշանում է» in words), `kitchen.hint.lateAfter_*` / `.oldestLeft` /
  `.more_*` / `.all`, `kitchen.sort.*`, `kitchen.board`, `kitchen.ticket.late`
  (the badge must keep the word «ուշ», not colour alone), `kitchen.ready`,
  `kitchen.readyWaiting`, `kitchen.servedByWaiter`, `kitchen.newHint`,
  `kitchen.empty` (says new ones come **with a sound** — true only on the
  kitchen's own screen; the waiter's tab uses `kitchen.emptyQuiet`),
  `kitchen.readyNotice`; `conflicts.title` (hy now «Պետք է որոշում»), `.sub`,
  `.intro`, `.discard` (hy «Հրաժարվել գործողությունից»), hy `.applyAnyway.*`
  (now «… այնուամենայնիվ»), `.applyAnywayNote`, `.empty`, `.emptyAll`,
  `.result.discardedTable` / `.sent`, `.toast.discarded` / `.sent`,
  `.queue.title` / `.summary` / `.state.*`, `.queue.what.*` where the artboard
  has a line, `.why.changedBack`, `.offlineLead` / `.offlineBody` (must keep
  saying cash, booking answers and sign-in **wait for the connection**),
  `.queueHint`. Not in an artboard, so **not** read by the user even in `hy`:
  `kitchen.band.*`, `kitchen.ticket.name` / `.minutes_*` / `.age_*` / `.sent`,
  `kitchen.fromApp` («Հավելվածից», HANDOFF §5.2), `kitchen.allergens`,
  `kitchen.readyName` / `.sendName`, `kitchen.servedFromRail`,
  `kitchen.readyQueued` (must keep saying it is **not sent yet**),
  `kitchen.arrived`, `kitchen.hint.byTable`; `conflicts.mainLabel`,
  `.backName.*`, `.notAppliedBy`, `.aGuest`, `.held.*` (a command another
  person took before the tablet changed hands: it must keep saying it goes
  **by itself** when they sign in again, and `.orderNote` that the ticket will
  **name you**), `.head.order` / `.orderMoved` / `.call` / `.gone` / `.forbidden`,
  `.why.*` except `.changedBack`, `.noAnyway.*` (why "send anyway" is not
  offered; `.money` must keep saying an order **changes a bill**),
  `.result.discarded` / `.claimed` / `.claimedQueued`, `.toast.claimed`,
  `.emptyWaiting_*`, `.queue.empty`. Removed: `conflicts.subtitle`, `.by`,
  `.applyAnywayGeneric`, `.applyAnyway.placeOrder_*` / `.setOrderStatus` /
  `.acknowledgeServiceRequest` (never offered now). Allergen names on tickets
  reuse `admin` `menu.allergen.*`.
  - Review and live QA (2026-10-19), **not** in an artboard: `floor.heldMark`,
    `notice.behindHeld`, `kitchen.band.unsent`, `kitchen.allergensUnknown`
    (must keep saying to **check**, never read as "no allergens"),
    `conflicts.introHeld`, `conflicts.someone`, `conflicts.held.notForRole`.
    Reworded: `kitchen.newHint` («Դեռ չի ուղարկվել…», so «նոր» means one thing
    on the board), `kitchen.arrived` (carries the time), `conflicts.sub` and
    `.intro` (no "because things changed"), `conflicts.held.orderNote` and
    `conflicts.result.claimed` (no promise the ticket names you, nor that it was
    sent), ru `kitchen.ticket.late`. hy: no article or case ending on an
    interpolated person's name any more — `notice.raceNamed`,
    `conflicts.notAppliedBy`, `conflicts.held.*`, `conflicts.queue.state.held`,
    `order.soldOutNotice`, `order.refused.soldOut`, `order.refused.guest.*`,
    `order.guestGone`, `cash.takenBy` put the name after «՝» or in brackets.

- `public` — the public page redesign, phase 1 (2026-10-20): the page
  states and the booking column. The `hy` copy is the approved States and
  Main artboards'; `ru` and `en` were written from it and are **not**
  reviewed. From the artboards: `page.notAvailable.title` / `.body` (must keep
  saying the venue's phone and door **still work**), `page.notFound.body`,
  `page.offline.*` (must keep saying the page opens **by itself** when the
  connection is back — it does), `page.error.*` (must keep saying nothing the
  visitor entered is lost), `page.retry`, `page.call` (the number follows
  «·»), `booking.offTitle`. The language buttons show «Հայ», «Рус», «Eng» —
  names, the same in every language, kept in `language.tsx`, not here.
  - Review fixes (2026-10-20), **not** in an artboard, so **not** read by the
    user even in `hy`: `page.stale.offline` / `.error`, the quiet line on a
    page that stays on screen while it may be out of date (must keep saying
    what is shown **may be out of date**, never that it is gone). ru
    `page.notAvailable.title` now «Сейчас нет на Yalla» and `page.error.title`
    «У нас что-то пошло не так» (was a calque).
- `public` — the public page redesign, phase 2 (2026-10-20): the header and
  the details. `hy` follows the Main artboard where it has the words; `ru` and
  `en`, and every `hy` string the artboard does not show, are **not**
  reviewed. From the artboard: `header.allBranches_*`, `header.reviewCount_*`
  («{{count}} կարծիք»), `header.call`, `.address`, `.share`, `.copied`,
  `gallery.allShort` («Բոլորը»), `gallery.title`, `gallery.close`,
  `section.about`, `section.reviews`, `reviews.seeAll_*`, `.showFewer`,
  `reviews.who` (must keep saying only guests who came **through Yalla** can
  review), `hours.todayMark`, `hours.zoneYerevan`. Written for this phase:
  `header.rating`, `.noReviews`, `.priceLabel`, `header.price.1`–`4` (the
  admin `publicPage.listing.price.level*` names, lower case, read after
  «֏֏ ·»), `header.copyThis`, `header.actions`, `details.failed`,
  `gallery.label`, `gallery.photo` and `gallery.all` (hy writes
  "{{index}} / {{count}}", no suffix on a number), `menu.sections`,
  `reviews.outOf`, `.count_*`, `.stars_*`, `.bar`, `.distribution`, `.more`,
  `.loading`, `.none`, `.failed`, `.edited`, `reviews.age.*` (ages in words
  from our own plurals rather than `Intl.RelativeTimeFormat`, which falls back
  to English where the browser has no Armenian data), `hours.zone`,
  `findUs.newTab`, `findUs.website`. Removed with the folded week:
  `hours.show`, `hours.hide`. Replies reuse `diner` `place.review.reply.*`
  and amenities `diner` `place.amenity.*`.
- `public` — the public page redesign, phase 3 (2026-10-20): the booking card
  and the room. `hy` follows the Main artboard where it has the words; `ru`
  and `en`, and every `hy` string the artboard does not show, are **not**
  reviewed. From the artboard: `booking.day`, `.today`, `.tomorrow`,
  `.otherDay`, `.otherDate_*` (must keep saying how many days ahead the
  venue books), `.fewer`, `.more`, `.dayParts`, `.dayPart.*`, `.onRequest`,
  `.noTimes.dayToday`, `booking.table.none`, `.prompt`, `.book`, `.forMe`,
  `.chosen`, `.noneFits_*`, `room.choose`, `.now`, `.liveSub`, `room.view.*`,
  `room.noneHere_*`. Written for this phase: `booking.weekday.*` and
  `booking.month.*` (short weekdays and genitive month names — ours, not
  `Intl`'s, which prints hy dates in English where the browser has no
  Armenian data), `booking.date`, `.dayNamed`, `.bigParty_*` (followed by the
  venue's number as a link), `.bigPartyAsk_*`, `.noTimes.day` / `.evening`,
  `.seats_*`, `booking.table.table`, `.summary`, `.lost` (no suffix on the
  table's label: «Սեղան {{label}} այս ընտրությամբ…»), `room.slot`,
  `room.freeIn_*`, `room.list.*`. `booking.bigParty_*` replaces the
  artboard's «10-ից ավելի…» with «Ավելի քան {{count}}…», which keeps the
  number free of a suffix. Removed: `room.pick` (the card's prompt replaces
  it) and `section.room` (the room's heading is now `room.choose` /
  `room.now`).
  - Review fixes (2026-10-20), **not** in an artboard and **not** reviewed:
    `booking.change` (the artboard's «Փոխել»), `booking.timesUnchecked`
    (must keep saying the times **could not be checked** — never that they
    confirm), `booking.otherDayChosen`, `booking.table.tableOnly`,
    `.summaryNoSeats`, `.checking`, `.roomFailed`, `room.failed`. `room.pin`
    and `room.pinUnavailable` now carry `{{seats}}`, as the list rows do. hy
    reworded: `booking.otherDate_*` «առաջիկա {{count}} օրվա ընթացքում» (was
    «… օր առաջ», which reads as "ago"), `booking.fewer` / `.more` «Մեկ հյուր
    պակաս» / «Մեկ հյուր ավելի», `booking.bigPartyAsk_*` «…կապվեք հաստատության
    հետ։». A time that waits for a venue confirming itself (not short notice)
    reuses `diner` `booking.approval.venueWillConfirm`.
- `public` and `diner` — the public page redesign, phase 5 (2026-10-20): the
  manage link and the branch chooser. `hy` follows the Manage and Venue
  artboards where they have the words; `ru` and `en`, and every `hy` string
  the artboards do not show, are **not** reviewed. From the artboards:
  `manage.heading.*`, `manage.badge.*`, `manage.codeHint`,
  `manage.updatesItself` (said only while the page really polls),
  `manage.freeUntil` (must keep saying cancelling **later is still allowed**),
  `manage.cancelYes` / `.cancelNo`, `manage.declinedBody`, `manage.calendar`,
  `.map`, `.change`, `.call`, `.rebook`, `manage.gone.body` (now the
  artboard's: the booking may be over or the link copied wrong; call the
  venue), `branches.freeCount_*`, `.noneFree`, `.later`, `branches.empty`.
  Written for this phase: `manage.freePassed`, `manage.pastBody` (hy writes
  «ընտրեցիք {{venue}}» with no suffix on the name), `branches.addressDistrict`,
  and the change flow `manage.changing.*` — `intro` must stay **neutral**
  (the venue _may_ need to confirm; the server decides, the page never
  predicts), `confirmed` / `pending` say what the answer carried, and
  `error.account` is the backend's link-holder sentence (call the venue, or
  cancel and book again). Removed: `manage.cancelled` (now
  `manage.heading.cancelled` and `manage.badge.cancelled`) and `branches.free`
  (the chooser no longer has a total). `diner`: the feed's
  `notifications.kind.bookingChangedByLink*` and `bookingCancelledByLink*` —
  a change or cancel made with the web link, which may be in a stranger's
  hands, so each says where the booking stands and "if that wasn't you";
  the day is `dd.MM` as the push says it, and hy keeps every interpolation
  free of suffixes.
  - Review fixes (2026-10-20), **not** in an artboard and **not** reviewed:
    `manage.changing.putBack` (the venue said no to a change, or nobody
    answered, and the booking stays where it was — must keep saying it
    **stays**, with its time), `manage.cancelledByVenueBody` (a booking the
    venue cancelled is not thanked), `booking.timeNotOffered` (the booking's
    own time is no longer offered; nothing moved). Reworded:
    `manage.changing.confirmed` ("Changed. Your booking is confirmed." — the
    change may be the party or the table, not the time), `.error.busy` and
    `.error.commandInUse` (name the real button, «Պահպանել փոփոխությունը» /
    «Сохранить изменение»), hy `.error.overlapsOwn` («Այդ ժամի մոտ…»), and
    `manage.declinedBody` drops "Nothing was charged" (nothing is ever
    charged).
- `public` — the public page redesign, phase 4 (2026-10-20): the Book sheet,
  `sheet.*`. `hy` follows the Book artboard where it has the words; `ru` and
  `en`, and every `hy` string the artboard does not show, are **not**
  reviewed. From the artboard: `sheet.progress.*` (Սեղան · Հեռախոս · Անուն),
  `sheet.back`, `.close`, `sheet.title.*` (but `.pending`), `sheet.table.continue`,
  `.agree`, `.agreeFirst`, `.lateOk`, `sheet.taken.body` (the label carries no
  suffix: «Սեղան {{label}} հենց նոր…»), `.free`, `.alt`, `.seeRoom`,
  `sheet.phone.body`, `.telegramNote`, `.telegram`, `.sms`, `.short`,
  `sheet.telegram.body`, `.left`, `.checkNow`, `.useCode`, `sheet.code.label`,
  `.check`, `sheet.name.*` (the counter says `{{length}} / {{max}}`),
  `sheet.done.link`, `.linkHint`, `.copy`, `.copied`, `.openManage`, `.back`,
  `.auto`, `.again`. Written for this phase: `sheet.title.pending` («Ձեր
  հայտը» — the artboard's «Հայտն ուղարկված է» is already the title under it,
  and «Սպասում ենք…» the countdown's), `sheet.table.value` /
  `.valueNoRoom`, `sheet.taken.none_*`, `sheet.phone.telegramOnly` (no
  "fastest" when Telegram is the only way), `.smsOff`, `.noDoors`,
  `.loading`, `sheet.done.table`, and the free-cancellation dates in our own
  words: `sheet.freeCancellationTomorrow` and `sheet.freeCancellationOn`
  (the date is `booking.date`, so `Intl` never prints a hy date in English).
  Removed from `diner`, which nothing renders any more: `verify.phoneTitle`,
  `verify.phoneBody`. (`book.freeBy.agree` stays: the manage page's change
  form asks the same promise with it.)
  - Review fixes (2026-10-20), **not** reviewed: `booking.weekdayInSentence.*`
    — the weekday as a sentence writes it, lower case in hy and ru («մինչև
    ուրբ, 23 հոկտեմբերի», «до 15:00, пт, 23 октября»), the same as
    `booking.weekday.*` in en; used by `sheet.freeCancellationOn` and
    `booking.overlapsOwnOn*`. The calendar file always dates the
    free-cancellation line (`sheet.freeCancellationOn`), never "tomorrow". ru
    reworded: `sheet.telegram.useCode` «Лучше получить код по SMS»,
    `sheet.telegram.body` «…Страница обновится сама…», `sheet.phone.body`
    «…нужен только для того, чтобы…».
- `public` — the day chips past midnight (2026-10-21), **not** reviewed:
  `booking.tonight` («Այս գիշեր», «Сегодня ночью», "Tonight") names the first
  chip while last night's block is still open past midnight — the backend's
  service day — so the calendar's day keeps "Today".
- `staff` and `admin` — unverified guests, part A (2026-10-20), **not** in an
  artboard and **not** reviewed. `staff`: `admission.*` — the "Now" rail's
  section for tables that scanned with no verified number (`title`,
  `unverified` «համարը չհաստատված» — also the badge on a booking made without
  one, on the floor card, the table panel and a request card — `scanned_*`,
  `scannedJustNow`, `host`, `phones_*`, `admit` «Թույլատրել», `reject`
  «Մերժել»), Reject's question (`confirmTitle` «Սեղան {{label}}․ ոչ ոք չկա՞» —
  no suffix on the label; `confirmFrees`, `confirmKeeps`, `confirmMayFree`:
  freeing the table is said only when the scan seated it; `confirmReject`),
  `needsOnline`, `decidedElsewhere`, `failed`, `unreachable` (not the same
  sentence as nobody waiting), the table panel's `panelTitle` and `why`, and
  the notices `admittedNotice`, `rejectedFreedNotice`, `rejectedNotice`;
  `floor.card.awaitingAdmission` (short: it shares a card line, «պետք է
  թույլատրել»); `approvals.because.unverifiedPhone`. `admin`:
  `approvals.because.unverifiedPhone`, `approvals.unverified` (beside another
  reason), and the Policy screen's group `policy.group.unverified.*`, fields
  `policy.field.unverifiedBookingsNeedApproval.*` and
  `policy.field.unverifiedMaxPartySize.*`, and the guest's view
  `policy.example.unverifiedApproved_*` / `unverifiedConfirmed_*`. The group
  must keep saying Telegram-verified guests are not affected. Added with the
  backend's review round (same day): `admission.hasOrders` (a reject refused
  because orders were keyed: somebody is there, admit instead), the third
  switch `policy.field.unverifiedScansNeedAdmission.*` (its why must keep
  saying it is switched off only while the tablets cannot admit yet) and its
  guest's view `policy.example.unverifiedScanWaits` / `unverifiedScanOrders`.
- `public` and `diner` — unverified guests, part B (2026-10-20), **not** in an
  artboard and **not** reviewed. `public`: the Book sheet's way without proof —
  `sheet.phone.withoutProof` «Շարունակել առանց հաստատելու», the line before it
  `sheet.unverified.offer` / `.offerNoApproval` (must keep all three facts: the
  venue may confirm first — or, where it does not, that the booking cannot be
  changed online — Telegram is instant, and the party cap `{{max}}`, said as
  "parties of up to" / «մինչև … հոգու» / «до … человек» so no plural is
  needed), `.tooMany` (over the cap: no button, Telegram for more), the name
  step's `.note` / `.noteNoApproval`, `.phoneHint`, `.badPhone`,
  `.verifyInstead` (beside a refusal proving the number lifts);
  `sheet.done.unverifiedLinkHint` (must keep saying no reminders are sent and
  that the link is how to cancel) and `.unverifiedNoLink`; the manage link's
  `manage.badge.unverified`, `manage.changeUnverified` (cancel and book again,
  or call) and `manage.noReminders`. `diner` (also read by the web page through
  `bookingFailure`): `confirm.error.phoneHasBookingHeld` (names the caller's own
  booking only), `.phoneHasBooking` (names nothing), `.phoneHasBookingVerify`
  (an unproved account: proving the number lifts a stranger's booking),
  `.deviceHasBooking`, `.unverifiedPartyTooLarge`, `.unverifiedQueueFull`,
  `.rateLimited`; `confirm.unverifiedNote`; `booking.approval.unverifiedWhy`;
  `success.unverifiedNudge`; `bookings.madeWithYourNumber.*` (made with the
  account's number, not by it — the cancel body must say the venue will see the
  owner disowned it); the scanned tab waiting for a waiter
  `order.blocked.awaitingAdmission` (hy «Մատուցողը շուտով կհաստատի Ձեր սեղանը…»:
  must keep that the menu and calling a waiter work meanwhile),
  `tab.admission.*` (waiting title, the let-in notice, the turned-away screen and
  its way home), `tab.pay.awaitingAdmission`, `scan.error.turnedAway`.
  Review round (same day): hy names the venue «վայրը» throughout, as the rest of
  the app does (never «հաստատությունը»), and no sentence stacks «հաստատ…» three
  times — "the venue confirms" became «որոշում է վայրը», "confirmed at once"
  «ընդունվում է անմիջապես». New: public `sheet.unverified.tooManyNoTelegram`
  (over the cap where Telegram is off) and `.openYours` (the booking this page
  made); diner `confirm.error.tooManyRequests` (the general 429 — the
  per-network sentence is for bookings without proof only),
  `confirm.error.unverifiedOff` (a branch whose cap is 0), and
  `booking.atTable.unverified` (scan the code instead); staff
  `admission.confirmHeld` / `.rejectedHeldNotice` (the table goes back to the late
  party it was held for), `.admitTable` / `.rejectTable` (button names with the
  table), `.tableChanged`; admin `policy.example.approvalAll` now says "with a
  verified number", `policy.example.unverifiedOff`, and the cap's why explains 0.
- All namespaces — guest record (2026-10-20), **not** in an Armenian or Russian
  review yet. Bookings need a proved number again, so most of the unverified
  guests' booking copy above is **removed**: public `sheet.phone.withoutProof`,
  `sheet.unverified.*`, `sheet.done.unverifiedLinkHint` / `.unverifiedNoLink`;
  diner `confirm.error.phoneHasBookingHeld` / `.phoneHasBooking` /
  `.phoneHasBookingVerify` / `.deviceHasBooking` / `.unverifiedPartyTooLarge` /
  `.unverifiedQueueFull` / `.rateLimited` / `.unverifiedOff`,
  `confirm.unverifiedNote`, `success.unverifiedNudge`,
  `bookings.madeWithYourNumber.*`; admin `policy.group.unverified.*`,
  `policy.field.unverifiedBookingsNeedApproval.*`,
  `policy.field.unverifiedMaxPartySize.*`, `policy.example.unverifiedApproved_*`
  / `unverifiedConfirmed_*` / `unverifiedOff`. **Kept for the few legacy
  bookings**: `manage.badge.unverified`, `manage.changeUnverified`,
  `manage.noReminders`, `booking.approval.unverifiedWhy`,
  `booking.atTable.unverified`, staff `admission.unverified`, admin
  `approvals.unverified`, both `approvals.because.unverifiedPhone`.
  New:
  - diner `confirm.error.maxActiveBookings` / `.maxActiveBookingsNext` (three
    active bookings per number; "Next" names the earliest — venue, day, time),
    `.overlapsOwnElsewhere` / `.overlapsOwnElsewhereOn` (another venue, too
    close: must keep "too close to this time"), `.blockedNoShows` /
    `.blockedNoShowsPlain` (three missed bookings in three days; until when, or
    "for a week"). The ru max-3 lines say «{{max}} активные брони», correct for
    3 only — the server's maximum.
  - diner app: `bookings.record.*` (the guest's own record; hy «Դուք եկել եք
    {{came}} անգամ {{count}}-ից», plurals elsewhere), `bookings.blocked.*`,
    `bookings.status.cancelledAutomatically` + `bookings.noShowBlockReason`
    (together: cancelled automatically, three missed bookings in three days),
    `privacy.guestRecord` and `about.venuesSee` (must keep: venues see counts
    only, the last 12 months, kept / missed / cancelled late, **never where**),
    `notifications.kind.bookingsBlockedNoShows*`, `.bookingNoShow*`,
    `.bookingsUnblocked*` (the cancelled bookings are **not** restored).
  - public `sheet.name.record` (the same privacy promise, beside Confirm),
    `manage.changing.error.blocked` / `.blockedPlain`.
  - staff and admin `guestRecord.*` (identical in both: label, bookings, came,
    no-shows, late cancellations, not marked, "New guest" — neutral, never a
    warning — and "Blocked until"). hy labels the counts («ամրագրում՝ 12 · եկավ՝
    11 · չեկավ՝ 1») because a suffix glued to `{{count}}` fails `i18n:check`.
  - staff `notice.undoNoShow.*` (undo a no-show until 05:00 the next morning).
  - staff `notice.bookingCancelledByBlock` (a booking at this table was
    cancelled by its guest's block); admin `overview.kpi.cancelledBySystem_*`
    (today's bookings a block cancelled — not the venue's doing).
  - admin `policy.group.scanning.*` (replaces the unverified group; must say
    bookings always need a verified number),
    `policy.field.autoConfirmGuestsWithGoodRecord.*` (must keep the definition
    — 3 visits, no no-show, no late cancellation, 12 months, all venues — and
    what it does **not** skip), `policy.inactive.autoConfirmOn`,
    `policy.example.approvalGoodRecord`, `approvals.cancelledByBlock`,
    `overview.bookings.action.undoNoShow` / `.done.undoNoShow` / `.undoNote` /
    `.refused.undoTooLate*`, `reports.reservations.systemCancelled`, and the
    platform's `home.blocks.*` (lifting must say the cancelled bookings are not
    restored). Changed: `policy.example.approvalAll`, `.unverifiedScanWaits`,
    `.unverifiedScanOrders`.
  - Review round 2 (2026-10-21), also unreviewed:
    - The privacy promise (public `sheet.name.record`, diner
      `privacy.guestRecord` — identical wording; the diner one is also the
      record card's line and About's "What venues see") must now say all a
      venue sees: kept / missed / cancelled late **and not marked**, the last
      12 months, all venues, and **while it lasts the pause on booking** after
      three missed bookings in three days; numbers only, **never where**.
    - New diner `help.faq.venuesSee.question` / `.answer` (the same facts, plus
      the week's pause cancelling bookings not yet started, and "contact the
      venue" for a mistaken no-show).
    - admin `policy.inactive.autoConfirmOn` must not claim every booking is
      confirmed at once: the setting only skips "approve every booking", which
      is off; large parties, short notice, a no-show history and the previous
      guest's answer wait either way.
    - hy: the venue is «վայր», never «հաստատություն» (which also reads as
      "confirmation" beside «հաստատել»): staff/admin `guestRecord.label` («…բոլոր
      վայրերում»), admin `policy.field.autoConfirmGuestsWithGoodRecord.why`,
      `home.blocks.cap`. Older strings still using it, outside this feature:
      diner `tab.admission.rejectedTitle`, `bill.adjustment.comp` and public
      `booking.bigPartyAsk_*`.
    - ru `bookings.record.came_*` reads «Вы пришли на {{came}} из {{count}}
      брони/броней».
    - staff (floor tablet): `notice.bookingCancelledByBlock` now names the
      booking's time; new `notice.bookingsCancelledByBlock_*` (several at once,
      tables listed), `notice.guestBlocked` (the no-show just marked was the
      guest's third in three days: blocked until when), `noShows.title` /
      `noShows.row` (the rail's no-shows still undoable, and until when).
    - Staff wire gaps (wire §0a): staff `approvals.cancelledByBlock` and admin
      `approvals.refusedCancelledByBlock` (a request its guest's block already
      cancelled — never "somebody else answered"), admin
      `overview.bookings.done.guestBlocked` (appended to the no-show toast), and
      public `manage.cancelledByBlockBody` (the guest's own link: cancelled
      automatically, and when they can book again).
- `diner` and `staff` — pre-orders on a booking, the shared API layer
  (2026-10-21), provisional and **not** reviewed: diner `preOrder.error.*` (the
  guest's refusals, said by `preOrderFailure` on the app and the manage link
  alike; `locked`/`lockedAt` must keep naming the **2 hours** and sending the
  guest to **call the venue**; `itemUnavailable`/`itemsUnavailable_*` must say
  the dish is to be **removed** to save — never that the pre-order is gone),
  `notifications.kind.bookingOnYourWay.*` ("Are you on your way?" — the body
  takes only `{{place}}`), and staff `preOrders.error.*` (the waiter's Send and
  Not coming, said by `preOrderActionFailure`). hy says «նախապատվեր» for
  a pre-order and avoids gluing suffixes onto `{{place}}` and `{{name}}`.
- `staff` and `admin` — pre-orders on the floor tablet and in the venue
  console (2026-10-21), provisional and **not** reviewed. hy says «նախապատվեր»
  (the lead's word for the rail section «Նախապատվերներ»), and staff
  `preOrders.error.notSendable` / `alreadySent` / `notFound` were changed from
  «նախնական պատվեր» to match, as were the diner bundle's. Never glue a suffix onto `{{label}}`, `{{name}}` or `{{time}}`.
  - staff `preOrders.*` (the rail's card and the table panel's section):
    `send` / `notComing` are the approved labels «Գալիս են → Ուղարկել խոհանոց» and
    «Չեն գալիս / չեն պատասխանում» (`sendTable` / `notComingTable` are the same
    with the table, for screen readers, and must start with the visible label);
    `onTheWay` «Հյուրը հաստատել է, որ ճանապարհին է»; `confirmBody` and
    `notComingNotice` must keep saying it can **still be sent** if they arrive;
    `soldOutNow` flags a dish sold out since it was chosen — it is still on the
    pre-order; `waitsForTable` says a sent one joins the bill when they sit.
    staff `kitchen.ticket.preOrder` («Նախապատվեր · Սեղան {{label}} · {{time}}»)
    and `kitchen.ticket.withPreOrder` (the ticket's screen-reader name), and
    `kitchen.ticket.dueIn_*` (a pre-order ticket counts down to its booking).
  - admin `preOrders.*` (the Policy card, and a booking's pre-order in the
    requests): `rules.lock_*` must keep the **hours** and that the guest **calls
    the venue** after; `rules.ask` the minutes of the "on your way" question;
    `rules.waiter` that **nothing is cooked** until a waiter sends it and that
    "not coming" can still be sent; `rules.price` the locked price and that a
    sent, never-collected pre-order is a **no-show**; `accept.why` that turning
    it off **keeps** the pre-orders already made. admin `menu.column.preOrder`,
    `menu.preOrderYes` / `preOrderNo`, `menu.dish.preOrder*` (`preOrderOff` must
    say pre-orders that already have the dish **keep** it). hy and ru
    `menu.column.preOrder` carry a soft hyphen (U+00AD) so the column heading
    can break and the menu table keeps its row actions in view; keep one there.

- `diner` and `public` — pre-orders on a booking, the guest's screens (the
  app's booking, editor and bookings list; the public page's done step and
  manage link) (2026-10-21), provisional and **not** reviewed: every diner
  `preOrder.*` key outside `preOrder.error.*` (one set of words for the app and
  the link, which loads `diner`), and public `sheet.name.preOrders` (said
  before booking where the branch takes pre-orders). hy now says «նախապատվեր»
  for a pre-order **everywhere**, the user's word — the guest-facing
  `preOrder.error.*` and `notifications.kind.bookingOnYourWay.body` were moved
  to it from «նախնական պատվեր»; ru «предзаказ».
  A reviewer must keep: `preOrder.state.lockedBody` naming the **2 hours** and
  **call the venue**; `preOrder.state.notComingBody` saying the waiter **can
  still send it** when the guest arrives; `preOrder.onYourWay.cantCome` being a
  **cancellation** (the booking's own cancel follows, with its confirmation);
  `preOrder.priceNote` saying a price is **fixed when the dish is added**;
  `preOrder.unavailableSwap` asking to **remove or swap** the dish.
  `preOrder.onYourWay.yes` / `cantCome` are also the push's two button labels,
  so keep them short.

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
  - **Removed with the booking note (PLAN-90 D1):** `book.specialRequests`,
    `book.requestPlaceholder` and `book.requestHint`, in all three languages.
    The booking screen now sends the note to the venue and labels it with
    `booking.note.title` / `.placeholder` / `.hint`, so the old "kept on this
    phone" wording would have been untrue. D1 added no new hy or ru strings.
  - **New `diner` keys.** `scripts/pending-diner-keys.json` names the screen
    that renders each one. `place.reviews.seeAll_*`, `reviews.*`,
    `place.menu.empty` / `.error`; `place.review.postedAs` (must say the
    review is **public**), `.starLabel` ("{{rating}} of 5 stars" — the rating
    comes first and 5 is the fixed maximum; hy "{{rating}} աստղ 5-ից", ru
    "{{rating}} из 5 звёзд", where ru "звёзд" is not agreed with the number, so
    a reviewer should decide whether it needs plural forms), `.needsVisit`
    (must keep the 180 days and both kinds of visit), `.hidden`; `place.review.report.*` (five reasons, the note,
    `own`, `failed`); `place.bookingsOff.*`; `booking.note.*` (the hint must
    say the **venue** sees it, and only as far as a venue screen shows it); `profile.deleteAccount.*` (the body
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
