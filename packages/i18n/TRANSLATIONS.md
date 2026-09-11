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
