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

`apps/web/src/offline/queue.ts`, backed by IndexedDB. The wifi in a Yerevan cafe
basement drops, and a waiter still seats people, still takes orders and still
closes bills while it is down. Three properties, all unit-tested against a real
IndexedDB:

1. **Durable.** Survives a tab close, a reload and a tablet reboot. A queue that
   dies with the process is not a queue. (`localStorage` is not used anywhere in
   this repo; IndexedDB via this module is the one persistence mechanism.)
2. **Idempotent.** Every entry carries a client-generated id, sent as the
   backend's idempotency key, so replaying an entry whose response was lost
   cannot double-add a round of drinks.
3. **Ordered per scope.** Actions on one table replay in the order they were
   taken, and a table stops at its first failure — a "free table" landing before
   the "seat walk-in" it followed would leave the floor wrong. Different tables
   are independent, so one stuck action does not freeze the whole floor.

**Nothing enqueues an action yet.** The types are declared and the queue works;
the tasks that add table-state changes and orders wire them to it. The header
badge reads its count back out of IndexedDB rather than tracking it in memory,
so "nothing waiting" means the store is genuinely empty — the one thing this
screen must never do is show a synced state that is not real.

The connection indicator obeys the same rule. There is no socket yet, so
`useConnectionState` returns `idle` and the header says _"live updates not
connected yet"_ rather than showing a green light. When the wifi is genuinely
gone it says so instead. Wiring the real connection is a change to that one hook
— `StaffHeader` already renders all five states.

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

| Screen                       | Source | Endpoint                                    |
| ---------------------------- | ------ | ------------------------------------------- |
| Console venue list           | real   | `GET /api/platform/venues` (platform admin) |
| Diner floor plan             | real   | `GET /api/branches/{id}/availability`       |
| Staff floor plan             | real   | `GET /api/branches/{id}/tables/floor`       |
| Diner venue and branch lists | —      | **no backend endpoint exists**              |
| Bookings, tabs, menus        | mock   | contracts not yet reconciled                |

The venue catalogue is the gap worth knowing about: the backend's only venue
listing is the platform-admin one, so a diner has nothing to browse. The real
gateway raises `EndpointNotWiredError` for it and every screen renders that as
"not available yet" rather than as an error — nobody should debug the app for
a missing endpoint. The methods still answered by the mock are listed at the
bottom of `packages/api/src/http/httpGateway.ts`.

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
