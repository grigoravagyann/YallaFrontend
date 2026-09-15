# Yalla — the diner app

Expo Router and React Native, portrait only, for iOS and Android. Browse cafés
and restaurants, book a table, scan the code on a table to open a shared tab,
order from it, and review the places you visited.

The repository-wide setup (Node, pnpm, the backend, CI) is in the
[root README](../../README.md). This file is what the diner app itself does,
and what it deliberately does not.

## Running it

| Command                           | What you get                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm dev:diner`                  | The Expo dev server. Open it on a phone with Expo Go or a development build, on the same wifi. |
| `pnpm dev:real`                   | Backend, console and this app's **web** target on http://localhost:8095, all on real data.     |
| `EXPO_PUBLIC_DATA_SOURCE=mock`    | The whole app on the in-memory mock, with no backend. Put it in `apps/diner/.env` and restart. |
| `pnpm --filter @yalla/diner test` | Vitest.                                                                                        |

On a phone, the backend address is derived from the dev server's host (the phone
loaded the bundle from `192.168.1.42:8081`, so the API is `192.168.1.42:5086`).
When that is wrong, see "When the phone cannot reach the backend" in the root
README.

### Configuration

Every variable is read when the dev server starts, and only `EXPO_PUBLIC_`
variables reach the bundle. `.env.example` has the details.

| Variable                           | Default                                   | Effect                                                                                        |
| ---------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_DATA_SOURCE`          | `real`                                    | `real` or `mock`. Anything else is a red screen naming the variable.                          |
| `EXPO_PUBLIC_API_URL`              | derived from the dev server host, `:5086` | The backend origin. Plain http: a phone will not trust the dev certificate.                   |
| `EXPO_PUBLIC_SUPPORT_EMAIL`        | unset                                     | Help & Support shows "Contact support" with a `mailto:` link.                                 |
| `EXPO_PUBLIC_SUPPORT_PHONE`        | unset                                     | Help & Support shows "Contact support" with a `tel:` link.                                    |
| `EXPO_PUBLIC_TERMS_URL`            | unset                                     | About lists "Terms".                                                                          |
| `EXPO_PUBLIC_PRIVACY_URL`          | unset                                     | About lists "Privacy".                                                                        |
| `EXPO_PUBLIC_SIMULATE_TABLE_TAKEN` | unset                                     | Mock only: the next booking loses the race, so the "someone just took that table" path shows. |

The four Help and About variables stay unset until the product has a real
support contact and real policy pages. Unset, the line is left out; nothing is
ever shown as a placeholder.

## Capability matrix

What the app does on real data, what it needs from outside the code to work,
and what it does not offer. Each real row names the API it runs on, so a row
can be checked against the backend's swagger. If a row and the code disagree,
the code is right and this table needs fixing.

### Real

