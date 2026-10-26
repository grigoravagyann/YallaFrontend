# AGENTS.md — start here

Repo map, rules and copyable recipes for the Yalla / SHURJ frontend monorepo. Read this
before exploring; the README has the long-form reasons. Backend: `grigoravagyann/Yalla`
(ASP.NET, default branch `master`), usually checked out beside this repo as `../Yalla`.

## Repo map

- `apps/diner` — Expo + React Native SHURJ app (`@yalla/diner`). Routes are files in `app/`
  (expo-router; `app/_layout.tsx` lists them in its `Stack` and must import
  `src/intlPolyfills` first). Code in `src/`: `components/`, `theme/` (the app's own palette),
  `data/` (query hooks, keys, `gateway.ts`), `places/`, `tab/`, `takeaway/`, `messages/`,
  `push/`, `stores/session`.
- `apps/web` — Vite + React Router (`@yalla/web`). Routes in `src/App.tsx`.
  - Console: `src/console/platform/*` (`/platform/*`, platform admin) and
    `src/console/venue/*` (`/venue/*`, owner / GM / manager; shell `VenueLayout.tsx`), shared UI
    in `src/console/ui/`.
  - Floor: `/staff/*` → `src/staff/StaffRoute.tsx` → `FloorRoute.tsx` (composes the hooks in
    `src/staff/floor/*`), tablet shell `staff/floor/FloorTablet.tsx`, phone shell
    `staff/floor/FloorPhone.tsx` → `staff/phone/PhoneShell.tsx` (picked by
    `staff/phone/usePhoneLayout.ts`). Kitchen: `staff/KitchenRoute.tsx`. Offline queue:
    `staff/commands/`, stored by `src/offline/commandStore.ts`. PIN/enrolment: `staff/auth/`.
  - Public page: `src/public/` (`BranchRoute`, `VenueRoute`, `ManageBookingRoute`; gateways in
    `public/gateways.ts`).
  - Service worker: `public/sw.js` (hand-written; caches shell assets, never API responses).
- `apps/e2e` — Playwright specs (`specs/diner`, `specs/console`) and helpers in `support/`
  (`api.ts`: `demoBranch`, `localDate`, `registerDiner`, …), against a real backend.
- `packages/api` (`@yalla/api`, `@yalla/api/react`, `@yalla/api/schema`):
  - `contracts/` — app-facing types and rules; typed errors + problem codes in
    `contracts/errors.ts`; failure-to-copy kinds like `contracts/messageFailure.ts`.
  - Gateway interfaces: `gateway.ts` (`YallaGateway`, diner), `staffGateway.ts`
    (`StaffGateway`), `consoleGateway.ts` (`ConsoleGateway`), `publicGateway.ts`
    (`PublicGateway`); chosen by `resolveGateway` / `resolveStaffGateway` /
    `resolveConsoleGateway` / `resolvePublicGateway`.
  - `http/` — HTTP implementations (`httpGateway.ts`, `staffHttpGateway.ts`,
    `consoleHttpGateway.ts`, `publicHttpGateway.ts`) and wire mappers `http/*Mapping.ts`.
  - `generated/schema.ts` + `generated/swagger.json` + `generated/problemCodes.ts` (every
    problem code, its status and typed context) — generated from the backend, committed.
  - `react/` — TanStack Query hooks, one file per feature (`takeaway.ts`, `staffFloor.ts`,
    `messages.ts`, …), plus `gateways.ts` (`GatewayProvider`, `useGateway`,
    `useStaffGateway`, `useConsoleGateway`, …) and `queryKeys.ts` (`queryKeys`). `index.ts`
    is the barrel.
  - `mocks/` — in-memory gateways: `mockGateway.ts`, `staffMock.ts`, `consoleMock.ts` spread
    per-feature method files from `mocks/diner/*`, `mocks/staff/*`, `mocks/console/*`; shared
    state lives in each folder's `context.ts`.
  - `contract/` — one assertion suite run against the mock and (in CI) the live backend.
- `packages/i18n` — namespaces `common`, `diner`, `public`, `staff`, `admin`
  (`src/namespaces.ts`); bundles `src/locales/{hy,ru,en}/<ns>.json`; checks in `scripts/`.
- `packages/tokens` — `consoleColor` etc. in `src/console.ts` (console, tablet, public page),
  `color`, `space`, `radius`, `touchTarget`, `durations`; `pnpm tokens:css` writes
  `apps/web/src/tokens.generated.css` (committed; also regenerated on web `predev`/`prebuild`).
  Diner colours are `apps/diner/src/theme/colors.ts` (`colors`), imported via `src/theme`.
- `packages/format` — money (`formatDram`), dates/zones, durations, names, phone, tables.
- `packages/realtime` — SignalR connection, hubs, sequence stream.
- `scripts/` — `dev-stack.mjs` (+ `dev-stack/lib.mjs`), `e2e-local.sh`,
  `check-swagger-drift.mjs`. `verify.sh` runs CI's build gates locally (Git Bash).
- Design sources: `DESIGN.md` (the SHURJ system: palettes, roles, contrast, type, touch
  targets) and `docs/design/{console,venue-console,floor-tablet,public-page}/HANDOFF.md`.
  The handoffs predate SHURJ's colours; where any doc disagrees, `packages/tokens/src/console.ts`
  and `apps/diner/src/theme/colors.ts` win. `packages/tokens/src/designDoc.test.ts` fails on a
  hex in `DESIGN.md` that no token file assigns.

## Golden rules

- **No blue in SHURJ UI.** Waiting/held are burgundy, confirmed is green. The only blues are
  the map's "you" dot and the Telegram button (`colors.location`, `consoleColor.publicTelegram`).
- **Colours only via tokens.** Web CSS reads `var(--console-*)` / `var(--color-*)`;
  `staff/staffStyles.test.ts` fails on any hex/`rgb()`/`hsl()`/`oklch()` in listed staff
  files (add new staff files to its `REDESIGNED` list); `cssTokens.test.ts` fails on an
  undefined `var(--x)`. Diner code imports colour/shadow/type from `src/theme` — ESLint
  refuses `color`, `elevation`, `fontSize`, `lineHeight` from `@yalla/tokens` there.
- **Hermes Intl.** New `Intl` use in `@yalla/format` needs a matching `@formatjs/*` polyfill
  (and locale data) in `apps/diner/src/intlPolyfills.ts`. Only a real phone shows the crash;
  web and Node have full Intl.
- **Tests env.** Diner and package tests need nothing. Web tests need `VITE_API_URL` set
  (any origin; CI uses `http://localhost:5086`) or config throws `ApiConfigError`.
- **No backend needed:** `VITE_DATA_SOURCE=mock` (web) / `EXPO_PUBLIC_DATA_SOURCE=mock`
  (diner), or `pnpm dev:stack --mock`. In mock mode the dev role switcher resets on reload:
  switch role, then navigate by clicking. Mock staff PIN is `1234` (`MOCK_STAFF_PIN`).
- **Reserved ports 5086, 5173, 8081, 8095** belong to servers the user starts by hand — never
  bind or kill them. `dev:stack` refuses them; its defaults are api 5199, web 5192, metro 8110.
- **pnpm release-age gate.** Expo tooling has rewritten `apps/diner/package.json`,
  `apps/diner/app.json` and `pnpm-lock.yaml` to Expo patches younger than pnpm's 48 h
  `minimumReleaseAge`, after which every pnpm command fails
  (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`). Never commit such rewrites; install with
  `pnpm install --frozen-lockfile`; allowed pins are `minimumReleaseAgeExclude` in
  `pnpm-workspace.yaml`. If it happens, tell the user (do not restore files yourself).
- **Copy:** no inline user-facing strings. Armenian (`hy`) is the source text and the
  fallback; `ru`/`en` are translations of it.
- **Accessibility baseline:** 44 px targets (`touchTarget.minimum`), a label on every control
  (`aria-label` / `accessibilityLabel`), `<caption>` + `aria-sort` on sortable tables (see
  `console/platform/VenuesRoute.tsx`), reduced motion honoured
  (`prefers-reduced-motion` media query on web, `useReducedMotion` in `apps/diner/src/hooks`,
  `durations(prefersReducedMotion)` from tokens).
- **Scope comes from the token**, never a URL param (only `/platform/venues/:venueId`).
  Routes are registered per role in `App.tsx`; no inline role checks in screens.
- Never read `dotnet user-secrets` (the backend's local secrets).

## Recipe: consume a new backend endpoint (contract first)

Example to copy end to end: takeaway — `contracts/takeaway.ts`, `http/takeawayMapping.ts`,
`StaffGateway.listTakeawayOrders` in `staffGateway.ts` + `http/staffHttpGateway.ts` +
`mocks/staff/takeaway.ts`, hook `useTakeawayOrders` in `react/takeaway.ts`.

1. Serve the backend branch's swagger (`pnpm dev:stack --only api`, or the backend run
   directly), then
   `pnpm api:generate --url http://localhost:5199/swagger/v1/swagger.json`. Commit
   `generated/schema.ts`, `generated/swagger.json` and `generated/problemCodes.ts` together.
2. Types the apps see go in `contracts/<feature>.ts`. Wire mapping goes in
   `http/<feature>Mapping.ts` using `import type { components } from '../generated/schema'`.
3. Add the method to the right interface: diner → `YallaGateway`, floor → `StaffGateway`,
   console → `ConsoleGateway`, public page → `PublicGateway`. Document `@throws`.
4. Implement it in the matching `http/*HttpGateway.ts` (`client.get/post/...` with a literal
   or template path) and in the mock feature file (`mocks/<diner|staff|console>/<feature>.ts`,
   a `Pick<Gateway, ...>` factory taking the folder's `context.ts`; new files are spread in
   `mockGateway.ts` / `staffMock.ts` / `consoleMock.ts`). The mock must refuse what the
   server refuses.
5. `packages/api/scripts/check-gateway-schema.mjs` (runs in `pnpm --filter @yalla/api test`,
   or `api:check`) fails on a path the schema lacks or an inline body with unknown/missing
   fields. A call ahead of the backend gets
   `// gateway-schema: awaiting-route — <why>` above it; the check fails once the route
   exists, so remove the marker and wire it then.
6. Hooks go in the feature file `react/<feature>.ts`, importing `./gateways` and
   `./queryKeys` (add keys to `queryKeys`; use `staleTime` from `../queryClient`), then export
   them from `react/index.ts`. **Never import a barrel (`./index`, `../index`) from a feature
   or mapping file** — require cycles. Export new contract types from `src/index.ts`.
7. Tests: HTTP mapping against `http/fakeBackend.testkit.ts` (see `http/takeaway.test.ts`),
   mock behaviour in `mocks/*.test.ts`, and a `contract/*.contract.ts` case when both
   implementations can be held to it.

## Recipe: map a problem code to a typed error and copy

The backend declares every code once (`ErrorCodes.cs`: status, meaning, `context` members) and
publishes it as `x-problem-codes`; `pnpm api:generate` writes `generated/problemCodes.ts` from it
(`ProblemCodes.X`, `PROBLEM_CODE_STATUS`, `ProblemContexts`, one `XProblemContext` per code). Never
type a slug by hand.

0. A new backend code: regenerate (`pnpm api:generate --url <swagger>`) and commit
   `generated/schema.ts`, `generated/swagger.json` and `generated/problemCodes.ts` together.
   `pnpm --filter @yalla/api api:check` then lists it under "no typed error or branch handles
   yet" until step 1.
1. In `contracts/errors.ts`: `export const FOO_CODE = ProblemCodes.FooBar`, a
   `FooError extends ApiError` carrying the problem's context in the client's vocabulary, and
   `isFoo(error)` (copy `TAKEAWAY_BUSY_CODE` / `TakeawayBusyError` / `isTakeawayBusy`). Export
   from `src/index.ts`.
2. Map it in the feature's refusal function in `http/<feature>Mapping.ts` (`takeawayRefusal`,
   `messageRefusal` + `rethrowMessageRefusal`), called from the gateway's `catch`: `case FOO_CODE:`
   then `const context = problemContext(problem, FOO_CODE)` — member names are the catalogue's
   (a typo is a compile error), values are `unknown` and still checked (model:
   `takeawayRefusal`). Throw the same class from the mock, with `code: ProblemCodes.FooBar`.
3. Turn errors into a sentence kind, not copy: a `<feature>Failure(error)` union like
   `messageFailure` in `contracts/messageFailure.ts`. Each app maps kinds to its own i18n keys
   (`messageFailureText` in `apps/web/src/staff/messages/messageText.ts`; diner
   `src/messages/ThreadScreen.tsx`).
4. `scripts/check-problem-codes.mjs` (in the api `test` script and `api:check`) fails on a
   hand-typed slug in a code position (`code === '…'`, `case '…':` on a code, `FOO_CODE = '…'`,
   `code: '…'` in a problem document) that the backend does not declare, in source, tests and
   mocks alike, and on a stale `problemCodes.ts`. A literal that is some other code (a locale, a
   table warning) carries `// problem-codes: not-a-problem-code — <why>`.

## Recipe: add a console page

- Screen: `apps/web/src/console/venue/<feature>/<Feature>Screen.tsx` (or `console/platform/`),
  wrapped in `<div className="yc-page">` with `PageHeader`; branch and zone from
  `useVenueOutlet()` (`branchId`, `branchName`, `timeZoneId`).
- Route: add `<Route path="<feature>" …>` inside the `/venue` block of `App.tsx` (that block
  is gated by `VENUE_ROLES`; platform routes use `<RequireRole allow={PLATFORM_ROLES}>`).
- Nav: add a link to `venueNavGroups` in `console/venue/VenueLayout.tsx` (key
  `nav.<feature>` in `admin`). Role-specific links follow the `floor` flag there
  (`FLOOR_ROLES`); roles come from `auth/useCurrentUser.ts`.
- Use the shared kit `apps/web/src/console/kit/` (one import from its `index.ts`) before
  writing your own: `useUrlFilters(codec)` + `pickParam`/`putParam` for URL-state filters
  (dates/kinds push history; search replaces), `usePagedRows` + `PagedFooter` for cursor
  lists, `DataTable` / `TableHead` / `NoValue`, `ChipGroup`, `DateField`, `LoadingLine` /
  `EmptyLine` / `QueryFailure` / `EmptyState`. Examples: `ActivityScreen.tsx`,
  `MessageHistoryScreen.tsx`, `StaffResults.tsx`.
- CSV: server-built → gateway returns a file, then `useFileExport().run(…)` from the kit (saves
  it and toasts ready / too large / failed; see `ActivityScreen.tsx`); client-built →
  `csvCell` / `csvBlob` / `csvFileName` in `console/venue/reports/csv.ts`.
- Tests: `// @vitest-environment jsdom`, `createConsoleHarness` + `initConsoleTestI18n` from
  `console/venue/reports/testHarness.tsx`. Page titles: `console/venue/venuePageTitles.test.tsx`.

## Recipe: add a staff floor feature

- Data: hooks in `packages/api/src/react/staffFloor.ts` (or a feature file) on
  `useStaffGateway()`.
- Composition: `apps/web/src/staff/FloorRoute.tsx` wires `staff/floor/*` hooks
  (`useFloorQueries`, `useFloorCommands`, `useTableActions`, `useTabActions`, `useOrderSend`,
  `useFloorLiveStream`, `useServiceCalls`, …) and hands shared state to both shells:
  `floor/FloorTablet.tsx` (landscape) and `floor/FloorPhone.tsx` (`PhoneShell` tabs). Put new
  logic in a `staff/floor/use<Thing>.ts` hook, not in `FloorRoute.tsx`. Feature UI example:
  `staff/takeaway/` (`TakeawayCounter.tsx`, `useTakeawayReady.ts`, `takeawayText.ts`).
- Offline queue (`staff/commands/`): add the kind to `StaffCommandKind` / `StaffCommandBody`
  in `types.ts`, to `QUEUEABLE` only if safe to replay (**payments never queue**), dispatch in
  `sendCommand` (`sync.ts`), project it in `reducer.ts` (`optimisticFloor`), test in
  `reducer.test.ts`; in-memory store for tests: `staff/testCommandStore.ts`.
- New staff files: add to `REDESIGNED` in `staff/staffStyles.test.ts`; copy in `staff`
  namespace.

## Recipe: add a diner screen

- Route file under `apps/diner/app/` (e.g. `app/profile/edit.tsx`), registered as a
  `<Stack.Screen name="…" />` in `app/_layout.tsx`.
- Wrap in `Screen` (`src/components/Screen.tsx`, safe-area `edges`). Forms:
  `KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}` around a
  `ScrollView` (see `app/profile/edit.tsx`). Colour/type/space from `src/theme`; text via
  `src/components/Text`.
- Data: hooks from `@yalla/api/react` or `src/data/queries.ts`; never touch a mock directly.
- Tests: `src/**/*.test.tsx` run in jsdom through react-native-web (`*.test.ts` in node).
  Copy the mocks block of `src/components/bookings/bookingFollowUp.test.tsx`
  (`expo-router`, safe-area, `@yalla/i18n` `t` → key, `useGateway` → `vi.hoisted` fake).

## Recipe: i18n keys

1. Add to `packages/i18n/src/locales/hy/<ns>.json` first, then the same path in `ru` and `en`.
2. `pnpm i18n:check` = `check-parity.mjs` (same keys in all three, no empty values, plural
   categories per language, amenity wording equal across `admin`/`diner`, **no suffix glued to
   an interpolation in hy/ru** — not `{{name}}-ը`; rephrase so the value stands alone) +
   `check-used-keys.mjs` (every `t()` key exists). Diner keys added before their screen go in
   `scripts/pending-diner-keys.json`.

## Recipe: e2e specs

- Specs in `apps/e2e/specs/{diner,console}/NN-name.spec.ts`; helpers in `support/`. They run
  only against a stack (`pnpm e2e:local`, or CI's `diner-web-e2e`); without one they skip.
- Uses the dev seed (`SEED_VENUE_SLUG` `yalla-demo`, `SEED_BRANCH_SLUG` `yerevan-centre`).
- **Never rely on "today has slots".** Late in the evening the booking screen opens on
  tomorrow; book a future day via `localDate(n)` and wait for that day's slots (see
  `specs/diner/03-book-with-note.spec.ts`). Same for unit tests: build times from `Date.now()`.

## Running things

- `pnpm dev:stack` — backend + web + diner (Expo Go). Flags: `--mock`,
  `--only`/`--skip` (`api`, `web`, `phone`), `--lan`, `--db <throwaway>`, `--no-telegram`, `--rebuild`, `--no-build`,
  `--keep-going`, ports `--api-port/--web-port/--metro-port`; `--help` for all;
  `docs/dev-stack.md`.
- `pnpm dev:web` (Vite 5173), `pnpm dev:diner` (Metro 8081) — the user's own ports.
- Gates (CI build order): `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm i18n:check`, `pnpm build:web`, then tests: `pnpm --filter @yalla/api test`,
  `VITE_API_URL=http://localhost:5086 pnpm --filter @yalla/web test`,
  `pnpm --filter @yalla/diner test`, `pnpm test:scripts` (or all: `pnpm test`). `./verify.sh`
  runs the lot; `--no-test`, `--live`.
- CI (`.github/workflows/ci.yml`): `build`; `backend-ref` ("pick the backend ref":
  `backend_ref` input → a `backend-ref: <ref>` line in the PR body → **a backend branch with
  the same name as this branch** → `master`); `contract` (live contract suite + OpenAPI drift
  gate); `diner-web-e2e`. Name the paired backend branch identically.

## Git

- Never run `git checkout`, `git restore`, `git reset`, `git stash` or `git clean` on files —
  other sessions share these checkouts. Take a conflict side with
  `git show origin/main:<path> > <path>` (Git Bash: `MSYS_NO_PATHCONV=1`) or regenerate.
- Work in your own `git worktree` off `origin/main`; if you must share a checkout, commit via a
  temporary index (`GIT_INDEX_FILE`) so you only commit your files.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. PR body ends with
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`; add `backend-ref: <ref>`
  when the backend branch name differs.
