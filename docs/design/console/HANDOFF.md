# Platform-admin console redesign: handoff

> **Colours:** this handoff predates SHURJ. Where it names a colour ("waiting is blue/amber", a brown or beige), `DESIGN.md` and the tokens (`packages/tokens/src/console.ts`) win: waiting and held are burgundy, and there is no blue.

This folder is everything a fresh session needs to implement the approved
platform-admin console redesign in `apps/web` (and the backend gaps in the
`Yalla` repo). The design was approved by the user on 2026-10-18 after two
ui-ux review rounds. Treat the artboards as the spec; where they disagree with
the existing code, section 6 says which one wins.

## 1. Where the design lives

| What | Where |
|---|---|
| Live design (canvas, clickable) | https://claude.ai/artifact/N3A87SJUjnA5AKFw1uwPd2 (version 14). Read it with the Artifact tool, `action: "read"`; open it for the user with `action: "open"`. |
| Same files, local | `artboards/*.dc.html` + `artboards/canvas.json` |
| Sign-in photo | `assets/signin-room.jpg` (Unsplash photo-1514362545857-3bc16c4c7d1b, free licence). The artboards reference it as `/_blob/9d36a72c…`. |
| Shared CSS/sidebar + sources of the newer pages | `source/` (`python source/build.py` rebuilds `artboards/` from `source/*.page.html`) |
| Behaviour checks | `node checks/scen.cjs` runs 42 flow scenarios against the artboards' logic; must print `ALL PASSED` |

Each `.dc.html` is: markup inside `<x-dc>` with `{{ holes }}`, `<sc-if>`,
`<sc-for>`; CSS in `<helmet><style>`; behaviour in the
`class Component extends DCLogic { renderVals() }` script at the bottom. The
script is the interaction spec: states, validation messages, which button is
disabled when, what a toast says, what undo restores. Read it, do not guess.
Tweaks in `data-props` (for example `state`, `kind`, `status`, `conflict`) are
the alternative states each screen must support.

## 2. Screens

Nav has exactly three items: Գլխավոր, Վայրեր, Կարգավորումներ.

| Artboard | Screen | Existing code to change or replace |
|---|---|---|
| SignIn | Sign-in + forgot password; states default, error, locked (too many attempts) | `apps/web/src/auth/SignInRoute.tsx` |
| SetPassword | Choose password from a link; states form, done, invalid link, signed in as someone else | `apps/web/src/auth/ResetPasswordRoute.tsx` |
| Main | Home: outbox alert, 4 KPI cards (pending and open-tabs cards expand a per-venue list), bookings per day 14/30 days, not-ready venues, recently added, activity feed | `/platform` (phase 5); the outbox alert has "Details" only, no retry |
| Venues | List with search, status filter (deleted hidden by default), tier filter, sortable columns, tier button with confirm, ⋮ menu (tier, suspend/restore, delete), 3-step create, undo toasts | `console/platform/VenuesRoute.tsx`, `CreateVenueRoute.tsx` |
| VenueDetail | One venue: suspended banner, edit, suspend, delete (type name, "still in use" refusal), tabs Ընդհանուր / Աշխատողներ / Ամրագրումներ, add branch, 4-step add staff, issue sign-in link | `console/platform/VenueDetailRoute.tsx`, `EditVenueForm.tsx`, `AddBranchForm.tsx`; staff UI reuses `console/venue/staff/*` logic |
| BranchPublic | Branch public page + app listing, two separately saved sections, live app-card preview | `console/platform/BranchPublicPageRoute.tsx` wrapping `console/venue/public/PublicPageScreen.tsx` |
| BranchRooms | Rooms, photos, table pins, QR, out-of-service tables, sticky save bar, conflict banner | `console/platform/BranchFloorPlanRoute.tsx` wrapping `console/venue/rooms/RoomsEditorScreen.tsx` |
| Reviews | Branch reviews moderation: filters, reported first, hide with required reason, show again, undo | `console/platform/BranchReviewsRoute.tsx` |
| Settings | Իմ հաշիվը (name and password saved separately) + Լեզու | new |
| Errors | 404, 403, offline, session ended, server error | `auth/RequireRole.tsx` (`Forbidden`) + new shared error states |