| Capability                                   | API                                                                                                               | Notes                                                                                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nearby places, search, filter by type        | `GET /api/public/branches`, `GET /api/public/branches/search`                                                     | Distance only when the phone shares its position.                                                                                                                                 |
| Place details: hours, amenities, gallery     | `GET /api/public/branches/{branchId}`                                                                             |                                                                                                                                                                                   |
| Menu                                         | `GET /api/public/branches/{branchId}/menu`                                                                        | Complete items only.                                                                                                                                                              |
| Reviews: read                                | `GET /api/public/branches/{branchId}/reviews`                                                                     | Newest first; hidden reviews are left out of the list and the rating.                                                                                                             |
| Reviews: write and edit                      | `GET`/`POST`/`PUT /api/diner/branches/{branchId}/review`                                                          | Needs a verified phone and a visit in the last 180 days (a seated or completed booking, or a place on a tab there).                                                               |
| Reporting a review                           | `POST /api/diner/reviews/{reviewId}/report`                                                                       | On every review the signed-in diner did not write. One report per diner per review.                                                                                               |
| Table view with pins on the photo            | `GET /api/public/branches/{branchId}/table-markers`                                                               | Only tables a manager placed on the cover photo.                                                                                                                                  |
| Map                                          | `GET /api/public/branches` (coordinates)                                                                          | Apple Maps on iOS, Google Maps on Android. An Android development or store build needs a Maps API key — see below.                                                                |
| Booking a table, with a note to the venue    | `GET /api/public/branches/{branchId}/availability`, `POST /api/reservations`                                      | Offered only when the place accepts app bookings. The note is shown to the venue only on a booking waiting for its approval; no venue screen shows it on a confirmed booking yet. |
| My bookings, cancelling one                  | `GET /api/reservations/mine`, `POST /api/reservations/{reservationId}/cancel`                                     |                                                                                                                                                                                   |
| Scanning a table, the shared tab, invites    | `POST /api/tabs/open`, `/api/tabs/join`, `/api/tabs/open-by-booking`, `GET /api/tabs/{tabId}`                     | No account needed to scan in.                                                                                                                                                     |
| Ordering from the table, calling a waiter    | `POST /api/tabs/{tabId}/orders`, `POST /api/tabs/{tabId}/service-requests`                                        |                                                                                                                                                                                   |
| Orders, current and past                     | `GET /api/diner/orders`, `GET /api/diner/orders/{orderId}`                                                        |                                                                                                                                                                                   |
| Account: phone code, password, profile photo | `/api/auth/diner/*`, `GET`/`PUT /api/diner/me`, `PUT /api/diner/me/password`, `POST`/`DELETE /api/diner/me/photo` |                                                                                                                                                                                   |
| Deleting the account                         | `DELETE /api/diner/me`                                                                                            | Asks for the password, or a fresh phone code when there is none. Signs the account out everywhere.                                                                                |
| Favourites                                   | `GET /api/diner/favorites`, `PUT`/`DELETE /api/diner/favorites/{branchId}`, `PUT /api/diner/favorites`            | **Synced to the account.** Hearts tapped while signed out are kept on the phone and merged into the account at sign-in, then cleared from the phone.                              |
| Notifications feed                           | `GET /api/diner/notifications`, `POST /api/diner/notifications/read`                                              | The Profile row shows the unread count. Rows are written whether or not the phone can receive push, so the feed works on a phone with notifications off.                          |
| Help & Support                               | none                                                                                                              | The FAQ describes what the app really does. "Contact support" appears only when `EXPO_PUBLIC_SUPPORT_EMAIL` or `EXPO_PUBLIC_SUPPORT_PHONE` is set.                                |
| About                                        | none                                                                                                              | App version and build. "Terms" and "Privacy" appear only for the URLs that are set.                                                                                               |

### Needs something outside the code

| Capability                                                                       | State today                          | What turns it on                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Push: booking reminder with Cancel, "still coming?"                              | **Inert** without an EAS project     | An EAS project id in `app.json` (`extra.eas.projectId`) and a development or store build. Without it there is no push token: the opt-in card says the reminder will not arrive, `POST /api/diner/devices` is never called, and nothing else changes. **And** a backend on `Notifications__Channel=Expo` (plus `Notifications__ExpoAccessToken` if push security is on): the default `Log` channel writes the reminder to the server log and the in-app feed and sends no push. |
| Map on an Android development or store build                                     | **Empty grey map** without a key     | A Google Maps Android API key in `android.config.googleMaps.apiKey`, from app config or an EAS secret. `react-native-maps` always draws Google Maps on Android; Expo Go carries its own key, so the map works there without one. iOS uses Apple Maps and needs nothing.                                                                                                                                                                                                        |
| Universal links: `https://yalla.am/t/<code>` and `https://yalla.am/join/<token>` | **Inert** until the files are hosted | `apple-app-site-association` and `assetlinks.json` under `https://yalla.am/.well-known/`, which need the Apple Team ID and the Android release signing SHA-256. Until then those links open in the browser. `yalla://t/<code>` and `yalla://join/<token>` work now.                                                                                                                                                                                                            |

### Not offered

| Capability          | Why                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paying online       | There is no payment provider. The tab shows what each person owes; payment happens with the venue.                                                  |
| Cancelling an order | Not a diner action in the domain. Voiding a line is a staff action on the kitchen rail, so there is no endpoint and the app shows no cancel button. |
| Takeaway            | Every order belongs to a table's tab.                                                                                                               |

### The web target is for QA only

`expo start --web` and the `expo export --platform web` bundle exist so the app
can be driven in a browser on a laptop (`pnpm dev:real`, end-to-end tests) and so
CI can run Metro on every pull request. It is not a product surface: there is no
push on the web, the map is a drawn stand-in rather than a real map, the camera
is whatever the browser offers. Storage is `localStorage` only in a development
build (`expo start --web`); an exported or production web bundle
(`expo export --platform web`, which CI, `verify.sh` and the end-to-end run use)
keeps the session in memory, so a reload signs the diner out. Anything a diner relies on is checked on a phone —
see [docs/PHONE-QA.md](docs/PHONE-QA.md).
