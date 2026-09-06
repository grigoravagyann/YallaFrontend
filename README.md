# Yalla — frontend monorepo

Table reservation and in-app ordering for restaurants and cafes, launching in
Yerevan. **Two apps** share one set of packages:

| App     | Audience                                      | Stack                         |
| ------- | --------------------------------------------- | ----------------------------- |
| `diner` | Anyone with a phone                           | Expo + React Native, portrait |
| `web`   | The Yalla team, owners, managers, floor staff | Vite + React + React Router   |

`apps/web` serves four audiences from one codebase, scoped by role — see
[The two-app layout](#the-two-app-layout-and-the-four-tiers). It is a plain web
app for the console and an **installed PWA on Android tablets** for the floor
screen.

Everything runs on mock data behind a swappable gateway; no backend is required
to work on any of it.

## Requirements

- Node 24 (see `.nvmrc`)
- pnpm 11 (`corepack enable`)
- For the native apps: the Expo Go app on a device, or an iOS Simulator /
  Android Emulator

## Getting started

```bash
pnpm install
```

Then run whichever surface you're working on:

```bash
pnpm dev:diner    # Expo dev server, then scan the QR with Expo Go
pnpm dev:web      # http://localhost:5173
```

In development the console shows a **dev-only role switcher** in the sidebar (and
in the floor screen's header, which has no sidebar). It changes which role the
_mock_ reports as signed in, so all four tiers can be walked without four
accounts. It is dropped from production bundles entirely, and against a real
backend the role comes from the token — `resolveConsoleGateway` ignores it.

The switcher is deliberately not persisted: a remembered role would be a
client-side claim outliving the session that granted it. A hard reload therefore
puts you back on platform admin.

### Workspace scripts

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `pnpm typecheck`    | `tsc --noEmit` across every package and app               |
| `pnpm test`         | Vitest across the shared packages                         |
| `pnpm lint`         | ESLint across the workspace                               |
| `pnpm format`       | Prettier, write mode (`format:check` to verify only)      |
| `pnpm build:web`    | Production build of the web app                           |
| `pnpm i18n:check`   | Fails if translation keys drift between languages         |
| `pnpm api:generate` | Regenerates API types from the backend's OpenAPI document |

## Pointing an app at a local backend

The backend is a separate ASP.NET Core project. Its dev URL is normally
`https://localhost:7188`, which is the default every app falls back to.

To override it, copy the example env file in the app you're running:

```bash
cp apps/web/.env.example apps/web/.env       # VITE_API_BASE_URL=...
cp apps/diner/.env.example apps/diner/.env   # EXPO_PUBLIC_API_BASE_URL=...
```

The prefixes are not interchangeable: Vite only exposes `VITE_`-prefixed
variables to the browser bundle, and Expo only inlines `EXPO_PUBLIC_`-prefixed
ones.

**On a physical phone or tablet, `localhost` is the device, not your machine.**
Use your machine's LAN address instead, e.g.
`EXPO_PUBLIC_API_BASE_URL=https://192.168.1.20:7188`, and make sure the backend
listens on that interface. The .NET dev certificate is self-signed, so a device
will reject it until you trust it or run the backend over plain HTTP for local
testing.

### Mock data versus a real backend

The diner app runs on **mock data by default**. There is one switch:

| `EXPO_PUBLIC_API_BASE_URL` | Data source            |
| -------------------------- | ---------------------- |
| unset or blank             | in-memory mock gateway |
| set to a backend origin    | real HTTP gateway      |

That decision lives entirely in `resolveGateway` (`packages/api/src/resolveGateway.ts`),
which returns a `YallaGateway`. **Every screen is typed against that interface
and none against a mock shape**, so pointing the app at a live backend is a
change to one module — not to a single component.

```bash
# mock data (default): just start it
pnpm dev:diner

# real backend
echo 'EXPO_PUBLIC_API_BASE_URL=https://192.168.0.30:7188' > apps/diner/.env
pnpm dev:diner
```

The mock gateway is a real implementation, not a stub: it holds bookings in
memory, enforces idempotency on `commandId`, expires and burns verification
codes, rate-limits per phone number, and frees the table again on cancel.

Two development-only switches:

- `EXPO_PUBLIC_SIMULATE_TABLE_TAKEN=1` makes the next booking attempt lose the
  race, so the 409 "someone just took that table" path can be walked without a
  second device.
- The mock returns the SMS code in the response (`devCode`), and the code screen
  shows it in a dashed banner. That banner is additionally gated on `__DEV__`,
  so a production bundle cannot render it even if a misconfigured server sends
  one. The mock always accepts `123456`.

### Regenerating API types

Types come from the backend's OpenAPI document rather than being hand-written,
so a contract change becomes a compile error in all three apps instead of a
runtime surprise in one:

```bash
pnpm api:generate                                     # default swagger URL
pnpm api:generate --url http://localhost:5188/swagger/v1/swagger.json
```

The output lands in `packages/api/src/generated/schema.ts` and **is committed**,
so the workspace typechecks with no backend running. Until you run it against a
real backend, that file is a placeholder stub.

## Adding a translation key

No user-facing string is ever written inline — in any app, including
placeholders. Every string goes through i18next.

1. Add the key to `packages/i18n/src/locales/hy/<namespace>.json` **first**.
   Armenian is the fallback language and the reference bundle that everything
   else is checked against.
2. Add the same key path to `ru` and `en`.
3. Run `pnpm i18n:check`.

Namespaces are `common` (shared) plus one per surface: `diner`, `staff`,
`admin`.

```tsx
const { t } = useTranslation(['diner', 'common']);
// own namespace
t('explore.title');
// another namespace, explicitly
t('common:placeholder.comingSoon');
```

`pnpm i18n:check` fails on a key present in one language and missing in another,
on a key that exists in a translation but not in `hy`, and on any empty string
value — an empty value renders as blank rather than falling back, which reads as
a broken screen rather than a missing translation.

> **The Armenian and Russian copy currently in the repo is provisional.** It
> covers only the placeholder shells and has not been written or reviewed by a
> native speaker. See `packages/i18n/TRANSLATIONS.md`.

## Scanning in and the shared tab

Someone walks in off the street, sits down, scans the code on the table, and is
in. **No account, no phone number, no password.** Nothing in that flow asks who
they are, and nothing should be added that does.

Reserving is the separate journey that needs a verified phone. The two are kept
apart deliberately: `scanTableCode` does not touch `verificationToken`, and the
tab contracts carry no user identity at all — a participant is a seat at a table
for as long as the tab is open.

### Walking the flow without a printer

The mock derives a six-character code for every table from its id, and the scan
screen shows the interesting ones in a dev-only panel:

| Code lands on          | What happens                                         |
| ---------------------- | ---------------------------------------------------- |
| a free table           | a tab opens and you host it                          |
| `b-lumen-north-t9`     | Aram is already hosting; you become a pending joiner |
| `b-lumen-north-t14`    | the table is out of service                          |
| `b-greenbean-main-t16` | that tab was closed and paid                         |
| anything unmatched     | not a table                                          |

The panel is gated on `__DEV__` **and** on running against mock data, exactly
like the SMS code banner. `__DEV__` is replaced with `false` by the production
bundler, so the subtree is dead code the minifier removes — it is not in a
release bundle, not merely hidden in one.

Six seconds after you open a tab, the mock lets a guest ask to join, so approve,
reject and the permission toggles can be exercised from a single device. Pass
`simulateJoiners: false` to `createMockGateway` to turn that off. It is the only
invented activity in the mock.

### The two permission rules

They live in `packages/api/src/contracts/permissions.ts` rather than in a
screen, because the server enforces them and both the UI and the mock have to
agree:

- **`canPay` implies `canSeeTableTotal`.** `setTabPermission` drags the other
  switch whichever one you touch, and `togglePullsAlong` tells the screen when
  to explain itself — so the line only appears when something actually moved.
- **Everyone always sees menu prices and their own items.** Not a flag, because
  it is never off. Hiding the total hides the _table_ total and _other people's_
  items. The host-controls screen says this in words; a guest who thinks they
  are being hidden from their own bill just asks a waiter, and the feature has
  cost the venue time rather than saved it.

Hiding the total exists for the host who is treating everyone. That is why
`canPay` is off by default and `canSeeTableTotal` is on.

### Links into the app

One token sits behind both the QR and the share sheet, so a friend across the
table and a friend on WhatsApp land in the same place.

| URL                             | Route                  | Carries                     |
| ------------------------------- | ---------------------- | --------------------------- |
| `https://yalla.am/t/<code>`     | `app/t/[code].tsx`     | the code printed on a table |
| `https://yalla.am/join/<token>` | `app/join/[token].tsx` | an invite token             |

Both render `JoinByLink`, which hands whatever it has to the same
`scanTableCode` call the camera uses — so a link and a scan cannot drift apart
in what they do or in what they say when they fail. `yalla://` works for both
too, but the shared link is always `https`: a phone without the app then opens a
web page instead of doing nothing at all. (That page is out of scope; the scheme
is chosen so it can exist.) Android verifies the domain via
`android.intentFilters` in `app.json`, iOS via `associatedDomains`.

### Calling a waiter is not wired yet

Presets only — napkins, water, the bill, other. One tap, no typing, no reply
expected. Deliberately not a chat: a chat promises an answer, and during the
Friday rush nobody answers, which leaves the diner more annoyed than if they had
raised a hand.

The backend endpoint does not exist yet. Rather than fake a confirmation,
`createHttpGateway` throws `EndpointNotWiredError` and the sheet says plainly
that the feature is not live. Grep for that class to find everything still
unwired.

## The two-app layout, and the four tiers

`apps/web` is one React codebase serving four audiences. Scope always comes from
the token, never from a URL the user could edit.

| Tier                 | Sees                                                                            | Routes registered                                                       |
| -------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Platform admin**   | Every venue. Create, suspend, soft-delete, set a branch's tier, onboard a venue | `/platform/venues`, `/platform/venues/new`, `/platform/venues/:venueId` |
| **Owner**            | Their venue only: all its branches, floor plans, menus, staff, reports          | `/venue/floorplan`, `/menu`, `/hours`, `/policy`, `/staff`, `/reports`  |
| **Manager**          | One branch. No pricing tier, no manager accounts                                | the same `/venue/*` set, plus `/staff`                                  |
| **Waiter / kitchen** | The floor screen for their branch, and nothing else                             | `/staff`                                                                |

Three rules hold this together:

1. **Navigation is built from the role, not filtered by CSS.** `AppRoutes` only
   registers the routes a role can use. A waiter's route tree contains no
   `/platform/venues` element to hide, so there is nothing to reveal by editing
   styles, replaying a bundle, or guessing a URL.
2. **Scope is never a route parameter the user supplies.** `/venue/*` and
   `/staff` read their venue and branch from the token; the branch switcher
   keeps its selection in React state rather than the address bar. Only the
   platform section takes a `:venueId`, and only because a platform admin's
   scope genuinely _is_ every venue. The server checks regardless.
3. **Unauthorised access renders a plain refusal, never a redirect.** Bouncing
   someone "somewhere they can go" is how you build a loop. The same page also
   renders for an unknown URL: distinguishing "does not exist" from "exists but
   is not yours" would tell someone which venue ids are real.

One hook and one guard: `useCurrentUser()` is the only place any component asks
about role or scope, and `<RequireRole>` is the only conditional. There are no
inline `user.role === '...'` checks in screens.

The manager gets the floor screen as well as the venue console, which the tier
table does not strictly grant. A branch manager is the person most likely to be
standing at the counter during a rush, and a manager who cannot open the floor
would have to borrow a waiter's tablet. Worth confirming with the pilot venues.

## Why the staff floor screen is a PWA on Android, not a native app

An earlier plan had staff as a second Expo app. It became a web screen inside
`apps/web` for three reasons:

1. **One React web codebase plus one mobile app is what a small team can
   maintain.** Two native apps and a web panel is three release processes.
2. **Fixes ship instantly.** When a waiter reports a problem at 20:00 on a
   Friday during a pilot, an app-store review is not an acceptable path to the
   fix.
3. **The floor plan no longer needs a bridge to work in three places.** It is a
   React Native component rendered through `react-native-web` on the console and
   the floor screen, and natively in the diner app — one renderer, one geometry,
   so a diner and a waiter cannot disagree about where table 7 is.

**The condition attached is Android only.** The floor screen is specified as an
installed PWA on Android tablets during venue onboarding, and deliberately not
on iOS: Safari can evict a PWA's storage under memory pressure and its
background sync is unreliable, which would undermine the offline queue that is
the whole reason for building this carefully.

### What "installed" actually means here

- `public/manifest.webmanifest` — `start_url: /staff`, `display: standalone`,
  `orientation: landscape`, with an `any` and a `maskable` icon so Android's
  adaptive mask cannot crop the mark.
- `public/sw.js` — a hand-written service worker, not a generated one, because
  the rule that matters is a negative one and has to be auditable in ten
  seconds: **shell assets are cached, API responses never are.** Navigations are
  network-first falling back to the cached shell; hashed build assets are
  cache-first (a changed file is a different URL, so a stale one is impossible);
  everything else goes straight to the network untouched. A cached floor plan is
  a floor plan that lies, and a waiter trusting one walks a party into somebody's
  dinner.
- Registration is production-only. To exercise it:

  ```bash
  pnpm build:web && pnpm --filter @yalla/web preview
  ```

### The offline queue

`apps/web/src/staff/commands/`, durable in IndexedDB via
`apps/web/src/offline/commandStore.ts`. The wifi in a Yerevan cafe basement
drops, and a waiter still seats people, still takes orders and still closes bills
while it is down. The moment the tablet becomes worse than a notepad is the
moment the venue is lost, so this is the part of the screen written most
carefully.

Everything that decides whether a tap is lost, applied twice, or turned into the
wrong thing is a **pure reducer** (`commands/reducer.ts`) with no IndexedDB, no
`fetch` and no React. That is not tidiness. The failure modes are a dropped seat
on a Friday and a double round of drinks, and neither reproduces on demand in a
browser.

**What queues:** table state changes, order placement, order status transitions,
service-request acknowledgements.

**What does not queue: payments.** A cash payment recorded against a balance the
device cannot verify is how a table pays twice — this tablet has no way to know
the other one took 8,000 dram two minutes ago, and "the balance was zero when I
tapped" is not a fact anybody can check afterwards. Offline, the cash button is
disabled with a plain explanation and the waiter takes the money and records it
when the connection returns, which is exactly what they would do with a paper
bill. Voids, comps and write-offs are excluded for the mirror reason: they change
what is owed, and a queued adjustment replayed against a bill that has moved on
is an argument at the counter.

Each entry captures, at the moment of the tap: the command, its
`clientCommandId`, the `expectedFromStatus`, and the row version. The command id
is the backend's idempotency key, so a retry after a lost response cannot add a
second round. The row version is captured and is currently always `null` — the
backend's floor read model has no version column — so the precondition that
actually does the work is the status. It is stored anyway so that the day the
server sends one, only the sender changes.

Preconditions are captured against the **projected** status, not the server's:
seat a table offline and then free it, and the free's precondition is `occupied`,
because that is what the queue in front of it will have produced. Capturing the
server's stale `free` would send the free straight to the conflict list for no
reason.

**Local state is optimistic and visibly pending.** A table seated offline draws
as occupied _and_ carries a "not sent" mark, and its action panel offers the
occupied actions rather than the free ones. Both halves matter: a waiter who
seats a party and watches the table stay white seats it again, and a tablet that
draws a synced state that is not real is worse than one that admits it is behind.
The pending count and the conflict count are computed from the queue, never
tracked beside it — two sources drift, and the one that drifts is always the one
on screen.

**On reconnect** the queue replays in enqueue order, per scope, with a failed
scope skipped for the rest of the pass so one stuck table cannot freeze the
floor. Four outcomes per command, and they must stay four:

| Outcome                         | What happens                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Applied                         | Cleared.                                                                                                                              |
| Already processed (`wasReplay`) | Cleared **silently**. The server recognised the command id; this is a success, and it is what a flaky connection produces constantly. |
| Precondition failed, or refused | Moves to the conflict list. Never applied, never discarded.                                                                           |
| Could not send                  | Stays queued, attempt counted. Nothing has been decided.                                                                              |

An error that is not an answer from the server — a bare `TypeError: Failed to
fetch`, an aborted request — counts as "could not send", not as a refusal. Asking
a waiter to adjudicate a wifi drop is not a thing this screen does.

### What the conflict list is for

`apps/web/src/staff/ConflictList.tsx`, reachable from a header badge that shows
until the count is zero.

Two 409s reach this screen and they are **not** the same thing, so the client
draws the line the server cannot:

- **A live race.** Somebody took the table in the seconds the panel was open.
  The command was sent on its first attempt, moments after the tap, and the
  waiter is still standing in front of the panel. The floor redraws, the panel
  closes, and one sentence appears: _"Table 7 was seated by Aram just now."_ Not
  a crash screen, not a retry, and nothing lands in the list. This is a normal
  Friday.
- **A stale command.** One that sat in the queue while the wifi was out and
  arrived after the table had moved on. Nobody is watching the panel and the
  decision was made about a world that no longer exists, so only a person can say
  whether it still holds.

The second kind goes to the conflict list, which is **a real screen, not a
toast**. Each entry answers three questions in the order a waiter asks them:

> You freed table 7 at 20:05.
> Table 7 is now occupied and has an open tab.
> Changed by Aram.

and offers exactly two actions: **discard**, or **apply anyway** — which re-sends
without the precondition, because that is the only honest reading of the button.
Nothing resolves automatically in either direction and nothing expires. The list
is persisted alongside the queue, so a tablet reboot mid-service does not quietly
forget three decisions it was waiting on. A 422 lands here too: the server
refusing a move as illegal is not a race, and no amount of redrawing the floor
makes it one.

### Live updates

`packages/realtime/src/sequenceStream.ts` — a `LiveStream` interface with a
polling implementation, shared by both apps. SignalR is a later task; the
backend's sequence columns exist so this can be written once and have its
transport swapped without any screen changing. **No polling logic lives outside
that file.**

It moved out of `apps/web` when the diner's bill needed the same thing. Two
implementations of a sequence stream is how a waiter's tablet and a diner's
phone end up disagreeing about a bill, with nobody able to say which is right.
It is generic over the page type and takes a fetch callback, so the package
needs no dependency on the API client and the same function serves a branch's
floor changes and a tab's events. Each app keeps one thin binding that says
which endpoint a page comes from and which error means "not shipped yet".

The floor polls `GET /api/branches/{id}/changes?afterSequence=` and folds pages
in incrementally, short interval while the screen is foreground and long while
the tab is hidden, resuming immediately on `visibilitychange` and on reconnect. A
page whose sequence numbers are not contiguous with what is on screen is a
**gap**: nothing is applied and the floor is refetched whole, because a partly
applied page looks updated while one table is drawn from a state that has been
superseded. The endpoint does not exist yet, so today the stream reports itself
unwired and falls back to full refetches — correct, more expensive, and it says
so.

## Running the staff screen on a tablet

Landscape, installed, on the counter. Development builds do not register the
service worker, so the offline behaviour only exists in a production build:

```bash
pnpm build:web
pnpm --filter @yalla/web preview --host    # serves the built app on the LAN
```

On the Android tablet, open `http://<laptop-ip>:4173/staff` in Chrome, then
**menu → Install app** (or _Add to home screen_). It then opens straight to the
floor in landscape, with no browser chrome, and starts without a network.

`VITE_API_URL` must be the laptop's LAN address rather than `localhost` — see
[Finding the laptop's LAN address](#finding-the-laptops-lan-address). It is read
when the build runs, not when the page loads, so rebuild after changing it.

What to check once it is installed, in this order:

1. Run a full tab: seat a walk-in, take an order, void a line, take cash, watch
   the tab close, free the table.
2. **Turn the wifi off mid-order.** Place two more orders and free a table. The
   header must show the connection state and the pending count together, and
   every affected table must be marked as not sent. Turn the wifi back on and
   confirm everything syncs.
3. While offline, tap **Take cash**. It must be disabled with an explanation
   rather than failing.
4. Kill the app and reopen it offline. The shell must load and the queue must
   still be there.
5. Hold the tablet at arm's length in a bright room and read the remaining
   balance on a tab.

Two development affordances, both gated on a development build _and_ mock data,
so neither can exist in anything a venue installs:

- The role switcher in the header. A waiter, a manager and the kitchen see three
  different screens, and this is how you walk all three without three accounts.
- `?race=t4` — the next transition on table 4 is refused as though another
  waiter got there first. One device cannot race itself, so this is the only way
  to walk the live-race message and the conflict list in a browser.

## Onboarding a venue

Four screens under `/venue`, and between them a venue can be set up end to end
without anybody inserting a row by hand: the floor plan, the menu, the opening
hours and the reservation policy. `/venue` itself is the overview, and it
carries the **onboarding checklist** — floor plan drawn, tables labelled, menu
categories, dishes finished, hours set, policy reviewed, staff, devices.

A checklist and not a wizard. Onboarding happens out of order, in a cafe, with
interruptions; a wizard insists on a sequence nobody follows and gets abandoned
at step two. What the checklist is for is the question nobody could answer
before without opening five screens: **is this venue ready?**

Both remaining rows — staff and devices — are listed as not done and say so,
because "is this venue ready" is false without them and a checklist that left
them out would answer wrongly. Neither has a screen in this build.

### The menu editor

Two audiences pulling in opposite directions, and where they conflict the first
one wins: a **bulk first pass**, where somebody enters eighty dishes in an
afternoon sitting beside the owner, and a **one-off edit in March** by the same
person, who remembers nothing. A slow first pass means the menu never gets
finished, and an unfinished menu means ordering does not exist for that venue.

So: a **dense table rather than cards** — scanning eighty dishes for the one
with the wrong price needs density, and a grid of photo cards is four dishes a
screen. **Inline editing** of name, price and availability, saving on blur,
because a three-field dialog to change one number is the difference between a
menu kept current and one abandoned. And **duplicate as a first-class action**,
because three sizes of one coffee differ by a name and a price and nothing else.

`duplicateDraft` copies every field except the identity and **clears the photo
reference**. Sharing one would look like a saving and is not: two items pointing
at one photo means deleting either breaks the other's card, and the server's own
content-hash dedupe already makes re-uploading the same bytes free — it returns
the first photo and writes nothing.

**Allergens are a fixed list plus free text**, not free text alone. Free text
produces fourteen spellings of "dairy" across three alphabets and a filter
nobody can build on. The nine presets are joined with commas into the one string
the server stores, so the wire format is unchanged and the data stops being a
mess. Anything that does not match a preset — "celery", or something typed
before the presets existed — survives a round trip in the free-text field rather
than being dropped.

**Ingredients are chips with autocomplete** from what this branch has already
used, and portion size suggests recent values. The second khachapuri is much
faster than the first.

### Completeness

`menuItemGaps` walks exactly the fields `CreateMenuItemCommand` marks required,
and **names all of them at once**. A form that reveals one missing field per
submit makes somebody press the button seven times to learn seven things, and
they stop at three.

The same function answers the count on each category row, the banner at the top
of the screen, and the checklist's "every dish finished" — so the three cannot
disagree, and the venue cannot be reported ready while the editor is still
showing a to-do count. A zero price and a zero prep time count as gaps, not
values: a free dish is a comp, and a venue's own numbers stop meaning anything
if one is entered as an item that costs nothing.

### Photos

`POST /api/branches/{id}/photos` is multipart, sniffs the bytes, strips EXIF and
returns three variants. Two things about the client side of it:

**It does not go through `ApiClient`.** `fetch` cannot report upload progress —
no shipping browser exposes a stream for the request body — and these are
eight-megabyte phone photos over a cafe's wifi, where a bar is the difference
between waiting and reloading. So `uploadPhoto` uses `XMLHttpRequest`, which
still has `upload.onprogress`, and is the only request in the client that does.

**The crop happens before the upload.** Owner photos are portrait and
off-centre; the card a diner looks at is a 4:3 landscape crop from the middle,
so a photo that looks fine in the form loses half the plate on the card. The
crop offers one control — a vertical offset — because the aspect is fixed and
every extra handle is time spent on the twelfth of eighty photos. The preview
then renders at **diner card size**, 160px, not at whatever the form has room
for: a photo that reads at 400px and is a brown rectangle at 120 is worth
catching here.

Rejections are surfaced by reason, because the three have three different fixes.
The confusing one is worth spelling out: **the server ignores the file name and
the declared content type** — both are attacker-controlled — so a photo an
iPhone saved as `IMG_0421.jpg` that is really a HEIC is refused as the wrong
format while every label on it says JPEG. The copy says so, with the format the
bytes turned out to be.

### Bulk photo matching

Drop thirty photos; names are matched against dish names and **nothing is
attached until somebody confirms**. A photo on the wrong dish is found by a
diner weeks later and nobody connects it to an import, so a wrong match is far
worse than no match. Anything ambiguous — two dishes wanting one file, two files
wanting one dish — goes to the tray untouched rather than being guessed at.

Matching normalises the extension, the `IMG_`/`DSC_`/`PXL_` prefixes and a
duplicate counter, then compares by containment first and bounded edit distance
second. Only a `(2)`-style counter is stripped, not any trailing number: a dish
called "Beer 500" is a dish, and losing the 500 would send its photo to the
tray.

**On real camera filenames the tray is where most of them land**, and that is
the honest outcome rather than a failure — `IMG_20260904_141233.jpg` contains
nothing to match. Placing twelve photos by hand beside a list is still an order
of magnitude faster than opening twelve forms, which is what the tray is for.

### Opening hours

Seven rows. **`closesNextDay` is derived, never asked**: a closing time at or
before the opening time crosses midnight, shown as "10:00 – 01:00 (next day)".
A checkbox for it is a checkbox somebody gets wrong on the one row where it
matters, and the server refuses to accept the flag from a client anyway. Equal
times are twenty-four hours, not zero.

**A closed day emits no interval at all.** Not `00:00–00:00`, which looks like
"shut" and reads to every consumer as a venue open for an instant at midnight.

Overlaps are checked before the request, because the server refuses the whole
PUT with one sentence about the week and that marks nothing on a table of seven
identical-looking days. The check is never _stricter_ than the server's:
touching spans are allowed, since a venue that closes at 15:00 and reopens at
15:00 has not overlapped anything. A span that crosses midnight is measured
forward from its opening, so 22:00–02:00 and 23:00–03:00 are correctly caught as
overlapping rather than read as disjoint.

The diner-facing preview is on the page because that string is generated from
this data and getting it wrong is silently visible to every user.

### The reservation policy

Every field, grouped by the question an owner is actually asking, and **each one
with a plain sentence** in terms of what a diner or a waiter experiences. "Turn
time" is not a concept a cafe owner has; "how long a table is held for a
booking — it is why a diner is told 'available 18:00 – 19:45'" is. The sentence
is under the input, not behind an icon, because an owner who has to hover will
not hover.

The shipped default is beside every field with a reset, so an owner who set turn
time to 45 minutes and watched bookings collapse has a way back without knowing
what it used to be. `defaultPolicyFor` mirrors `ReservationPolicy.DefaultFor`,
and the two differ in exactly one field: a cafe holds a table for two hours and
a restaurant for ninety minutes.

**Out-of-range values are refused, never clamped**, and the refusal lands
against the field it is about. That takes a small piece of string matching and
it is worth explaining why: `ReservationPolicyLimits.Validate` throws
`ArgumentOutOfRangeException` with a message that opens with the field's label —
_"Turn time must be between 15 and 360 minutes; 5 minutes was given."_ — and the
API's mapper turns it into a 400 carrying the message and **nothing else**: no
`errors` map, no `context`, no field name. So `policyFieldFromMessage` maps that
prose back to a key. A message it cannot place is shown above the form rather
than dropped; a refusal swallowed by a missed mapping is a save button that
does nothing.

**Changing a policy never rewrites an existing booking.** The server reports how
many now fall outside the new rules and which ones; the screen shows that count
until somebody dismisses it, never as a toast. It is the most surprising
behaviour on the screen.

### Two things this build does not do

**Bulk CSV import of a menu.** An obvious later win, and deliberately not here:
filename matching covers the photo half, which is the slow half. Typing eighty
names and prices is an hour; attaching eighty photos one at a time is an
afternoon.

**Multilingual menu content.** The schema holds **one name per item** — one
`Name`, one `Description`, one `Ingredients` string — so a venue with an
Armenian menu and Russian-speaking guests has to pick one. Answering it properly
would need, at minimum: a translations table keyed by item and locale with the
venue's own language as the fallback, `MenuItemView` returning the caller's
locale rather than the stored string, the ordering endpoints continuing to
snapshot **one** name onto an order line so a bill does not change language
when somebody's phone does, and an editor that makes the second and third
languages optional without letting an untranslated dish look finished — which
means `menuItemGaps` would need a per-locale notion of complete. That is a
product decision about whether Yalla is a one-language-per-venue product, and it
has not been made. Flagged rather than invented.

## Repository layout

```
apps/
  diner/      Expo Router, tabs: Explore / Scan / Bookings / Profile, portrait only
  web/        Vite + React Router. Console (platform / owner / manager) and the
              staff floor screen, which installs as a PWA on Android tablets
packages/
  api/        Typed fetch client, typed errors, TanStack Query client factory
  realtime/   SignalR connection, backoff, connection state
  floorplan/  Shared top-down floor plan renderer + geometry
  i18n/       i18next setup and hy/ru/en resources
  tokens/     Colours, spacing, type scale, table-state styles
  format/     Dram, dates, durations, table labels
  tsconfig/   Shared TypeScript presets
```

Apps depend on packages via `workspace:*`. Packages never depend on apps, and
never on each other except `api → format` and `floorplan → tokens`.

## Conventions worth knowing

- **Money is whole-integer Armenian dram.** The backend computes every total;
  the client only displays. `formatDram` throws on a fractional amount, because
  a fractional dram means someone did arithmetic on the client.
- **Every date and time formatter takes an explicit IANA timezone** — the
  branch's, never the device's. A tourist's phone is on Moscow time and their
  booking is not.
- **Table state is distinguishable without colour.** Each of the six states
  pairs its colour with a distinct border treatment and fill pattern, because
  colour alone fails for some users and on a sunlit terrace.
- **A 409 from the backend is a normal outcome, not a crash.** It surfaces as
  `ConcurrencyConflictError` — "someone just took that table" — and is expected
  to be handled by refetching and telling the user, never by a generic error.
- **Connection state is rendered, not hidden.** A floor plan that looks live but
  is forty seconds stale is worse than one that says it's reconnecting.

## Running against the real backend

Both apps default to the real backend and both need to be told where it is.
They need **different answers**, and this is the thing that wastes an afternoon
if it is not handled deliberately:

| App     | Variable                         | Value                                                                     |
| ------- | -------------------------------- | ------------------------------------------------------------------------- |
| `web`   | `VITE_API_URL`                   | `http://localhost:5086` — the browser is on the same machine              |
| `diner` | `EXPO_PUBLIC_API_URL` (optional) | `http://<laptop LAN address>:5086` — on a phone, `localhost` is the phone |

Use the backend's **plain-http port (5086)**, not the https one: the https dev
certificate is self-signed and a phone will refuse it. Copy each app's
`.env.example` to `.env`; the dev servers read env vars when they start, so
restart after editing. A missing or malformed URL fails at startup with a
message naming the variable — in the browser as a boxed message on the page, in
Expo as a red screen. That is deliberate: a silent `undefined` becomes requests
to `/api/...` on the wrong origin that fail in confusing ways.

### Finding the laptop's LAN address

The diner app usually needs no editing at all. When `EXPO_PUBLIC_API_URL` is
unset it takes the host the phone already loaded the bundle from (the Expo dev
server, e.g. `192.168.1.42:8081`) and swaps the port for `5086`. Set the
variable only when the backend runs on another machine or port. This matters
more than it looks: a laptop's address changes with the network, and a
hard-coded one is stale the next time you open the app somewhere else.

The backend prints its own LAN address on startup, which is the value to use:

```
Swagger UI:        http://192.168.1.42:5086/swagger
pnpm api:generate: http://192.168.1.42:5086/swagger/v1/swagger.json
```

By hand: `ipconfig` on Windows (the IPv4 address of the wifi adapter),
`ipconfig getifaddr en0` on macOS, `hostname -I` on Linux.

### Starting the backend

From the backend repo, with no arguments:

```bash
dotnet run --project src/Yalla.Api
```

In Development it binds `0.0.0.0` on 5086 (http) and 7289 (https) itself, skips
https redirection, and admits loopback and private-network browser origins
through CORS — so a phone on the same wifi and the Vite dev server both reach
it with no extra configuration. **Only Development does this.** Two things it
needs that are not in the repo:

- `PlatformAdmin:Email` and `PlatformAdmin:Password` in user secrets. The app
  refuses to start without them rather than leave a fresh database with no way
  in. They are also the console's sign-in.
- `DevActor:Enabled` set to `false` if you are testing real sign-in. The dev
  actor stub answers every request as the seeded waiter regardless of the
  bearer token, so the console signs in as a platform admin and is then
  refused for being a waiter — a confusing 403 that is nothing to do with the
  frontend.

### Switching between mock and real

`VITE_DATA_SOURCE` and `EXPO_PUBLIC_DATA_SOURCE` take `mock` or `real` and
default to `real`. On `mock` the base URL is ignored and the app runs entirely
on the in-memory mock; the console's dev role switcher comes back, and is
hidden against a real backend because there it changes nothing but still
navigates. Two reasons the mock stays: a second developer can build screens
with no backend running, and when a screen misbehaves, flipping to mock says
instantly whether the bug is in the UI or in the API. Components never import
from `mocks/`; the switch is `resolveGateway` and `resolveConsoleGateway` in
`packages/api`, and nowhere else.

### What is real, and what is still on the mock

| Screen                                 | Source | Endpoint                                                                                            |
| -------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| Console venue list                     | real   | `GET /api/platform/venues` (platform admin)                                                         |
| Diner floor plan                       | real   | `GET /api/branches/{id}/availability`                                                               |
| Staff device enrolment and PIN sign-in | real   | `POST /api/auth/staff/{enrol,pin,renew,sign-out}`                                                   |
| Staff floor plan                       | real   | `GET /api/branches/{id}/tables/floor`                                                               |
| Staff table actions                    | real   | the eight `POST /api/branches/{id}/tables/{id}/…`                                                   |
| Floor change stream                    | real   | `GET /api/branches/{id}/tables/changes`                                                             |
| Order entry and the kitchen rail       | real   | `POST /api/tabs/{id}/staff-orders`, `GET /api/branches/{id}/orders`, `POST /api/orders/{id}/status` |
| Service requests                       | real   | `GET /api/branches/{id}/service-requests`, `POST /api/service-requests/{id}/acknowledge`            |
| Tab totals and participants            | real   | `GET /api/tabs/{id}/participants`                                                                   |
| Voids, comps and discounts             | real   | `POST /api/tabs/{id}/lines/{id}/void`, `POST /api/tabs/{id}/adjustments`                            |
| Cash, closing, abandon, reassign host  | real   | `POST /api/tabs/{id}/{payments/cash,closing,abandon,reassign-host}`                                 |
| Releasing a late booking               | real   | `POST /api/reservations/{id}/release`                                                               |
| Diner menu, tab, shares, events        | real   | `GET /api/branches/{id}/menu`, `/api/tabs/{id}`, `/shares`, `/events`                               |
| Diner ordering                         | real   | `POST /api/tabs/{id}/orders` — wired, and **refused by the server**; see below                      |
| Settlement mode, calling a waiter      | real   | `POST /api/tabs/{id}/settlement-mode`, `/service-requests`                                          |
| Push registration and the two actions  | real   | `POST /api/diner/devices`, `/api/reservations/{id}/{cancel,extend-hold}`                            |
| Branch time zone                       | real   | `GET /api/branches/{id}/availability` — the only diner-readable source                              |
| Diner venue and branch lists           | —      | **no backend endpoint exists**                                                                      |
| Bookings and the tab roster            | mock   | `TableTab`/`Booking` carry six fields no reservation or tab view has                                |

Nothing on the counter screen says "not available yet" any more.
`EndpointNotWiredError` survives for the diner's venue catalogue and nothing
else; the staff gateway raises it nowhere.

### Four things a staff token cannot do, and how the screens handle it

These are the server's shape rather than missing client work, and each one
changes what a screen can honestly say. All four are worth a backend
conversation.

**A staff session cannot read a tab.** `GET /api/tabs/{id}`, `/shares` and
`/events` all carry the `TabParticipant` policy, and `TabParticipantHandler`
fails any principal that is not a tab participant — which a waiter never is.
The only staff-side tab read is `GET /api/tabs/{id}/participants`, and it
carries participants and totals and nothing else. So the tab panel assembles its
**lines from the branch's own order queue**, filtered to the tab: three reads,
because `GET /api/branches/{id}/orders` returns only outstanding orders unless
asked for a status, and a bill missing everything already served is not a bill.
`StaffTab.linesKnown` says whether that assembly ran, so an empty list is never
drawn as "nothing was ordered" when it means "not read".

**Nothing projects a void reason.** `TabOrderLine.VoidReason` is stored and
required by the domain, and appears in no read model; `TabProjection` filters
voided lines out of the diner's view entirely. A voided line is therefore
_inferred_ — the server zeroes `lineTotalAmd` while `unitPriceAmd` and
`quantity` keep their order-time snapshots, and nothing else produces that
combination — and it renders as "removed by staff" with no reason and no name.
The endpoint's own documentation says the line "stays visible to the diner,
labelled as removed by staff, with the reason", which is not true of any GET
today.

**Nothing lists a tab's adjustments back.** `POST /api/tabs/{id}/adjustments`
answers with the adjustment it just made, and there is no read. The panel shows
what this device has done in this session and says plainly that it cannot show
the rest, because an empty list captioned "no discounts" would be a claim.

**A waiter cannot open a tab.** `POST /api/tabs/open` takes the QR token printed
on the table, which a staff session does not have. `StaffGateway` therefore has
no `openTabForTable` at all — a method that could only ever fail is worse than
its absence, which the screens can see at compile time — and order entry says
so before the waiter builds an order rather than after they try to send it.

There is a fifth, smaller one. **The PIN screen cannot list a branch's staff.**
`POST /api/auth/staff/pin` takes a `staffMemberId`, and the only staff listing
is `GET /api/venues/{id}/staff`, which is `ManagerOrAbove` and venue-scoped. So
the tablet remembers everybody who has signed in on it and shows them as tiles,
and somebody it has never seen types their id once. A device-token-readable
roster — ids and names only — would remove the one genuinely bad moment in the
flow.

### What the diner's endpoints actually carry, and the eight places they did not agree

The diner half of the ordering loop was built against `contracts/unshipped.ts`
before the endpoints existed. `unshipped.ts` had already been renamed to
`ordering.ts` when the counter screen was wired; what had **not** happened is
the diner-side reconciliation, and eight of its shapes disagreed with the wire.

`pnpm api:generate` against a running backend produced **no shape changes at
all** — the schema in the repo was already current with Backend 9 — so every
disagreement below was between the hand-written contract and a generated type
that had been sitting there correct the whole time. The compiler found them the
moment `DinerTabView` stopped being a guess: eleven errors, in the mock and its
tests, which is exactly where you want them.

Three are naming. Five are logic, and two of those changed what a screen can
honestly say.

| #   | Contract said                                                                                                          | Wire says                                                                  | Kind      |
| --- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------- |
| 1   | `TabShares.yourShare`                                                                                                  | `TabSharesView.myShare`                                                    | naming    |
| 2   | `TabEventPage.lastSequence`                                                                                            | `TabEventPage.maxSequence`                                                 | naming    |
| 3   | `TabEvent.data`                                                                                                        | `TabEventView.payload`                                                     | naming    |
| 4   | `DinerTabView.lines` — one array                                                                                       | `myLines` **and** `tableLines`, the second absent when the total is hidden | **logic** |
| 5   | `DinerTabView.lastSequence`                                                                                            | nothing; the cursor comes from `GET /events`'s `maxSequence`               | **logic** |
| 6   | `DinerTabView.timeZoneId`                                                                                              | nothing; the zone is on `BranchAvailability`                               | **logic** |
| 7   | `TabMoney.serviceChargePercent`, on both branches                                                                      | nothing a diner token can read                                             | **logic** |
| 8   | `TabLine.status`, `voidReason`, `voidedByName`, plus `orderId`, `menuItemId`, `note`, `orderStatus`, `sharedWithCount` | none of the eight                                                          | **logic** |

Plus two smaller ones: `DinerTabView.adjustments` does not exist on `TabView` at
all, and `SetSettlementModeCommand.clientCommandId` was invented —
`SetSettlementModeRequest` carries only the mode, so that endpoint is the one
mutation in the product with no idempotency key.

**The shares union survived, and it is genuinely absent rather than nullable.**
This was the one worth being most careful about. `TabSharesView` is
`tableTotalVisible: boolean` with `totals?` and `shares?`, which openapi-typescript
renders as `?: T | null` — the shape that would let a screen render `0 ֏`. It
does not, for a reason that is not visible in the schema:
`DependencyInjectionExtension` sets `JsonIgnoreCondition.WhenWritingNull`
globally, so the members are omitted from the body. Verified against a live
guest with the total hidden: `'tableTotal' in body === false`,
`'tableLines' in body === false`, `'totals' in body === false`. The mapper
therefore narrows on **`tableTotalVisible`, never on presence** — presence-testing
works today and would flip the branch silently the day anything changes the
serializer.

**A voided line does not reach a diner at all.** This is the finding that
changed a screen. `TabProjection` builds both line arrays from
`tab.Lines.Where(l => !l.IsVoided)`, so a void is not a strike-through — it is a
row that vanishes and a total that moves. The void endpoint's own documentation
says the line "stays visible to the diner, labelled as removed by staff, with
the reason", and that is true of no `GET` on either path. `LiveBill` no longer
renders a struck-through row, because it can never be sent one; instead the
`lineVoided` event names the dish from the snapshot the phone held **before** the
refetch, which is the only place that name still exists. `RenderedLine` has no
`isVoided`, `voidReason` or `voidedByName`, so no component can reach for one.

Adjustments are the same gap without the workaround: a comp moves the total and
no read model tells the diner why.

**The tab event stream needed no change.** The enum is 1–20, the reducer's union
is those twenty plus `unknown`, and Backend 9's scheduler introduced none — its
five message types go through the outbox, not the tab's sequence. A test now
pins the realistic case rather than the tidy one: a type 21 arriving _in the
middle_ of a page the client does understand, where the known events must still
apply and the cursor must end past all three.

### One thing that stops the ordering loop, and it is not in this repo

`POST /api/tabs/{tabId}/orders` **refuses every diner**, with
`403 forbidden`, `"Ordering is allowed only for somebody on this tab."`

The client is correct and the authorization is correct. The service is not:

- `IssueTabParticipantToken` mints `PrincipalType = TabParticipant` with
  `ParticipantId` and `TabId` claims, and **no `DinerUserId`**.
- `TabParticipantHandler` reads exactly those claims, checks the participant's
  standing, and lets the request through — it even computes `canOrderNow`, which
  the tab read reports as `true`.
- `TabOrderService` then does
  `var participantId = actor.DinerUserId ?? throw new TabPermissionException("Ordering", "somebody on this tab")`.
  `ClaimsCurrentActor.DinerUserId` returns a value only when
  `PrincipalType == Diner`, so for a scanned QR it is null and the order is
  refused after passing the gate that exists to allow it.

There is no token that satisfies both: a `Diner` principal fails the policy at
`PrincipalType() != PrincipalType.TabParticipant`, and even if it did not,
`DinerUserId` is a user id being compared against `TabParticipant.Id`, which is
a participant row id.

`ServiceRequestService` is the working pattern in the same codebase — it takes
`actingParticipantId` as a parameter, passed from the claim, and calling a
waiter works. The fix is to give `ICurrentActor` a `TabParticipantId` and have
`TabOrderService` read it. Nothing in this repo changes when it lands.

### Where the wire shapes live

`packages/api/src/contracts/ordering.ts`, which used to be `unshipped.ts` and is
not a set of guesses any more: every shape in it is built from
`generated/schema.ts` by `http/staffMapping.ts`, so a renamed field on the
server is a compile error rather than an `undefined` on a counter screen. What
the client still translates is vocabulary — the server's `Amd` becomes
`Dram`-suffixed integers, integer enums become string unions — and that happens
in `http/` and nowhere else.

Three fields are `null` there rather than invented, each with the reason at the
declaration: a voided line's reason, an actor's name (no view turns a staff id
into one), and a tab's adjustments as a read.

`packages/api/src/mocks/billing.ts` is a faithful port of
`TabBilling.Compute` — line adjustments, then tab adjustments, then a service
charge on what is left, rounded once, remainders to the host by largest
remainder. **Mock data generation only.** Nothing rendered to a diner comes from
it: every screen reads its money from `TabView.tableTotal`, `TabSharesView` or
`OrderView.totals`, and against the real gateway this file is not on the path at
all. The one place the app multiplies money is the tray subtotal, which is a
preview of items _not yet ordered_ and is labelled as such.

What keeps a second implementation of money from drifting is not its own tests.
The property test over two thousand random tabs proves the port is
_self-consistent_ — its shares sum to its own total — which two implementations
can both be while quietly disagreeing about what three people owe. So the side
that owns the arithmetic publishes its answers: Backend 8b emits
`docs/billing-vectors.json` from `TabBilling.Compute` itself, by a test that
**compares rather than overwrites**, and it is copied here as
`mocks/fixtures/billing-vectors.json`. `goldenBilling.test.ts` runs the port
against all fourteen — round numbers, a three-way split, an indivisible
residue, rounding once at the end, a voided line, a comped dish comping its
service charge, a tab-wide percentage, a flat discount capped at its line, a
removed guest absorbed by the host, a pending guest who still owes, a
table-attributed line, no service charge, a partial payment, everything voided.
All fourteen passed on the first run, aggregate and per-participant share.
Regenerating is a deliberate act on their side (`YALLA_WRITE_BILLING_VECTORS=1`)
followed by copying the file here, and a rule change turns this red with the
vector that moved.

**No component is typed against a mock.** Screens depend on the contracts; the
mocks implement them. A screen typed against what a mock happens to return stops
compiling on the day the backend ships, which is the moment it is least
affordable.

The counter screen **never falls back to the mock**. A tablet that quietly
started inventing orders and balances when an endpoint was unreachable would
look exactly like one that is working, on the screen where that costs the most.
Run with `VITE_DATA_SOURCE=mock` to exercise the whole service against the
in-memory one, which simulates transitions, warnings, an idempotency log, a
sequence counter and — since Prompt 8b — **row versions**, so both halves of a
precondition failure can be walked without a backend.

### The tray bar, and why "Review" was the worst word on the screen

The bar at the bottom of the menu used to be one filled green pill: a count, a
subtotal, and the word **Review**. Every part of that reads like an order that
already exists. "Review" describes looking at something done; a total beside it
looks like a bill; and the only other green pill in the flow is the one that
confirms things. A diner who reads it that way puts the phone down and waits
twenty minutes for food nobody is cooking, which is the worst failure in the
app.

`src/order/TrayBar.tsx` renders a three-member union and **only one member is a
tray**:

- `empty` — no bar.
- `holding` — an _outlined, dashed_ surface, never a filled pill. It states the
  negative in words — "Not sent yet" — at the same size as the count rather than
  as grey subtext, and its action reads **Send to kitchen**. After three minutes
  the line becomes "Still here — nothing has gone to the kitchen".
- `sent` — a different object: filled, no count, no money, carrying the server's
  own `estimatedReadyAtUtc`. It cannot be produced by rendering the tray
  differently, which is what stops the two converging next time somebody edits
  the file.

`lastSent` is set from a `PlaceOrderResult` and from nothing else — never
optimistically — and adding anything to the tray clears it, because "Order sent"
above a tray with new items in it is the exact confusion the bar exists to
prevent. The same honesty rule the staff queue follows: never present a state
the server does not agree with.

`trayBarState` is a pure function of the tray and a clock, so all of that is
tested without rendering anything. A failed send never clears the tray: nothing
was placed, so the items are still what that person wants.

### `networkMode`, which has now caused a defect in both apps

Prompt 9 needed `networkMode: 'always'` so an offline send fails rather than
pausing. It landed on **one mutation** in the diner app, not on the shared query
client, so `apps/web` was never affected — but as an unexplained one-liner it was
one copy-paste away from being.

`createQueryClient` now **requires** `mutationNetworkMode` and has no default,
because there is no safe shared one:

- `apps/diner` passes `'always'`. A paused mutation leaves the send button
  spinning forever and a diner believing food is on the way. Nobody is standing
  at that table who can reconcile a late order.
- `apps/web` passes `'online'`. The tablet's own command queue owns retry, the
  wifi in a basement drops for seconds, and failing a table transition the
  moment it does puts a warning in front of a waiter mid-service whose action is
  about to succeed. A waiter _is_ standing in the room.

Both call sites carry the reason. `queryClient.test.ts` drives a real
`MutationObserver` with the online manager forced off and asserts the two
opposite behaviours: `'always'` calls the mutation function once and settles
`error`; `'online'` never calls it, reports `isPaused`, and lands when the
connection returns.

### Coalescing refetches, and why an announcement waits

Tab events arrive batched per poll today and will arrive individually once a hub
exists. `invalidateQueries` per batch was survivable; per event it is a refetch
per person at a busy table.

`src/tab/refetchQueue.ts` caps it at **one in flight and one queued**. The cap is
deliberately not zero-queued: a request that arrives mid-flight describes a
change the running fetch started too early to see, so dropping it would leave
the bill an order out of date with nothing on screen saying so. Ten events in
quick succession produce exactly two refetches, which is what the test asserts.

`request()` returning a promise is the other half. It resolves only once a run
that **began after the call** has finished, and `useTabStream` awaits it before
publishing the change markers. Previously the markers were set first, so "the
waiter removed your Khorovats" rendered against a bill that still showed it and
a total that had not moved — an explanation arriving before the thing it
explains reads as a bug in the bill rather than as an account of it.

### Push: registration, three app states, and two buttons

Backend 9 sends five message types through Expo. Until this task they reached
nothing.

**The permission is requested in exactly one place** —
`src/push/ReminderOptIn.tsx`, on the booking-confirmed screen, one line under a
booking that has just been made. Never on launch: a prompt somebody sees before
they understand it is a prompt they decline, and on iOS declining is close to
permanent. Declining costs nothing here — the booking is already made — so a
"no" produces one honest sentence saying the reminder will not arrive, and never
a second prompt. There is deliberately no "not now" button; the OS prompt has
one, and a custom pre-prompt with three options is a dark pattern wearing a
cardigan.

The token goes up with the **device locale**, which is not a formality: the
backend picks the language for every message from the most recently seen device
row, so a Russian speaker's Russian reminder comes from that argument and
nothing else. `addPushTokenListener` re-registers on rotation, because a rotated
token is a silently unreachable phone — the outbox reports a successful send to
a token nobody holds.

`usePushNotifications` handles all three states through one code path:

| State          | How the response arrives                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Foreground     | `addNotificationResponseReceivedListener`, with a handler that opts back in to showing the banner    |
| Background     | the same listener; the router is already mounted                                                     |
| **Cold start** | `getLastNotificationResponseAsync()`, read once on mount — the tap fired before any listener existed |

Cold start is the one that breaks, and it breaks silently: without that read
every notification tapped from a killed app lands on the home tab. The hook is
mounted inside the providers and above the navigator so a cold-start tap can
route before any screen has mounted.

**The two action buttons run without opening the app** —
`opensAppToForeground: false` on both categories. That is the entire feature: a
reminder whose cancel takes four taps and a scroll is just a notification.

`parsePushTarget` is a pure function over the payload dictionary, which is how
cold-start routing is testable at all. Everything arrives as a string, including
`approved` and `extensionMinutes`, so parsing happens there rather than at a
call site where `"false"` would be truthy. An unrecognised `kind`, or one missing
the id its screen needs, routes **nowhere** rather than to the home tab.

**A notification never performs the action from a screen.** It routes, and
`ReservationActions` reads the booking's state _now_ to decide what to offer:
a reminder read the next morning must not offer to cancel a table somebody
already sat at. `actionIsLive` allows only `confirmed` and `pendingApproval`;
`canExtendHold` allows only `confirmed`, because a pending booking holds nothing.

**`extend-hold` works once**, and the second refusal is the specific message
rather than a generic error. Getting there took an inference, which is worth
recording: `Reservation.ExtendHold` throws `DomainStateException`, mapped to a
409 with the generic `conflicting-state` code and **prose only** — no field name,
no `graceExtensionsUsed` in the context. Three domain rules produce it, and on
the nudge's path (a confirmed booking at a branch whose policy has non-zero
`GraceExtensionMinutes` — the payload carries the number) only "already
extended" is left. `HoldAlreadyExtendedError` says so at the boundary, and the
screen renders "you have already let them know". A dedicated
`hold-already-extended` code, or `graceExtensionsUsed` on `ReservationView`,
would replace the inference with a fact; both are worth asking for.

Both actions are idempotent by a `clientCommandId` held per reservation for the
life of the process and **reused on retry** — a fresh id would turn a retry
after a lost response into a genuine second attempt, which is the thing that
gets refused. Except cancel: `CancelReservationRequest` carries `reason` and
nothing else, so it is the one mutation with no idempotency key, and the gateway
compensates by reading the booking back on a 409 and reporting success when it
is genuinely cancelled.

`ReservationState` is deliberately narrower than `Booking`. The rich contract
carries `venueId`, `venueName`, `floorAreaName`, the availability `window`,
`freeCancellationUntilUtc` and `createdAtUtc`; `ReservationView` carries none of
the six, which is why the booking screens are still on the mock. What is real is
the subset an action needs, and that is what this reads.

### Signing a tablet in

Two credentials with two lifetimes, and keeping them apart is the design.

The **device token** is minted once, during onboarding, from a code a manager
generates in the console and reads out. It lives in IndexedDB — not
`localStorage`: it has to survive a tablet reboot, and the way back from losing
it is a manager generating another code, which on a Friday means the counter
screen is gone for the evening. It can do exactly one thing: offer a PIN.

The **session token** is minted every shift from four digits, carries the person
and their branch, and dies after thirty minutes of inactivity. The tablet locks
itself at twenty-five, on its own clock, because locking early produces a keypad
and letting the server get there first produces a failed request that has to be
explained.

**Locking never unmounts the floor.** The PIN screen renders over it, `inert`,
with the floor's queries and live stream paused. A half-entered order is React
state inside the order-entry overlay, and a gate that swapped the tree would
throw it away every time somebody put the tablet down — after which nobody lets
the screen lock, and the tablet on the counter stays signed in to whoever went
home at six.

`/staff` is matched **before** anything reads the console session, so a waiter
is never redirected to an email form. Against `VITE_DATA_SOURCE=mock` there is
no tablet credential to hold and the gate is skipped entirely: signing in is the
one thing a mock cannot honestly simulate, because the credential it would hand
out means nothing.

### Two dev affordances, and the test that keeps them out of production

`?race=t4` refuses the next transition on those tables as though another waiter
got there first. `?churn=t4` moves a table's row version without moving its
status, which is the conflict a status check cannot catch and the only way to
walk the second half of the conflict list's copy from one device. Both are gated
on a development build **and** on mock data.

`src/productionBundle.test.ts` builds the app if `dist/` is missing and greps
the output. It asserts that neither flag is read anywhere, that the dev role
switcher is gone, and that `VITE_DATA_SOURCE` survives only as a literal Vite
inlined — so choosing the mock is a rebuild, not a query string.

What it deliberately does not claim: `createStaffMockGateway` is still _in_ the
bundle. `resolveStaffGateway` imports both implementations statically and picks
with a runtime `if`, so the bundler cannot drop the branch it can prove is never
taken. That is roughly 30 kB of dead weight rather than a reachable affordance.
Removing it needs the resolver to take the mock as an injected dependency behind
a dynamic import, which is a change to all three resolvers and to `bootstrap`.

An earlier version of that test asserted the mock's absence by grepping for a
doc comment — which minification had already stripped. It passed, and it was
checking nothing. That is the same category of mistake as the four defects the
regression suite was written for, which is why the replacement asserts something
minification preserves.

### What the service worker serves

`src/offline/serviceWorkerCache.test.ts` evaluates the real `public/sw.js` in a
stub of the worker global and dispatches the requests a running tablet makes, so
this table is an assertion rather than a reading of the file:

| Request                                       | Worker                        |
| --------------------------------------------- | ----------------------------- |
| `/api/**`, same-origin or not                 | passthrough                   |
| any `POST`/`PUT`/`PATCH`/`DELETE`             | passthrough                   |
| navigations (`/staff`, `/`)                   | network first, shell fallback |
| `/assets/**`, `.js`, `.css`, `.woff2`, `.svg` | cache first                   |
| `/manifest.webmanifest`                       | passthrough                   |
| anything unrecognised                         | passthrough                   |

The manifest is cached at install and passed through afterwards, which is a
small inconsistency and a safe one: the browser reads it at install time and
nothing on the floor needs it.

### When the phone cannot reach the backend

Work down this list; each step rules out one layer.

1. **Same network?** The phone and the laptop must be on the same wifi, and it
   must not be a guest network that isolates clients. A phone on mobile data
   cannot see a laptop.
2. **Can the phone open the backend in a browser?** Visit
   `http://<laptop address>:5086/swagger` on the phone. If that fails, nothing
   in the app will work and the problem is not in the app.
3. **Is the firewall letting port 5086 in?** On Windows, the first run prompts
   to allow `dotnet` on private networks; if it was declined, add an inbound
   rule for TCP 5086. On macOS, allow incoming connections for `dotnet` in the
   firewall pane.
4. **Is the address current?** DHCP hands out a new address on a new network.
   The derived default follows the dev server automatically; a hard-coded
   `EXPO_PUBLIC_API_URL` does not, so unset it or update it.
5. **Did the app pick up the change?** Expo inlines env vars at start. Restart
   `pnpm dev:diner` and reload the app after editing `.env`.
6. **Is the backend in Development?** Any other environment binds loopback
   only and redirects to https, which a phone cannot follow.

Offline is a state, not an error. With the laptop's wifi off the diner app
shows "You are offline" with a retry button, the console shows a dashed
notice, and the staff floor keeps the last room it loaded with the header
saying it is reconnecting.

### The two offline rules, and why they are opposites

The staff tablet **queues** what a waiter does and replays it on reconnect. The
diner's phone **refuses** to place an order it cannot send, and says so
immediately.

That is deliberate, not an inconsistency. The waiter is standing in the room: a
seat command that lands two minutes late is something they can see and reconcile,
and losing it would make the tablet worse than the notepad it replaced. The diner
cannot reconcile anything — a phone that swallows an order and reports success
produces somebody waiting twenty minutes for food nobody is cooking, which is a
worse outcome than being told at the moment they tapped.

So on the phone: the **menu is cached hard** and readable with no signal, because
it changes rarely and it is what somebody stares at while the signal is gone; the
**bill is never cached as live data** and shows its last known state marked stale
with the time it was read; and **placing an order is attempted even when the
device says it is offline**, so it fails honestly rather than being paused by the
query client and leaving a button spinning for ever.