Branch pages share one header: breadcrumbs Վայրեր / venue / branch, a branch
switcher, and sub-tabs Հանրային էջ / Սրահներ և սեղաններ / Կարծիքներ.

## 3. Settled decisions (do not reopen)

- **One platform admin**: the user. It is seeded from `PlatformAdmin:Email` and `PlatformAdmin:Password` by `PlatformAdminSeeder`. Do not build admin invites or an admin list. Owner, general-manager and manager accounts are created from the venue page's Աշխատողներ tab.
- **Sign-in links and PINs are shown once** in a dialog to copy and pass on in a chat. They are never emailed. Closing without copying warns once. This matches `admin.json` `staff.signIn.*` and `staff.pin.*`.
- **Tier refusals** are the backend's rules, per branch (`PATCH /api/platform/branches/{id}`): switching to Paid is refused while the branch's dishes are not ready (`branch-not-ready`, `venue.tier.notReady`), and **switching to Free is refused while the branch has open tabs**, because hiding a live bill from the people who owe it strands real money (`venues.tierDialog.openTabs`). Mountain View in the mock shows the Paid refusal, Sunset Lounge the allowed path, and Cascade Cafe's Կենտրոն branch the Free refusal.
- **Delete is soft.** You type the venue name. The server refuses while tabs are open or bookings are upcoming (`venue.blocked.*`), and the refusal offers "Կասեցնել փոխարենը". Deleted venues are hidden from the list unless the "Ջնջված" filter is on.
- **Bookings on the venue page are aggregates only.** Never show guest names or phones to the platform admin.
- **Red is only for real failures** (outbox, server error, destructive buttons). Not-ready states are amber. Hours were removed from the venue status column at the user's request. Category and cuisine are in Armenian.
- **The language picker is only in Settings and on sign-in**, not in the sidebar.

## 4. Visual system

Tokens, identical in every artboard (`.y` block in `source/_shell.css`):
`--bg #F7F1E8`, `--paper #FFF`, `--side #2B1608` (sidebar), `--brand #3A1D0C`
(primary button fill) with `--brand-ink #FFF3E4`, `--ink #2A1A10`,
`--muted #6B5A4F`, `--line #E8DDD0`, `--line-2 #F1E9DF`, `--hover #FBF6EF`,
and amber, red, green and grey pairs (`--amber #8A4B08` on `--amber-bg #FDF1DE`, and so on).

- **Type**: Noto Serif Armenian for titles (h1 28px, h2 17px), Noto Sans Armenian for body (14px). The minimum is 12px.
- **Sizes**: 40px buttons (32px small), 24px pills, 12px card radius, 232px sidebar, main padding 32/40px.

