# Yalla — frontend monorepo

Table reservation and in-app ordering for restaurants and cafes, launching in
Yerevan. Three surfaces share one set of packages:

| App     | Target                   | Stack                          |
| ------- | ------------------------ | ------------------------------ |
| `diner` | Phone (iOS, Android)     | Expo + React Native, portrait  |
| `staff` | Tablet on the counter    | Expo + React Native, landscape |
| `admin` | Web, for the venue owner | Vite + React + React Router    |

This repository currently contains the **structure, the shared packages, and an
app shell per surface**. There are no real screens and no API calls yet.

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
pnpm dev:staff    # Expo dev server, tablet/landscape
pnpm dev:admin    # http://localhost:5173
```

Each app boots to a placeholder screen with a language switcher, so you can
confirm the three-language setup works before any real screens exist.

### Workspace scripts

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `pnpm typecheck`    | `tsc --noEmit` across every package and app               |
| `pnpm test`         | Vitest across the shared packages                         |
| `pnpm lint`         | ESLint across the workspace                               |
| `pnpm format`       | Prettier, write mode (`format:check` to verify only)      |
| `pnpm build`        | Production build of the admin panel                       |
| `pnpm i18n:check`   | Fails if translation keys drift between languages         |
| `pnpm api:generate` | Regenerates API types from the backend's OpenAPI document |

## Pointing an app at a local backend

The backend is a separate ASP.NET Core project. Its dev URL is normally
`https://localhost:7188`, which is the default every app falls back to.

To override it, copy the example env file in the app you're running:

```bash
cp apps/admin/.env.example apps/admin/.env     # VITE_API_BASE_URL=...
cp apps/diner/.env.example apps/diner/.env     # EXPO_PUBLIC_API_BASE_URL=...
cp apps/staff/.env.example apps/staff/.env     # EXPO_PUBLIC_API_BASE_URL=...
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

## Why the staff app is native rather than a web page

The staff app is the one surface where a web page would be actively worse, for
four reasons that all show up on a normal Friday night:

1. **The wifi drops.** A cafe basement in Yerevan loses signal regularly, and a
   waiter still has to seat people, take orders and close bills while it's down.
   That needs a durable local queue that survives an app kill and a device
   reboot, and replays in order when the connection returns
   (`apps/staff/src/offlineQueue.ts`). A browser tab gives you fragile storage,
   eviction under memory pressure, and no reliable background sync.

2. **It has to survive being backgrounded and killed.** The tablet lives on the
   counter for a twelve-hour shift, gets locked, backgrounded and reopened
   constantly. A native app resumes with its queue intact; a browser tab gets
   discarded and comes back with whatever survived.

3. **Spoken orders need real microphone access.** Taking an order by voice with
   the reliability a rush demands is a native capability, not a
   `getUserMedia` permission prompt that a locked tablet will re-ask for.

4. **It shares the floor plan with the diner app.** Both render the same
   `@yalla/floorplan` component from the same data. Building the staff side for
   the web would mean a second renderer, and a diner tapping a table that the
   staff tablet draws somewhere else is a booking dispute, not a rendering bug.

The admin panel has none of these constraints — it's used sitting down, on a
laptop, with working wifi — so it stays a plain web app, and reuses the floor
plan component through `react-native-web`.

## Repository layout

```
apps/
  diner/      Expo Router, tabs: Explore / Scan / Bookings / Profile, portrait only
  staff/      Expo Router, single-level navigation, landscape only, offline queue
  admin/      Vite + React Router, sidebar layout
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
