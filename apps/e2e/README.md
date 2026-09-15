# @yalla/e2e

Playwright specs for the diner web build and the console, against the real backend.

The diner web target is the QA stand-in for the phone app. Camera scanning, native
push and the native photo picker stay on the manual checklist in
`apps/diner/docs/PHONE-QA.md`.

## Running

`pnpm --filter @yalla/e2e test` needs a stack. With none configured it prints why
and exits 0, so the repository's `pnpm -r test` stays a unit-test run. Set
`E2E_REQUIRED=1` in any job that exists to run this suite, and a missing stack
fails it instead.

### Against a stack that is already running

This is what `scripts/e2e-local.sh` and the CI job do.

| Variable                                | What                                                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `E2E_API_URL`                           | the backend origin, e.g. `http://localhost:5199`                                                                            |
| `E2E_DINER_URL`                         | the diner web export, served (see `scripts/serve-static.mjs --mode expo`)                                                   |
| `E2E_CONSOLE_URL`                       | the console build, served (`--mode spa`)                                                                                    |
| `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | the backend's `PlatformAdmin:Email` / `PlatformAdmin:Password`. `YALLA_CONTRACT_ADMIN_EMAIL` / `_PASSWORD` are accepted too |

The backend must run in **Development** with the dev seed on (the default there):
the specs read the verification code from `request-code`'s `developmentCode`, and
use the seeded `yalla-demo` / `yerevan-centre` branch, its tables and "Nune
Manager". Each diner app build bakes its API URL in, so build it with
`EXPO_PUBLIC_DATA_SOURCE=real EXPO_PUBLIC_API_URL=$E2E_API_URL`, and the console with
`VITE_DATA_SOURCE=real VITE_API_URL=$E2E_API_URL`.

Use a fresh database per run. The specs make their own diners, bookings and
reviews, but the console spec changes the demo branch's cover, pins and address.

### Letting Playwright start the stack (`E2E_STACK=1`)

For a laptop run. Playwright starts the backend from `E2E_BACKEND_DIR` (default
`../Yalla-browse` beside this repository) on its own database, serves the two
builds, and the global teardown drops that database and its photo folder.

| Variable                                               | Default                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| `E2E_DINER_DIST`                                       | required: the `expo export --platform web` output                    |
| `E2E_CONSOLE_DIST`                                     | required: the `vite build` output                                    |
| `E2E_API_PORT` / `E2E_DINER_PORT` / `E2E_CONSOLE_PORT` | 5287 / 8297 / 5297                                                   |
| `E2E_SQL_SERVER`                                       | `localhost`. A SQL Express install is usually `localhost\SQLEXPRESS` |
| `E2E_BACKEND_DIR`                                      | `../Yalla-browse`, then set it                                       |

Export the diner app with `--clear`. Metro's transform cache keeps the
`EXPO_PUBLIC_*` values of the last build that used it, so without `--clear` an
export made after a mock-mode one can come out on mock data with no API URL in
it, and spec 2 fails on a build that looks right.

```bash
# from the repository root, once per API port
EXPO_PUBLIC_DATA_SOURCE=real EXPO_PUBLIC_API_URL=http://localhost:5287 \
  pnpm --filter @yalla/diner exec expo export --platform web --clear --output-dir /tmp/yalla-diner-web
VITE_DATA_SOURCE=real VITE_API_URL=http://localhost:5287 \
  pnpm --filter @yalla/web exec vite build --outDir /tmp/yalla-console --emptyOutDir

E2E_STACK=1 E2E_DINER_DIST=/tmp/yalla-diner-web E2E_CONSOLE_DIST=/tmp/yalla-console \
  pnpm --filter @yalla/e2e test
```

In this mode the platform admin and the JWT signing key are generated for the run:
random, held in the Playwright process's environment, passed to the backend and
the workers that way, and never printed or written.

Browsers: `pnpm --filter @yalla/e2e install:browsers` once (Chromium only).

## Credentials

Only from the environment. The specs never log, attach or write one, and failure
messages quote a route, a status and the server's answer, never a request body.
Diners, the manager's sign-in and passwords are made per run. Phone numbers come
from the `+374 91 000 xxx` / `+374 99 000 xxx` test ranges, and addresses end in
`@yalla.test`.

## The specs

Diner (`specs/diner`, 390 x 844):

1. Sign up, verify the number with the code, and the profile shows it verified.
2. Explore shows the demo branch with the API's id; the place page draws the cover
   markers and reviews, and the floor plan asks by slug.
3. Book tomorrow with a note; Bookings lists it and the API has the note.
4. Open a tab from `/t/<table code>` while signed in, write a review, reload, and it is
   there.
5. Log out: Orders and Bookings are signed out, and a second diner sees nothing of
   the first.
6. The `/map` web fallback renders.
7. Avatar upload through the file input; after signing in again the `<img>` decodes.
8. A favourite made on one sign-in is there after logging out and in again.
9. A booking the venue releases shows in Notifications, and opens the booking.
10. Report another diner's review, and the venue's list counts the report.

Console (`specs/console`, 1280 x 900):

1. As platform admin, on the demo branch's public page: listing fields persist, a
   pin lands where it was clicked, a new cover clears the pins, and a new address
   reaches the public details.
2. As the branch manager: a reported review is hidden with a reason, and the public
   list stops showing it.

The diner web build keeps its session in memory outside development builds, so a
full page load signs the diner out. After signing in, the specs move through the
app by tapping, or with `goInApp` (a client-side history change), and sign in again
after a reload.