**Conflict with `DESIGN.md` / `@yalla/tokens`.** The repo system uses a beige
(#C3B59F) accent fill. The user approved this darker console look instead:
brown CTA, dark-brown sidebar, cream canvas. Add it as console tokens in
`@yalla/tokens` and amend `DESIGN.md`. Do not hard-code hex values in
components. The thesis still holds: chroma means state or the one action.

**Accessibility behaviour to keep** (the reviews were run against the ui-ux-pro-max rules):
- **Dialogs**: Escape closes, focus goes in, Tab is trapped, and focus returns to the opener.
- **Menus**: the ⋮ menu supports arrow keys.
- **Tabs**: tabs use roving tabindex with arrow keys.
- **Errors**: errors appear under the field and focus moves to the first invalid field. `aria-invalid` and `aria-describedby` are set.
- **Live regions**: `role=status` for toasts, `role=alert` for failures.
- **Undo**: every destructive or suspending action has an undo toast.
- **Pins**: table pins move with arrow keys too (Shift for steps of 5), not only by dragging.
- **Copy**: copy buttons fall back to selecting the text.
- **Motion**: respect `prefers-reduced-motion`.

## 5. What the backend already has (Yalla repo, `/api/platform/*` = PlatformAdminOnly)

- `GET/POST /api/platform/venues`
- `GET/PATCH/DELETE /api/platform/venues/{id}`
- `POST …/suspend` and `POST …/reactivate`
- `POST /api/platform/venues/{id}/branches`
- `PATCH /api/platform/branches/{id}` (includes `subscriptionTier`)
- `GET /api/platform/branches/{id}/reviews` and `PUT /api/platform/reviews/{id}/visibility`
- `GET /api/platform/outbox` (pending, failed and dead-lettered counts with last errors)
- Venue-console endpoints the platform admin can call with a branch in the URL: public profile, listing, rooms, readiness, staff, sign-in issuance, QR regeneration

React Query hooks live in `packages/api/src/react`, and the console gateway in
`packages/api/src/http/consoleHttpGateway.ts` (mock: `consoleMock`).

## 6. Gaps and decisions for the implementer

The **backend endpoints to add** (red-first tests, contract types regenerated):
1. **`GET /api/platform/overview`**: venue counts by tier, bookings this week with the change from last week, pending approvals per venue, open tabs per venue, bookings per day for 14 and 30 days, not-ready branches with the reason (from readiness), and recently added venues.
2. **Venue bookings summary** (for the Ամրագրումներ tab): counts by status and by branch, by weekday, and average party size for 7 and 30 days. Aggregates only.
3. **Activity feed** for Home: there is no audit log today. Either add a minimal one (actor, action, target, time) or leave the card out until it exists.
4. **Outbox retry**: the endpoint only reports, and dead letters are never retried. Either add a re-queue endpoint or replace the button with "Մանրամասներ" only.
5. **Dismissing review reports** ("Բողոքները անտեսել"): the button has no endpoint yet.
6. **Admin's own name and password change** (Settings): it has no endpoint yet. The email is fixed by configuration.
7. **Venue list fields** used by the table (rating, review count, tables, open tabs, readiness issue, cover thumbnail): check what `ListVenuesAsync` returns and extend it if needed.

**Ask the user** before building:
- **Tier is per branch in the backend** (`PATCH /branches/{id}`), but the design shows one tier per venue. Proposal: show the tier control per branch in the venue page's branch table, and let the list show a summary ("Վճարովի", or "Խառը · 1/2") with the button applying to all branches. Confirm with the user.

## 7. How this user wants the work done

- **Requests** come in Armenian transliteration, so reply in Armenian.
- **Delivery**: build on a branch, open a PR per repo, and "merge when done" once CI is green.
- **Tests**: red-first tests. A check is not trusted until it has been seen failing, and never pin a known-bad state.
- **Local gates**: capture exit codes (`X=$?`). Never hide them behind `| tail` or `| grep`.
- **i18n**: parity in hy/ru/en (`packages/i18n/src/locales/*/admin.json`) and keep `packages/i18n/TRANSLATIONS.md` in sync.
- **Shared checkout**: other Claude sessions use the same checkout. Commit through a temporary git index (`GIT_INDEX_FILE`, `read-tree HEAD`, `update-index`, `write-tree`, `commit-tree`, `update-ref`). Never stage or restore other sessions' files. Never run `git checkout/restore/reset/stash/clean` on files.
- **Dev database**: the dev database "Yalla" is read-only for you. Use a throwaway database or port for experiments.
- **Running things**: `.claude/launch.json` (api-real, console-real on 5173, diner-web-real on 8095) through `scripts/dev-real.sh`. Preview stop leaves child processes running, so kill them by PID after checking the command line.
- **Phases**: run phases back to back and report at the end, not after every step.

## 8. Suggested order

1. Console tokens and layout shell (sidebar, header, toasts, dialogs, error states), SignIn and SetPassword.
2. Venues list + create + tier/suspend/delete flows (needs the tier decision).
3. Venue page: overview, edit, add branch, staff wizard and sign-in issuance, then the bookings tab (with the summary endpoint).
4. Branch pages: public page, rooms, reviews (mostly reskins of existing venue-console screens behind the shared branch header).
5. Home with `GET /api/platform/overview`, then Settings.

Ship each phase as its own PR pair if backend changes are involved.
