/**
 * GENERATED FILE — do not edit.
 *
 * Source: http://localhost:5199/swagger/v1/swagger.json
 * Regenerate with: pnpm api:generate
 */

/* eslint-disable */
export interface paths {
    "/api/auth/diner/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign in a diner with a username or email and a password
         * @description `identifier` is a username or an email address, case-insensitively.
         *
         *     Unknown identifier, wrong password, an account that has no password yet and a deactivated account all answer the same `401 invalid-credentials`, and all cost the same time, so this form cannot be used to discover which accounts exist.
         *
         *     Rate limited on two axes: per address by the pipeline, and per identifier by the service - ten attempts in fifteen minutes, right or wrong, after which the answer is `429 too-many-attempts` rather than another 401. Wait; the account is not locked and nobody has to unlock it.
         *
         *     The response is exactly what `verify-code` returns, with `isNewAccount` false.
         */
        post: operations["loginDiner"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/diner/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Rotate a diner refresh token
         * @description Spends the handle you send and returns its successor. Sending a handle that was already spent means two parties hold it, so the whole chain from that sign-in is revoked and both must sign in again.
         */
        post: operations["refreshDinerToken"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/diner/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create a diner account with a username, email and password
         * @description The sign-up form, for the people who want an account they can recognise - and for the moment there is no signal for an SMS. The code flow is still the front door and still needs no registration.
         *
         *     **The phone number is stored as typed and is not verified by registering.** The account's `phoneVerified` stays false until a one-time code to it is passed once; the profile screen shows a *verify* link until then.
         *
         *     Username: 3-30 characters, letters, digits, dots and underscores, lowercased on the way in. Password: 8-128 characters and not the username or the email - no composition rules. A malformed field answers 400 with `context.field` naming it.
         *
         *     Rate limited per address like `request-code`. Signs the new account in: the response is exactly what `verify-code` returns, with `isNewAccount` true.
         */
        post: operations["registerDiner"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/diner/request-code": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Send a one-time code to a phone number
         * @description Issues a six-digit code, good for five minutes and five attempts, and hands it to the configured sender.
         *
         *     The response is **identical** whether or not the number already has an account. Nothing here reads the account table, so there is no field and no timing difference to tell the two apart - this endpoint cannot be used to ask who has a Yalla account.
         *
         *     Rate limited per address by the pipeline and per phone number by the service. Codes cost money to send, so an unlimited request endpoint is an invoice generator.
         *
         *     In Development the code comes back in `developmentCode`, so the flow works with no SMS provider wired up. That field is always null anywhere else.
         */
        post: operations["requestDinerCode"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/diner/sign-out": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Revoke a refresh chain
         * @description Always succeeds, including for a handle that was never valid.
         */
        post: operations["signOutDiner"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/diner/telegram/{challengeId}/claim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Poll a Telegram verification and, once verified, exchange it for tokens
         * @description `pending` while the bot has not been handed the number; `verified` exactly once, with `signIn` set to **exactly what `verify-code` returns** - the account is created on a first number, a registered number's account is signed in and its number marked verified, with the same displacement rule - and `phoneE164`, the number Telegram handed over, so the app can show it without reading the profile. After that the challenge is spent.
         *
         *     Unknown, expired and spent challenges - and one started under a different account than the one claiming it - all answer **410 `telegram-verification-expired`**: start again. Links last five minutes; a verified challenge stays claimable for two more.
         *
         *     Rate limited per address by its own `auth-telegram-claim` policy, sized for one app polling as told.
         */
        post: operations["claimTelegramVerification"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/diner/telegram/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Start proving a phone number through the Telegram bot
         * @description Issues a challenge and a single-use deep link into the bot. Open `deepLinkUrl`; Telegram starts the bot, which asks the person to share their contact. Then poll `claim` with `challengeId` every `pollAfterMs` until it answers `verified`.
         *
         *     **The number never passes through the app.** Telegram hands the bot the number it verified when the account was created, and only the sender's own contact card counts - a forwarded card does not.
         *
         *     Send the `Authorization: Bearer` token `register` returned when verifying a registered number from the same app, exactly as for `verify-code`: the claim then keeps the password. Without it the registrant is displaced. The route stays anonymous; an invalid token is ignored.
         *
         *     Rate limited per address like `request-code`. Not mapped at all when the Telegram door is switched off in configuration.
         */
        post: operations["startTelegramVerification"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/diner/verify-code": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Exchange a one-time code for tokens
         * @description Checks the newest live code for the number. On success the account is created if this is the first time - there is no separate registration step, because a separate registration step is a step people abandon.
         *
         *     **A registered number.** The account that registered with the number is signed in and its number marked verified; no second account is made. The first time, send the `Authorization: Bearer` token `register` returned: a request carrying that same account's token keeps its password and sessions. Without it - anonymous, or under a different diner - the code's holder is treated as the number's owner and the registrant as a stranger: the password is cleared (`hasPassword` false) and every refresh token for the account is revoked. The route stays anonymous; an invalid token is ignored, not refused.
         *
         *     A wrong code spends one of five attempts and says how many are left. The sixth attempt is refused outright with 429: the code is dead and a new one is needed.
         */
        post: operations["verifyDinerCode"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/staff/device": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What this device is bound to. Reads the claim in the handler for the same reason the PIN
         *     exchange does: the device token is the credential being described, not one being authorised.
         * @description For the PIN screen. **A tablet on a counter should say where it thinks it is** - without this a browser enrolled months ago shows a keypad with no indication of which branch it will act on, and a laptop bound to the wrong one is first noticed in an audit row.
         *
         *     Authenticated by the device token. A revoked device is refused here too: showing a venue name and a keypad to somebody holding a killed tablet is the wrong answer twice.
         */
        get: operations["getEnrolledStaffDevice"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/staff/enrol": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Redeem a one-time enrolment code for a device token
         * @description Turns a code a manager generated into a long-lived token bound to one tablet and one branch. The code works exactly once; a second attempt is a 409, and a manager who sees one should check the branch's device list for a tablet they did not enrol.
         *
         *     The device token can do exactly one thing - offer a PIN. It carries a branch but no person, so an enrolled tablet with nobody signed in cannot seat a table.
         */
        post: operations["enrolStaffDevice"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/staff/pin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * The one endpoint that reads a claim in the handler, because the device is the credential
         *     being exchanged rather than something being authorised.
         * @description The whole point of the staff model: **a waiter never types an email during a Friday rush**. The tablet signs in once and stays signed in; a person becomes present with four taps.
         *
         *     Send the device token as the bearer. The session token that comes back carries the staff member, their role and the tablet's branch, and lasts thirty minutes; the renewal handle keeps it alive while the tablet is in use and stops working after thirty minutes of inactivity.
         *
         *     PINs are per person, never shared. A shared PIN is faster and destroys the audit trail that answers 'who gave away my reserved table'.
         */
        post: operations["signInStaffWithPin"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/staff/renew": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Keep a staff session alive
         * @description Rotates the renewal handle and pushes the inactivity window forward. Refused once the session has been idle for thirty minutes, once its shift-length cap runs out, or as soon as the tablet is revoked - in every case the answer is to tap the PIN again.
         */
        post: operations["renewStaffSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/staff/roster": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Who may sign in on this device. Reads the device claim exactly as
         *     M:Yalla.Api.Endpoints.AuthEndpoints.GetEnrolledDeviceAsync(Yalla.Application.Auth.IStaffAuthService,Microsoft.AspNetCore.Http.HttpContext,System.Threading.CancellationToken) does, so the two refuse the same callers the same way.
         * @description For the PIN screen, so a first sign-in is a name to tap rather than a staff member id to type. Exactly the people `POST /api/auth/staff/pin` would accept here: active, of this device's venue, and either at this device's branch or at no particular branch. Sorted by name.
         *
         *     Three fields per person and nothing else - no phone, email or PIN state - because whoever holds the tablet can read it.
         *
         *     Authenticated by the device token, and refused exactly as `GET /api/auth/staff/device` refuses: no token, or a revoked device, is a 401.
         */
        get: operations["getStaffRoster"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/staff/sign-out": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * End a staff session
         * @description The tablet's sign-out button. Always succeeds.
         */
        post: operations["signOutStaffSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/venue/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Rotate an admin-panel refresh token
         * @description As the diner refresh: rotating, and reuse revokes the whole chain.
         */
        post: operations["refreshVenueUserToken"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/venue/request-password-reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Email a password-reset link
         * @description Answers 202 whether or not the address has an account, for the same reason `request-code` answers identically to everyone.
         */
        post: operations["requestPasswordReset"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/venue/reset-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Complete a password reset
         * @description Consumes the link and revokes every session the account had open - the usual reason to reset a password is that somebody else might have had it.
         *
         *     Only a minimum length is enforced. No composition rules.
         */
        post: operations["resetPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/venue/sign-in": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign in to the admin panel with email and password
         * @description The conventional flow, because this is a desktop browser session holding prices, refunds and staff accounts.
         *
         *     Unknown address, wrong password and deactivated account all answer identically, so this form cannot be used to discover which addresses have accounts.
         */
        post: operations["signInVenueUser"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/venue/sign-out": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoke a refresh chain */
        post: operations["signOutVenueUser"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/availability": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Which tables a branch can offer for one slot
         * @description Every table in the branch pinned on a room photo - `photoId`, `photoX`, `photoY` - with its derived state at the requested time, whether it can be booked for this party - and if not, the one specific reason - and the window the diner may have. Assembled in a single query. Returns no guest names and no money. Omit date and time for 'now, at the branch'.
         *
         *     `excludeReservationId` leaves one booking out of the answer as though it had never been made - the diner's own, while they change it, so the table they already hold reads as free to them. Every other booking still counts, and an id that is not a booking at this branch changes nothing. Anonymous like the rest of the read: booking ids are unguessable, and the answer says no more about the one left out than that its table is free.
         */
        get: operations["getBranchAvailability"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/availability/slots": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Which start times on one day have a table for this party
         * @description Every half hour from 00:00 on `date` (`stepMinutes` is 30) whose whole sitting - the branch's turn time - fits one opening block, earliest first. A time the branch is shut for is **left out**, never struck. Each slot carries `time` (`HH:mm`, branch wall clock), `startUtc`, `isAvailable`, `requiresApproval`, `freeTableCount` and, when not available, `unavailableReason`.
         *
         *     **`isAvailable`** is true when at least one bookable table pinned on a photo of its room seats the party within the seat-overhang limit and has no booking or sitting running into the slot, clearing time included. These are the single-slot read's own rules over the same rows, so a time listed here as free is one `availability?time=` offers exactly `freeTableCount` tables at, and a struck time is one it offers none at.
         *
         *     **Why a time is struck**: `LeadTimeTooShort` (1) or `OutsideBookingWindow` (2) when the time itself is refused; otherwise `TableAlreadyBooked` (8) - or `TableCurrentlyOccupied` (10) - when tables that fit the party are taken, else the commonest table reason, e.g. `PartyExceedsCapacity` (4) when nothing seats them.
         *
         *     The top-level `unavailableReason` refuses the whole day: `OutsideOpeningHours` (3) with no slots when the branch is shut all day, or the timing reason every listed time shares - a past day, the rest of today inside the lead time, a date beyond the booking window. Null when any time was judged on its tables.
         *
         *     One query, like the single slot. Returns no guest names and no money. `partySize` defaults to 2.
         *
         *     `excludeReservationId` leaves one booking out of the answer as though it had never been made - the diner's own, while they change it, so the table they already hold reads as free to them. Every other booking still counts, and an id that is not a booking at this branch changes nothing. Anonymous like the rest of the read: booking ids are unguessable, and the answer says no more about the one left out than that its table is free.
         */
        get: operations["getBranchDaySlots"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/devices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Every tablet enrolled to this branch
         * @description Revoked devices are included, so the list is an audit trail rather than a roster.
         */
        get: operations["listBranchDevices"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/devices/{deviceId}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Kill a lost or stolen tablet
         * @description Takes effect on the tablet's next request, not when its token expires - every request carrying a device or session token checks this row. Any session open on the tablet is ended at the same time, because the session is the thing that can act.
         *
         *     Permanent. A tablet that turns up again is enrolled afresh.
         */
        post: operations["revokeBranchDevice"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/devices/enrolment-codes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Generate a one-time code for enrolling a tablet
         * @description The code is returned **once**. Only its hash is stored, so a manager who loses it issues another rather than looking it up.
         *
         *     It is good for 24 hours and exactly one redemption. Codes get read out across a bar and will be overheard; single use is what makes that survivable, because a second redemption fails and the manager sees a tablet in the list they did not enrol.
         */
        post: operations["createDeviceEnrolmentCode"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/floor-areas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Add a floor area */
        post: operations["createFloorArea"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/floor-areas/{areaId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Remove a room and its photos; its tables stay, with no room and no pin */
        delete: operations["deleteFloorArea"];
        options?: never;
        head?: never;
        /** Rename or reorder a floor area */
        patch: operations["updateFloorArea"];
        trace?: never;
    };
    "/api/branches/{branchId}/floor-plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The rooms, their photos, and every table with its pin
         * @description The rooms editor's read. Each area is a room (Hall, Terrace, VIP) with its `photos` in the order a diner swipes them. Each table carries `photoId`/`photoX`/`photoY`: the room photo it is pinned on and where, as fractions of the picture (0-1 from the left and the top), or all three null when it has no pin. Inactive tables are included, flagged by `isActive`.
         *
         *     `version` is the plan's revision, opaque: send it back as `expectedVersion` when saving.
         */
        get: operations["getFloorPlan"];
        /**
         * Replace the rooms, their photos and every table's pin in one atomic call
         * @description The editor sends the finished layout: rooms with their `photoIds`, and tables with their pins. It lands whole or not at all.
         *
         *     - Tables match by `id`, then by `label`, so an editor that lost the ids still edits the same tables and their **QR codes survive**. A QR token is never regenerated by an edit.
         *     - Labels must be unique and present; room names too. Violations are `422 floor-plan-invalid` naming them in `context.errors`.
         *     - A room has at most 10 photos (`areas[i].photoIds`, bound `max`), no photo twice, and a photo is in at most one room (`areas[i].photoIds[j]`, bound `conflict`). A photo not uploaded for this branch is `404`, the gallery's answer.
         *     - A pin is `photoId`, `photoX` and `photoY` together or none of them (`tables[i].photoX`, bound `required`), each coordinate 0-1 (bound `range`), on one of **the table's own room's** photos (`tables[i].photoId`, bound `conflict`).
         *     - **A photo dropped from every room takes its tables off it**: a table still sent pinned on such a photo is saved with no pin rather than refused.
         *     - A bookable table with no pin is saved, with a warning: diners are not offered it.
         *     - A table omitted from the plan is deleted only if it has never been used. One with any reservation, session or tab is **deactivated** instead, and `deactivatedTables` says so. One with a booking still to come (Confirmed or PendingApproval, not yet ended) is refused: `409 table-has-future-bookings` naming `context.tables` and `context.bookings`, nothing written.
         *     - **`expectedVersion` is required**: the `version` the editor loaded. A plan saved by somebody else since then is `409 floor-plan-changed` with `context.currentVersion`, and nothing is written. Missing, it is `422` naming `expectedVersion`. A successful save returns the new `version`; nothing else moves it.
         */
        put: operations["putFloorPlan"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/listing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** What the diner app's browse screens say about this branch */
        get: operations["getBranchListing"];
        /**
         * Set cuisine, about, price level, website, amenities, district, map pin and gallery
         * @description Every listing field is replaced; null or blank clears it. `priceLevel` is 1-4; `amenities` are keys from `outdoorSeating`, `wifi`, `parking`, `cardPayment`, `vegan`; `websiteUrl` is an absolute http(s) address; `district` is the part of town, e.g. `Kentron`, trimmed, at most 60 characters, and a manager may set it like any other listing field - it is not the address and moves nothing. Every broken field is reported at once as `422 validation-failed`.
         *
         *     **Moving the branch.** `address`, `latitude` and `longitude` travel together: coordinates without an address, or an address without coordinates, is `422` naming the missing field (bound `required`); the address is at most 400 characters. Sending all three as they are stored is not a move. A move - any of them present and different from the stored value - is allowed only to an **owner of this venue or a platform admin signed in to the admin panel**; anyone else (a manager, or any PIN session) gets `403 relocation-not-allowed` and **nothing on the form is saved**. A move is audited as `branch.relocate` with the old and new address and coordinates.
         *
         *     `galleryPhotoIds` are photos uploaded for **this** branch through `POST /api/branches/{branchId}/photos`, in display order, at most 12. **Null leaves the gallery alone**; `[]` clears it. A photo from another branch is 404 and nothing is written.
         */
        put: operations["putBranchListing"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/menu": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The branch's menu
         * @description Categories in display order, each with its items, in one query.
         *
         *     **Sold-out items are returned with `isAvailable: false`, not hidden.** A dish that silently vanishes looks like a broken menu and sends the diner to ask a waiter - the exact question this feature exists to remove. Grey it out and keep the price.
         *
         *     **Unfinished items are excluded entirely, which is the opposite rule for the opposite reason.** Since the photo requirement moved from create-time to go-live-time an item can exist without a photo, a description, ingredients, allergens, a portion size or a prep time - that is how a menu gets typed in before it gets photographed - and none of those may reach a diner. Somebody reading an empty allergen list reasonably concludes there are none.
         *
         *     So every descriptive field on this read is always present and `isComplete` is always true. The console's `GET /api/branches/{branchId}/menu/manage` is where the unfinished ones are visible.
         */
        get: operations["getBranchMenu"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/menu/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Add a category */
        post: operations["createMenuCategory"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/menu/categories/{categoryId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Remove a category and its items
         * @description Refused while any of its items appears on an order; mark them unavailable instead.
         */
        delete: operations["deleteMenuCategory"];
        options?: never;
        head?: never;
        /** Rename or reorder a category */
        patch: operations["updateMenuCategory"];
        trace?: never;
    };
    "/api/branches/{branchId}/menu/categories/{categoryId}/items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Add an item; only a name and a price are required
         * @description **A photo and the descriptive fields are optional here and required to go live.** Ingredients, allergens, portion size, prep minutes and a photo are what a diner would otherwise ask a waiter, so an item without them is not fit to show one - but requiring them at this point meant an eighty-dish menu could not be entered without eighty photo uploads first, in order, before a single name or price could be typed. That is not the order the work happens in.
         *
         *     So the rule moved rather than went away. An item saved without them comes back with `isComplete: false`; `GET /api/branches/{branchId}/readiness` counts it; the branch cannot be switched to `Paid` while any remain; and the diner-facing menu does not return it at all.
         */
        post: operations["createMenuItem"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/menu/items/{itemId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Remove an item, or deactivate one that appears on orders
         * @description An item referenced by any order line cannot be deleted - the reference must survive - so it is marked unavailable instead, and the response says so.
         */
        delete: operations["deleteMenuItem"];
        options?: never;
        head?: never;
        /**
         * Edit an item, including its price and its category
         * @description A price change never affects existing order lines, which snapshotted the price they were placed at.
         *
         *     `categoryId` **moves the item to another category of the same branch**, where it lands last in the display order - reorder afterwards if that is not where it belongs. Existing order lines are unaffected: they never reference a category. A category belonging to another branch is refused with `context.field` of `categoryId`.
         *
         *     A field left out is left alone, including one that was never filled in, so a half-entered item can be saved again without the edit insisting on the half that is missing.
         */
        patch: operations["updateMenuItem"];
        trace?: never;
    };
    "/api/branches/{branchId}/menu/items/{itemId}/availability": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * "We're out of khachapuri tonight"
         * @description Separate from delete. The item stays on the menu record; diners cannot order it while unavailable.
         */
        post: operations["setMenuItemAvailability"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/menu/manage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The full menu, including unavailable and unfinished items
         * @description The same shape as the public `GET /api/branches/{branchId}/menu`, without its open-for-business gate, so a suspended venue's manager can still edit.
         *
         *     **This read includes items with `isComplete: false`; the diner-facing one does not.** A manager has to be able to see the eleven dishes that still need a photo - that is the entire point of being allowed to save them half-entered - and a diner must never be shown a dish with no allergen list.
         */
        get: operations["getMenuForAdmin"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/opening-hours": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** The weekly opening hours */
        get: operations["getOpeningHours"];
        /**
         * Replace the whole week atomically
         * @description Send every block for every day. `closesNextDay` is derived - a closing time at or before the opening time means after midnight - and is not accepted from the client. Blocks on one day may touch but not overlap.
         *
         *     The body is an array, so a refusal names the offending block by index: `context.field` reads `[2].closesAt`. Every bad block is reported, not just the first.
         */
        put: operations["putOpeningHours"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The kitchen queue
         * @description Open orders for the branch, oldest first, with the table label, the lines and their kitchen notes. Omit `status` for everything still outstanding - New, InKitchen and Ready - which is what a kitchen screen shows.
         */
        get: operations["getBranchOrders"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/photos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Upload a photo for a menu item or a venue card
         * @description Multipart upload of a single `file` part. Returns the photo id and its three variant URLs; attach the id to a menu item or a branch.\n\n**The bytes are sniffed, never trusted.** JPEG, PNG and WebP are accepted and everything else is refused, whatever the declared content type or the file name says - those are both attacker-controlled.\n\n**EXIF is stripped.** A menu photo comes off the owner's phone carrying GPS coordinates and a device serial; the original bytes are never stored. Three variants are generated and the originals are discarded.\n\nUploading the same image twice returns the first photo and writes nothing, with `wasDeduplicated: true`. A photo nothing attaches to is deleted after 24 hours.
         */
        post: operations["uploadBranchPhoto"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/public-profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** What this branch publishes on its public page */
        get: operations["getBranchPublicProfile"];
        /**
         * Set the published phone number, whether the page takes bookings, and the cover photo
         * @description `acceptsWebBookings` is **false until somebody switches it on**, and stays false for every branch that has never been asked. A venue has not agreed to take bookings from strangers on the internet by never having been consulted, so this is a decision made during onboarding rather than a default inherited - which is also why it appears on the branch readiness checklist.
         *
         *     While it is off the public page still shows the room, the menu and the hours and simply offers no booking.
         *
         *     `phoneE164` must be E.164 (`+37411223344`); spaces, dashes and brackets are stripped first. Null or blank clears it. A branch with no number published is a branch a diner on the public page has no way to ask about a high chair.
         *
         *     `coverPhotoId` is the venue card's picture: a photo uploaded for **this** branch through `POST /api/branches/{branchId}/photos`, or null to clear it. A photo uploaded for another branch is not found here, and the whole form is refused before anything is written. The cover is the card's picture only - tables are pinned on room photos through the floor plan, so changing it moves no pin.
         */
        put: operations["putBranchPublicProfile"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/readiness": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What this branch still needs before it can take diners
         * @description The onboarding checklist, answered by the server: floor plan drawn, tables labelled, at least one menu category, how many menu items are still incomplete, hours set, reservation policy reviewed, staff enrolled, at least one tablet.
         *
         *     The console used to render this from a client-side guess, which meant the console and the server had two different ideas of ready - and only the server's decides whether the branch may be switched to `Paid`. `incompleteMenuItemCount` is the line that gate enforces, and `incompleteMenuItemIds` says which items to finish.
         *
         *     `blockers` says what is left in sentences; `issues` says the same lines, one for one and in the same order, as stable codes - `no-tables`, `tables-unlabelled`, `no-menu`, `menu-empty`, `incomplete-dishes` (with `count`), `no-hours`, `policy-not-reviewed`, `no-staff`, `no-device`.
         */
        get: operations["getBranchReadiness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/reports/menu": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What sold, what did not, and what got sent back
         * @description Top items by count and by revenue - frequently two different lists - plus voids by item and reason, because a dish voided often is either mis-described or badly made.
         *
         *     **`neverOrdered` is the one report that changes behaviour.** A dish nobody orders is inventory that spoils and menu space that could sell something else, and no venue knows which those are: they are, by definition, the ones nobody mentions.
         */
        get: operations["getMenuReport"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/reports/occupancy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * How full the room was, and how long people actually stayed
         * @description Tables occupied by hour of day and by weekday, seats filled against capacity, and walk-ins against bookings.
         *
         *     **`turnTime` is a distribution, not an average, and it is the most useful number in the whole set.** A cafe whose policy says 120 minutes and whose real median is 165 is refusing a 20:00 sitting because it believes the 18:00 one ends at 20:00 - and half the time it does not. It is losing bookings it has no other way to see. An average hides exactly that: a fast lunch and a slow dinner average to something plausible and describe neither service. Read `medianMinutes`, `p90Minutes` and `overPolicyFraction` together.
         *
         *     A sitting is counted in **every hour it spans**, not only the one it started in: "how busy is the room at eight" is a question about occupancy, and counting arrivals makes a restaurant look empty at its busiest hour.
         */
        get: operations["getOccupancyReport"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/reports/reservations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Bookings, and what became of them
         * @description Booked, seated, cancelled and no-show with their rates, late cancellations against the branch's own deadline, and how far ahead people book.
         *
         *     `leadTime` is what `bookingWindowDays` should be set from - a venue taking bookings 30 days out when nobody books more than 5 days ahead is holding tables against demand that does not exist.
         *
         *     **`webBookingsWithoutAnApp` is the number that decides a commercial question.** Somebody who booked from the public page and has no registered device cannot be reached by the reminder, the late nudge or one-tap cancel - the entire no-show story. If that number is large, an SMS or Telegram channel is worth paying for; if it is small, the install prompt on the confirmation screen is enough. See `docs/reports.md`.
         */
        get: operations["getReservationReport"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/reports/revenue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What was taken, by day and by hour
         * @description Total, average tab and **average per head** - a different question from average tab, and the one a menu is priced against. Service charge collected, cash against in-app, and comps and discounts as their own line **with who authorised them**.
         *
         *     That last part is why adjustments are manager-only: an owner asking "what did we give away last month, and who decided" is asking both halves.
         *
         *     Revenue is counted on the tab **closing**, so a sitting that starts at 23:30 and settles at 00:40 belongs to the night it was taken - which is the day the venue counted its drawer.
         */
        get: operations["getRevenueReport"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/reports/staff": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Orders entered and tables turned, per branch
         * @description Aggregated across the branch, and **deliberately not per waiter**.
         *
         *     The audit log has the per-person data and an owner will ask for it. A ranked list of employees that renders itself every morning is a different product from a report somebody requests - it is a management decision with consequences, made on the venue's behalf by software. If a venue wants per-person numbers they can be given a report. See `docs/reports.md`.
         */
        get: operations["getStaffReport"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/reservation-policy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Every field of the branch's reservation policy */
        get: operations["getReservationPolicy"];
        /**
         * Replace the reservation policy
         * @description Every field, as one form. Out-of-range values are **refused, never clamped** - a turn time of 5 minutes or 12 hours gets a 422 that says so.
         *
         *     **Every refusal names its field.** `context.field` is the first offending property and `context.fields` is all of them, each with the `bound` it broke, the `min` and `max` allowed and the `value` sent - in the same casing this schema uses, so a form can put each message against its own input without mapping English prose back to a field. A request that breaks six bounds reports six.
         *
         *     **Existing bookings are never touched.** If the new window or turn time would not have allowed some of them, `affectedExistingReservations` says how many and `affectedReservationIds` which; they stay exactly as booked. The new rules apply to future bookings only.
         *
         *     Saving this form is what marks the policy as reviewed on the branch readiness checklist.
         */
        put: operations["putReservationPolicy"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/reservations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A branch's bookings in one status - the approval queue
         * @description What the console's *awaiting approval* panel reads before calling `approve` or `reject`. `status` is required (`1` PendingApproval).
         *
         *     Sorted by the branch's local date, then local start time. **No paging: at most 200 rows**, the earliest first, so what a cap would cut is what is furthest away.
         *
         *     Manager or above: a branch manager lists their own branch only; an owner or general manager, any branch of their venue; a platform admin, any branch. (Approving and rejecting are open to the branch's waiters too; the floor's own list is `/reservations/awaiting`.) `awaitingApprovalBecause` is the reason stored when the booking went to approval - worked out against the branch's current policy only for a booking from before that was stored - and `approvalExpiresAtUtc` the short-notice deadline to count down to.
         */
        get: operations["listBranchReservations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/reservations/awaiting": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The bookings waiting for the floor's yes or no, with each table's evening
         * @description What the staff tablet's *awaiting approval* panel polls (every ten seconds or so) before calling `approve` or `reject`. The branch's bookings in `PendingApproval` that can still be answered - not past `approvalExpiresAtUtc`, not started - **soonest deadline first**, then those with no deadline by start. At most 200; no paging.
         *
         *     Each item: `reservation` (the `ReservationView` - code, start, party, table, room, guest name, and `guestPhone` for calling), `approvalExpiresAtUtc` (count down to it; null for a booking that waits as long as it takes), `trigger` (the `ApprovalTrigger`, 4 ShortNotice), and the table's context that day: `previousBooking` (`reservationId`, `startUtc`, `localStartTime`, `partySize`, `guestName`, `guestPhone`, `status` - the booking before it, cancelled ones skipped), `nextBooking` (`reservationId`, `startUtc`, `localStartTime`, `partySize`) and `currentSitting` (`seatedAtUtc`, `partySize` - absent when a diner's scan opened the table and only guessed). Each is absent when there is none, like every null in this API.
         *
         *     One query however many are waiting. A waiter or above at this branch; an owner or general manager at any branch of their venue. A platform admin reads the list with every guest number blank (`guestPhone` empty, `previousBooking.guestPhone` absent).
         */
        get: operations["listAwaitingApproval"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/reviews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * This branch's reviews for moderation, with report counts
         * @description Every review of the branch - published or hidden - with `hidden`, `hiddenReason`, `hiddenAtUtc`, `hiddenByPlatform`, `reportCount` and `lastReportedAtUtc`. `authorName` is the public name, never the account's full name, number or email.
         *
         *     `filter`: `all` (default, newest written first), `reported` (at least one diner report, most recently reported first) or `hidden`. `page` from 1, `pageSize` 1-100 (default 20); `total` counts the rows for the filter.
         *
         *     Scoped like every branch setting: a manager whose account names a home branch reaches that branch only.
         */
        get: operations["listBranchReviewsForModeration"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/reviews/{reviewId}/visibility": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Take a review of this branch down, or put one back
         * @description `{ "hidden": true, "reason": "…" }` takes it down: out of the public list, the rating, the count and the badges at once. `reason` is required when hiding, at most 500 characters. `{ "hidden": false }` puts it back.
         *
         *     **A review the platform took down stays down**: putting it back is `403 forbidden`, and hiding it again changes nothing. `hiddenByPlatform` on the list says which ones those are.
         *
         *     **Audited** as `review.hide` or `review.unhide` with `actorType: venue`. A request that changes nothing writes nothing. Answers the review as the list shows it.
         */
        put: operations["setBranchReviewVisibility"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/service-requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What tables are asking for
         * @description Open requests, newest first, with the table label and how long they have been waiting. Newest first because on a busy floor the screen is glanced at, and the thing that just came in is the one nobody has walked to yet.
         *
         *     A request for the bill from the diner's pay sheet carries `billScope`, `billAmountAmd`, `tipPercent` and `tipAmd`: the amount to bring, priced when the diner asked, and the tip to expect on top of it - what the cash keypad opens with. One the same diner has since replaced with a newer request for the bill is not listed: the newer one is what to bring.
         */
        get: operations["getOpenServiceRequests"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/staff/{staffMemberId}/clear-pin-lockout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Unlock a staff member's PIN
         * @description The path that actually gets used mid-service. A waiter who fat-fingered their PIN during a rush cannot be made to wait out a timer, so a manager clears it.
         */
        post: operations["clearStaffPinLockout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/tables/{tableId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete a never-used table, or deactivate one with history
         * @description A table with any reservation, session or tab is **deactivated**, not deleted - deleting it would orphan financial and occupancy records. The response says which happened. Only a table that has never been used is removed outright. A table with a booking still to come (Confirmed or PendingApproval, not yet ended) is neither: it is refused `409 table-has-future-bookings` with `context.tables` and `context.bookings`.
         *
         *     Either outcome changes the floor plan and moves its version: `floorPlanVersion` is the new one. A floor-plan save still carrying the version loaded before the delete is refused 409 `floor-plan-changed`, rather than saving the table back as a new one.
         */
        delete: operations["deleteTable"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/tables/{tableId}/free": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Free a table (Occupied to Free)
         * @description Closes the occupancy. Closes the tab when nothing is owed; when a balance is outstanding the table is still freed - the diners have left - and the response carries the amount as a warning.
         */
        post: operations["freeTable"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/tables/{tableId}/hold": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Hold a table for a party expected imminently (Free to Held) */
        post: operations["holdTable"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/tables/{tableId}/open-tab": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Staff: open the tab on a seated table for a party that is not scanning
         * @description For the walk-in with no phone, or who would rather not: the waiter seats them, opens the tab here, and keys the order in with `staff-orders`. Cash closes it as usual.
         *
         *     The tab opens with **nobody on it** - staff are not participants, and there is no phone to host it. If somebody at the table scans the QR code later, the **first of them becomes the host**, approved on the spot, exactly as if they had scanned first; anyone after them joins pending as usual.
         *
         *     Convergent: a table that already has a tab - a guest scanned first, or this is the second tap - answers with that tab rather than opening another. A retry with the same `clientCommandId` answers with the same tab.
         *
         *     Online only. Opening a tab is not one of the floor commands the tablet queues.
         */
        post: operations["openTabForStaff"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/tables/{tableId}/out-of-service": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Withdraw a table from service (Free or Held to OutOfService)
         * @description Refuses an occupied table with 422: free it first.
         */
        post: operations["markTableOutOfService"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/tables/{tableId}/release-hold": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Give up on a held table (Held to Free) */
        post: operations["releaseTableHold"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/tables/{tableId}/return-to-service": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Put a table back into service (OutOfService to Free) */
        post: operations["returnTableToService"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/tables/{tableId}/seat-held-party": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Seat the party a hold was placed for (Held to Occupied) */
        post: operations["seatHeldParty"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/tables/{tableId}/seat-reservation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Seat a booked party (Free to Occupied, booking to Seated) */
        post: operations["seatReservation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/tables/{tableId}/seat-walk-in": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Seat a party with no booking (Free to Occupied) */
        post: operations["seatWalkIn"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/tables/changes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The branch's change stream, for catching up after a dropped connection
         * @description Every table state change writes exactly one audit row in the same transaction as the change, so this is an ordered event log. A client that lost its connection sends the `maxSequence` from its last floor response as `afterSequence` and applies what comes back, in order, rather than refetching the whole floor and working out what moved. `maxSequence` in the response is where the branch's stream ends right now, not the last entry in this page - so a short page still tells you that you are up to date. `hasMore` is set when the page hit its cap; call again with the last sequence you received.
         */
        get: operations["getBranchChanges"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/branches/{branchId}/tables/floor": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The derived floor state for a branch
         * @description Physical table status with the reservation overlay applied. Assembled in a single query - this is the most-called endpoint in the product. Returns no guest names and no money: the diner app calls it too.
         */
        get: operations["getBranchFloor"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/diner/branches/{branchId}/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The signed-in diner's own review of this place
         * @description For pre-filling the review form. **404** when this diner has not reviewed it.
         *
         *     `publicAuthorName` is the name the public list shows it under. `hidden` true means moderation took it down: the diner still sees it here, nobody else sees it anywhere.
         */
        get: operations["getMyBranchReview"];
        /**
         * Write or replace the diner's review of a place
         * @description Replaces rating and text together; blank text clears it. Writes the review if there was none (**201**), otherwise **200**. Same phone gate and bounds as POST.
         *
         *     **Revising an existing review is always allowed**; writing a first one through PUT needs the visit a POST needs (`403 review-needs-visit`).
         *
         *     **The same rating and text again is a 200 that writes nothing** - `updatedAtUtc` does not move, so re-saving an unchanged form does not mark the review edited.
         */
        put: operations["putBranchReview"];
        /**
         * Review a place: 1-5 stars and optional text
         * @description **One review per diner per branch.** A second POST is `409 conflicting-state`; change the review with PUT instead.
         *
         *     **Needs a verified phone number** - `403 phone-not-verified` otherwise - **and a visit**: a booking of this diner's at the branch that was Seated or Completed, or a place on one of its tabs, in the last 180 days. Without one, `403 review-needs-visit` with `context.windowDays`.
         *
         *     `rating` 1-5 and `text` at most 1000 characters are `422 validation-failed` with `context.fields` naming each. The branch's `rating` and `reviewCount` on the list routes follow within fifteen seconds; the reviews route reads them live.
         */
        post: operations["createBranchReview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/diner/devices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Register this phone for notifications
         * @description Call it on every launch. **Idempotent on the push token** - a row per launch would mean one diner accumulating a hundred devices and a hundred copies of every message.
         *
         *     Re-registering a token that was revoked brings it back, because that is what a reinstall looks like. A token that turns up under a different diner is moved: the phone belongs to whoever is holding it, and the previous owner stops receiving their bookings on it.
         */
        post: operations["registerDinerDevice"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/diner/favorites": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The diner's favourite places
         * @description Newest first: `{ items: [ { branchId, createdAtUtc, listing } ] }`, where `listing` is the `PublicBranchListing` the browse list serves. A place that is not published - inactive, or its venue suspended or deleted - is left out, and comes back if it reopens.
         *
         *     `lat` and `lng` work as on the browse list: together they add `distanceKm`. One without the other, or out of range, is `400`.
         */
        get: operations["getDinerFavorites"];
        /**
         * Merge hearts made while signed out into the account
         * @description Body `{ branchIds: uuid[] }`, at most 500. Every published place not already kept is added; **nothing is removed**. An unknown or unpublished place is skipped rather than refused. Answers with the list, as the GET does (and takes the same `lat`/`lng`).
         *
         *     Meant for once, at sign-in. If the merge would take the account past 500 favourites, `409 conflicting-state` and nothing is written.
         */
        put: operations["mergeDinerFavorites"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/diner/favorites/{branchId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Heart a place
         * @description **204**, and idempotent: hearting a place already kept writes nothing. `404` for a place that does not exist or is not published. An account keeps at most 500: a new one past that is `409 conflicting-state`.
         */
        put: operations["addDinerFavorite"];
        post?: never;
        /**
         * Take the heart off a place
         * @description **204**, and idempotent: a place that is not kept, or does not exist, is the same 204. Works for a place that has since closed.
         */
        delete: operations["removeDinerFavorite"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/diner/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The signed-in diner's own account
         * @description What the profile screen shows. Two fields say what is *missing*: `phoneVerified` false means the number was typed at sign-up and never proved - show a *verify* link into the code flow; `hasPassword` false means the account was created by a code and can set a password without giving a current one.
         *
         *     `photo` is absent when there is no picture.
         */
        get: operations["getDinerProfile"];
        /**
         * Change the name, username or email
         * @description Only the fields sent change; a null leaves the current value alone, and nothing here can be cleared. The username and email are under exactly the rules and the 409s of `register`, so the profile screen and the sign-up form cannot disagree.
         *
         *     Answers the whole profile, not just what changed.
         */
        put: operations["updateDinerProfile"];
        post?: never;
        /**
         * Delete the signed-in diner's account
         * @description Proof first: `password` when the account has one (`hasPassword`), otherwise `code` - a one-time code from `POST /api/auth/diner/request-code` for the account's own number.
         *
         *     **In one transaction**: the account becomes a tombstone - number, username, email, name, password and verification stamp cleared, so all three can register again; every session ends (access and refresh tokens); push devices, every review by the account and its pictures (files included) are deleted. The venue keeps its records with the link to the person removed: bookings keep the guest name and number typed into them, places at a table become `Guest`, orders stay. An audit row `diner.delete` is written.
         *
         *     Rate limited per address, and per account like a password sign-in: ten attempts in fifteen minutes, right or wrong.
         */
        delete: operations["deleteDinerAccount"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/diner/me/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Set a first password, or change the current one
         * @description An account the code flow created has no password and sets one without `currentPassword` - the bearer token is the proof. An account that has one must send it, and a wrong one is `401 invalid-credentials`.
         *
         *     **Forgot it?** Sign in again with a code (`verify-code`) or the Telegram bot: for ten minutes after that sign-in, `currentPassword` may be left out. Past that, or from a password sign-in or a refreshed token, leaving it out is `422 validation-failed` with `context.field` = `currentPassword`.
         *
         *     The new password is under the same rule as registration: 8-128 characters, and not the username or the email.
         *
         *     **Every access token the account holds ends, this one included**: the next call with it answers `401 session-revoked`. **Every other sign-in's refresh token is revoked**, so other devices are signed out; the sign-in this token came from keeps its refresh token, so the app refreshes and carries on.
         */
        put: operations["setDinerPassword"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/diner/me/photo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Set the profile picture
         * @description Multipart upload of a single `file` part, through the same pipeline as a branch photo: **the bytes are sniffed, never trusted** - JPEG, PNG and WebP are accepted and everything else refused whatever the declared type says; **EXIF is stripped**; three WebP variants are kept and the original is discarded. Same size cap.
         *
         *     Replaces whatever picture was there. The same bytes uploaded twice by the same person are one photo. The picture replaced is left for the orphan sweep, which runs every hour by default (`PhotoStorage:SweepIntervalMinutes`) and deletes a picture nothing uses once it is more than a day old - so its old URL keeps working for at least a day and stops within about an hour after that. To end it at once, `DELETE /api/diner/me/photo` before uploading.
         */
        post: operations["uploadDinerPhoto"];
        /**
         * Remove the profile picture
         * @description Succeeds when there was none. The picture is deleted at once, files included: its `/api/photos/{id}/…` links answer 404 from the next request.
         */
        delete: operations["removeDinerPhoto"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/diner/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The diner's notifications, newest first, with the unread count
         * @description `{ items, nextCursor, unreadCount }`. Each item is `{ notificationId, kind, params, branchId, branchName, reservationId, tabId, orderId, createdAtUtc, read }`.
         *
         *     `kind` is `booking-reminder`, `booking-confirmed`, `booking-declined`, `booking-cancelled-by-venue`, `order-ready` or `review-hidden`. **The server sends no prose**: the app writes the text from `kind` and the string values in `params`.
         *
         *     A reminder appears when it is due, not when the booking was made; cancelling the booking before then removes it. `unreadCount` covers the whole feed, not the page.
         *
         *     Pages: `limit` 1-50 (default 20); pass `nextCursor` back as `before` for the next page - absent on the last. A cursor this feed did not issue, or a `limit` out of range, is `400`. Entries are kept for 90 days.
         */
        get: operations["getDinerNotifications"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/diner/notifications/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Mark notifications read
         * @description Body `{ upTo: uuid | null, ids: uuid[] | null }`, **204**. `upTo` marks that entry and every older one; `ids` (at most 200) marks those. Both may be sent. **Both absent marks the whole feed read.** An id that is unknown or not the caller's is skipped, not refused.
         */
        post: operations["markDinerNotificationsRead"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/diner/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The diner's orders, for the Orders tab
         * @description Every order this diner is on: placed from their phone, keyed in by a waiter on their behalf, or keyed in for the whole table on a tab they were approved onto. Newest first, at most 100.
         *
         *     `status=active` is New, InKitchen and Ready; `status=history` is Served and Voided; absent is both. Anything else is `400`.
         *
         *     `status` on each order is the app's word: New `confirmed`, InKitchen `preparing`, Ready `ready`, Served `completed`, Voided `cancelled`. `inProgress` is never produced - there is no takeaway. `kind` is always `dineIn`. `timeline` starts with `confirmed` at `placedAtUtc` and adds each kitchen step as it was recorded. `canCancel` is always false: voiding an order is a staff action.
         */
        get: operations["getDinerOrders"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/diner/orders/{orderId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One of the diner's orders
         * @description Same shape as a list entry. Somebody else's order is **404**, the same as no order.
         */
        get: operations["getDinerOrder"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/diner/reviews/{reviewId}/report": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Report somebody else's review
         * @description `reason` is one of `spam`, `offensive`, `not-a-visit`, `personal-info`, `other`; `note` is optional, at most 500 characters. **204.**
         *
         *     A report takes nothing down. The venue and the platform see a count and decide.
         *
         *     **One report per diner per review:** reporting the same review again is a 204 that writes nothing. Any diner account may report - a verified number is not needed. Reporting one's own review is `409 conflicting-state`; a hidden review, or one at a branch that is not published, is `404` like one that does not exist.
         */
        post: operations["reportReview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/orders/{orderId}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Move an order along the rail
         * @description `New -> InKitchen -> Ready -> Served`. Named transitions against an explicit table, the same shape as the table state machine: going backwards is refused, because a Ready order tapped back to InKitchen loses the fact that it was ever cooked.
         *
         *     **The Kitchen role may make exactly one move: `InKitchen -> Ready`.** Serving is a floor action and belongs to whoever carried the plate.
         */
        post: operations["moveOrderStatus"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/photos/{photoId}/{variant}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Serve one variant of a photo
         * @description `thumbnail`, `card` or `full`, always WebP. Anonymous: a menu photo is public, and the diner reading it has no account.\n\nThe content hash is part of the storage path, so a given URL always returns the same bytes - replacing a photo produces a new id rather than changing what this one serves, which is why these are safe to cache hard.
         */
        get: operations["getPhotoVariant"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/platform/activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The activity feed: the newest audit rows, newest first
         * @description Every change the audit log records that a member of staff made - the platform admin's own and the venues' teams' (adding staff, taking down a review, replacing a QR code). Each carries the `action` slug, the `actor` (`role` 5 is the platform admin; `displayName` as they were called then), the `target` (`type`, `id`, `displayName` then - for a review, the branch it is about, never the reviewer), the `venue` it concerns by its current name, and `detail`, the row's JSON as written (shapes in `docs/platform-admin.md`).
         *
         *     `limit` 1-100 (default 20). `venueId` narrows it to one venue.
         */
        get: operations["listPlatformActivity"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/platform/branches/{branchId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Name, address, coordinates, timezone, active flag, tier
         * @description `subscriptionTier` is set here, per branch. Moving a branch to Free switches off tabs and ordering there; the tab endpoints answer `feature-not-enabled`. It is refused while the branch has open tabs, because hiding a live bill from the people who owe it strands real money on a real table.
         *
         *     **Moving a branch to Paid is refused while its menu has unfinished items.** This is where the rule that a dish needs a photo, ingredients, allergens, a portion size and a prep time is actually enforced - at the moment the branch starts taking diners, rather than at the moment somebody types a name and a price. The refusal is `branch-not-ready` and carries `incompleteMenuItemCount`; `GET /api/branches/{branchId}/readiness` lists which items are left.
         */
        patch: operations["updateBranch"];
        trace?: never;
    };
    "/api/platform/branches/{branchId}/reviews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A branch's reviews for moderation, hidden ones included
         * @description Every review of the branch - published or hidden, at any branch whether or not it is published - with `hidden`, `hiddenReason`, `hiddenAtUtc`, `hiddenByPlatform`, `reportCount` and `lastReportedAtUtc`. `authorName` is the public name, not the account's.
         *
         *     `filter`: `all` (default, newest written first), `reported` (at least one report, most recently reported first) or `hidden`. `page` from 1, `pageSize` 1-100 (default 20); `total` counts the rows for the filter.
         */
        get: operations["listPlatformBranchReviews"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/platform/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The signed-in platform admin's own account
         * @description `fullName` is theirs to change. `email` is the sign-in address and is fixed: it is `PlatformAdmin:Email` in configuration, and nothing here changes it.
         */
        get: operations["getPlatformAdminProfile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Change the signed-in platform admin's name
         * @description `fullName`, 1-200 characters after trimming. The configured `PlatformAdmin:FullName` only names the account when the seed first creates it; the seed never overwrites a name changed here. **Audited** as `admin.rename`; a name that does not change writes nothing.
         */
        patch: operations["updatePlatformAdminProfile"];
        trace?: never;
    };
    "/api/platform/me/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Change the signed-in platform admin's password
         * @description `currentPassword` must be right and `newPassword` at least 12 characters - the one rule every console password follows. Everything wrong is reported in one 422: a wrong current password is `context.fields` naming `currentPassword`, not a 401, so the console stays signed in and shows it under the field.
         *
         *     **Answers a fresh token pair - store it.** The change ends every session the account has, at once: the session generation moves, so every admin-panel access token it holds - the one this request was sent with included - is refused from now on with `401 session-revoked`, every refresh token is revoked and every unused reset link is spent. The body (`accessToken`, `refreshToken`, `expiresInSeconds`, the refresh endpoint's shape) is how the sign-in that made the change carries on.
         *
         *     **Wrong current passwords are counted per account**: each is audited as `admin.password-change-failed`, and after 10 inside 15 minutes the route answers `429 too-many-attempts` with `Retry-After` (and `context.retryAfterSeconds`) until the oldest leaves the window - right password or not. A successful change starts the count again. The route is also under the `auth` rate limit. The seed never resets a password changed here. **Audited** as `admin.password-change`, with nothing about either password.
         */
        post: operations["changePlatformAdminPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/platform/outbox": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Pending, failed and dead-lettered message counts
         * @description **The first place to look when notifications quietly stop working.** Without it the symptom is silence, and silence is indistinguishable from nothing having happened.
         *
         *     `deadLettered` is the number that needs a person: those have been given up on and will never be retried. Each carries its last error and the key that names what caused it, so a dead reminder can be traced back to its booking.
         *
         *     A `sentLastDay` of zero on a live venue means the channel is broken, whatever the other counts say.
         */
        get: operations["getOutboxHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/platform/overview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Home: the platform's numbers in one read
         * @description **Aggregates only** - no guest's name, phone or booking code at any depth.
         *
         *     `venues`: venues not deleted, split by `tierMix` (`paid` every branch paid, `mixed` some, `free` none) and by state, with `deleted` counted apart and the branch totals. `bookings`: bookings by the day of the visit, on each branch's own calendar, cancelled ones left out - `perDay` is thirty entries, oldest first and today last (the 14-day chart is the last fourteen), `last7Days` against `previous7Days` with `changePercent` (absent when the previous week had none). `pendingApprovals`: booking requests still waiting for a venue whose visit is ahead; `openTabs`: tabs open or closing now - each a total and the venues it comes from, most first. `notReady`: branches diners can reach that a guest would find unfinished - `no-tables`, `no-menu`, `incomplete-dishes`, `no-hours`, `no-photo` (the first twenty, newest venues first, and the `total`). `recentVenues`: the five newest venues not deleted. `outbox`: the counts `GET /api/platform/outbox` serves, with `deadLetteredLastDay` - the messages given up on in the last 24 hours, what Home's alert counts.
         */
        get: operations["getPlatformOverview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/platform/reviews/{reviewId}/dismiss-reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Leave a reported review up, and set its reports aside
         * @description The platform looked and found nothing wrong: the review stays exactly as it is - shown or hidden - and stops counting as reported, for the platform's list and the venue's. The reports are kept, marked dismissed; `reportCount` counts only the ones nobody has dismissed, so a diner reporting it afterwards brings it back to the reported filter.
         *
         *     **Idempotent**: a review with no open report is answered as it is and nothing is written. **Audited** as `review.dismiss-reports`, with how many were dismissed. Answers the review as the moderation list shows it.
         */
        post: operations["dismissPlatformReviewReports"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/platform/reviews/{reviewId}/restore-reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Undo the last dismissal of a review's reports
         * @description The console's undo for `dismiss-reports`: the reports the **most recent** dismissal of this review set aside count again - exactly those, recognised by the dismissal's instant, which every report it dismissed shares. Reports dismissed by an earlier dismissal stay dismissed; reports filed since are untouched. The review itself is not changed.
         *
         *     **One dismissal, once**: when the review was already restored after its latest dismissal - or nothing was ever dismissed - it is answered as it is and nothing is written; a second undo never reaches back to an older dismissal. **Audited** as `review.restore-reports`, with how many came back. Answers the review as the moderation list shows it.
         */
        post: operations["restorePlatformReviewReports"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/platform/reviews/{reviewId}/visibility": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Take a review down, or put one back
         * @description `{ "hidden": true, "reason": "…" }` takes it down: out of the public list, the rating, the count and the badges at once. `reason` is required when hiding, at most 500 characters. `{ "hidden": false }` puts it back; the reason is ignored.
         *
         *     The platform can put back any review, including one the venue hid, and a review it hides is the platform's: the venue cannot put it back.
         *
         *     **Audited** as `review.hide` or `review.unhide` with `actorType: platform`. A request that changes nothing writes nothing. Answers the review as the list shows it.
         */
        put: operations["setPlatformReviewVisibility"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/platform/venues": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Venues, with search, filters, sorting and paging
         * @description Each row is what the console's venue table shows: the branch, active-table and paid-branch counts; `tierMix` (1 Free, 2 Mixed, 3 Paid - billing is per branch, so a venue is Mixed when only some branches pay) and `branches`, every branch with its own tier and `issues`; `status` (1 Active, 2 Suspended, 3 Inactive, 4 Deleted); `averageRating` and `reviewCount` over the published reviews of every branch; `openTabCount`; `readinessIssue` (`code`, `count`, `branchName`), the first thing a guest would find missing at an active branch - setup progress, so suspended venues count and switched-off branches never do - `no-tables`, `no-menu`, `incomplete-dishes`, `no-hours` or `no-photo`; `coverThumbnailUrl`, the first branch's cover thumbnail; `district`, `cuisine` and `createdAtUtc`.
         *
         *     `search` matches the venue's name and slug and each branch's name and district. `status`: `live` (default: every venue not deleted), `all`, `active`, `suspended`, `inactive` or `deleted`; the older `includeDeleted=true` is `all` when no `status` is sent. `tier`: `free`, `mixed` or `paid`; blank is every tier. `sort`: `name` (default), `rating`, `tables` or `created`; `dir`: `asc` (default) or `desc` - a venue with no rating sorts below every rated one. `page` from 1, `pageSize` 1-200 (default 20).
         */
        get: operations["listVenues"];
        put?: never;
        /**
         * Create a venue with its first branch
         * @description A venue with no branch is useless, so the first branch is created in the same transaction. A failure creates neither. The branch's `subscriptionTier` defaults to Free.
         *
         *     **Missing fields are reported together.** An empty body names `name`, `slug` and `firstBranch` in one 422, each in `context.fields`, rather than making somebody submit three times to discover three problems. Nested fields are dotted - `firstBranch.address`.
         *
         *     **Out-of-range values are still reported one at a time**, as a 400 - a latitude of 200 refuses before the next field is looked at. The bounds live in the `Venue` and `Branch` constructors rather than in a limits class of their own, so collecting them would mean a second copy of every rule. See `docs/platform-admin.md`.
         */
        post: operations["createVenue"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/platform/venues/{venueId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** One venue and its branches */
        get: operations["getVenue"];
        put?: never;
        post?: never;
        /**
         * Soft-delete a venue
         * @description **Soft delete only.** Reservations, tabs and payments hang off the venue and are never removed. Refused while any tab is open or any confirmed booking is still in the future - the response names which. `POST .../restore` undoes it.
         */
        delete: operations["deleteVenue"];
        options?: never;
        head?: never;
        /** Name, type, slug, active flag */
        patch: operations["updateVenue"];
        trace?: never;
    };
    "/api/platform/venues/{venueId}/bookings-summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One venue's bookings as counts, for the last 7 or 30 days
         * @description **Aggregates only**: the restaurant sees its guests; the platform sees numbers.
         *
         *     `days` is `7` or `30` (default 30). The window is each branch's own today and the days before it, by the branch's local date of the visit, in **every** status: `byStatus` splits the `total` into `completed` (seated or completed), `upcoming` (confirmed, not yet seated), `pendingApproval`, `cancelled` (either side, rejections included) and `noShow`. `byWeekday` is all seven days by the weekday of the visit, `dayOfWeek` 0 Sunday to 6 Saturday. `averagePartySize` is over the bookings not cancelled, to one decimal, and absent with none. `byBranch` is every branch of the venue, by name, with the same split flat and `todayCount` - its bookings for today, cancelled ones left out.
         */
        get: operations["getVenueBookingsSummary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/platform/venues/{venueId}/branches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Add a branch to a venue */
        post: operations["addBranch"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/platform/venues/{venueId}/reactivate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Undo a suspension */
        post: operations["reactivateVenue"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/platform/venues/{venueId}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Undo a soft delete
         * @description The venue comes back exactly as it was before it was deleted: switched on or off as it was then, and **still suspended if it was suspended** - deleting never touched the suspension. Nothing under it was removed, so nothing is rebuilt; its branches, tables, staff and history are all where they were, and it accepts changes again. A venue deleted before this was recorded comes back switched off, for somebody to switch on on purpose.
         *
         *     A venue that is not deleted is answered as it is and nothing is written, so an undo that arrives twice is harmless. Refused with **409** when its web address now belongs to another venue - which the unique slug index, covering deleted venues, keeps from happening today. **Audited** as `venue.restore`.
         */
        post: operations["restoreVenue"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/platform/venues/{venueId}/suspend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Hide the venue from diners; keep everything
         * @description What happens when someone stops paying. The venue disappears from diner browsing but keeps all its data and stays visible to its owner.
         */
        post: operations["suspendVenue"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/public/bookings/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One booking, by the manage link that was mailed with it
         * @description What the confirmation screen renders, for somebody holding nothing but the link: venue, branch, address, table and the room it is in (`roomName`, absent for a table in no room), local date and time, party size, status, the code quoted at the door, and the instant past which cancelling counts as late.
         *
         *     **Nothing else.** No diner id, no phone number, no other bookings, no floor state. The token is the whole credential and it will be pasted into WhatsApp, left in browser history and read by whoever picks the phone up, so this response is a hand-picked subset rather than a trimmed reservation.
         *
         *     **A cancelled, missed or finished booking answers 200 with its state**, not 404. Somebody opening a three-week-old link should learn what happened to their table.
         *
         *     **An unknown token, an expired one and a booking that no longer exists answer identically** - same status, same code, same sentence. The link must not be usable to find out which tokens are real. The link stops working `ManageTokenGraceDays` after the booking ends.
         */
        get: operations["getPublicBooking"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/public/bookings/{token}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancels a booking from its manage link.
         * @description The reason is optional and comes from the body, which may be absent entirely - a diner
         *     tapping Cancel on a page has nothing to say and should not have to send an empty object.
         */
        post: operations["cancelPublicBooking"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/public/branches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Every published branch, for Explore and the map
         * @description Each entry is a `PublicBranchListing`: ids and slugs, `venueName`, `branchName`, `venueType` (1 Cafe, 2 Restaurant, 3 Bar), `cuisine` and `priceLevel` (absent until the venue sets them), `address`, `latitude`, `longitude`, `timeZoneId`, `isOpenNow`, `freeTableCount`, `rating` (average to one decimal, **absent with no reviews**), `reviewCount`, `badges` and `coverPhoto`, and `district` - the part of town, e.g. `Kentron`, absent until the venue sets it; search's `q` matches it as well as the names, cuisine and address.
         *
         *     `badges` is derived, never stored: `new` for a branch created in the last 30 days; `popular` for one that seated 20 or more parties in the last 30 days, or has 5 or more reviews averaging 4.5 or better.
         *
         *     Send `lat` and `lng` together to get `distanceKm` on every entry and nearest-first order; without them the order is best rated first. Cached for fifteen seconds.
         */
        get: operations["getPublicBranches"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/public/branches/{branchId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One branch's details screen, by id
         * @description `listing` is the card exactly as the list serves it. Beside it: `about`, `websiteUrl`, `phoneE164`, `amenities`, `openingHours` (`day` 0 = Sunday, wall-clock `opensAt`/`closesAt` as `HH:mm:ss`, `closesNextDay`), `gallery` (pictures beyond the cover, in order), `tableCount`, `acceptsWebBookings`, `recentReviews` (newest three) and `rooms` - the rooms with their photos and the live pins on them, exactly as `GET /api/public/branches/{branchId}/rooms` serves them.
         *
         *     A branch that is inactive or whose venue is suspended or deleted is **404**, read live. `listing.rating` and `listing.reviewCount` are read live too; the other live numbers share the list's fifteen seconds.
         */
        get: operations["getPublicBranchDetail"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/public/branches/{branchId}/availability": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Availability, through the existing read model.
         * @description The public gate is applied first and the query is then the same one the app calls. Growing a
         *     second availability implementation here would be the beginning of two answers to "is table 7
         *     free", and the two would eventually disagree in front of somebody standing at the door.
         */
        get: operations["getPublicAvailability"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/public/branches/{branchId}/availability/slots": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The day's slots, through the same read model as the app's - the public gate first, exactly as
         *     for one slot.
         * @description The app's day-slots read, reused rather than reimplemented, behind the public 404 rule and the tighter rate limit. `partySize` is required here, as on the public single-slot read.
         *
         *     Every half hour from 00:00 on `date` (`stepMinutes` is 30) whose whole sitting - the branch's turn time - fits one opening block, earliest first. A time the branch is shut for is **left out**, never struck. Each slot carries `time` (`HH:mm`, branch wall clock), `startUtc`, `isAvailable`, `requiresApproval`, `freeTableCount` and, when not available, `unavailableReason`.
         *
         *     **`isAvailable`** is true when at least one bookable table pinned on a photo of its room seats the party within the seat-overhang limit and has no booking or sitting running into the slot, clearing time included. These are the single-slot read's own rules over the same rows, so a time listed here as free is one `availability?time=` offers exactly `freeTableCount` tables at, and a struck time is one it offers none at.
         *
         *     **Why a time is struck**: `LeadTimeTooShort` (1) or `OutsideBookingWindow` (2) when the time itself is refused; otherwise `TableAlreadyBooked` (8) - or `TableCurrentlyOccupied` (10) - when tables that fit the party are taken, else the commonest table reason, e.g. `PartyExceedsCapacity` (4) when nothing seats them.
         *
         *     The top-level `unavailableReason` refuses the whole day: `OutsideOpeningHours` (3) with no slots when the branch is shut all day, or the timing reason every listed time shares - a past day, the rest of today inside the lead time, a date beyond the booking window. Null when any time was judged on its tables.
         *
         *     One query, like the single slot. Returns no guest names and no money. `partySize` defaults to 2.
         *
         *     `excludeReservationId` leaves one booking out of the answer as though it had never been made - the diner's own, while they change it, so the table they already hold reads as free to them. Every other booking still counts, and an id that is not a booking at this branch changes nothing. Anonymous like the rest of the read: booking ids are unguessable, and the answer says no more about the one left out than that its table is free.
         */
        get: operations["getPublicDaySlots"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/public/branches/{branchId}/menu": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The branch's menu, complete items only
         * @description Exactly what the diner app receives, from the same read model - not a second implementation.
         *
         *     **An item without a photo or without allergens never appears here**, for the same reason it never reaches the app: somebody reading an empty allergen list reasonably concludes there are none. Sold-out items *are* shown, flagged.
         */
        get: operations["getPublicMenu"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/public/branches/{branchId}/meta": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Open Graph and Twitter card fields for this branch
         * @description What a link should look like when it is pasted into WhatsApp or Telegram. Served here so the web page and any future renderer do not each invent their own.
         *
         *     **The free-table count is deliberately absent.** A card is fetched once by whichever chat app saw the link and cached for hours, so a live number would be frozen at whatever it was when somebody first pasted it - and "4 tables free" three hours stale is worse than no number. The venue description does not move.
         */
        get: operations["getPublicBranchMeta"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/public/branches/{branchId}/reviews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A page of a branch's reviews, newest first
         * @description Twenty a page from `page=1`. `rating` and `reviewCount` are read live. Each review carries `authorName` as a first name and last initial, never the account or its id.
         */
        get: operations["getPublicBranchReviews"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/public/branches/{branchId}/rooms": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The rooms a diner picks from: photos, and the live pins on them
         * @description `rooms` lowest `displayOrder` first; each room's `photos` in the order the venue chose; on each photo the active tables pinned there, by label. A room with no photo is not listed, and a table with no pin is not on any photo - a diner books by tapping a pin, so an unpinned table is not offered.
         *
         *     `photoX` and `photoY` are 0-1 across and down that photo. `state` is what the floor derives now: 1 Free, 2 ReservedSoon, 3 Held, 4 Occupied, 5 OutOfService. `isBookable` false is a walk-in-only table, shown but not booked. Refetch this more often than the details.
         */
        get: operations["getPublicBranchRooms"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/public/branches/{venueSlug}/{branchSlug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One branch's public page, by its slug pair
         * @description Address, coordinates, opening hours, whether it is open **now** in its own time zone, the live free-table count, and the floor plan in diner shape.
         *
         *     The floor plan here is not the editor's: it carries no QR tokens and no table status beyond whether somebody is sitting there. A QR token is the credential that opens a tab.
         *
         *     A suspended venue, an inactive branch and a wrong slug pairing all answer **404**, identically and on purpose - a public page that distinguished them would be publishing a customer's billing status to anybody who guessed a slug.
         */
        get: operations["getPublicBranch"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/public/branches/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Search published branches by name, cuisine, address or district
         * @description `q` matches venue name, branch name, cuisine and address, contains and case-insensitive; blank matches everything. `category` narrows to one venue type (1 Cafe, 2 Restaurant, 3 Bar). `q` is at most 100 characters.
         *
         *     Each entry is a `PublicBranchListing`: ids and slugs, `venueName`, `branchName`, `venueType` (1 Cafe, 2 Restaurant, 3 Bar), `cuisine` and `priceLevel` (absent until the venue sets them), `address`, `latitude`, `longitude`, `timeZoneId`, `isOpenNow`, `freeTableCount`, `rating` (average to one decimal, **absent with no reviews**), `reviewCount`, `badges` and `coverPhoto`, and `district` - the part of town, e.g. `Kentron`, absent until the venue sets it; search's `q` matches it as well as the names, cuisine and address.
         *
         *     `badges` is derived, never stored: `new` for a branch created in the last 30 days; `popular` for one that seated 20 or more parties in the last 30 days, or has 5 or more reviews averaging 4.5 or better.
         *
         *     Send `lat` and `lng` together to get `distanceKm` on every entry and nearest-first order; without them the order is best rated first. Cached for fifteen seconds.
         */
        get: operations["searchPublicBranches"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/public/venues": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Every venue on Yalla, for the browse case
         * @description Active, non-suspended venues with their active branches: name, type, the slug pair that addresses each branch, its IANA `timeZoneId`, whether it is open now, and a **live free-table count**: every table nobody is sitting at, walk-in-only stools included, the same tables the branch page's `tableCount` counts.
         *
         *     The estate is cached for minutes; the table counts, open-now and which branches are still published for fifteen seconds, because a stale menu is fine and a stale table count is the one thing here that can waste somebody's evening. A suspended venue leaves the list within that window.
         *
         *     **Rate limited on budgets of its own**, per caller and city-wide, not the page budget: this is the diner app's Explore screen, and a phone network puts thousands of phones behind one address.
         */
        get: operations["getPublicVenues"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reservations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Book a table
         * @description Idempotent on `clientCommandId`: a retry returns the original booking and creates nothing, answering 200 rather than 201. Lands as `Confirmed`, or `PendingApproval` (`awaitingApprovalBecause` says why) when the booking is at **short notice** - for the branch's today, or starting under six hours from now - the branch approves every booking, the party is over the branch's threshold, or the diner is over the rolling no-show threshold.
         *
         *     A short-notice booking (`awaitingApprovalBecause` 4) is the floor's to decide, by `approvalExpiresAtUtc` - fifteen minutes from now, or the start if sooner. Unanswered by then it is declined (`CancelledByVenue`, `declinedBecause` 2 NoAnswer) and the diner gets a `reservation-decided` push with `expired` true. Count down to `approvalExpiresAtUtc`; read the booking again to see the answer.
         */
        post: operations["createReservation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reservations/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Accept a booking that is waiting for approval
         * @description A waiter or above at the booking's own branch - an owner or general manager at any branch of their venue, a platform admin anywhere. Staff of one branch cannot decide another's bookings by guessing an id.
         *
         *     A short-notice booking (`awaitingApprovalBecause` 4) can be approved until `approvalExpiresAtUtc`, and no booking once it has started. The caller's **stored** role counts, not only the token's: a waiter moved to the kitchen is refused at once. A platform admin gets the booking back with `guestPhone` empty.
         */
        post: operations["approveReservation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reservations/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel a booking
         * @description A diner may only cancel their own; anyone else's is 403. Free until the branch's cancellation deadline and still allowed after it - a late cancellation is far better than a no-show - with `cancelledAfterDeadline` recording which it was.
         */
        post: operations["cancelReservation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reservations/{id}/extend-hold": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Keep the table a little longer - the late nudge's action
         * @description What the **late nudge** notification's action button calls. The diner taps it from the lock screen; they never open a screen and hunt for it.
         *
         *     **Once.** `graceExtensionsUsed` enforces it, and a second attempt is refused with a reason a diner can read. Repeated requests for five more minutes are how a table stays held all evening for somebody who is not coming.
         *
         *     The extension goes onto the branch change sequence, so the waiter watching that table sees it immediately rather than in a column nothing reads.
         *
         *     **Not before the booking starts.** Nothing is held until then, so there is nothing to keep: offer the button from the late nudge, or once `startUtc` has passed. A tap days early used to spend the one extension and ping the floor about a table nobody was holding.
         */
        post: operations["extendReservationHold"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reservations/{id}/no-show": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Mark a booking as a no-show, and free the table
         * @description The same action as `release` with `outcome: 1`, under the name the tablet's late-booking panel uses - one implementation, two doors, so the two cannot drift.
         *
         *     **Never automatic.** Prompt 2's rule that the decision belongs to a waiter applies here more than anywhere: only a person standing in the room knows whether the party is late or absent.
         *
         *     Counts toward the diner's rolling no-show threshold. If they telephoned to say they could not come, use `release` with `outcome: 2` instead - a diner who let the venue know must not be punished for it.
         */
        post: operations["markReservationNoShow"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reservations/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Decline a booking that is waiting for approval
         * @description Scoped as `approve`. Refuses a booking that was already confirmed: the diner has been told it is theirs. `reason` is optional and recorded as `cancellationReason`; the booking answers `declinedBecause` 1 (StaffDeclined). A short-notice booking can be declined until `approvalExpiresAtUtc` - after that it is declined for nobody answering, and the diner is told that instead.
         *
         *     **A change of a confirmed booking** is declined as a change: when the slot it had is still free the answer is the booking back there - `Confirmed`, its old `startUtc`, `tableId` and `partySize` - and the diner is told it stands (`reservation-decided` with `wasChange` and `originalKept` "true"); when that slot has gone too it is declined as above, with `originalKept` "false". A platform admin gets `guestPhone` empty.
         */
        post: operations["rejectReservation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reservations/{id}/release": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Let a late booking go, and free the table with it
         * @description **Two outcomes, and the difference matters to the diner.**
         *
         *     | `outcome` | Booking becomes | Counts toward the no-show threshold |
         *     |---|---|---|
         *     | `1` NoShow | `NoShow` | **Yes** |
         *     | `2` CancelledByVenue | `CancelledByVenue` | **No** |
         *
         *     Render these as two buttons - *release, marked no-show* and *release, they let us know*. With one button a busy waiter taps it for both, and the threshold ends up punishing the people who phoned ahead. A table out of service is always the second one: a broken chair is the venue's doing.
         *
         *     The table is freed when it is **held for this booking**, through the state machine, so the audit row is written and the branch change sequence moves. A table somebody is **sitting at** is left alone - the booking is released either way, and a floor plan that shows an occupied table as free costs more than a stale hold.
         */
        post: operations["releaseReservation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reservations/{reservationId}/reschedule": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Change a booking's date, time, party size or table
         * @description Moves the diner's **own** booking and answers with it: the **same `id` and `code`** and manage link, at the new `startUtc`/`endUtc`, `partySize`, `tableId`, `roomId`/`roomName` and `status`. Send the whole new slot - `date`, `time`, `partySize` and `diningTableId` (required, the current table or another at the branch) - as a new booking would.
         *
         *     **Only a booking still to come**: `PendingApproval` or `Confirmed` and not yet started. Anything else - seated, finished, cancelled, a no-show, or past its start - is `409 reservation-not-changeable`, before the new slot is looked at.
         *
         *     **Judged as a new booking would be**, with the same `reservation-*` 422s: the branch open for business and still taking bookings from the channel the booking came from, lead time and booking window, opening hours, the table pinned on its room and fitting the party. The clash check runs under the target table's lock **excluding this booking**, so moving dinner by half an hour on the same table is never refused because of itself - and the 409's fresh floor shows the diner's own table free.
         *
         *     **The status is decided again** by the create rules: the move can keep it `Confirmed`, confirm a pending one, or send it back to `PendingApproval` (`awaitingApprovalBecause` says why). A `Confirmed` booking that keeps its **table and start** and does not grow stays `Confirmed`, today included - nothing about it got harder to keep. Otherwise a move into the short-notice window (today, or under six hours away) goes to `PendingApproval` with a fifteen-minute `approvalExpiresAtUtc` - and keeps the slot it had: if the change is declined, or nobody answers it, the booking goes back to that slot, `Confirmed` as before, when it is still free. A booking **already waiting** on a short-notice answer keeps its deadline through a move (never past the new start); past the deadline it cannot be moved at all - `409 reservation-approval-expired`. A `Confirmed` booking whose party does not grow keeps its confirmation against the party-size threshold - the venue already said yes to that many people - but not against a branch that approves every booking or the diner's no-show history.
         *
         *     The reminder and late nudge are replaced with ones for the new time. Idempotent on `clientCommandId`: a retry of the same change answers `200` with the booking **as it stands now** and `wasReplay: true`, moving nothing; the same id on another command, or on a different change (another table, start or party size), is `409 client-command-id-in-use` - mint a fresh id per change.
         */
        post: operations["rescheduleReservation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reservations/mine": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The calling diner's own bookings, upcoming and past
         * @description Upcoming means still going to happen: not finished, and not already called off. A booking cancelled for tomorrow belongs in the history, not at the top of the screen.
         */
        get: operations["getMyReservations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/service-requests/{id}/acknowledge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * A waiter has seen it
         * @description Acknowledging one twice is a no-op rather than an error: two waiters tapping the same request is the normal case, and both seeing it is what the table wanted.
         */
        post: operations["acknowledgeServiceRequest"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tab-adjustments/{adjustmentId}/void": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Manager: reverse a discount or comp
         * @description It stops counting and stays on the record. A comp applied to the wrong table is itself part of what happened, and reporting that cannot see it cannot explain why the evening's takings are short.
         */
        post: operations["voidTabAdjustment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tables/{tableId}/regenerate-qr": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Replace a compromised QR code
         * @description The one way a table's QR token changes. Editing the table never touches it - the printed code must keep working - so this is explicit, and audited to the platform log.
         */
        post: operations["regenerateTableQr"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The tab, as this participant is allowed to see it
         * @description Projected through the caller's own flags by one function, so every rule applies the same way everywhere:
         *     - The caller's **own items and own subtotal are always present**, whatever the flags. Own means their own orders, a waiter's keyed in with `onBehalfOfParticipantId` for them, and the shared lines they were at the table for - and, only with `tableTotalVisible`, the `isTableAttributed` lines they were at the table for: a waiter's lines for nobody in particular can be the whole bill. `/shares` charges a part of those either way.
         *     - The **table total and other people's items appear only with `canSeeTableTotal`**, and only once approved. When hidden they are **absent from the body** - not zero, not null - with `tableTotalVisible: false` beside the gap, so no client can render a hidden total as a free bill.
         *     - A **pending** participant sees their own row and nothing else.
         *     - **Nothing silently disappears.** A voided line stays in both arrays with `isVoided`, `voidReason` and `voidedAtUtc`, worth zero and counted toward no total; comps and discounts appear in `adjustments` with the reason the manager typed - all of them with `tableTotalVisible`, otherwise only those on the caller's own lines, because one off the whole tab or another person's dish is the table's money. A bill whose number drops with no visible cause is the fastest way to make somebody distrust the app, and a waiter then has to explain it at the table.
         *
         *     Menu prices are not part of this view and stay visible through the menu, so a guest without the total can always work out what their own order costs - and `serviceChargePercent` is on the response **for everyone**, hidden total or not, because the percentage is a fact about the venue rather than an aggregate.
         *
         *     `timeZoneId` is the branch's IANA zone: render every instant here in it and never in the device's. `maxSequence` is where the tab's event stream stands, so a client never has to call `/events` purely to find out.
         */
        get: operations["getTab"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/abandon": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Manager: write off an outstanding balance
         * @description The diners left without paying and the venue is accepting the loss. Kept for reporting rather than deleted - a venue's write-offs are a number it needs.
         */
        post: operations["abandonTab"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/adjustments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Manager: discount or comp
         * @description Exactly one of `percent` and `amountAmd`. A `tabOrderLineId` applies it to that line; leaving it out applies it to the whole tab.
         *
         *     **The service charge is computed after this**, so comping a dish comps its service charge with it - which is what a manager means by comping a dish.
         *
         *     Visible to the diner with its reason, for the same reason a void is.
         */
        post: operations["addTabAdjustment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/closing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Staff: the bill has been asked for
         * @description After this, no new participants and no new orders - someone who already paid their share must not get dessert added after they have left. Any live invitation is revoked.
         */
        post: operations["beginClosingTab"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/display-name": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Set what the host sees you called
         * @description A profile field on the participant, not an account. Someone who scanned a QR code has no user row and never will; putting a name on the tab is optional and costs them nothing to skip.
         */
        post: operations["setTabDisplayName"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Catch up on what happened
         * @description Everything after `afterSequence`, oldest first, for the phone that was in a lift when the wine was ordered.
         *
         *     `sequence` is this event's place **on this tab**, counting from 1, and the order is the order things happened - a payment that settles the bill is immediately followed by the close, never the other way round. Keep the highest you have seen and ask for everything after it.
         *
         *     **Ignore a `type` you do not recognise and keep your position**: new types will be added and an old build must not break on a tab that used one.
         *
         *     **You read the stream you may see.** Every event is here - the sequence never has a hole - but without `tableTotalVisible` on your tab the payloads carry only your own money: `orderPlaced.lines` holds just your lines (your own, a waiter's on your behalf, and shared items you were at the table for - never a waiter's line for the table, which can be the whole bill), a void names only your own dish, an adjustment says what, how much and why only when it is off your line, a payment says how much only when it was yours, and `remainingAmd`, `totalAmd` and `writtenOffAmd` are never there. While you wait for the host, other people's `displayName` and `note` are left out too. Redacted members are **absent**, never null or zero. See `docs/tabs.md`, section 7.4.
         */
        get: operations["getTabEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/join-tokens": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Host: create or refresh the invitation
         * @description Returns one token and the share link that carries it. Render the token as a QR on the host's screen for the people at the table; send the link to the friend who is fifteen minutes late. Both join the same tab.
         *
         *     Lasts thirty minutes. Calling again issues a fresh one and revokes any earlier invitation still live, so a refresh also kills a screenshot that is doing the rounds.
         */
        post: operations["createTabJoinToken"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/leave": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Take yourself off the tab
         * @description The same status change a host's remove makes, never a delete: everything you ordered and anything you paid stays on the bill. Your token stops working on this tab, and you are on no shared line ordered after you leave.
         *
         *     **A host** hands the tab to the approved guest who has been on it longest, who gains sight of the total and the right to pay. With nobody approved to take it the host cannot leave - **409** - and a waiter takes the tab over or closes it.
         *
         *     Refused once the bill has been asked for, like every other change to the tab.
         */
        post: operations["leaveTab"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/lines/{lineId}/void": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Take a line off the bill
         * @description The line **stays on the tab and stays visible to the diner**, labelled as removed by staff, with the reason. Nothing silently disappears from a bill somebody is watching on their phone.
         *
         *     Refused once the tab has been paid against: that is a refund, which is a different thing with its own rail.
         */
        post: operations["voidTabLine"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Order from your own phone
         * @description Names and prices are **snapshotted onto every line** as they stand now, so a menu edit next week cannot change a bill presented tonight.
         *
         *     A `isShared` line records **who is at the table at this moment**: a friend who joins ten minutes later is not on the bottle, and one who is removed still is - they were there when it was poured.
         *
         *     An unavailable item refuses the **whole** order, by name, rather than quietly dropping it: a partial order is a decision made on your behalf that you discover when the food arrives.
         *
         *     `estimatedReadyAtUtc` comes from the longest prep time on the order, not the sum - a kitchen cooks an order together.
         *
         *     `totals` is the tab's, so it follows `tableTotalVisible` on your tab: **absent**, with `tableTotalVisible: false` beside it, when the host hid the total from you. Read it as optional.
         */
        post: operations["placeOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/participants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Staff: everyone on the tab, and the money
         * @description "Aram, Nare, +1 guest" - every phone on the table with its role, status and flags, so staff can see how many people are on a bill and who hosts it. Staff are not participants; the host's visibility flags do not apply to them.
         */
        get: operations["getTabForStaff"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/participants/{participantId}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Host: let a pending joiner on */
        post: operations["approveTabParticipant"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/participants/{participantId}/permissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Host: set one person's three flags
         * @description `canOrder`, `canSeeTableTotal` and `canPay`, together. **`canPay` requires `canSeeTableTotal`** - nobody puts money toward a total they may not see - and the combination that breaks that is refused with 400 rather than silently corrected.
         *
         *     **The host always sees the total.** `canSeeTableTotal: false` on the host's own row is `422 validation-failed` with `context.field` `canSeeTableTotal`: only the host sets flags, so nobody could ever turn it back on.
         */
        post: operations["setTabParticipantPermissions"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/participants/{participantId}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Host: turn a pending joiner away */
        post: operations["rejectTabParticipant"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/participants/{participantId}/remove": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Host: take someone off the tab
         * @description A status change, never a delete. Their items and any payment they made are financial records and survive them leaving. The host cannot remove themself: they leave, which hands the tab on, or staff reassign the host.
         */
        post: operations["removeTabParticipant"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/payments/cash": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Take cash at the table
         * @description The amount is **reserved against the remaining balance under the tab's row version** before anything is recorded, then marked succeeded in the same call. The two-step shape exists so a wallet provider can sit in `Reserved` while it is being called.
         *
         *     Paying more than is owed is refused **with the current balance in the body** - the waiter is standing at the table and needs the number, and the usual cause is somebody settling in the app while the waiter was typing.
         *
         *     Partial payments are normal and expected. When the balance reaches zero the tab closes and its sitting closes with it - but **the table is not freed**. That stays an explicit waiter action, because a party that has paid usually sits on for another twenty minutes.
         *
         *     `tipAmd` is recorded and kept **entirely outside** `paidAmd` and `remainingAmd`.
         *
         *     **This is not a fiscal receipt.** The venue's registered cash register still issues one.
         */
        post: operations["recordCashPayment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/reassign-host": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Staff: move the host role to another participant
         * @description The host left early or their phone died, and without this the tab is stuck with nobody able to approve joiners or change the split. The new host must be an approved participant; the old host stays on the tab as a guest.
         */
        post: operations["reassignTabHost"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/service-requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ask a waiter for something
         * @description Presets and one short optional note. **Not a chat**: a message box creates the expectation of a reply, and during the Friday rush nobody answers it.
         *
         *     Rate limited **per tab**, not per person - the list a waiter is looking at is the table's, and one bored guest must not be able to bury another table's request.
         *
         *     **Asking for the bill from the pay sheet.** With `preset` 3 a request may carry `billScope` (1 WholeBill, 2 MyShare) and `tipPercent` (0 to 25). The server prices it from the tab's own arithmetic - the same numbers `/shares` reports - and the response and the waiter's list carry `billAmountAmd` and `tipAmd`:
         *     - WholeBill: the tab's remaining balance. Only for somebody who can see the table total - otherwise 403.
         *     - MyShare: what the asker still owes of their own share (`shareAmd` less `paidAmd`); for somebody who can see the table total, never more than the tab owes.
         *
         *     The tip is on the **unpaid part of the items**: the tab subtotal (WholeBill) or the asker's `personalAmd` (MyShare), in the proportion `billAmountAmd` bears to the total or the share - all of the items when nothing has been paid. The service charge is inside `billAmountAmd`; the tip is **outside** it, as a cash payment's `tipAmd` is outside the balance. Either field on another preset, a tip with no scope, or a tip outside 0 to 25 is a 422 naming the field; a scope with nothing left to pay is a 422 on `billScope`.
         *
         *     A request with a `billScope` **replaces** the asker's own earlier open request for the bill on this tab: that one leaves the waiter's list. The `ServiceRequested` event carries `billScope` and `tipPercent` but never the amounts - every phone at the table reads the stream.
         */
        post: operations["raiseServiceRequest"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/settlement-mode": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Host: change how the bill will be split
         * @description Allowed until the first payment lands - reserved or succeeded - then locked. The lock is stamped on the tab the first time a change is attempted after money exists, and from then on this answers 409.
         */
        post: operations["setTabSettlementMode"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/shares": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Who owes what
         * @description Every split is integer and every remainder goes to the host, so the shares sum to the total **to the dram** - a property test asserts it over randomised tabs. Service charge splits pro rata: order 30% of the food, pay 30% of the service.
         *
         *     Without `canSeeTableTotal` you get **your own share and no table aggregate** - the members are absent from the body, not zeroed, so a hidden total cannot be rendered as a free bill.
         *
         *     A removed participant's items stay on the bill and fall to the host, reported in `absorbedFromRemovedAmd` rather than folded in silently.
         */
        get: operations["getTabShares"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/{tabId}/staff-orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Key in an order spoken at the table
         * @description The same code path as a diner's order, deliberately: the total is only right if **every** order goes through the system.
         *
         *     `onBehalfOfParticipantId` is what keeps "everyone pays their own" working. Without it the line is **attributed to the table** and splits across everyone present - a real answer rather than a wrong one, and one whose cost the venue can see in its own numbers.
         */
        post: operations["placeOrderAsStaff"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/join": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Join a tab with the host's invitation
         * @description The same token backs the QR on the host's screen and the share link they sent in WhatsApp - two ways to hand over one thing. Joining puts this device on the tab as a **pending** participant; the host taps approve. There is no code to say out loud, and the next table cannot order on your bill.
         *
         *     Invitations last thirty minutes. A screenshot from last Tuesday gets 401.
         */
        post: operations["joinTab"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/open": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Scan the table's QR code: open a tab, or land on the one already open
         * @description The flow the product lives on. Anyone - booked, phoned ahead, or in off the street - scans the code on the table and gets a token scoped to that table's tab, with **no account behind it**.
         *
         *     What happens depends on the table:
         *     - **Free**: a session and a tab open, the scanner is the host, the table becomes Occupied.
         *     - **Seated, no tab yet** (a party a waiter sat down, or from a booking): a tab opens on their session and the scanner is the host.
         *     - **Already has a tab**: no second tab. The scanner is put on it as a *pending* participant until the host approves them. `outcome` says which case applied.
         *     - **Out of service**: 409.
         *
         *     Two phones scanning a free table at the same moment produce exactly one tab; the loser lands pending on it. A double scan with the same `clientCommandId` returns the same tab with `wasReplay` set.
         */
        post: operations["openTab"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tabs/open-by-booking": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * "I'm at my table": open the tab on your booked table with your booking code
         * @description For a diner who booked through the app and is at their table: the booking code in place of the table's QR token. The code finds **the caller's own** booking, the booking names the table, and from there it is exactly `POST /api/tabs/open` - the same four cases, the same host and pending guests, the same `outcome`, the same response body.
         *
         *     **Whose.** Only a booking this diner account made opens anything. Somebody else's code answers `404 booking-not-found`, word for word what a code nobody holds gets: a code is read out at the door and proves nothing.
         *
         *     **When.** A `Confirmed` booking opens from the branch's walk-in holdback before its start - the moment the branch starts keeping the table back from walk-ins for it - until its end. Earlier is `409 booking-too-early` with `context.earliestUtc`; from `endUtc` on, `409 booking-ended`. Late is fine: until a waiter releases the table it is still theirs. A `Seated` booking opens whatever the time - the venue already put the party there. Pending-approval, cancelled and no-show bookings answer `409 booking-not-active`, with `context.status` saying which; a completed one, `booking-ended`.
         *
         *     **Whose sitting.** A booking opens only its own sitting. If the table still has another party's sitting open - one that is not this booking's - the answer is `409 booking-table-occupied` and nobody is put on that tab. On the booking's own sitting, a tab somebody else opened first (a friend who scanned) takes the booker on **approved**, with no host tap; the host stays host.
         *
         *     **Seating.** A free table is seated *as the booking*: the sitting names it and the booking becomes `Seated`, so the floor does not go on treating a party that is eating as one that has not arrived.
         *
         *     Case, spaces and dashes in the code do not matter. A double tap with the same `clientCommandId` returns the same tab with `wasReplay` set.
         */
        post: operations["openTabByBooking"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/venues/{venueId}/manage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The venue you work in, with the branches your account covers
         * @description The read the console opens a venue with. **Which branches come back is decided from the caller's own staff record, not from the token**: an owner covers every branch of the venue, whether or not their record names a home branch; a general manager covers every branch; a branch manager is given their own branch only - the only one the server lets them act on; a platform admin is given everything.
         *
         *     Branches are listed active first, then by name. An inactive branch is listed and flagged rather than hidden.
         *
         *     This is not `GET /api/platform/venues/{id}`, which is the platform tier's and refuses every venue user. Nothing here is platform-only: no tier rollup, no paid-branch count, no suspension timestamps.
         */
        get: operations["getManagedVenue"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/venues/{venueId}/staff": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Everyone who works for the venue
         * @description Most senior first, then by name. An owner, general manager or platform admin sees the whole venue; a branch manager sees the people at their own branch.
         */
        get: operations["listStaff"];
        put?: never;
        /**
         * Add a staff member, with a PIN
         * @description Roles: 1 Owner, 6 GeneralManager, 2 Manager (a branch manager), 3 Waiter, 4 Kitchen. A branch manager may create waiters and kitchen staff at their own branch; a general manager may create branch managers, waiters and kitchen at any branch; an owner or platform admin may also create general managers and owners. Nobody creates a role above their own.
         *
         *     **The branch suits the role**: a branch manager needs `branchId`, a general manager must not have one - otherwise `422 validation-failed` with `context.field` = `branchId`.
         *
         *     A manager or owner gets their admin-panel sign-in through `issueStaffSignIn` after they exist: it stores the address and returns a link they choose their own password by. Sending `email` and `password` here still works, and is the one path where the caller types a password for somebody else.
         */
        post: operations["createStaff"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/venues/{venueId}/staff/{staffMemberId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Edit a staff member
         * @description Nobody may change their own role or deactivate their own account. Set `setBranch` to apply `branchId`, including null for venue-wide.
         *
         *     The role and the branch are checked as a pair: promoting a branch manager to general manager is `role: 6, setBranch: true, branchId: null` in one request, and the reverse names the branch. A branch manager edits only their own branch's people and cannot move anybody elsewhere.
         */
        patch: operations["updateStaff"];
        trace?: never;
    };
    "/api/venues/{venueId}/staff/{staffMemberId}/pin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Set or reset a PIN
         * @description 4 to 8 digits. Clears any lockout.
         */
        post: operations["setStaffPin"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/venues/{venueId}/staff/{staffMemberId}/sign-in": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Give an owner, general manager or branch manager their admin-panel sign-in
         * @description Stores the address and returns a link the person opens to choose their own password. Nobody types a password for somebody else: the reset endpoint that consumes the link is the only thing that ever sets one.
         *
         *     The link is returned **once** and this is the only copy - the server keeps the token's hash and never logs it, so a lost link is replaced by issuing another. It is good for 24 hours and exactly one use. Issuing a new link retires any earlier unused one; two links issued at the same instant can both be live until one is used.
         *
         *     Only somebody the caller strictly outranks: a general manager issues for branch managers, an owner for general and branch managers, a platform admin for owners as well, and nobody for a peer or for themselves. A person who already has a password keeps it - and their open sessions - until the link is used, when both are replaced. Their sign-in address changes to the one given as soon as this answers.
         *
         *     Ten a minute per caller: this mints a credential, so it spends the sign-in budget rather than the global one.
         */
        post: operations["issueStaffSignIn"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /**
         * Format: int32
         * @description Values: 0 Sunday, 1 Monday, 2 Tuesday, 3 Wednesday, 4 Thursday, 5 Friday, 6 Saturday.
         * @enum {integer}
         */
        "System.DayOfWeek": 0 | 1 | 2 | 3 | 4 | 5 | 6;
        /** @description Writing off an outstanding balance. */
        "Yalla.Api.Endpoints.AbandonTabRequest": {
            /** @description Why the venue is accepting the loss. */
            reason: string;
        };
        /** @description A discount or a comp. */
        "Yalla.Api.Endpoints.AddAdjustmentRequest": {
            /**
             * Format: int64
             * @description Flat dram off. Exactly one of this and Percent.
             */
            amountAmd?: number | null;
            /**
             * Format: uuid
             * @description Idempotency.
             */
            clientCommandId: string;
            /** @description Why money is coming off a bill. */
            kind: components["schemas"]["Yalla.Domain.Enums.AdjustmentKind"];
            /**
             * Format: double
             * @description Percentage off. Exactly one of this and AmountAmd.
             */
            percent?: number | null;
            /** @description Why. Shown to the diner. */
            reason: string;
            /**
             * Format: uuid
             * @description The line, or null for the whole tab.
             */
            tabOrderLineId?: string | null;
        };
        /** @description Why a booking was cancelled, if the diner said. Optional in every sense. */
        "Yalla.Api.Endpoints.CancelBookingRequest": {
            /** @description Free text, stored on the booking. Null when the body is absent or the field is omitted. */
            reason?: string | null;
        };
        /** @description Body for a diner cancelling their own booking. */
        "Yalla.Api.Endpoints.CancelReservationRequest": {
            /** @description Optional free text, recorded on the booking. */
            reason?: string | null;
        };
        /** @description Body of `POST /api/platform/me/password`. */
        "Yalla.Api.Endpoints.ChangePlatformAdminPasswordRequest": {
            /** @description The password the admin signs in with now. */
            currentPassword?: string | null;
            /** @description At least 12 characters. Length is the only rule. */
            newPassword?: string | null;
        };
        /** @description Polls a Telegram phone verification. */
        "Yalla.Api.Endpoints.ClaimTelegramVerificationRequest": {
            /** @description Language to store against the account. Falls back to `Accept-Language`, then Armenian. */
            localeCode?: string | null;
        };
        /** @description Body for booking a table. */
        "Yalla.Api.Endpoints.CreateReservationRequest": {
            /**
             * Format: uuid
             * @description The branch being booked.
             */
            branchId: string;
            /** @description Where a booking was made from. */
            channel: components["schemas"]["Yalla.Domain.Enums.ReservationChannel"];
            /**
             * Format: uuid
             * @description The caller's own id for this booking. <b>Required.</b> A phone on a patchy connection retries,
             *     and this is what makes the retry return the original booking instead of taking a second table
             *     for the same party.
             */
            clientCommandId: string;
            /**
             * Format: date
             * @description Local calendar date at the branch, e.g. `2026-09-12`.
             */
            date: string;
            /** @description Who to ask for at the door. */
            guestName: string;
            /** @description How to reach them when they are late. */
            guestPhone: string;
            /**
             * @description A note to the venue - "window table", "a high chair". Optional; trimmed, blank means none, at
             *     most 500 characters, refused as `validation-failed` naming `note` with bound `max`.
             */
            note?: string | null;
            /**
             * Format: int32
             * @description How many are coming.
             */
            partySize: number;
            /** @description Advisory only. The interval comes from the branch's turn time. */
            stayHint?: components["schemas"]["Yalla.Domain.Enums.StayHint"] | null;
            /**
             * Format: uuid
             * @description The table the diner picked off the floor plan.
             */
            tableId: string;
            /**
             * Format: time
             * @description Local wall-clock start at the branch, e.g. `19:30`.
             */
            time: string;
        };
        /** @description Body for staff accepting or declining a booking that is waiting for approval. */
        "Yalla.Api.Endpoints.DecideReservationRequest": {
            /** @description Optional free text, recorded when declining. */
            reason?: string | null;
        };
        /** @description Body of `DELETE /api/diner/me`: the proof that the account holder is asking. */
        "Yalla.Api.Endpoints.DeleteDinerAccountRequest": {
            /**
             * @description Required when it has none: a one-time code from `POST /api/auth/diner/request-code` for the
             *     account's own number.
             */
            code?: string | null;
            /** @description Required when the account has a password (the profile's `hasPassword`). */
            password?: string | null;
        };
        /** @description Body of `POST /api/reservations/{id}/extend-hold`. */
        "Yalla.Api.Endpoints.ExtendHoldRequest": {
            /**
             * Format: uuid
             * @description Idempotency. The late nudge is a notification the diner can tap twice, and the second tap must be
             *     a no-op rather than an error about an extension already used.
             */
            clientCommandId: string;
        };
        /** @description Body of `POST /api/tabs/join`. */
        "Yalla.Api.Endpoints.JoinTabRequest": {
            /** @description See Yalla.Api.Endpoints.OpenTabRequest.DeviceId. */
            deviceId: string;
            /** @description Optional display name. */
            displayName?: string | null;
            /** @description The invitation from the host's QR or share link. Thirty-minute lifetime. */
            joinToken: string;
        };
        /** @description Body of `POST /api/auth/diner/login`. */
        "Yalla.Api.Endpoints.LoginDinerRequest": {
            /** @description A username or an email address, case-insensitively. */
            identifier: string;
            /**
             * @description Language to store against the account: `hy`, `ru` or `en`. Left alone when
             *     absent or unrecognised - the account already knows its language.
             */
            localeCode?: string | null;
            /** @description The password. */
            password: string;
        };
        /** @description Body of `POST /api/reservations/{id}/no-show`. */
        "Yalla.Api.Endpoints.MarkNoShowRequest": {
            /**
             * Format: uuid
             * @description Idempotency - see Yalla.Api.Endpoints.ExtendHoldRequest.
             */
            clientCommandId: string;
            /** @description Optional free text for the audit row. */
            reason?: string | null;
        };
        /** @description Moving an order along the kitchen rail. */
        "Yalla.Api.Endpoints.MoveOrderStatusRequest": {
            /** @description Kitchen-facing progress of one order placed against a tab. */
            status: components["schemas"]["Yalla.Domain.Enums.TabOrderStatus"];
        };
        /** @description Body of `POST /api/tabs/open-by-booking`. */
        "Yalla.Api.Endpoints.OpenTabByBookingRequest": {
            /**
             * @description The code on the diner's booking - "DFJFQY" - typed however they typed it. Case, spaces and dashes
             *     do not matter.
             */
            bookingCode: string;
            /**
             * Format: uuid
             * @description The caller's own id for this attempt. <b>Required.</b> A retry with the same id returns the same
             *     tab instead of opening a second one.
             */
            clientCommandId: string;
            /** @description See Yalla.Api.Endpoints.OpenTabRequest.DeviceId. */
            deviceId: string;
            /** @description Optional. What the host sees; defaults to a numbered guest. */
            displayName?: string | null;
            /** @description Optional. As on `/api/tabs/open`. Only used when this opens the tab. */
            hideTotalFromGuests?: boolean | null;
            /**
             * Format: int32
             * @description Optional. How many sat down. Only used when this seats the table; defaults to the booked party size.
             */
            partySize?: number | null;
            /** @description Optional. As on `/api/tabs/open`. Only used when this opens the tab. */
            settlementMode?: components["schemas"]["Yalla.Domain.Enums.SettlementMode"] | null;
        };
        /** @description Body of `POST /api/branches/{branchId}/tables/{tableId}/open-tab`. */
        "Yalla.Api.Endpoints.OpenTabForStaffRequest": {
            /**
             * Format: uuid
             * @description Caller-generated. A double tap with the same id answers with the same tab.
             */
            clientCommandId: string;
        };
        /** @description Body of `POST /api/tabs/open`. */
        "Yalla.Api.Endpoints.OpenTabRequest": {
            /**
             * Format: uuid
             * @description The caller's own id for this scan. <b>Required.</b> A double scan, or a retry on flaky wifi,
             *     with the same id returns the same tab instead of opening a second one.
             */
            clientCommandId: string;
            /**
             * @description A stable identifier the app generates once per install. Not an account and not a login - it is
             *     what lets someone who re-scans after their phone locked land back on the same participant
             *     instead of appearing twice on the bill.
             */
            deviceId: string;
            /** @description Optional. What the host sees; defaults to a numbered guest. */
            displayName?: string | null;
            /** @description Optional. The table default for whether guests see the total. Only used when this scan opens the tab. */
            hideTotalFromGuests?: boolean | null;
            /**
             * Format: int32
             * @description Optional. How many sat down, when the app asks. Defaults to one.
             */
            partySize?: number | null;
            /** @description The token printed in the QR code on the table. */
            qrToken: string;
            /**
             * @description Optional. How the bill will be split, if the host chooses now: 1 HostPaysEverything,
             *     2 EveryonePaysOwnItems, 3 AnyonePaysAnyAmount (the default). Only used when this scan opens the tab.
             */
            settlementMode?: components["schemas"]["Yalla.Domain.Enums.SettlementMode"] | null;
        };
        /** @description One item on an order being placed. */
        "Yalla.Api.Endpoints.OrderItemRequest": {
            /** @description True for something the table shares. */
            isShared: boolean;
            /**
             * Format: uuid
             * @description Which dish.
             */
            menuItemId: string;
            /** @description What the guest asked for. Goes to the kitchen, not the bill. */
            note?: string | null;
            /**
             * Format: int32
             * @description How many. At least one.
             */
            quantity: number;
        };
        /** @description An order, from a diner's phone or a waiter's tablet. */
        "Yalla.Api.Endpoints.PlaceOrderRequest": {
            /**
             * Format: uuid
             * @description The caller's own id. A double-tap over flaky wifi returns the first order rather than sending
             *     the kitchen two. <b>Required</b>: left out, it bound `Guid.Empty` and replayed whichever order
             *     first used that, on any tab; now it is refused with 400. A replay is matched on this tab and this
             *     caller only.
             */
            clientCommandId: string;
            /** @description What was ordered. At least one line. */
            items: components["schemas"]["Yalla.Api.Endpoints.OrderItemRequest"][];
            /**
             * Format: uuid
             * @description <b>Staff only.</b> Who the spoken order was for. Leave it out when the waiter did not know, and
             *                 the lines are attributed to the table and split across everyone present.
             */
            onBehalfOfParticipantId?: string | null;
        };
        /** @description A table asking for something. */
        "Yalla.Api.Endpoints.RaiseServiceRequest": {
            /**
             * @description Only with preset 3: whose part of the bill - 1 WholeBill, 2 MyShare. The server prices it and the
             *     response carries `billAmountAmd`. Leave it out for a plain "the bill, please". WholeBill needs
             *     sight of the table total. Replaces the asker's own earlier open request for the bill on the tab.
             */
            billScope?: components["schemas"]["Yalla.Domain.Enums.BillScope"] | null;
            /** @description One short line, optional. Not a conversation. */
            note?: string | null;
            /** @description What a table is asking for. Presets only - see `docs/tabs.md`. */
            preset: components["schemas"]["Yalla.Domain.Enums.ServiceRequestPreset"];
            /**
             * Format: int32
             * @description Only with a BillScope: the tip, 0 to 25 percent of the items that scope still
             *     leaves unpaid (before service). The response carries it priced as `tipAmd`.
             */
            tipPercent?: number | null;
        };
        /** @description Body of `POST /api/tabs/{tabId}/reassign-host`. */
        "Yalla.Api.Endpoints.ReassignHostRequest": {
            /**
             * Format: uuid
             * @description The approved participant who takes over.
             */
            newHostParticipantId: string;
        };
        /** @description Cash handed over at the table. */
        "Yalla.Api.Endpoints.RecordCashRequest": {
            /**
             * Format: int64
             * @description What was taken against the balance, in whole dram.
             */
            amountAmd: number;
            /**
             * Format: uuid
             * @description Idempotency.
             */
            clientCommandId: string;
            /**
             * Format: uuid
             * @description Who handed it over, when the waiter knows.
             */
            tabParticipantId?: string | null;
            /**
             * Format: int64
             * @description A tip. Kept entirely outside the balance.
             */
            tipAmd: number;
        };
        /** @description Body of `POST /api/auth/staff/enrol`. */
        "Yalla.Api.Endpoints.RedeemEnrolmentCodeRequest": {
            /** @description The one-time enrolment code a manager generated for this branch. */
            code: string;
            /**
             * @description The identifier the tablet minted for itself, stable across reinstalls. Enrolling the same one
             *     twice on a branch is refused as a client bug rather than as a credential problem - the tablet is
             *     already enrolled and holding a token it is not using.
             */
            deviceId: string;
            /**
             * @description What the tablet should be called in the admin panel - "Bar tablet", "Terrace". A manager
             *     revoking a lost device picks it out of a list by this name.
             */
            deviceName: string;
        };
        /** @description Body of the two refresh endpoints and of sign-out. */
        "Yalla.Api.Endpoints.RefreshTokenRequest": {
            /**
             * @description The handle from the last sign-in or refresh. It is spent by this call: use the one in the
             *     response next time. Sending a spent handle revokes the whole chain.
             */
            refreshToken: string;
        };
        /** @description Body of `POST /api/diner/devices`. */
        "Yalla.Api.Endpoints.RegisterDeviceRequest": {
            /**
             * @description BCP-47. <b>The person's language, not the venue's</b> - a Russian-speaking regular at an
             *     Armenian venue is written to in Russian. Anything unrecognised falls back to Armenian.
             */
            locale: string;
            /** @description Which app store the device came from. Expo needs it and so does message formatting. */
            platform: components["schemas"]["Yalla.Domain.Identity.DevicePlatform"];
            /** @description The Expo push token this phone reported. */
            pushToken: string;
        };
        /** @description Body of `POST /api/auth/diner/register`. */
        "Yalla.Api.Endpoints.RegisterDinerRequest": {
            /** @description What the venue calls this person at the door. 1-100 characters, required. */
            displayName: string;
            /** @description An email address. Stored trimmed and lowercased, unique. */
            email: string;
            /** @description Language for messages: `hy`, `ru` or `en`. Anything else falls back. */
            localeCode?: string | null;
            /** @description 8-128 characters, and not the username or the email. No composition rules. */
            password: string;
            /**
             * @description The number, in E.164 - `+37411223344`. <b>Not verified by registering:</b> the account's
             *     `phoneVerified` stays false until a one-time code to it is passed once.
             */
            phoneE164: string;
            /**
             * @description 3-30 characters - letters, digits, dots and underscores, starting with a letter or a digit.
             *     Stored lowercased, unique case-insensitively.
             */
            username: string;
        };
        /** @description Body of `POST /api/reservations/{id}/release`. */
        "Yalla.Api.Endpoints.ReleaseReservationRequest": {
            /**
             * Format: uuid
             * @description Idempotency. Releasing twice from a tablet that lost its connection must not put two no-shows on
             *     a diner's record.
             */
            clientCommandId: string;
            /**
             * @description <b>1 NoShow</b> - nobody came and nobody called; counts toward the diner's rolling no-show
             *                  threshold. <b>2 CancelledByVenue</b> - they phoned, or the table went out of service; does
             *                  <b>not</b> count.
             *
             *                  Two buttons on the tablet, never one. A single "release" gets tapped for both cases by a busy
             *                  waiter, and the threshold then punishes the diners who bothered to ring ahead.
             */
            outcome: components["schemas"]["Yalla.Application.Reservations.ReleaseOutcome"];
            /** @description Optional free text for the audit row. */
            reason?: string | null;
        };
        /** @description Body of `POST /api/auth/staff/renew` and `/api/auth/staff/sign-out`. */
        "Yalla.Api.Endpoints.RenewStaffSessionRequest": {
            /**
             * @description The handle from the last PIN sign-in or renewal. Rotates on every use, and stops working after
             *     thirty minutes of inactivity.
             */
            renewalToken: string;
        };
        /** @description Body of `POST /api/auth/diner/request-code`. */
        "Yalla.Api.Endpoints.RequestDinerCodeRequest": {
            /**
             * @description Language for the message: `hy`, `ru` or `en`. A regional tag such as
             *     `hy-AM` is accepted; anything unrecognised falls back rather than failing.
             */
            localeCode?: string | null;
            /**
             * @description The number to send the code to, in E.164 - `+37411223344`. Spaces, dashes and brackets
             *     are stripped before validation, so what a phone keypad produces is accepted.
             */
            phoneE164: string;
        };
        /** @description Body of `POST /api/auth/venue/request-password-reset`. */
        "Yalla.Api.Endpoints.RequestPasswordResetRequest": {
            /** @description The address to send the link to. */
            email: string;
            /** @description Language for the email: `hy`, `ru` or `en`. */
            localeCode?: string | null;
        };
        /** @description Body of `POST /api/reservations/{reservationId}/reschedule`. */
        "Yalla.Api.Endpoints.RescheduleReservationRequest": {
            /**
             * Format: uuid
             * @description The caller's own id for this change. <b>Required.</b> A retry with the same id answers with the
             *     booking as it stands instead of moving it again; a fresh id for every change.
             */
            clientCommandId: string;
            /**
             * Format: date
             * @description The new local calendar date at the branch, e.g. `2026-09-12`.
             */
            date: string;
            /**
             * Format: uuid
             * @description The table to move to: the one the booking is on, or another at the same branch, picked off the
             *     room photos as for a new booking. <b>Required</b>, as `tableId` is on a new booking - a
             *     booking is always for one table the diner chose.
             */
            diningTableId: string;
            /**
             * Format: int32
             * @description How many are coming now.
             */
            partySize: number;
            /**
             * Format: time
             * @description The new local wall-clock start at the branch, e.g. `19:30`.
             */
            time: string;
        };
        /** @description Body of `POST /api/auth/venue/reset-password`. */
        "Yalla.Api.Endpoints.ResetPasswordRequest": {
            /**
             * @description The new password. Only a minimum length is enforced - no composition rules, which push people
             *     towards predictable substitutions and towards writing the result down.
             */
            newPassword: string;
            /** @description The single-use handle from the emailed link. */
            resetToken: string;
        };
        /** @description Body for seating the party a hold was placed for. */
        "Yalla.Api.Endpoints.SeatHeldPartyRequest": {
            /**
             * Format: uuid
             * @description See Yalla.Api.Endpoints.TableStateRequest.ClientCommandId.
             */
            clientCommandId: string;
            /** @description The status the table had when the waiter tapped. */
            expectedFromStatus?: components["schemas"]["Yalla.Domain.Enums.TableStatus"] | null;
            /**
             * @description The table's `rowVersion` from the floor read model at the moment of the tap, sent back
             *     untouched. <b>Status is not a version:</b> a table that went Free to Occupied and back to Free
             *     while the command sat in the queue passes a status check, and the command lands on a sitting that
             *     has already ended. When both are supplied both must match, and the refusal says which failed.
             */
            expectedRowVersion?: string | null;
            /**
             * Format: int32
             * @description How many people sat down.
             */
            partySize: number;
            /**
             * @description True when this came off the tablet's offline queue rather than from a live tap. A queued command
             *     <b>must</b> carry ExpectedFromStatus, because idempotency stops it being
             *     applied twice and says nothing about it being out of date.
             */
            queued: boolean;
            /** @description Optional free text for the audit log. */
            reason?: string | null;
            /**
             * Format: uuid
             * @description Set when the hold was for a late booking, which is the usual case.
             */
            reservationId?: string | null;
        };
        /** @description Body for seating a booked party. */
        "Yalla.Api.Endpoints.SeatReservationRequest": {
            /**
             * Format: uuid
             * @description See Yalla.Api.Endpoints.TableStateRequest.ClientCommandId.
             */
            clientCommandId: string;
            /** @description The status the table had when the waiter tapped. */
            expectedFromStatus?: components["schemas"]["Yalla.Domain.Enums.TableStatus"] | null;
            /**
             * @description The table's `rowVersion` from the floor read model at the moment of the tap, sent back
             *     untouched. <b>Status is not a version:</b> a table that went Free to Occupied and back to Free
             *     while the command sat in the queue passes a status check, and the command lands on a sitting that
             *     has already ended. When both are supplied both must match, and the refusal says which failed.
             */
            expectedRowVersion?: string | null;
            /**
             * Format: int32
             * @description Overrides the booked size when the number who turned up differs.
             */
            partySize?: number | null;
            /**
             * @description True when this came off the tablet's offline queue rather than from a live tap. A queued command
             *     <b>must</b> carry ExpectedFromStatus, because idempotency stops it being
             *     applied twice and says nothing about it being out of date.
             */
            queued: boolean;
            /** @description Optional free text for the audit log. */
            reason?: string | null;
            /**
             * Format: uuid
             * @description The booking being honoured.
             */
            reservationId: string;
        };
        /** @description Body for seating a party with no booking. */
        "Yalla.Api.Endpoints.SeatWalkInRequest": {
            /**
             * Format: uuid
             * @description See Yalla.Api.Endpoints.TableStateRequest.ClientCommandId.
             */
            clientCommandId: string;
            /** @description The status the table had when the waiter tapped. */
            expectedFromStatus?: components["schemas"]["Yalla.Domain.Enums.TableStatus"] | null;
            /**
             * @description The table's `rowVersion` from the floor read model at the moment of the tap, sent back
             *     untouched. <b>Status is not a version:</b> a table that went Free to Occupied and back to Free
             *     while the command sat in the queue passes a status check, and the command lands on a sitting that
             *     has already ended. When both are supplied both must match, and the refusal says which failed.
             */
            expectedRowVersion?: string | null;
            /**
             * Format: int32
             * @description How many people sat down.
             */
            partySize: number;
            /**
             * @description True when this came off the tablet's offline queue rather than from a live tap. A queued command
             *     <b>must</b> carry ExpectedFromStatus, because idempotency stops it being
             *     applied twice and says nothing about it being out of date.
             */
            queued: boolean;
            /** @description Optional free text for the audit log. */
            reason?: string | null;
        };
        /** @description Body of `PUT /api/diner/me/password`. */
        "Yalla.Api.Endpoints.SetDinerPasswordRequest": {
            /**
             * @description Required when the account has a password, unless this sign-in proved the phone (a code or the
             *     Telegram bot) in the last ten minutes; ignored when it has none yet. The profile's
             *     `hasPassword` says which.
             */
            currentPassword?: string | null;
            /** @description 8-128 characters, and not the username or the email. No composition rules. */
            newPassword: string;
        };
        /** @description Body of `POST /api/tabs/{tabId}/display-name`. */
        "Yalla.Api.Endpoints.SetDisplayNameRequest": {
            /** @description What the host should see instead of "Guest 3". */
            displayName: string;
        };
        /** @description Body of `POST /api/tabs/{tabId}/participants/{participantId}/permissions`. */
        "Yalla.Api.Endpoints.SetParticipantPermissionsRequest": {
            /** @description Whether they may add items. */
            canOrder: boolean;
            /** @description Whether they may settle against the tab. Requires CanSeeTableTotal. */
            canPay: boolean;
            /** @description Whether they may see the table total and other people's items. */
            canSeeTableTotal: boolean;
        };
        /** @description Body of the two review visibility routes, the venue's and the platform's. */
        "Yalla.Api.Endpoints.SetReviewVisibilityRequest": {
            /** @description True takes the review down; false puts it back. Required. */
            hidden: boolean;
            /** @description Required when hiding, at most 500 characters. Ignored when putting it back. */
            reason?: string | null;
        };
        /** @description Body of `POST /api/tabs/{tabId}/settlement-mode`. */
        "Yalla.Api.Endpoints.SetSettlementModeRequest": {
            /** @description How the people on a tab agreed to split the bill. */
            settlementMode: components["schemas"]["Yalla.Domain.Enums.SettlementMode"];
        };
        /** @description Body of `POST /api/auth/staff/pin`. */
        "Yalla.Api.Endpoints.StaffPinRequest": {
            /** @description The four digits. Never logged and never stored in the clear. */
            pin: string;
            /**
             * Format: uuid
             * @description Whose PIN is being tapped. The tablet lists the branch's staff.
             */
            staffMemberId: string;
        };
        /** @description Starts a Telegram phone verification. */
        "Yalla.Api.Endpoints.StartTelegramVerificationRequest": {
            /** @description Language for the bot's messages and the account, if one is created. Falls back to `Accept-Language`, then Armenian. */
            localeCode?: string | null;
        };
        /** @description Body of a state-change request that needs nothing beyond the table. */
        "Yalla.Api.Endpoints.TableStateRequest": {
            /**
             * Format: uuid
             * @description The caller's own id for this command. <b>Required.</b> The staff tablet queues changes while
             *     the wifi is down and replays them on reconnect, so the same request arrives twice; this is
             *     what makes the second arrival return the first one's result instead of acting again.
             */
            clientCommandId: string;
            /** @description The status the table had when the waiter tapped. */
            expectedFromStatus?: components["schemas"]["Yalla.Domain.Enums.TableStatus"] | null;
            /**
             * @description The table's `rowVersion` from the floor read model at the moment of the tap, sent back
             *     untouched. <b>Status is not a version:</b> a table that went Free to Occupied and back to Free
             *     while the command sat in the queue passes a status check, and the command lands on a sitting that
             *     has already ended. When both are supplied both must match, and the refusal says which failed.
             */
            expectedRowVersion?: string | null;
            /**
             * @description True when this came off the tablet's offline queue rather than from a live tap. A queued command
             *     <b>must</b> carry ExpectedFromStatus, because idempotency stops it being
             *     applied twice and says nothing about it being out of date.
             */
            queued: boolean;
            /** @description Optional free text for the audit log. */
            reason?: string | null;
        };
        /** @description Body of `PUT /api/diner/me`. Only the fields sent change. */
        "Yalla.Api.Endpoints.UpdateDinerProfileRequest": {
            /** @description A new name, 1-100 characters. */
            displayName?: string | null;
            /** @description A new sign-in address, under the same rules as registration. Lowercased on the way in. */
            email?: string | null;
            /** @description A new sign-in name, under the same rules as registration. Lowercased on the way in. */
            username?: string | null;
        };
        /** @description Body of `PATCH /api/platform/me`. */
        "Yalla.Api.Endpoints.UpdatePlatformAdminProfileRequest": {
            /** @description The name the console shows and the activity feed records. 1-200 characters. */
            fullName?: string | null;
        };
        /** @description Body of the sign-in issue. */
        "Yalla.Api.Endpoints.VenueAdminEndpoints.IssueSignInRequest": {
            /** @description The address this person will sign in with. Stored lowercased. */
            email: string;
        };
        /** @description Body of the availability toggle. */
        "Yalla.Api.Endpoints.VenueAdminEndpoints.SetAvailabilityRequest": {
            isAvailable: boolean;
        };
        /** @description Body of the PIN reset. */
        "Yalla.Api.Endpoints.VenueAdminEndpoints.SetPinRequest": {
            pin: string;
        };
        /** @description Body of `POST /api/auth/venue/sign-in`. */
        "Yalla.Api.Endpoints.VenueUserSignInRequest": {
            /** @description The address on the account. */
            email: string;
            /** @description The password. */
            password: string;
        };
        /** @description Body of `POST /api/auth/diner/verify-code`. */
        "Yalla.Api.Endpoints.VerifyDinerCodeRequest": {
            /** @description The six digits. */
            code: string;
            /** @description Language to store against the account for future messages. */
            localeCode?: string | null;
            /** @description The number the code was sent to. */
            phoneE164: string;
        };
        /** @description Taking a line off the bill. It stays visible to the diner, labelled. */
        "Yalla.Api.Endpoints.VoidLineRequest": {
            /**
             * Format: uuid
             * @description Idempotency.
             */
            clientCommandId: string;
            /** @description Why. Shown to the diner. */
            reason: string;
        };
        /** @description "I'm at my table" was refused, and the facts a sentence about it needs. */
        "Yalla.Api.Errors.BookingTabRefusedContext": {
            /**
             * Format: date-time
             * @description When the branch starts holding the table for the party - the earliest the code opens the tab.
             *     Before it, `booking-too-early`: render it in the branch's time zone, "from 19:10".
             */
            earliestUtc: string;
            /**
             * Format: date-time
             * @description When it ends. From this instant on, `booking-ended`.
             */
            endUtc: string;
            /**
             * Format: uuid
             * @description The booking.
             */
            reservationId: string;
            /**
             * Format: date-time
             * @description When the booking starts.
             */
            startUtc: string;
            /** @description Lifecycle of a booking. Every member is the result of somebody doing something. */
            status: components["schemas"]["Yalla.Domain.Enums.ReservationStatus"];
            /**
             * @description The booked table's label on `booking-table-occupied`, for "Table 1 still has another party
             *     seated". Null on the other codes.
             */
            tableLabel?: string | null;
        };
        /**
         * @description `booking-too-early`, `booking-ended`, `booking-not-active` or
         *                 `booking-table-occupied` (another party still seated at the booked table), 409, with the
         *                 booking's facts. Branch on the code. The other 409s the route shares with the scan - the table out
         *                 of service, the tab being settled, the command id taken by another device - arrive on the same
         *                 status with no `context`.
         */
        "Yalla.Api.Errors.BookingTabRefusedProblem": {
            /** @description The stable kebab-case slug. <b>This is what a client branches on.</b> */
            code: string;
            /** @description "I'm at my table" was refused, and the facts a sentence about it needs. */
            context?: components["schemas"]["Yalla.Api.Errors.BookingTabRefusedContext"] | null;
            /** @description What went wrong this time, in words. */
            detail: string;
            /** @description Field-level complaints, when the failure was about the payload. */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body.
             */
            status: number;
            /** @description Short, stable summary of the kind of problem. */
            title: string;
            /** @description Correlates this response with the one log entry written for it. */
            traceId: string;
            /** @description A URI naming the problem type, built from Yalla.Api.Errors.ProblemShape.Code. */
            type: string;
        };
        /** @description The branch's menu is not finished, so it cannot start taking diners. */
        "Yalla.Api.Errors.BranchNotReadyContext": {
            /**
             * Format: uuid
             * @description The branch.
             */
            branchId: string;
            /**
             * Format: int32
             * @description How many items are missing a photo, a description, ingredients, allergens, a portion size or a
             *     prep time. The number the refusal exists to carry - the readiness endpoint lists which ones.
             */
            incompleteMenuItemCount: number;
        };
        /** @description `branch-not-ready`, 409. Finish the menu, then switch the tier. */
        "Yalla.Api.Errors.BranchNotReadyProblem": {
            /** @description The stable kebab-case slug. <b>This is what a client branches on.</b> */
            code: string;
            /** @description The branch's menu is not finished, so it cannot start taking diners. */
            context: components["schemas"]["Yalla.Api.Errors.BranchNotReadyContext"];
            /** @description What went wrong this time, in words. */
            detail: string;
            /** @description Field-level complaints, when the failure was about the payload. */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body.
             */
            status: number;
            /** @description Short, stable summary of the kind of problem. */
            title: string;
            /** @description Correlates this response with the one log entry written for it. */
            traceId: string;
            /** @description A URI naming the problem type, built from Yalla.Api.Errors.ProblemShape.Code. */
            type: string;
        };
        /** @description One field of the request that was refused. */
        "Yalla.Api.Errors.FieldViolationShape": {
            /** @description Which rule broke: `min`, `max`, `range`, `required` or `conflict`. */
            bound?: string | null;
            /**
             * @description The property, in the casing the OpenAPI schema uses - `turnTimeMinutes`, or
             *     `[2].closesAt` where the payload is an array. <b>This is what a form keys on.</b> It
             *     deliberately is not an English label: the console used to map server prose back to inputs
             *     through a lookup table, which stopped working the moment either side was translated.
             */
            field: string;
            /** @description The highest accepted value, where the bound has one. */
            max?: unknown;
            /** @description What is wrong with it, in a sentence. */
            message: string;
            /** @description The lowest accepted value, where the bound has one. */
            min?: unknown;
            /** @description What was supplied, so the message can quote it back. */
            value?: unknown;
        };
        /** @description The floor plan was saved by somebody else since the editor loaded it. */
        "Yalla.Api.Errors.FloorPlanChangedContext": {
            /** @description The revision now stored. Reload the plan; it carries this as `version`. */
            currentVersion: string;
        };
        /** @description `floor-plan-changed`, 409. Nothing was written. */
        "Yalla.Api.Errors.FloorPlanChangedProblem": {
            /** @description The stable kebab-case slug. <b>This is what a client branches on.</b> */
            code: string;
            /** @description The floor plan was saved by somebody else since the editor loaded it. */
            context: components["schemas"]["Yalla.Api.Errors.FloorPlanChangedContext"];
            /** @description What went wrong this time, in words. */
            detail: string;
            /** @description Field-level complaints, when the failure was about the payload. */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body.
             */
            status: number;
            /** @description Short, stable summary of the kind of problem. */
            title: string;
            /** @description Correlates this response with the one log entry written for it. */
            traceId: string;
            /** @description A URI naming the problem type, built from Yalla.Api.Errors.ProblemShape.Code. */
            type: string;
        };
        /** @description The floor plan the editor sent could not be applied. */
        "Yalla.Api.Errors.FloorPlanRejectedContext": {
            /** @description Labels used more than once. */
            duplicateLabels: string[];
            /** @description Every reason, one sentence each, naming the tables and rooms involved. */
            errors: string[];
        };
        /** @description `floor-plan-invalid`, 422. */
        "Yalla.Api.Errors.FloorPlanRejectedProblem": {
            /** @description The stable kebab-case slug. <b>This is what a client branches on.</b> */
            code: string;
            /** @description The floor plan the editor sent could not be applied. */
            context: components["schemas"]["Yalla.Api.Errors.FloorPlanRejectedContext"];
            /** @description What went wrong this time, in words. */
            detail: string;
            /** @description Field-level complaints, when the failure was about the payload. */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body.
             */
            status: number;
            /** @description Short, stable summary of the kind of problem. */
            title: string;
            /** @description Correlates this response with the one log entry written for it. */
            traceId: string;
            /** @description A URI naming the problem type, built from Yalla.Api.Errors.ProblemShape.Code. */
            type: string;
        };
        /** @description "Keep my table" was refused. */
        "Yalla.Api.Errors.HoldExtensionRefusedContext": {
            /**
             * Format: uuid
             * @description The booking.
             */
            reservationId: string;
            /**
             * Format: date-time
             * @description When it starts - so a refusal before then can say when to ask again.
             */
            startUtc: string;
        };
        /**
         * @description `hold-not-active`, `hold-already-extended` or `extensions-not-offered`, 409. Branch
         *                 on the code: the three need three different sentences.
         */
        "Yalla.Api.Errors.HoldExtensionRefusedProblem": {
            /** @description The stable kebab-case slug. <b>This is what a client branches on.</b> */
            code: string;
            /** @description "Keep my table" was refused. */
            context: components["schemas"]["Yalla.Api.Errors.HoldExtensionRefusedContext"];
            /** @description What went wrong this time, in words. */
            detail: string;
            /** @description Field-level complaints, when the failure was about the payload. */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body.
             */
            status: number;
            /** @description Short, stable summary of the kind of problem. */
            title: string;
            /** @description Correlates this response with the one log entry written for it. */
            traceId: string;
            /** @description A URI naming the problem type, built from Yalla.Api.Errors.ProblemShape.Code. */
            type: string;
        };
        /** @description A diner's username, email or phone number is already somebody else's. */
        "Yalla.Api.Errors.IdentifierTakenContext": {
            /**
             * @description The request field to highlight: `username`, `email` or `phoneE164`. The same
             *     information the code carries, in the form a form keys on.
             */
            field: string;
        };
        /**
         * @description `username-taken`, `email-taken` or `phone-in-use`, 409. Branch on the code: the
         *                 third is the one that offers "log in with a code instead", because the number's owner can
         *                 prove it and a stranger typing it cannot.
         */
        "Yalla.Api.Errors.IdentifierTakenProblem": {
            /** @description The stable kebab-case slug. <b>This is what a client branches on.</b> */
            code: string;
            /** @description A diner's username, email or phone number is already somebody else's. */
            context: components["schemas"]["Yalla.Api.Errors.IdentifierTakenContext"];
            /** @description What went wrong this time, in words. */
            detail: string;
            /** @description Field-level complaints, when the failure was about the payload. */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body.
             */
            status: number;
            /** @description Short, stable summary of the kind of problem. */
            title: string;
            /** @description Correlates this response with the one log entry written for it. */
            traceId: string;
            /** @description A URI naming the problem type, built from Yalla.Api.Errors.ProblemShape.Code. */
            type: string;
        };
        /** @description Removing this line would reverse money already taken. */
        "Yalla.Api.Errors.LineAlreadyPaidContext": {
            /**
             * Format: uuid
             * @description The line.
             */
            lineId: string;
            /**
             * Format: uuid
             * @description The tab.
             */
            tabId: string;
        };
        /** @description `line-already-paid`, 409. That is a refund, which is a different thing. */
        "Yalla.Api.Errors.LineAlreadyPaidProblem": {
            /** @description The stable kebab-case slug. <b>This is what a client branches on.</b> */
            code: string;
            /** @description Removing this line would reverse money already taken. */
            context: components["schemas"]["Yalla.Api.Errors.LineAlreadyPaidContext"];
            /** @description What went wrong this time, in words. */
            detail: string;
            /** @description Field-level complaints, when the failure was about the payload. */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body.
             */
            status: number;
            /** @description Short, stable summary of the kind of problem. */
            title: string;
            /** @description Correlates this response with the one log entry written for it. */
            traceId: string;
            /** @description A URI naming the problem type, built from Yalla.Api.Errors.ProblemShape.Code. */
            type: string;
        };
        /** @description Another writer held the table for longer than the wait allows. */
        "Yalla.Api.Errors.LockTimeoutContext": {
            /** @description Always true. Stated so no client has to know which codes are retryable. */
            retryable: boolean;
            /**
             * Format: uuid
             * @description The table.
             */
            tableId: string;
            /** @description Its label. */
            tableLabel: string;
            /**
             * Format: int32
             * @description How long it waited.
             */
            timeoutMilliseconds: number;
        };
        /** @description `reservation-lock-timeout` or `table-lock-timeout`, 503. */
        "Yalla.Api.Errors.LockTimeoutProblem": {
            /** @description The stable kebab-case slug. <b>This is what a client branches on.</b> */
            code: string;
            /** @description Another writer held the table for longer than the wait allows. */
            context: components["schemas"]["Yalla.Api.Errors.LockTimeoutContext"];
            /** @description What went wrong this time, in words. */
            detail: string;
            /** @description Field-level complaints, when the failure was about the payload. */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body.
             */
            status: number;
            /** @description Short, stable summary of the kind of problem. */
            title: string;
            /** @description Correlates this response with the one log entry written for it. */
            traceId: string;
            /** @description A URI naming the problem type, built from Yalla.Api.Errors.ProblemShape.Code. */
            type: string;
        };
        /** @description A dish on the order has sold out. */
        "Yalla.Api.Errors.MenuItemUnavailableContext": {
            /**
             * @description Its name. The reason this family is typed at all: the client has to be able to say <i>which</i>
             *     dish, and "your order could not be placed" sends the diner back to a waiter.
             */
            itemName: string;
            /**
             * Format: uuid
             * @description Which item.
             */
            menuItemId: string;
        };
        /** @description `menu-item-unavailable`, 409. */
        "Yalla.Api.Errors.MenuItemUnavailableProblem": {
            /** @description The stable kebab-case slug. <b>This is what a client branches on.</b> */
            code: string;
            /** @description A dish on the order has sold out. */
            context: components["schemas"]["Yalla.Api.Errors.MenuItemUnavailableContext"];
            /** @description What went wrong this time, in words. */
            detail: string;
            /** @description Field-level complaints, when the failure was about the payload. */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body.
             */
            status: number;
            /** @description Short, stable summary of the kind of problem. */
            title: string;
            /** @description Correlates this response with the one log entry written for it. */
            traceId: string;
            /** @description A URI naming the problem type, built from Yalla.Api.Errors.ProblemShape.Code. */
            type: string;
        };
        /** @description More was offered than the tab still owes. */
        "Yalla.Api.Errors.PaymentExceedsRemainingContext": {
            /**
             * Format: int64
             * @description What is actually owed. The waiter is standing at the table holding notes, so this is the field
             *     the refusal exists to carry.
             */
            remainingAmd: number;
            /**
             * Format: int64
             * @description What was offered, in whole dram.
             */
            requestedAmd: number;
            /**
             * Format: uuid
             * @description The tab.
             */
            tabId: string;
        };
        /** @description `payment-exceeds-remaining`, 409. */
        "Yalla.Api.Errors.PaymentExceedsRemainingProblem": {
            /** @description The stable kebab-case slug. <b>This is what a client branches on.</b> */
            code: string;
            /** @description More was offered than the tab still owes. */
            context: components["schemas"]["Yalla.Api.Errors.PaymentExceedsRemainingContext"];
            /** @description What went wrong this time, in words. */
            detail: string;
            /** @description Field-level complaints, when the failure was about the payload. */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body.
             */
            status: number;
            /** @description Short, stable summary of the kind of problem. */
            title: string;
            /** @description Correlates this response with the one log entry written for it. */
            traceId: string;
            /** @description A URI naming the problem type, built from Yalla.Api.Errors.ProblemShape.Code. */
            type: string;
        };
        /** @description A first review of a branch the diner has not visited in the window. */
        "Yalla.Api.Errors.ReviewNeedsVisitContext": {
            /**
             * Format: uuid
             * @description The branch.
             */
            branchId: string;
            /**
             * Format: int32
             * @description How far back a visit counts, in days. The app says "after a visit" with it.
             */
            windowDays: number;
        };
        /**
         * @description `review-needs-visit`, 403, with the window. `phone-not-verified` arrives on the same status
         *                 with no `context`: branch on the code.
         */
        "Yalla.Api.Errors.ReviewNeedsVisitProblem": {
            /** @description The stable kebab-case slug. <b>This is what a client branches on.</b> */
            code: string;
            /** @description A first review of a branch the diner has not visited in the window. */
            context?: components["schemas"]["Yalla.Api.Errors.ReviewNeedsVisitContext"] | null;
            /** @description What went wrong this time, in words. */
            detail: string;
            /** @description Field-level complaints, when the failure was about the payload. */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body.
             */
            status: number;
            /** @description Short, stable summary of the kind of problem. */
            title: string;
            /** @description Correlates this response with the one log entry written for it. */
            traceId: string;
            /** @description A URI naming the problem type, built from Yalla.Api.Errors.ProblemShape.Code. */
            type: string;
        };
        /** @description This table has asked for too many things too quickly. */
        "Yalla.Api.Errors.ServiceRequestRateLimitedContext": {
            /**
             * Format: int32
             * @description How many are allowed in the window.
             */
            limit: number;
            /**
             * Format: uuid
             * @description The tab.
             */
            tabId: string;
            /**
             * Format: int32
             * @description How long the window is.
             */
            windowMinutes: number;
        };
        /** @description `service-request-rate-limited`, 429. */
        "Yalla.Api.Errors.ServiceRequestRateLimitedProblem": {
            /** @description The stable kebab-case slug. <b>This is what a client branches on.</b> */
            code: string;
            /** @description This table has asked for too many things too quickly. */
            context: components["schemas"]["Yalla.Api.Errors.ServiceRequestRateLimitedContext"];
            /** @description What went wrong this time, in words. */
            detail: string;
            /** @description Field-level complaints, when the failure was about the payload. */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body.
             */
            status: number;
            /** @description Short, stable summary of the kind of problem. */
            title: string;
            /** @description Correlates this response with the one log entry written for it. */
            traceId: string;
            /** @description A URI naming the problem type, built from Yalla.Api.Errors.ProblemShape.Code. */
            type: string;
        };
        /** @description The tables a delete or a plan save would have taken away, and the bookings that hold them. */
        "Yalla.Api.Errors.TableHasFutureBookingsContext": {
            /** @description The codes of the upcoming bookings on them, in code order. */
            bookings: string[];
            /** @description The labels of the tables refused, in label order. */
            tables: string[];
        };
        /** @description `table-has-future-bookings`, 409. Move or cancel the bookings first. Nothing was written. */
        "Yalla.Api.Errors.TableHasFutureBookingsProblem": {
            /** @description The stable kebab-case slug. <b>This is what a client branches on.</b> */
            code: string;
            /** @description The tables a delete or a plan save would have taken away, and the bookings that hold them. */
            context: components["schemas"]["Yalla.Api.Errors.TableHasFutureBookingsContext"];
            /** @description What went wrong this time, in words. */
            detail: string;
            /** @description Field-level complaints, when the failure was about the payload. */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body.
             */
            status: number;
            /** @description Short, stable summary of the kind of problem. */
            title: string;
            /** @description Correlates this response with the one log entry written for it. */
            traceId: string;
            /** @description A URI naming the problem type, built from Yalla.Api.Errors.ProblemShape.Code. */
            type: string;
        };
        /** @description Nobody is seated at the table a tab was asked for. */
        "Yalla.Api.Errors.TableNotSeatedContext": {
            /** @description The <b>physical</b> state of a table: what somebody did to it. */
            status: components["schemas"]["Yalla.Domain.Enums.TableStatus"];
            /**
             * Format: uuid
             * @description The table.
             */
            tableId: string;
            /** @description What staff call it. */
            tableLabel: string;
        };
        /** @description `table-not-seated`, 409. Seat the party first, then open the tab. */
        "Yalla.Api.Errors.TableNotSeatedProblem": {
            /** @description The stable kebab-case slug. <b>This is what a client branches on.</b> */
            code: string;
            /** @description Nobody is seated at the table a tab was asked for. */
            context: components["schemas"]["Yalla.Api.Errors.TableNotSeatedContext"];
            /** @description What went wrong this time, in words. */
            detail: string;
            /** @description Field-level complaints, when the failure was about the payload. */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body.
             */
            status: number;
            /** @description Short, stable summary of the kind of problem. */
            title: string;
            /** @description Correlates this response with the one log entry written for it. */
            traceId: string;
            /** @description A URI naming the problem type, built from Yalla.Api.Errors.ProblemShape.Code. */
            type: string;
        };
        /** @description The bill has been asked for, so nothing more goes on the tab. */
        "Yalla.Api.Errors.TabNotAcceptingOrdersContext": {
            /** @description Lifecycle of a tab. */
            status: components["schemas"]["Yalla.Domain.Enums.TabStatus"];
            /**
             * Format: uuid
             * @description The tab.
             */
            tabId: string;
        };
        /** @description `tab-not-accepting-orders`, 409. Show the bill, not the menu. */
        "Yalla.Api.Errors.TabNotAcceptingOrdersProblem": {
            /** @description The stable kebab-case slug. <b>This is what a client branches on.</b> */
            code: string;
            /** @description The bill has been asked for, so nothing more goes on the tab. */
            context: components["schemas"]["Yalla.Api.Errors.TabNotAcceptingOrdersContext"];
            /** @description What went wrong this time, in words. */
            detail: string;
            /** @description Field-level complaints, when the failure was about the payload. */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body.
             */
            status: number;
            /** @description Short, stable summary of the kind of problem. */
            title: string;
            /** @description Correlates this response with the one log entry written for it. */
            traceId: string;
            /** @description A URI naming the problem type, built from Yalla.Api.Errors.ProblemShape.Code. */
            type: string;
        };
        /** @description The single failure shape every endpoint answers with, whatever went wrong. */
        "Yalla.Api.Errors.UnifiedErrorEnvelope": {
            /** @description Stable kebab-case slug identifying the failure. This is what clients branch on. */
            code: string;
            /**
             * @description Machine-readable facts about this particular failure, for the cases where the client has
             *     to act on more than the code.
             */
            context?: {
                [key: string]: unknown;
            } | null;
            /** @description What went wrong this time, in words. Safe to show a developer, not necessarily a diner. */
            detail: string;
            /**
             * @description Field-level complaints, keyed by field name, when the failure was about the payload.
             *     Omitted entirely when there are none.
             */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body so a client logging only bodies keeps it.
             */
            status: number;
            /**
             * @description Short, stable summary of the <i>kind</i> of problem. Same wording for every occurrence -
             *     the specifics go in Yalla.Api.Errors.UnifiedErrorEnvelope.Detail.
             */
            title: string;
            /** @description Correlates this response with the single log entry written for it. */
            traceId: string;
            /**
             * @description A URI naming the problem type. Built from Yalla.Api.Errors.UnifiedErrorEnvelope.Code, so it is stable and
             *     dereferenceable to documentation rather than being `about:blank` for everything.
             */
            type: string;
        };
        /** @description Every field the request got wrong. */
        "Yalla.Api.Errors.ValidationFailedContext": {
            /** @description The first offending field, for a form that can only highlight one input at a time. */
            field: string;
            /**
             * @description All of them. A single request can break six bounds, and returning one at a time makes an owner
             *     submit six times to discover that.
             */
            fields: components["schemas"]["Yalla.Api.Errors.FieldViolationShape"][];
        };
        /**
         * @description `validation-failed`, 422. The reservation policy and opening-hours refusals, and every
         *                 other field-level refusal that used to carry prose and nothing else.
         */
        "Yalla.Api.Errors.ValidationFailedProblem": {
            /** @description The stable kebab-case slug. <b>This is what a client branches on.</b> */
            code: string;
            /** @description Every field the request got wrong. */
            context: components["schemas"]["Yalla.Api.Errors.ValidationFailedContext"];
            /** @description What went wrong this time, in words. */
            detail: string;
            /** @description Field-level complaints, when the failure was about the payload. */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body.
             */
            status: number;
            /** @description Short, stable summary of the kind of problem. */
            title: string;
            /** @description Correlates this response with the one log entry written for it. */
            traceId: string;
            /** @description A URI naming the problem type, built from Yalla.Api.Errors.ProblemShape.Code. */
            type: string;
        };
        /** @description A one-time code that was not accepted, and what is left on it. */
        "Yalla.Api.Errors.VerificationCodeInvalidContext": {
            /**
             * Format: int32
             * @description Tries left on the number's live code. <b>Zero</b> when there is no live code, or the last try was
             *     just spent: say "ask for a new code", not "try again".
             */
            attemptsRemaining: number;
        };
        /**
         * @description `verification-code-invalid`, 401, with the count. `verification-code-expired` arrives on
         *                 the same status with no `context`.
         */
        "Yalla.Api.Errors.VerificationCodeInvalidProblem": {
            /** @description The stable kebab-case slug. <b>This is what a client branches on.</b> */
            code: string;
            /** @description A one-time code that was not accepted, and what is left on it. */
            context?: components["schemas"]["Yalla.Api.Errors.VerificationCodeInvalidContext"] | null;
            /** @description What went wrong this time, in words. */
            detail: string;
            /** @description Field-level complaints, when the failure was about the payload. */
            errors?: {
                [key: string]: string[];
            } | null;
            /** @description The request path this happened on. */
            instance?: string | null;
            /**
             * Format: int32
             * @description The HTTP status code, repeated in the body.
             */
            status: number;
            /** @description Short, stable summary of the kind of problem. */
            title: string;
            /** @description Correlates this response with the one log entry written for it. */
            traceId: string;
            /** @description A URI naming the problem type, built from Yalla.Api.Errors.ProblemShape.Code. */
            type: string;
        };
        /** @description A one-time code a manager reads out to a tablet being enrolled. */
        "Yalla.Application.Auth.DeviceEnrolmentCodeResult": {
            /**
             * Format: uuid
             * @description The branch the resulting device will be bound to.
             */
            branchId: string;
            /** @description The code. Shown once, never retrievable again - only its hash is stored. */
            code: string;
            /**
             * Format: date-time
             * @description When it stops being redeemable.
             */
            expiresAtUtc: string;
        };
        /** @description What a tablet gets back for a redeemed enrolment code. */
        "Yalla.Application.Auth.DeviceEnrolmentResult": {
            /**
             * Format: uuid
             * @description The one branch this tablet is bound to.
             */
            branchId: string;
            /**
             * Format: uuid
             * @description The enrolled device, revocable from the admin panel.
             */
            deviceId: string;
            /** @description The name the manager gave it. */
            deviceName: string;
            /** @description Long-lived bearer token identifying the tablet. It can do exactly one thing: offer a PIN. */
            deviceToken: string;
            /**
             * Format: date-time
             * @description When the device token itself expires and the tablet must re-enrol.
             */
            expiresAtUtc: string;
        };
        /** @description Tokens issued to a diner who verified their phone number. */
        "Yalla.Application.Auth.DinerSignInResult": {
            /** @description Bearer token for the diner surface. Short-lived. */
            accessToken: string;
            /**
             * Format: uuid
             * @description The account, created on first successful verification.
             */
            dinerUserId: string;
            /**
             * Format: int32
             * @description Lifetime of AccessToken.
             */
            expiresInSeconds: number;
            /** @description True when this verification created the account. */
            isNewAccount: boolean;
            /** @description Rotating handle. Send it once; the response carries its successor. */
            refreshToken: string;
        };
        /** @description Where an enrolled device thinks it is, shown on the PIN screen before anybody taps. */
        "Yalla.Application.Auth.EnrolledDeviceView": {
            /**
             * Format: uuid
             * @description The one branch it can act on.
             */
            branchId: string;
            /** @description That branch, in words, because an id on a counter screen means nothing. */
            branchName: string;
            /** @description The identifier the client minted for itself. */
            clientDeviceId: string;
            /**
             * Format: uuid
             * @description The device row.
             */
            deviceId: string;
            /** @description What the manager called it. */
            deviceName: string;
            /**
             * Format: date-time
             * @description When it was set up.
             */
            enrolledAtUtc: string;
            /**
             * Format: date-time
             * @description When it was last used.
             */
            lastSeenAtUtc?: string | null;
            /** @description The venue, for a chain where two branches share a name. */
            venueName: string;
        };
        /** @description A refreshed access token and the refresh token that replaces the one just spent. */
        "Yalla.Application.Auth.RefreshResult": {
            /** @description The new bearer token. */
            accessToken: string;
            /**
             * Format: int32
             * @description Lifetime of AccessToken.
             */
            expiresInSeconds: number;
            /** @description The successor handle. The one you sent is now dead. */
            refreshToken: string;
        };
        /** @description One enrolled tablet, as the admin panel lists it. */
        "Yalla.Application.Auth.StaffDeviceSummary": {
            /**
             * Format: uuid
             * @description The branch it is bound to.
             */
            branchId: string;
            /**
             * Format: date-time
             * @description When it redeemed its enrolment code.
             */
            enrolledAtUtc: string;
            /**
             * Format: uuid
             * @description The device.
             */
            id: string;
            /** @description True once a manager killed it. Revocation is permanent; re-enrol instead. */
            isRevoked: boolean;
            /**
             * Format: date-time
             * @description Last time a token from it was used. Null if never.
             */
            lastSeenAtUtc?: string | null;
            /** @description What the manager called it. */
            name: string;
        };
        /** @description One person who may tap a PIN on this tablet, as its PIN screen lists them. */
        "Yalla.Application.Auth.StaffRosterEntry": {
            /** @description The name to tap. */
            fullName: string;
            /** @description What a staff member is allowed to do, coarsely. Authorisation itself is a later task. */
            role: components["schemas"]["Yalla.Domain.Enums.StaffRole"];
            /**
             * Format: uuid
             * @description What `POST /api/auth/staff/pin` takes.
             */
            staffMemberId: string;
        };
        /** @description A staff member's session on a tablet, opened by a PIN. */
        "Yalla.Application.Auth.StaffSessionResult": {
            /** @description Bearer token carrying the staff member, their role and their branch. */
            accessToken: string;
            /**
             * Format: uuid
             * @description The branch this session may act on, and only this one.
             */
            branchId: string;
            /**
             * Format: int32
             * @description Lifetime of AccessToken.
             */
            expiresInSeconds: number;
            /** @description Shown on the tablet so the waiter can see whose session is open. */
            fullName: string;
            /**
             * @description Handle the tablet exchanges to stay signed in. Rotates on every use, and stops working after
             *     thirty minutes of inactivity - at which point the PIN is needed again.
             */
            renewalToken: string;
            /** @description What a staff member is allowed to do, coarsely. Authorisation itself is a later task. */
            role: components["schemas"]["Yalla.Domain.Enums.StaffRole"];
            /**
             * Format: uuid
             * @description Who is acting. This is the id that lands in the audit log.
             */
            staffMemberId: string;
        };
        /** @description The tab-scoped token handed to someone who scanned a QR code or redeemed a join token. */
        "Yalla.Application.Auth.TabParticipantTokenResult": {
            /** @description Bearer token valid only for TabId. */
            accessToken: string;
            /**
             * Format: uuid
             * @description The branch the tab is in.
             */
            branchId: string;
            /** @description Whether this participant may add items. */
            canOrder: boolean;
            /** @description What the host sees. Changeable, and not an account. */
            displayName: string;
            /**
             * Format: date-time
             * @description When it stops working - the tab's close, plus a receipt grace period.
             */
            expiresAtUtc: string;
            /**
             * Format: uuid
             * @description This person's row on the tab.
             */
            participantId: string;
            /**
             * Format: uuid
             * @description The one tab this token can touch.
             */
            tabId: string;
        };
        /** @description The answer to one poll. */
        "Yalla.Application.Auth.TelegramVerificationClaim": {
            /**
             * @description The number Telegram handed over, in E.164, when State is `verified` -
             *     so the app can show it without a second round trip to the profile. Null otherwise.
             */
            phoneE164?: string | null;
            /** @description The tokens, when State is `verified`. Null otherwise. */
            signIn?: components["schemas"]["Yalla.Application.Auth.DinerSignInResult"] | null;
            /**
             * @description `pending` while the bot has not been handed the number; `verified` exactly once,
             *                 with SignIn set. After that the challenge is spent and answers 410.
             */
            state: string;
        };
        /** @description What the app needs to open the bot and to poll. */
        "Yalla.Application.Auth.TelegramVerificationStart": {
            /**
             * Format: uuid
             * @description Poll with this. Opaque, and useless to anyone who did not also open the link.
             */
            challengeId: string;
            /** @description `https://t.me/{bot}?start={nonce}`. Open it; Telegram starts the bot with the nonce. */
            deepLinkUrl: string;
            /**
             * Format: int32
             * @description How long the link, and the challenge, stay usable.
             */
            expiresInSeconds: number;
            /**
             * Format: int32
             * @description How long to wait between claims. Polling faster than this spends the claim rate limit for nothing.
             */
            pollAfterMs: number;
        };
        /** @description An owner or manager signed in to the admin panel. */
        "Yalla.Application.Auth.VenueUserSignInResult": {
            /** @description Bearer token for the admin surface. */
            accessToken: string;
            /**
             * Format: int32
             * @description Lifetime of AccessToken.
             */
            expiresInSeconds: number;
            /** @description Display name for the panel. */
            fullName: string;
            /** @description Rotating handle, thirty days. */
            refreshToken: string;
            /** @description What a staff member is allowed to do, coarsely. Authorisation itself is a later task. */
            role: components["schemas"]["Yalla.Domain.Enums.StaffRole"];
            /**
             * Format: uuid
             * @description Who signed in.
             */
            staffMemberId: string;
            /**
             * Format: uuid
             * @description The venue this account administers. Null for a platform admin, who administers all of them.
             */
            venueId?: string | null;
        };
        /** @description What `request-code` answers, whether or not the number has an account. */
        "Yalla.Application.Auth.VerificationCodeRequestResult": {
            /**
             * @description The code itself, returned <b>only</b> in Development so the flow can be exercised with no SMS
             *     provider wired up. Always null in any other environment.
             */
            developmentCode?: string | null;
            /**
             * Format: int32
             * @description How long the code stays usable.
             */
            expiresInSeconds: number;
            /**
             * Format: int32
             * @description How many wrong guesses the code tolerates before it dies.
             */
            maxAttempts: number;
        };
        /** @description The listing form, as written. */
        "Yalla.Application.BranchSettings.BranchListingCommand": {
            /** @description Up to 2000 characters. Null or blank clears it. */
            about?: string | null;
            /** @description A new street address; only applied together with coordinates. */
            address?: string | null;
            /**
             * @description Keys from `outdoorSeating`, `wifi`, `parking`, `cardPayment`, `vegan`.
             *     Null or empty clears them.
             */
            amenities?: string[] | null;
            /** @description Up to 120 characters. Null or blank clears it. */
            cuisine?: string | null;
            /**
             * @description The part of town, e.g. "Kentron" - printed after the venue type and cuisine, and matched by search.
             *     Up to 60 characters, trimmed. Null or blank clears it. A listing field like the cuisine line: a
             *     manager may set it, unlike the address, because naming the neighbourhood moves nobody's pin.
             */
            district?: string | null;
            /**
             * @description Photos uploaded for <b>this</b> branch, in display order, at most 12. <b>Null leaves the gallery
             *     as it is</b>; an empty list clears it.
             */
            galleryPhotoIds?: string[] | null;
            /**
             * Format: double
             * @description Sent with Longitude to move the pin, or neither.
             */
            latitude?: number | null;
            /**
             * Format: double
             * @description Sent with Latitude.
             */
            longitude?: number | null;
            /**
             * Format: int32
             * @description 1-4, or null to clear.
             */
            priceLevel?: number | null;
            /** @description An absolute http(s) URL, or null to clear. */
            websiteUrl?: string | null;
        };
        /** @description What a branch says about itself on the diner app's browse screens. */
        "Yalla.Application.BranchSettings.BranchListingView": {
            /** @description A paragraph, or absent. */
            about?: string | null;
            /** @description Street address. */
            address: string;
            /** @description Amenity keys. */
            amenities: string[];
            /** @description The cuisine line, or absent. */
            cuisine?: string | null;
            /** @description The part of town, e.g. "Kentron", or absent. */
            district?: string | null;
            /** @description Pictures beyond the cover, in order. */
            gallery: components["schemas"]["Yalla.Application.Media.PhotoView"][];
            /**
             * Format: double
             * @description WGS84.
             */
            latitude: number;
            /**
             * Format: double
             * @description WGS84.
             */
            longitude: number;
            /**
             * Format: int32
             * @description 1-4, or absent.
             */
            priceLevel?: number | null;
            /** @description http(s), or absent. */
            websiteUrl?: string | null;
        };
        /** @description What a branch still needs before it can take diners. */
        "Yalla.Application.BranchSettings.BranchReadinessView": {
            /**
             * @description Whether the branch takes bookings from its public page.
             *     <b>Reported, and deliberately not a blocker.</b> A venue that does not want bookings from
             *     strangers on the internet is not an unfinished venue - most will start this way, and its public
             *     page showing the room, the menu and the hours is a perfectly good page. It is on the checklist
             *     so that leaving it off is something somebody saw and chose, rather than a default they never
             *     knew they had inherited; a line that blocked going live would instead teach every onboarder to
             *     switch it on without reading it, which is the opposite of the point.
             */
            acceptsWebBookings: boolean;
            /**
             * @description One sentence per unsatisfied line, in checklist order. The console renders its own labels; this
             *     is for the places that need to say what is wrong without reimplementing the list - a log line,
             *     a support answer, an email to the venue.
             */
            blockers: string[];
            /**
             * Format: uuid
             * @description The branch this is about.
             */
            branchId: string;
            /**
             * Format: int32
             * @description How many.
             */
            deviceCount: number;
            /** @description At least one tablet is enrolled and not revoked. */
            deviceEnrolled: boolean;
            /** @description At least one active table exists at the branch. */
            floorPlanDrawn: boolean;
            /**
             * Format: int32
             * @description How many items are missing a photo, a description, ingredients, allergens, a portion size or a
             *     prep time. <b>The number that blocks going live</b>, and the number the refusal quotes.
             */
            incompleteMenuItemCount: number;
            /** @description Which ones, so the console can link straight to them. */
            incompleteMenuItemIds: string[];
            /**
             * @description Every line below satisfied. This is exactly what going Paid requires on the menu side, plus the
             *     rest of the checklist - the tier switch itself only enforces the menu, because a venue may want
             *     its tabs enabled before it has finished enrolling tablets.
             */
            isReadyForDiners: boolean;
            /**
             * @description The same unsatisfied lines as Blockers, one for one and in the same order, as
             *     stable codes a client can switch on - Yalla.Application.BranchSettings.ReadinessIssueCodes - with the count behind
             *     the ones that have one. The platform console's venue list and Home show the first of these.
             */
            issues: components["schemas"]["Yalla.Application.BranchSettings.ReadinessIssue"][];
            /** @description The branch has at least one menu category. */
            menuCategoriesPresent: boolean;
            /**
             * Format: int32
             * @description How many categories there are.
             */
            menuCategoryCount: number;
            /** @description No categories missing, and no incomplete items. */
            menuComplete: boolean;
            /**
             * Format: int32
             * @description How many items there are, complete or not.
             */
            menuItemCount: number;
            /**
             * Format: int32
             * @description How many days of the week have any opening block.
             */
            openingHoursDayCount: number;
            /** @description At least one opening block exists for the week. */
            openingHoursSet: boolean;
            /**
             * @description Somebody has saved the reservation policy at least once. A branch ships with defaults, so
             *     "has a policy" is always true and answers nothing; this asks whether a human has looked.
             */
            reservationPolicyReviewed: boolean;
            /**
             * Format: int32
             * @description How many.
             */
            staffCount: number;
            /** @description At least one active staff member works at this branch. */
            staffEnrolled: boolean;
            /**
             * Format: int32
             * @description How many active tables there are.
             */
            tableCount: number;
            /**
             * @description Every active table carries a label. Labels are required by the entity and unique per branch, so
             *     this is satisfied whenever there are tables at all - it is reported because the checklist has a
             *     line for it and a silently-absent line reads as a failure.
             */
            tablesLabelled: boolean;
        };
        "Yalla.Application.BranchSettings.FloorAreaCommand": {
            /** Format: int32 */
            displayOrder: number;
            name: string;
        };
        /** @description A room as the editor sends it. `Id` matches an existing room; null means new. */
        "Yalla.Application.BranchSettings.FloorAreaInput": {
            /**
             * Format: int32
             * @description Lowest first.
             */
            displayOrder: number;
            /**
             * Format: uuid
             * @description The existing room this entry edits, or null for one matched by name or created.
             */
            id?: string | null;
            /** @description Unique within the branch, and required. */
            name: string;
            /**
             * @description The room's photos, in the order a diner swipes them - the whole list, replacing what was there.
             *     At most Yalla.Domain.Venues.FloorAreaPhoto.MaxPhotos, each a photo uploaded for <b>this</b> branch
             *     (another branch's is not found here, the gallery's answer), and each in at most one room. Null or
             *     absent means none. A photo dropped from every room takes the tables pinned on it off the photo.
             */
            photoIds?: string[] | null;
        };
        /** @description A room as the editor reads it, with its photos in the order a diner swipes them. */
        "Yalla.Application.BranchSettings.FloorAreaView": {
            /**
             * Format: int32
             * @description Lowest first.
             */
            displayOrder: number;
            /**
             * Format: uuid
             * @description The room.
             */
            id: string;
            /** @description Hall, Terrace, VIP. */
            name: string;
            /** @description The room's photos, in order. Empty for a room nobody has photographed yet. */
            photos: components["schemas"]["Yalla.Application.Media.PhotoView"][];
        };
        /**
         * @description The plan as applied, plus what the editor should know: warnings that did not stop it, and which
         *     omitted tables were deactivated rather than deleted because they have history.
         */
        "Yalla.Application.BranchSettings.FloorPlanReplaceResult": {
            /**
             * @description Labels of tables this save took out of service: active before, left out, kept inactive because
             *     they have history. Not the tables already inactive - the editor leaves those out of every save,
             *     and reporting them each time would announce a change nobody made.
             */
            deactivatedTables: string[];
            /** @description The plan now stored. */
            plan: components["schemas"]["Yalla.Application.BranchSettings.FloorPlanView"];
            /** @description Labels of omitted tables deleted outright. */
            removedTables: string[];
            /**
             * @description Things worth fixing that are not errors - today, a bookable table with no pin, which diners are
             *     not offered.
             */
            warnings: string[];
        };
        /** @description The rooms, their photos, and every table with its pin. */
        "Yalla.Application.BranchSettings.FloorPlanView": {
            /** @description The rooms, lowest `displayOrder` first, each with its photos. */
            areas: components["schemas"]["Yalla.Application.BranchSettings.FloorAreaView"][];
            /**
             * Format: uuid
             * @description The branch.
             */
            branchId: string;
            /** @description Every table, inactive ones included. */
            tables: components["schemas"]["Yalla.Application.BranchSettings.FloorTableView"][];
            /**
             * @description The plan's revision, opaque. Send it back as `expectedVersion` on the replace; a save against
             *     an older revision is refused with `floor-plan-changed`.
             */
            version: string;
        };
        /**
         * @description A table as the editor sends it. `Id` matches an existing table; null means new - unless a
         *     table with that label already exists in the branch, in which case it is that table, so its QR
         *     code survives an editor that lost the id.
         */
        "Yalla.Application.BranchSettings.FloorTableInput": {
            /** @description Names a room in the same plan, by name. Null for no room. */
            floorAreaName?: string | null;
            /**
             * Format: uuid
             * @description The existing table this entry edits, or null for one matched by label or created.
             */
            id?: string | null;
            /** @description False for tables that only ever take walk-ins, e.g. bar stools. */
            isBookable: boolean;
            /** @description What is printed on the table. Unique within the branch, and required. */
            label: string;
            /**
             * Format: uuid
             * @description The photo the table is pinned on - one of <b>its own room's</b>`photoIds` in this plan - or
             *     null for no pin. Sent with PhotoX and PhotoY, or all three
             *     null. A diner is only offered a bookable table that has a pin.
             */
            photoId?: string | null;
            /**
             * Format: double
             * @description Where the pin sits, 0 (left) to 1 (right).
             */
            photoX?: number | null;
            /**
             * Format: double
             * @description Where the pin sits, 0 (top) to 1 (bottom).
             */
            photoY?: number | null;
            /**
             * Format: int32
             * @description How many people it seats.
             */
            seats: number;
        };
        /** @description A table as the editor reads it. */
        "Yalla.Application.BranchSettings.FloorTableView": {
            /**
             * Format: uuid
             * @description Its room, or null.
             */
            floorAreaId?: string | null;
            /**
             * Format: uuid
             * @description The table.
             */
            id: string;
            /** @description False for a table deactivated because it has history. */
            isActive: boolean;
            /** @description False for tables that only ever take walk-ins. */
            isBookable: boolean;
            /** @description Whether a delete would remove it rather than deactivate it. */
            isDeletable: boolean;
            /** @description What is printed on it. */
            label: string;
            /**
             * Format: uuid
             * @description The room photo it is pinned on, or null. Always one of its own room's photos.
             */
            photoId?: string | null;
            /**
             * Format: double
             * @description Where the pin sits on that photo, 0 (left) to 1 (right); null with no pin.
             */
            photoX?: number | null;
            /**
             * Format: double
             * @description 0 (top) to 1 (bottom); null with no pin.
             */
            photoY?: number | null;
            /** @description The token behind the QR code on the table. */
            qrToken: string;
            /**
             * Format: int32
             * @description How many it seats.
             */
            seats: number;
            /** @description The <b>physical</b> state of a table: what somebody did to it. */
            status: components["schemas"]["Yalla.Domain.Enums.TableStatus"];
        };
        /** @description One opening block as the client supplies it. `ClosesNextDay` is derived, not sent. */
        "Yalla.Application.BranchSettings.OpeningHoursBlock": {
            /** Format: time */
            closesAt: string;
            day: components["schemas"]["System.DayOfWeek"];
            /** Format: time */
            opensAt: string;
        };
        "Yalla.Application.BranchSettings.OpeningHoursView": {
            /** Format: time */
            closesAt: string;
            closesNextDay: boolean;
            day: components["schemas"]["System.DayOfWeek"];
            /** Format: time */
            opensAt: string;
        };
        /** @description The same settings, as written. All are replaced at once. */
        "Yalla.Application.BranchSettings.PublicProfileCommand": {
            /** @description Whether to offer booking on the public page. */
            acceptsWebBookings: boolean;
            /**
             * Format: uuid
             * @description A photo uploaded for <b>this</b> branch, or null to clear the picture. One uploaded for another
             *     branch is not found here, the same answer a menu item gets for a foreign photo.
             */
            coverPhotoId?: string | null;
            /**
             * @description E.164, e.g. `+37411223344`. Spaces, dashes and brackets are stripped before validation.
             *     Null or blank clears the number.
             */
            phoneE164?: string | null;
        };
        /** @description The two settings that decide what a branch publishes to anybody with its link. */
        "Yalla.Application.BranchSettings.PublicProfileView": {
            /**
             * @description Whether the public page offers booking. See
             *     Yalla.Domain.Venues.Branch.AcceptsWebBookings for why this is false until somebody
             *     says otherwise.
             */
            acceptsWebBookings: boolean;
            /**
             * @description The venue card's picture - the first thing a stranger sees on the public page and in the diner
             *     app's list - or null when there is none yet.
             */
            coverPhoto?: components["schemas"]["Yalla.Application.Media.PhotoView"] | null;
            /** @description The published contact number in E.164, or null when there is none. */
            phoneE164?: string | null;
        };
        /** @description One thing a branch still lacks, as a code and, where it has one, the count behind it. */
        "Yalla.Application.BranchSettings.ReadinessIssue": {
            /** @description One of Yalla.Application.BranchSettings.ReadinessIssueCodes. */
            code: string;
            /**
             * Format: int32
             * @description How many, when the line counts something - the unfinished dishes for
             *     `incomplete-dishes`. Absent for a line that is simply missing.
             */
            count?: number | null;
        };
        /** @description The whole plan - rooms, their photos and every table's pin - replaced in one atomic call. */
        "Yalla.Application.BranchSettings.ReplaceFloorPlanCommand": {
            /** @description Every room in the plan, each with its photos. */
            areas: components["schemas"]["Yalla.Application.BranchSettings.FloorAreaInput"][];
            /**
             * @description <b>Required.</b> The `version` the editor loaded. A plan changed since then is refused with
             *                 `409 floor-plan-changed` and `context.currentVersion`, and nothing is written.
             */
            expectedVersion?: string | null;
            /** @description Every table in the plan, each with its pin or none. */
            tables: components["schemas"]["Yalla.Application.BranchSettings.FloorTableInput"][];
        };
        /** @description The policy after the change, and what the change did <i>not</i> do. */
        "Yalla.Application.BranchSettings.ReservationPolicyChangeResult": {
            /**
             * Format: int32
             * @description How many live bookings now fall outside the new rules - beyond the shortened window, or
             *     booked under a longer turn time. They were <b>not</b> changed: a settings edit never rewrites or
             *     cancels a booking. The new rules apply to future bookings only.
             */
            affectedExistingReservations: number;
            /** @description Which ones, so the panel can show them. */
            affectedReservationIds: string[];
            /** @description The policy now in force, as stored. */
            policy: components["schemas"]["Yalla.Application.BranchSettings.ReservationPolicyView"];
        };
        /** @description Every field of the policy, as written. The whole form is replaced at once. */
        "Yalla.Application.BranchSettings.ReservationPolicyCommand": {
            /** Format: int32 */
            approvalRequiredAbovePartySize?: number | null;
            autoConfirm: boolean;
            /** Format: int32 */
            bookingWindowDays: number;
            /** Format: int32 */
            bufferMinutes: number;
            /** Format: int32 */
            cancellationDeadlineMinutes: number;
            /** Format: int32 */
            graceExtensionMinutes: number;
            /** Format: int32 */
            graceMinutes: number;
            /** Format: int32 */
            lateNudgeAfterMinutes: number;
            /** Format: int32 */
            maxSeatOverhang?: number | null;
            /** Format: int32 */
            minLeadMinutes: number;
            pricesIncludeVat: boolean;
            /** Format: double */
            serviceChargePercent: number;
            /** Format: int32 */
            turnTimeMinutes: number;
            /** Format: int32 */
            walkInHoldbackMinutes: number;
        };
        /** @description Every field of the owned Yalla.Domain.Venues.ReservationPolicy, as read. */
        "Yalla.Application.BranchSettings.ReservationPolicyView": {
            /** Format: int32 */
            approvalRequiredAbovePartySize?: number | null;
            autoConfirm: boolean;
            /** Format: int32 */
            bookingWindowDays: number;
            /** Format: int32 */
            bufferMinutes: number;
            /** Format: int32 */
            cancellationDeadlineMinutes: number;
            /** Format: int32 */
            graceExtensionMinutes: number;
            /** Format: int32 */
            graceMinutes: number;
            /** Format: int32 */
            lateNudgeAfterMinutes: number;
            /** Format: int32 */
            maxSeatOverhang?: number | null;
            /** Format: int32 */
            minLeadMinutes: number;
            pricesIncludeVat: boolean;
            /** Format: double */
            serviceChargePercent: number;
            /** Format: int32 */
            turnTimeMinutes: number;
            /** Format: int32 */
            walkInHoldbackMinutes: number;
        };
        /** @description What deleting a table did: removed outright, or deactivated because it has history. */
        "Yalla.Application.BranchSettings.TableDeletionResult": {
            /** @description Kept and switched off: it has reservations, seatings or tabs. */
            deactivated: boolean;
            /** @description Removed outright: it had never been used. */
            deleted: boolean;
            /**
             * @description The plan's version after the delete. Either outcome changes the plan and moves it, so an editor
             *     that loaded the plan before is refused rather than saving the table back; the editor that made
             *     the delete adopts this to keep its own draft current.
             */
            floorPlanVersion: string;
            /** @description Its label. */
            label: string;
            /** @description Which of the two happened, for the manager. */
            message: string;
            /**
             * Format: uuid
             * @description The table.
             */
            tableId: string;
        };
        /** @description The diner's favourites, newest first. A place that is not published is left out. */
        "Yalla.Application.Diners.DinerFavoriteList": {
            /** @description The favourites. */
            items: components["schemas"]["Yalla.Application.Diners.DinerFavoriteView"][];
        };
        /** @description One of the diner's favourite places (K11). */
        "Yalla.Application.Diners.DinerFavoriteView": {
            /**
             * Format: uuid
             * @description The place.
             */
            branchId: string;
            /**
             * Format: date-time
             * @description When it was hearted.
             */
            createdAtUtc: string;
            /** @description The card, exactly as the public list serves it - with `distanceKm` when `lat`/`lng` were sent. */
            listing: components["schemas"]["Yalla.Application.Public.PublicBranchListing"];
        };
        /** @description A page of the feed, newest first. */
        "Yalla.Application.Diners.DinerNotificationPage": {
            /** @description This page. */
            items: components["schemas"]["Yalla.Application.Diners.DinerNotificationView"][];
            /** @description Pass as `before` for the next page; absent on the last page. */
            nextCursor?: string | null;
            /**
             * Format: int32
             * @description Unread entries across the whole feed, not only this page - the badge.
             */
            unreadCount: number;
        };
        /** @description One entry in the diner's notifications feed (K12). */
        "Yalla.Application.Diners.DinerNotificationView": {
            /**
             * Format: uuid
             * @description The place, when there is one.
             */
            branchId?: string | null;
            /** @description The place's name now, or as written when the branch is gone. */
            branchName?: string | null;
            /**
             * Format: date-time
             * @description When it appeared - for a reminder, when the reminder was due.
             */
            createdAtUtc: string;
            /**
             * @description `booking-reminder`, `booking-confirmed`, `booking-declined`,
             *                 `booking-cancelled-by-venue`, `order-ready` or `review-hidden`. The app writes the text.
             */
            kind: string;
            /**
             * Format: uuid
             * @description The entry; what `upTo` and `ids` name when marking read.
             */
            notificationId: string;
            /**
             * Format: uuid
             * @description The order, for `order-ready`.
             */
            orderId?: string | null;
            /**
             * @description String values the app's text is built from, as they were when the entry was written: for bookings
             *     `venueName`, `branchName`, `date` (yyyy-MM-dd), `time` (HH:mm), `partySize`,
             *     `reservationCode`; for an order `venueName`, `branchName`, `tableLabel`; for a
             *     review `venueName`, `branchName`, `reviewId`.
             */
            params: {
                [key: string]: string;
            };
            /** @description Marked read. */
            read: boolean;
            /**
             * Format: uuid
             * @description The booking, for the booking kinds.
             */
            reservationId?: string | null;
            /**
             * Format: uuid
             * @description The tab, for `order-ready`.
             */
            tabId?: string | null;
        };
        /** @description One line on a diner's order. */
        "Yalla.Application.Diners.DinerOrderItem": {
            /** @description Removed by staff. Kept on the order, at zero, rather than vanishing. */
            isVoided: boolean;
            /**
             * Format: uuid
             * @description The line's id.
             */
            lineId: string;
            /**
             * Format: int64
             * @description Quantity × unit price, or 0 once voided.
             */
            lineTotalAmd: number;
            /** @description The item name as it read when ordered. */
            name: string;
            /** @description The kitchen note, or absent. */
            note?: string | null;
            /**
             * Format: int32
             * @description How many.
             */
            quantity: number;
            /**
             * Format: int64
             * @description Whole dram per unit, as it stood when ordered.
             */
            unitPriceAmd: number;
        };
        /** @description When the order reached a status. */
        "Yalla.Application.Diners.DinerOrderTimelineEntry": {
            /**
             * Format: date-time
             * @description When.
             */
            atUtc: string;
            /** @description An app status - see Yalla.Application.Diners.DinerOrderStatuses. */
            status: string;
        };
        /** @description One order the diner is on, receipt-shaped, for the Orders tab. */
        "Yalla.Application.Diners.DinerOrderView": {
            /**
             * Format: uuid
             * @description The app's `placeId`.
             */
            branchId: string;
            /** @description Which location. */
            branchName: string;
            /** @description Always false. Voiding an order is a staff action on the kitchen rail; a diner has no cancel. */
            canCancel: boolean;
            /** @description The branch's cover, or absent. */
            coverPhoto?: components["schemas"]["Yalla.Application.Media.PhotoView"] | null;
            /**
             * Format: date-time
             * @description The kitchen's estimate, or absent.
             */
            estimatedReadyAtUtc?: string | null;
            /** @description Every line, voided ones included. */
            items: components["schemas"]["Yalla.Application.Diners.DinerOrderItem"][];
            /** @description Always `"dineIn"`: every order in the domain is placed against a table's tab. */
            kind: string;
            /** @description Kitchen-facing progress of one order placed against a tab. */
            kitchenStatus: components["schemas"]["Yalla.Domain.Enums.TabOrderStatus"];
            /**
             * Format: uuid
             * @description The order's id.
             */
            orderId: string;
            /**
             * Format: int32
             * @description The seated party's size.
             */
            partySize: number;
            /**
             * Format: date-time
             * @description When it was sent to the kitchen.
             */
            placedAtUtc: string;
            /** @description App status - see Yalla.Application.Diners.DinerOrderStatuses. */
            status: string;
            /**
             * Format: uuid
             * @description The tab it was placed against.
             */
            tabId: string;
            /** @description The table's label. */
            tableLabel: string;
            /** @description Oldest first; the last entry is the current status. */
            timeline: components["schemas"]["Yalla.Application.Diners.DinerOrderTimelineEntry"][];
            /**
             * Format: int64
             * @description Sum of the non-voided lines, whole dram, before service charge.
             */
            totalAmd: number;
            /** @description The brand name. */
            venueName: string;
        };
        /** @description A diner's own account, as their app shows it on the profile screen. */
        "Yalla.Application.Diners.DinerProfileView": {
            /**
             * Format: uuid
             * @description The account.
             */
            dinerUserId: string;
            /** @description What the venue calls this person. */
            displayName?: string | null;
            /** @description Sign-in address, lowercased. Null until given. */
            email?: string | null;
            /** @description Whether a password sign-in exists. False for a code-only account. */
            hasPassword: boolean;
            /** @description Language for messages: `hy`, `ru` or `en`. */
            localeCode: string;
            /** @description The number on the account. */
            phoneE164: string;
            /** @description Whether a one-time code to that number has ever been passed. */
            phoneVerified: boolean;
            /** @description The profile picture's three links, or null when there is none. */
            photo?: components["schemas"]["Yalla.Application.Media.PhotoView"] | null;
            /** @description Sign-in name, lowercased. Null for an account the code flow created and nobody has filled in. */
            username?: string | null;
        };
        /** @description The signed-in diner's own review of one branch. */
        "Yalla.Application.Diners.DinerReviewView": {
            /**
             * Format: uuid
             * @description The branch it is about.
             */
            branchId: string;
            /**
             * Format: date-time
             * @description First written.
             */
            createdAtUtc: string;
            /** @description Taken down by moderation: the diner still sees it here, nobody else sees it anywhere. */
            hidden: boolean;
            /** @description The name the public list shows it under - see `BranchReview.PublicAuthorName`. */
            publicAuthorName: string;
            /**
             * Format: int32
             * @description 1-5.
             */
            rating: number;
            /**
             * Format: uuid
             * @description The review.
             */
            reviewId: string;
            /** @description Absent when stars only. */
            text?: string | null;
            /**
             * Format: date-time
             * @description When the rating or text last changed. Re-sending the same review does not move it.
             */
            updatedAtUtc: string;
        };
        /** @description Body of `POST /api/diner/notifications/read`. */
        "Yalla.Application.Diners.MarkNotificationsReadCommand": {
            /** @description Marks these entries read; at most 200. */
            ids?: string[] | null;
            /**
             * Format: uuid
             * @description Marks this entry and every older one read.
             */
            upTo?: string | null;
        };
        /** @description Body of `PUT /api/diner/favorites`: hearts made while signed out, merged into the account. */
        "Yalla.Application.Diners.MergeFavoritesCommand": {
            /**
             * @description At most 500. Each is added when missing; nothing is ever removed. An unknown or unpublished place is
             *     skipped rather than refused - a heart made weeks ago may be for a place that has since closed.
             */
            branchIds?: string[] | null;
        };
        /** @description Body of `POST /api/diner/reviews/{reviewId}/report`. */
        "Yalla.Application.Diners.ReportReviewCommand": {
            /** @description Optional detail, at most 500 characters. */
            note?: string | null;
            /** @description `spam`, `offensive`, `not-a-visit`, `personal-info` or `other`. */
            reason?: string | null;
        };
        /** @description Body of the diner's review routes. */
        "Yalla.Application.Diners.SubmitBranchReviewCommand": {
            /**
             * Format: int32
             * @description 1-5 stars.
             */
            rating: number;
            /** @description Optional, at most 1000 characters. Blank clears it. */
            text?: string | null;
        };
        /** @description One entry in a branch's change stream, as a client catching up reads it. */
        "Yalla.Application.Floor.BranchChange": {
            /**
             * Format: uuid
             * @description Who acted. Null only for a System change.
             */
            actorId?: string | null;
            /** @description Who caused a logged change. */
            actorType: components["schemas"]["Yalla.Domain.Enums.ActorType"];
            /**
             * Format: date-time
             * @description When it happened.
             */
            atUtc: string;
            /**
             * Format: uuid
             * @description The table that changed.
             */
            diningTableId: string;
            /** @description The <b>physical</b> state of a table: what somebody did to it. */
            fromStatus: components["schemas"]["Yalla.Domain.Enums.TableStatus"];
            /** @description Free text recorded with the transition. */
            reason: string;
            /**
             * Format: uuid
             * @description The booking involved, when there was one.
             */
            reservationId?: string | null;
            /**
             * Format: int64
             * @description Position in the stream. Strictly increasing per branch.
             */
            sequence: number;
            /** @description Its label, so a client can render without a second lookup. */
            tableLabel: string;
            /**
             * Format: uuid
             * @description The seating opened or closed by this change, when there was one.
             */
            tableSessionId?: string | null;
            /**
             * Format: uuid
             * @description The audit row this came from.
             */
            tableStateChangeId: string;
            /** @description The <b>physical</b> state of a table: what somebody did to it. */
            toStatus: components["schemas"]["Yalla.Domain.Enums.TableStatus"];
        };
        /** @description A page of a branch's change stream, and where the stream currently ends. */
        "Yalla.Application.Floor.BranchChangePage": {
            /**
             * Format: int64
             * @description The sequence the caller asked to start after.
             */
            afterSequence: number;
            /**
             * Format: uuid
             * @description The branch.
             */
            branchId: string;
            /** @description The entries, in sequence order. */
            changes: components["schemas"]["Yalla.Application.Floor.BranchChange"][];
            /** @description True when the page hit its cap and there are further entries before MaxSequence. */
            hasMore: boolean;
            /**
             * Format: int64
             * @description The branch's highest sequence right now. Zero when nothing has happened.
             */
            maxSequence: number;
        };
        /**
         * @description Every active table in one branch with its live state, as of one instant: what the staff floor
         *     screen lists, grouped by room.
         */
        "Yalla.Application.Floor.BranchFloorState": {
            /**
             * Format: date-time
             * @description The instant the derived states were computed for. Every `ReservedSoon` in this
             *     payload is relative to this, not to the client's clock.
             */
            asOfUtc: string;
            /** Format: uuid */
            branchId: string;
            branchName: string;
            /**
             * Format: int64
             * @description The branch's highest change-log sequence at the moment this was read.
             */
            maxSequence: number;
            tables: components["schemas"]["Yalla.Application.Floor.TableFloorState"][];
            /** @description IANA zone, so a client can render Yalla.Application.Floor.TableFloorState.NextReservationStartUtc locally. */
            timeZoneId: string;
        };
        /** @description One table's physical state plus the derived reservation overlay. */
        "Yalla.Application.Floor.TableFloorState": {
            /**
             * Format: uuid
             * @description The open occupancy, when somebody is sitting here.
             */
            currentSessionId?: string | null;
            /** Format: int32 */
            floorAreaDisplayOrder: number;
            /** Format: uuid */
            floorAreaId?: string | null;
            floorAreaName?: string | null;
            /**
             * Format: date-time
             * @description How long this table can be given away for: the next booking's start less the branch's
             *     turnaround buffer. Null when nothing is booked.
             */
            freeUntilUtc?: string | null;
            isBookable: boolean;
            label: string;
            /**
             * Format: uuid
             * @description The next relevant booking, so the staff app can seat it straight from the floor.
             */
            nextReservationId?: string | null;
            /** Format: date-time */
            nextReservationStartUtc?: string | null;
            occupancySource?: components["schemas"]["Yalla.Domain.Enums.TableSessionSource"] | null;
            /**
             * Format: uuid
             * @description The open tab on this table, when the party sitting here has one.
             */
            openTabId?: string | null;
            /** Format: int32 */
            partySize?: number | null;
            /**
             * Format: uuid
             * @description The room photo the table is pinned on, or null when it has no pin. Staff seat an unpinned
             *     table like any other; diners are not offered one.
             */
            photoId?: string | null;
            /**
             * Format: double
             * @description Where the pin sits on Yalla.Application.Floor.TableFloorState.PhotoId, 0-1 across; null when there is no pin.
             */
            photoX?: number | null;
            /**
             * Format: double
             * @description Where the pin sits on Yalla.Application.Floor.TableFloorState.PhotoId, 0-1 down; null when there is no pin.
             */
            photoY?: number | null;
            /** @description The <b>physical</b> state of a table: what somebody did to it. */
            physicalStatus: components["schemas"]["Yalla.Domain.Enums.TableStatus"];
            /** @description The table's row version, base64, as it stood when this floor was read. */
            rowVersion: string;
            /** Format: date-time */
            seatedAtUtc?: string | null;
            /** Format: int32 */
            seats: number;
            /**
             * @description What a client should draw for a table: its physical Yalla.Domain.Enums.TableStatus with the
             *     reservation overlay applied.
             */
            state: components["schemas"]["Yalla.Domain.Enums.DerivedTableState"];
            /** Format: uuid */
            tableId: string;
        };
        /** @description What an upload produced. */
        "Yalla.Application.Media.PhotoUploadResult": {
            /**
             * Format: int64
             * @description Total across the three variants.
             */
            bytesStored: number;
            /** @description SHA-256 of the processed bytes, which is also part of the storage path. */
            contentHash: string;
            /** @description The three links, ready to attach to a menu item or a branch. */
            photo: components["schemas"]["Yalla.Application.Media.PhotoView"];
            /**
             * @description True when these exact bytes were already stored for this branch and the existing photo was
             *     returned. Reported rather than hidden - an upload that wrote nothing looks like a failure.
             */
            wasDeduplicated: boolean;
        };
        /** @description One photo as a client consumes it: three URLs and the id behind them. */
        "Yalla.Application.Media.PhotoView": {
            /** @description Menu card size - what a diner actually looks at. */
            cardUrl: string;
            /** @description The largest kept. */
            fullUrl: string;
            /**
             * Format: int32
             * @description Pixel height of the full variant. Null for a migrated photo.
             */
            height?: number | null;
            /**
             * Format: uuid
             * @description The photo row.
             */
            photoId: string;
            /** @description Small square, for lists and the floor screen. */
            thumbnailUrl: string;
            /**
             * Format: int32
             * @description Pixel width of the full variant. Null for a migrated photo.
             */
            width?: number | null;
        };
        /** @description One branch's whole menu, as a diner reads it. */
        "Yalla.Application.Menus.BranchMenuView": {
            /**
             * Format: uuid
             * @description The branch. Menus belong to branches, not venues - see `SCHEMA.md`.
             */
            branchId: string;
            /** @description Every category in display order, each with its items. */
            categories: components["schemas"]["Yalla.Application.Menus.MenuCategoryView"][];
        };
        "Yalla.Application.Menus.CreateMenuCategoryCommand": {
            /** Format: int32 */
            displayOrder: number;
            name: string;
        };
        /** @description A new item. Only a name and a price are required. */
        "Yalla.Application.Menus.CreateMenuItemCommand": {
            allergens?: string | null;
            description?: string | null;
            /** Format: int32 */
            displayOrder: number;
            ingredients?: string | null;
            name: string;
            /** Format: uuid */
            photoId?: string | null;
            portionSize?: string | null;
            /** Format: int32 */
            prepMinutes?: number | null;
            /** Format: int64 */
            priceAmd: number;
            /** @description How hot a dish is, so the diner does not have to ask. */
            spiceLevel: components["schemas"]["Yalla.Domain.Enums.SpiceLevel"];
        };
        "Yalla.Application.Menus.MenuCategoryView": {
            /** Format: int32 */
            displayOrder: number;
            /** Format: uuid */
            id: string;
            items: components["schemas"]["Yalla.Application.Menus.MenuItemView"][];
            name: string;
        };
        /** @description What deleting an item did: removed, or deactivated because order lines reference it. */
        "Yalla.Application.Menus.MenuItemDeletionResult": {
            deactivated: boolean;
            deleted: boolean;
            /** Format: uuid */
            itemId: string;
            message: string;
        };
        /** @description One menu item as a client reads it. */
        "Yalla.Application.Menus.MenuItemView": {
            allergens?: string | null;
            /** Format: uuid */
            categoryId: string;
            description?: string | null;
            /** Format: int32 */
            displayOrder: number;
            /** Format: uuid */
            id: string;
            ingredients?: string | null;
            isAvailable: boolean;
            isComplete: boolean;
            name: string;
            /** @description One photo as a client consumes it: three URLs and the id behind them. */
            photo?: components["schemas"]["Yalla.Application.Media.PhotoView"] | null;
            portionSize?: string | null;
            /** Format: int32 */
            prepMinutes?: number | null;
            /** Format: int64 */
            priceAmd: number;
            /** @description How hot a dish is, so the diner does not have to ask. */
            spiceLevel: components["schemas"]["Yalla.Domain.Enums.SpiceLevel"];
        };
        "Yalla.Application.Menus.UpdateMenuCategoryCommand": {
            /** Format: int32 */
            displayOrder?: number | null;
            name?: string | null;
        };
        /** @description Patch an item. Only supplied fields change; null means "not supplied", never "clear this". */
        "Yalla.Application.Menus.UpdateMenuItemCommand": {
            allergens?: string | null;
            /** Format: uuid */
            categoryId?: string | null;
            description?: string | null;
            /** Format: int32 */
            displayOrder?: number | null;
            ingredients?: string | null;
            name?: string | null;
            /** Format: uuid */
            photoId?: string | null;
            portionSize?: string | null;
            /** Format: int32 */
            prepMinutes?: number | null;
            /** Format: int64 */
            priceAmd?: number | null;
            spiceLevel?: components["schemas"]["Yalla.Domain.Enums.SpiceLevel"] | null;
        };
        /** @description One message nobody is going to retry. */
        "Yalla.Application.Messaging.DeadLetterView": {
            /**
             * Format: int32
             * @description How many times it was tried before being given up on.
             */
            attemptCount: number;
            /**
             * Format: date-time
             * @description When it was given up on.
             */
            deadLetteredAtUtc?: string | null;
            /**
             * Format: uuid
             * @description The message.
             */
            id: string;
            /** @description What caused it - this names the booking or the tab. */
            idempotencyKey: string;
            /** @description Why. The first thing to read. */
            lastError?: string | null;
            /**
             * Format: date-time
             * @description When it was due.
             */
            scheduledForUtc: string;
            /** @description What it was, e.g. `reservation.reminder`. */
            type: string;
        };
        /** @description What the platform view shows about the outbox. */
        "Yalla.Application.Messaging.OutboxHealthView": {
            /**
             * Format: int32
             * @description Given up on. These need a person.
             */
            deadLettered: number;
            /**
             * Format: int32
             * @description Given up on in the last twenty-four hours: the messages that recently failed to reach somebody, which
             *     is what the console's Home alert counts. DeadLettered is every one ever.
             */
            deadLetteredLastDay: number;
            /** @description The dead-lettered messages themselves, newest first. */
            deadLetters: components["schemas"]["Yalla.Application.Messaging.DeadLetterView"][];
            /**
             * Format: int32
             * @description Pending and due now - the backlog, if there is one.
             */
            due: number;
            /**
             * Format: int32
             * @description Pending with at least one failed attempt behind them.
             */
            failed: number;
            /**
             * Format: int32
             * @description Written, not yet sent, not dead. Includes ones not yet due.
             */
            pending: number;
            /**
             * Format: int32
             * @description Sent in the last twenty-four hours, so "nothing is sending" is visible.
             */
            sentLastDay: number;
        };
        /** @description An adjustment as the diner sees it, reason included. */
        "Yalla.Application.Ordering.AdjustmentView": {
            /**
             * Format: uuid
             * @description The adjustment.
             */
            adjustmentId: string;
            /**
             * Format: int64
             * @description Flat dram off, when that is how it was expressed.
             */
            amountAmd?: number | null;
            /**
             * Format: date-time
             * @description When.
             */
            createdAtUtc: string;
            /** @description True once reversed. It stays on the record either way. */
            isVoided: boolean;
            /** @description Why money is coming off a bill. */
            kind: components["schemas"]["Yalla.Domain.Enums.AdjustmentKind"];
            /**
             * Format: double
             * @description Percentage off, when that is how it was expressed.
             */
            percent?: number | null;
            /** @description Why. Shown to the diner for the same reason a void is. */
            reason: string;
            /**
             * Format: int64
             * @description What it actually took off, in whole dram.
             */
            reductionAmd: number;
            /**
             * Format: uuid
             * @description The line it applies to, or null for the whole tab.
             */
            tabOrderLineId?: string | null;
        };
        /** @description A cash payment, as recorded. */
        "Yalla.Application.Ordering.CashPaymentView": {
            /**
             * Format: int64
             * @description What was taken against the balance.
             */
            amountAmd: number;
            /**
             * Format: uuid
             * @description The payment.
             */
            paymentId: string;
            /** @description Lifecycle of a payment attempt. */
            status: components["schemas"]["Yalla.Domain.Enums.PaymentStatus"];
            /** @description True when this payment settled the bill and closed the tab. */
            tabClosed: boolean;
            /**
             * Format: int64
             * @description The tab's event sequence after this payment.
             */
            tabEventSequence: number;
            /**
             * Format: uuid
             * @description The tab.
             */
            tabId: string;
            /**
             * @description True when closing the tab also closed the sitting. The <b>table is not freed</b> by this -
             *     that stays an explicit waiter action, because physical and financial state are independent.
             */
            tableSessionClosed: boolean;
            /**
             * Format: uuid
             * @description Who handed it over, when known.
             */
            tabParticipantId?: string | null;
            /**
             * Format: int64
             * @description The tip, which is not part of the balance.
             */
            tipAmd: number;
            /** @description The tab's totals after it. */
            totals: components["schemas"]["Yalla.Application.Ordering.TabTotalsSnapshot"];
            /** @description True when the command had already been applied. */
            wasReplay: boolean;
        };
        /** @description An order on the kitchen queue. */
        "Yalla.Application.Ordering.KitchenOrderView": {
            /**
             * Format: date-time
             * @description When it is due.
             */
            estimatedReadyAtUtc?: string | null;
            /** @description What to cook, with the kitchen notes. */
            lines: components["schemas"]["Yalla.Application.Ordering.OrderLineView"][];
            /**
             * Format: uuid
             * @description The order.
             */
            orderId: string;
            /**
             * Format: date-time
             * @description When it was sent.
             */
            placedAtUtc: string;
            /** @description Kitchen-facing progress of one order placed against a tab. */
            status: components["schemas"]["Yalla.Domain.Enums.TabOrderStatus"];
            /**
             * Format: uuid
             * @description Its tab.
             */
            tabId: string;
            /** @description Which table to take it to. */
            tableLabel: string;
            /**
             * Format: int32
             * @description How long it has been waiting, at the moment of reading.
             */
            waitingMinutes: number;
        };
        /** @description One line as it was placed, for the order confirmation and the kitchen queue. */
        "Yalla.Application.Ordering.OrderLineView": {
            /** @description Split across the table. */
            isShared: boolean;
            /** @description Nobody owns it: the waiter could not say who ordered it. */
            isTableAttributed: boolean;
            /**
             * Format: uuid
             * @description The line.
             */
            lineId: string;
            /**
             * Format: int64
             * @description Unit price times quantity. Zero once voided.
             */
            lineTotalAmd: number;
            /**
             * Format: uuid
             * @description The item it came from.
             */
            menuItemId: string;
            /** @description The name snapshotted at order time. */
            name: string;
            /** @description The kitchen note. */
            note?: string | null;
            /**
             * Format: int32
             * @description How many.
             */
            quantity: number;
            /** @description Who it splits across, snapshotted at order time. */
            sharedWithParticipantIds: string[];
            /**
             * Format: int64
             * @description The price snapshotted at order time.
             */
            unitPriceAmd: number;
        };
        /** @description An order as it was accepted. */
        "Yalla.Application.Ordering.OrderView": {
            /**
             * Format: date-time
             * @description From the longest prep time on the order, not the sum: a kitchen cooks an order together.
             */
            estimatedReadyAtUtc?: string | null;
            /** @description What was ordered. */
            lines: components["schemas"]["Yalla.Application.Ordering.OrderLineView"][];
            /**
             * Format: uuid
             * @description Who a spoken order was for, when the waiter knew.
             */
            onBehalfOfParticipantId?: string | null;
            /**
             * Format: uuid
             * @description The order.
             */
            orderId: string;
            /**
             * Format: date-time
             * @description When.
             */
            placedAtUtc: string;
            /**
             * Format: uuid
             * @description The diner who ordered from their phone.
             */
            placedByParticipantId?: string | null;
            /**
             * Format: uuid
             * @description The waiter who keyed it in.
             */
            placedByStaffId?: string | null;
            /** @description Kitchen-facing progress of one order placed against a tab. */
            status: components["schemas"]["Yalla.Domain.Enums.TabOrderStatus"];
            /**
             * Format: int64
             * @description The tab's event sequence after this order, for a live client.
             */
            tabEventSequence: number;
            /**
             * Format: uuid
             * @description The tab it went on.
             */
            tabId: string;
            /**
             * @description Whether Totals is present: for staff, and for a diner allowed the table total -
             *     the rule `tableTotalVisible` on their tab follows.
             */
            tableTotalVisible: boolean;
            /**
             * @description The tab's totals as they stand after this order. <b>Absent</b> for a diner the host hid the
             *     total from - an order of their own is no way round the hidden bill. Never zeroed.
             */
            totals?: components["schemas"]["Yalla.Application.Ordering.TabTotalsSnapshot"] | null;
            /** @description True when the command had already been applied and this is the original answer. */
            wasReplay: boolean;
        };
        /** @description What one person owes. See `docs/billing.md` for the arithmetic. */
        "Yalla.Application.Ordering.ParticipantShareView": {
            /**
             * Format: int64
             * @description What fell to them because somebody removed from the tab cannot pay for what they ate. Non-zero
             *     only for the host, and stated rather than folded in silently.
             */
            absorbedFromRemovedAmd: number;
            /** @description Their name on the tab. */
            displayName: string;
            /**
             * Format: int64
             * @description Their own unshared lines.
             */
            ownItemsAmd: number;
            /**
             * Format: int64
             * @description What they have settled. Reported, never netted off the share.
             */
            paidAmd: number;
            /**
             * Format: uuid
             * @description The participant.
             */
            participantId: string;
            /**
             * Format: int64
             * @description Their part of the subtotal.
             */
            personalAmd: number;
            /**
             * Format: int64
             * @description Their pro-rata slice of the service charge.
             */
            serviceChargeAmd: number;
            /**
             * Format: int64
             * @description What they owe. These sum to the tab total exactly.
             */
            shareAmd: number;
            /**
             * Format: int64
             * @description Their slice of shared and table-attributed lines.
             */
            sharedItemsAmd: number;
            /** @description Whether a participant is allowed on the tab. */
            status: components["schemas"]["Yalla.Domain.Enums.ParticipantStatus"];
        };
        /** @description A table asking for something. */
        "Yalla.Application.Ordering.ServiceRequestView": {
            /**
             * Format: date-time
             * @description When a waiter picked it up, if they have.
             */
            acknowledgedAtUtc?: string | null;
            /**
             * Format: int64
             * @description What that scope left to pay when the diner asked, in whole dram - service charge included, tip
             *     excluded. Priced by the server, so the waiter brings the number the diner was shown. Absent with
             *     BillScope.
             */
            billAmountAmd?: number | null;
            /**
             * @description On a request for the bill that said whose part: 1 WholeBill, 2 MyShare. Absent on every other
             *     request.
             */
            billScope?: components["schemas"]["Yalla.Domain.Enums.BillScope"] | null;
            /**
             * Format: date-time
             * @description When.
             */
            createdAtUtc: string;
            /** @description The one optional line. */
            note?: string | null;
            /** @description What a table is asking for. Presets only - see `docs/tabs.md`. */
            preset: components["schemas"]["Yalla.Domain.Enums.ServiceRequestPreset"];
            /**
             * Format: uuid
             * @description Who asked.
             */
            requestedByParticipantId?: string | null;
            /**
             * Format: uuid
             * @description The request.
             */
            serviceRequestId: string;
            /**
             * Format: int64
             * @description Where the tab's event stream stands. Raising or acknowledging a request appends an event, so the
             *     response says where that left the stream - otherwise the phone that just called a waiter is the
             *     one client guaranteed to be behind. Zero on the branch-wide list, which spans many tabs and so
             *     has no single stream to be caught up with.
             */
            tabEventSequence: number;
            /**
             * Format: uuid
             * @description Its tab.
             */
            tabId: string;
            /** @description Which table to walk to. */
            tableLabel: string;
            /**
             * Format: int64
             * @description That tip in whole dram, on top of BillAmountAmd and outside the bill, like a
             *     cash payment's `tipAmd`. Absent with TipPercent.
             */
            tipAmd?: number | null;
            /**
             * Format: int32
             * @description The tip the diner chose, 0 to 25. Absent when none was asked.
             */
            tipPercent?: number | null;
            /**
             * Format: int32
             * @description How long they have been waiting.
             */
            waitingMinutes: number;
        };
        /** @description A page of a tab's event stream. */
        "Yalla.Application.Ordering.TabEventPage": {
            /**
             * Format: int64
             * @description What the caller already had.
             */
            afterSequence: number;
            /** @description The events, oldest first. */
            events: components["schemas"]["Yalla.Application.Ordering.TabEventView"][];
            /** @description True when more remain past this page. */
            hasMore: boolean;
            /**
             * Format: int64
             * @description The newest position on the tab, whether or not it is in this page.
             */
            maxSequence: number;
            /**
             * Format: uuid
             * @description The tab.
             */
            tabId: string;
        };
        /** @description One thing that happened on a tab. */
        "Yalla.Application.Ordering.TabEventView": {
            /**
             * Format: uuid
             * @description Who, when there is a who.
             */
            actorId?: string | null;
            /** @description Who caused a logged change. */
            actorType: components["schemas"]["Yalla.Domain.Enums.ActorType"];
            /**
             * Format: date-time
             * @description When.
             */
            atUtc: string;
            /** @description The details, shaped per type. */
            payload: unknown;
            /**
             * Format: int64
             * @description This event's place on its tab, from 1. Ask for everything after the one you hold.
             */
            sequence: number;
            /** @description What happened on a tab, for the catch-up stream. */
            type: components["schemas"]["Yalla.Domain.Enums.TabEventType"];
        };
        /** @description Who owes what on a tab, projected through the caller's own visibility. */
        "Yalla.Application.Ordering.TabSharesView": {
            /**
             * Format: int64
             * @description How much fell to the host from removed participants.
             */
            absorbedFromRemovedAmd: number;
            /**
             * Format: int64
             * @description Where the tab's event stream stands, so a client that just read the split knows whether it has
             *     missed anything. Prompt 8 said every tab response carries it; this one did not, which made the
             *     bill screen - the screen where being out of date matters most - the one that had to ask twice.
             */
            maxSequence: number;
            /** @description The caller's own share. Always present. */
            myShare?: components["schemas"]["Yalla.Application.Ordering.ParticipantShareView"] | null;
            /** @description Everyone's share. Absent when not visible. */
            shares?: components["schemas"]["Yalla.Application.Ordering.ParticipantShareView"][] | null;
            /**
             * Format: uuid
             * @description The tab.
             */
            tabId: string;
            /** @description Whether the two members below are present. */
            tableTotalVisible: boolean;
            /** @description The table aggregate. Absent when not visible. */
            totals?: components["schemas"]["Yalla.Application.Ordering.TabTotalsSnapshot"] | null;
        };
        /** @description The tab's money, in whole dram. Server-computed; a client only ever displays it. */
        "Yalla.Application.Ordering.TabTotalsSnapshot": {
            /**
             * Format: int64
             * @description Settled so far. Tips excluded.
             */
            paidAmd: number;
            /**
             * Format: int64
             * @description Still owed.
             */
            remainingAmd: number;
            /**
             * Format: int64
             * @description Charged on the post-discount subtotal.
             */
            serviceChargeAmd: number;
            /**
             * Format: int64
             * @description Lines less adjustments.
             */
            subtotalAmd: number;
            /**
             * Format: int64
             * @description Subtotal plus service charge.
             */
            totalAmd: number;
        };
        /** @description Who acted. */
        "Yalla.Application.Platform.ActivityActor": {
            /** @description Their name when they acted; absent for a row from before names were kept. */
            displayName?: string | null;
            /** @description Their role when they acted: 5 is the platform admin, the rest a venue's own staff. */
            role?: components["schemas"]["Yalla.Domain.Enums.StaffRole"] | null;
            /**
             * Format: uuid
             * @description Their staff row.
             */
            staffMemberId: string;
        };
        /** @description One audit row as the console's activity feed shows it. */
        "Yalla.Application.Platform.ActivityEntry": {
            /**
             * @description The stable slug - `venue.create`, `venue.update`, `venue.suspend`,
             *     `venue.reactivate`, `venue.delete`, `branch.create`, `branch.update`,
             *     `branch.tier-change`, `branch.relocate`, `staff.create`, `staff.sign-in-issued`,
             *     `venue.restore`, `review.hide`, `review.unhide`, `review.dismiss-reports`, `table.regenerate-qr`,
             *     `admin.rename`, `admin.password-change`.
             */
            action: string;
            /** @description Who did it, as they were called then. */
            actor: components["schemas"]["Yalla.Application.Platform.ActivityActor"];
            /**
             * Format: date-time
             * @description When it happened.
             */
            atUtc: string;
            /** @description The row's JSON as written - its shape is per action (docs/platform-admin.md). */
            detail?: unknown;
            /**
             * Format: uuid
             * @description The row.
             */
            id: string;
            /** @description What it was done to, as it was called then. */
            target: components["schemas"]["Yalla.Application.Platform.ActivityTarget"];
            /** @description The venue it concerns, by its current name; absent for the admin's own account. */
            venue?: components["schemas"]["Yalla.Application.Platform.ActivityVenue"] | null;
        };
        /** @description The newest audit rows, newest first. */
        "Yalla.Application.Platform.ActivityFeed": {
            items: components["schemas"]["Yalla.Application.Platform.ActivityEntry"][];
        };
        /** @description What was acted on. */
        "Yalla.Application.Platform.ActivityTarget": {
            /**
             * @description Its name then - a table's label, a person's name; for a review, the branch it is about, because the
             *     reviewer is a diner and is not named in the log.
             */
            displayName?: string | null;
            /**
             * Format: uuid
             * @description Its id.
             */
            id: string;
            /** @description `Venue`, `Branch`, `StaffMember`, `BranchReview`, `DiningTable`. */
            type: string;
        };
        /** @description The venue an entry concerns. */
        "Yalla.Application.Platform.ActivityVenue": {
            name: string;
            /** Format: uuid */
            venueId: string;
        };
        /** @description Bookings by outcome. See Yalla.Application.Platform.BookingBucket for which statuses each counts. */
        "Yalla.Application.Platform.BookingStatusCounts": {
            /**
             * Format: int32
             * @description Cancelled by either side, rejections included.
             */
            cancelled: number;
            /**
             * Format: int32
             * @description Seated or completed: they came.
             */
            completed: number;
            /**
             * Format: int32
             * @description Nobody came.
             */
            noShow: number;
            /**
             * Format: int32
             * @description Still waiting for the venue to approve.
             */
            pendingApproval: number;
            /**
             * Format: int32
             * @description Confirmed and not seated - still ahead, or late and not yet marked.
             */
            upcoming: number;
        };
        /** @description One branch's share of the window, and its bookings today. */
        "Yalla.Application.Platform.BranchBookingCounts": {
            /**
             * Format: uuid
             * @description The branch.
             */
            branchId: string;
            /**
             * Format: int32
             * @description Cancelled by either side.
             */
            cancelled: number;
            /**
             * Format: int32
             * @description Seated or completed.
             */
            completed: number;
            /** @description Its name. */
            name: string;
            /**
             * Format: int32
             * @description Nobody came.
             */
            noShow: number;
            /**
             * Format: int32
             * @description Waiting for approval.
             */
            pendingApproval: number;
            /**
             * Format: int32
             * @description Bookings for the branch's today, cancelled ones left out - the venue page's branch table.
             */
            todayCount: number;
            /**
             * Format: int32
             * @description Its bookings in the window.
             */
            total: number;
            /**
             * Format: int32
             * @description Confirmed and not seated.
             */
            upcoming: number;
        };
        /** @description One branch as the platform's venue page shows it. */
        "Yalla.Application.Platform.BranchSummary": {
            /** @description Street address. */
            address: string;
            /**
             * Format: uuid
             * @description The branch.
             */
            branchId: string;
            /** @description As the listing form saved it. */
            district?: string | null;
            /** @description Whether the branch is switched on. */
            isActive: boolean;
            /**
             * Format: double
             * @description The map pin.
             */
            latitude: number;
            /**
             * Format: double
             * @description The map pin.
             */
            longitude: number;
            /** @description Its name. */
            name: string;
            /**
             * Format: int32
             * @description Tabs open or closing at the branch right now.
             */
            openTabCount: number;
            /** @description URL segment, unique within the venue. */
            slug: string;
            /**
             * @description What a <b>branch</b> pays for. Stored per branch, never per venue: a chain with four locations
             *     is four paying customers. The venue-level view is a rollup.
             */
            subscriptionTier: components["schemas"]["Yalla.Domain.Enums.SubscriptionTier"];
            /**
             * Format: int32
             * @description Active tables. A table kept only for its history is not counted.
             */
            tableCount: number;
            /** @description IANA zone; every local time at the branch is in it. */
            timeZoneId: string;
            /**
             * Format: uuid
             * @description Its venue.
             */
            venueId: string;
        };
        /** @description One branch's tier and what it still lacks, as the venue list shows it. */
        "Yalla.Application.Platform.BranchTierView": {
            /**
             * Format: uuid
             * @description The branch.
             */
            branchId: string;
            /** @description The branch's district as the listing form saved it; absent when it has none. */
            district?: string | null;
            /** @description Whether the branch is switched on. */
            isActive: boolean;
            /**
             * @description What a guest would find missing at the branch, in checklist order: `no-tables`, `no-menu`,
             *     `incomplete-dishes` (with `count`), `no-hours`, then `no-photo`. Empty when there
             *     is nothing to do. Always empty for a deleted venue, which is not worked out. The full checklist is
             *     `GET /api/branches/{id}/readiness`.
             */
            issues: components["schemas"]["Yalla.Application.BranchSettings.ReadinessIssue"][];
            /** @description Its name. */
            name: string;
            /**
             * @description What a <b>branch</b> pays for. Stored per branch, never per venue: a chain with four locations
             *     is four paying customers. The venue-level view is a rollup.
             */
            subscriptionTier: components["schemas"]["Yalla.Domain.Enums.SubscriptionTier"];
        };
        /** @description Add a branch. The tier is per branch - a chain with four locations pays four times. */
        "Yalla.Application.Platform.CreateBranchCommand": {
            address: string;
            /** Format: double */
            latitude: number;
            /** Format: double */
            longitude: number;
            name: string;
            slug: string;
            /**
             * @description What a <b>branch</b> pays for. Stored per branch, never per venue: a chain with four locations
             *     is four paying customers. The venue-level view is a rollup.
             */
            subscriptionTier: components["schemas"]["Yalla.Domain.Enums.SubscriptionTier"];
            timeZoneId: string;
        };
        /** @description Create a venue together with its first branch. A venue with no branch is useless. */
        "Yalla.Application.Platform.CreateVenueCommand": {
            /** @description Add a branch. The tier is per branch - a chain with four locations pays four times. */
            firstBranch: components["schemas"]["Yalla.Application.Platform.CreateBranchCommand"];
            name: string;
            slug: string;
            /** @description What kind of place a venue is. Drives the shipped reservation-policy defaults. */
            type: components["schemas"]["Yalla.Domain.Enums.VenueType"];
        };
        /** @description One day's count. */
        "Yalla.Application.Platform.DailyCount": {
            /**
             * Format: int32
             * @description Bookings for that day.
             */
            count: number;
            /**
             * Format: date
             * @description The day, in Yalla.Application.Platform.OverviewBookings.LabelTimeZoneId.
             */
            date: string;
        };
        /** @description A branch that is not ready, and why. */
        "Yalla.Application.Platform.NotReadyBranch": {
            /**
             * Format: uuid
             * @description The branch.
             */
            branchId: string;
            /** @description The branch's name. */
            branchName: string;
            /**
             * @description What a guest would find missing (M:Yalla.Application.Platform.PlatformRollups.GuestFacingIssues(System.Collections.Generic.IEnumerable{Yalla.Application.BranchSettings.ReadinessIssue},System.Boolean)): `no-tables`,
             *     `no-menu`, `incomplete-dishes`, `no-hours`, `no-photo`. The card shows the first.
             */
            issues: components["schemas"]["Yalla.Application.BranchSettings.ReadinessIssue"][];
            /**
             * Format: uuid
             * @description Its venue.
             */
            venueId: string;
            /** @description The venue's name. */
            venueName: string;
        };
        /**
         * @description Bookings by the day of the visit. A booking counts on the branch's own local date; cancelled ones
         *     are left out (a request the venue rejected is a cancellation). Venues that are deleted are left out.
         */
        "Yalla.Application.Platform.OverviewBookings": {
            /**
             * Format: double
             * @description Last7Days against Previous7Days, in percent to one decimal;
             *                 absent when the previous week had none.
             */
            changePercent?: number | null;
            /**
             * @description The zone the Yalla.Application.Platform.DailyCount.Date labels are written in: the one most branches share. Each
             *     branch is counted on its own calendar, aligned so the last entry is every branch's today.
             */
            labelTimeZoneId: string;
            /**
             * Format: int32
             * @description Today and the six days before it.
             */
            last7Days: number;
            /** @description Thirty entries, oldest first, the last one today. The 14-day chart is the last fourteen. */
            perDay: components["schemas"]["Yalla.Application.Platform.DailyCount"][];
            /**
             * Format: int32
             * @description The seven days before those.
             */
            previous7Days: number;
        };
        /** @description The branches still not ready for diners. */
        "Yalla.Application.Platform.OverviewNotReady": {
            /** @description The first twenty, by venue name then branch name. */
            branches: components["schemas"]["Yalla.Application.Platform.NotReadyBranch"][];
            /**
             * Format: int32
             * @description How many branches.
             */
            total: number;
        };
        /** @description The outbox's counts. */
        "Yalla.Application.Platform.OverviewOutbox": {
            /**
             * Format: int32
             * @description Given up on, ever.
             */
            deadLettered: number;
            /**
             * Format: int32
             * @description Given up on in the last 24 hours - what Home's alert counts.
             */
            deadLetteredLastDay: number;
            /**
             * Format: int32
             * @description Pending and due now.
             */
            due: number;
            /**
             * Format: int32
             * @description Pending with at least one failed attempt.
             */
            failed: number;
            /**
             * Format: int32
             * @description Written, not yet sent, not dead.
             */
            pending: number;
            /**
             * Format: int32
             * @description Sent in the last 24 hours.
             */
            sentLastDay: number;
        };
        /** @description A total and the venues it is made of. */
        "Yalla.Application.Platform.OverviewVenueCounter": {
            /**
             * Format: int32
             * @description The sum over every venue.
             */
            total: number;
            /** @description Each venue with any, the most first, then by name. */
            venues: components["schemas"]["Yalla.Application.Platform.VenueCount"][];
        };
        /**
         * @description Venue counts. Everything but Deleted counts venues that are not deleted; the tier
         *     split is per venue, from its branches' tiers (Yalla.Application.Platform.TierMix).
         */
        "Yalla.Application.Platform.OverviewVenueCounts": {
            /**
             * Format: int32
             * @description Active (see Yalla.Application.Platform.VenueStatus).
             */
            active: number;
            /**
             * Format: int32
             * @description Branches of the venues in Total.
             */
            branches: number;
            /**
             * Format: int32
             * @description Soft-deleted - outside every other number here.
             */
            deleted: number;
            /**
             * Format: int32
             * @description No branch paid, or no branch.
             */
            free: number;
            /**
             * Format: int32
             * @description Switched off.
             */
            inactive: number;
            /**
             * Format: int32
             * @description Some branches paid.
             */
            mixed: number;
            /**
             * Format: int32
             * @description Every branch paid.
             */
            paid: number;
            /**
             * Format: int32
             * @description How many of those are paid.
             */
            paidBranches: number;
            /**
             * Format: int32
             * @description Suspended.
             */
            suspended: number;
            /**
             * Format: int32
             * @description Venues not deleted: Paid + Mixed + Free.
             */
            total: number;
        };
        "Yalla.Application.Platform.PagedResult`1[[Yalla.Application.Platform.VenueSummary, Yalla.Application, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]]": {
            items: components["schemas"]["Yalla.Application.Platform.VenueSummary"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            totalCount: number;
        };
        /** @description The signed-in platform admin's own account. */
        "Yalla.Application.Platform.PlatformAdminProfile": {
            /**
             * @description The sign-in address. Fixed: it is `PlatformAdmin:Email` in configuration, and the seed finds the
             *     account by it, so there is no endpoint that changes it.
             */
            email: string;
            /** @description The name the console shows and the audit log records. Theirs to change. */
            fullName: string;
            /**
             * Format: uuid
             * @description Their staff row.
             */
            staffMemberId: string;
        };
        /**
         * @description Everything the platform console's Home shows, in one read. <b>Aggregates only</b>: no guest's name,
         *     phone or booking code is in it, at any depth.
         */
        "Yalla.Application.Platform.PlatformOverview": {
            /** @description Bookings per day for the last 30 days and the week-on-week change. */
            bookings: components["schemas"]["Yalla.Application.Platform.OverviewBookings"];
            /**
             * Format: date-time
             * @description When this was worked out.
             */
            generatedAtUtc: string;
            /** @description Branches diners can reach that a guest would find unfinished. */
            notReady: components["schemas"]["Yalla.Application.Platform.OverviewNotReady"];
            /** @description Tabs open or closing right now, per venue. */
            openTabs: components["schemas"]["Yalla.Application.Platform.OverviewVenueCounter"];
            /** @description The message outbox's counts - the same numbers `GET /api/platform/outbox` serves. */
            outbox: components["schemas"]["Yalla.Application.Platform.OverviewOutbox"];
            /** @description Booking requests still waiting for a venue to approve them, per venue. */
            pendingApprovals: components["schemas"]["Yalla.Application.Platform.OverviewVenueCounter"];
            /** @description The five newest venues that are not deleted, newest first. */
            recentVenues: components["schemas"]["Yalla.Application.Platform.RecentVenue"][];
            /** @description How many venues there are, by tier and by state. */
            venues: components["schemas"]["Yalla.Application.Platform.OverviewVenueCounts"];
        };
        /** @description A recently added venue, as Home's table shows it. */
        "Yalla.Application.Platform.RecentVenue": {
            /** Format: int32 */
            branchCount: number;
            /** Format: date-time */
            createdAtUtc: string;
            name: string;
            /** Format: int32 */
            paidBranchCount: number;
            slug: string;
            /** @description A venue's state, as one value. Derived from the venue's flags; never stored. */
            status: components["schemas"]["Yalla.Application.Platform.VenueStatus"];
            /** @description How a venue's branches are spread over the tiers. Derived; never stored. */
            tierMix: components["schemas"]["Yalla.Application.Platform.TierMix"];
            /** @description What kind of place a venue is. Drives the shipped reservation-policy defaults. */
            type: components["schemas"]["Yalla.Domain.Enums.VenueType"];
            /** Format: uuid */
            venueId: string;
        };
        /**
         * Format: int32
         * @description How a venue's branches are spread over the tiers. Derived; never stored.
         *
         *     Values: 1 Free, 2 Mixed, 3 Paid.
         * @enum {integer}
         */
        "Yalla.Application.Platform.TierMix": 1 | 2 | 3;
        /** @description Patch a branch. Every field optional; only the ones supplied change. Coordinates and address travel together. */
        "Yalla.Application.Platform.UpdateBranchCommand": {
            address?: string | null;
            isActive?: boolean | null;
            /** Format: double */
            latitude?: number | null;
            /** Format: double */
            longitude?: number | null;
            name?: string | null;
            subscriptionTier?: components["schemas"]["Yalla.Domain.Enums.SubscriptionTier"] | null;
            timeZoneId?: string | null;
        };
        /** @description Patch a venue. Every field optional; only the ones supplied change. */
        "Yalla.Application.Platform.UpdateVenueCommand": {
            isActive?: boolean | null;
            name?: string | null;
            slug?: string | null;
            type?: components["schemas"]["Yalla.Domain.Enums.VenueType"] | null;
        };
        /**
         * @description One venue's bookings over the last 7 or 30 days, as counts, for the venue page. <b>Aggregates
         *     only</b>: no guest's name, phone or code.
         */
        "Yalla.Application.Platform.VenueBookingsSummary": {
            /**
             * Format: double
             * @description The average party of the bookings not cancelled, to one decimal; absent with none.
             */
            averagePartySize?: number | null;
            /** @description Every branch of the venue, by name, each listed even with none. */
            byBranch: components["schemas"]["Yalla.Application.Platform.BranchBookingCounts"][];
            /** @description The total, split by outcome. */
            byStatus: components["schemas"]["Yalla.Application.Platform.BookingStatusCounts"];
            /**
             * @description All seven days, Sunday (0) to Saturday (6) as System.DayOfWeek numbers, by the weekday
             *     of the visit at the branch.
             */
            byWeekday: components["schemas"]["Yalla.Application.Platform.WeekdayCount"][];
            /**
             * Format: int32
             * @description 7 or 30.
             */
            days: number;
            /**
             * Format: int32
             * @description Every booking in the window.
             */
            total: number;
            /**
             * Format: uuid
             * @description The venue.
             */
            venueId: string;
        };
        /** @description One venue's count. */
        "Yalla.Application.Platform.VenueCount": {
            /** Format: int32 */
            count: number;
            name: string;
            /** Format: uuid */
            venueId: string;
        };
        "Yalla.Application.Platform.VenueDetail": {
            branches: components["schemas"]["Yalla.Application.Platform.BranchSummary"][];
            /** @description One venue as the platform sees it, with the per-branch tier rolled up. */
            venue: components["schemas"]["Yalla.Application.Platform.VenueSummary"];
        };
        /** @description The one issue the venue table shows, and the branch it is at. */
        "Yalla.Application.Platform.VenueReadinessIssue": {
            /** @description The branch it is at. */
            branchName: string;
            /** @description `no-tables`, `no-menu`, `incomplete-dishes`, `no-hours` or `no-photo`. */
            code: string;
            /**
             * Format: int32
             * @description How many, for `incomplete-dishes`; absent otherwise.
             */
            count?: number | null;
        };
        /**
         * Format: int32
         * @description A venue's state, as one value. Derived from the venue's flags; never stored.
         *
         *     Values: 1 Active, 2 Suspended, 3 Inactive, 4 Deleted.
         * @enum {integer}
         */
        "Yalla.Application.Platform.VenueStatus": 1 | 2 | 3 | 4;
        /** @description One venue as the platform sees it, with the per-branch tier rolled up. */
        "Yalla.Application.Platform.VenueSummary": {
            /**
             * Format: double
             * @description The average of the published reviews across every branch, to one decimal; absent with none. The
             *     same rule the public pages use, over the whole venue.
             */
            averageRating?: number | null;
            /**
             * Format: int32
             * @description How many branches it has.
             */
            branchCount: number;
            /** @description Every branch with its own tier, active ones first, then by name. */
            branches: components["schemas"]["Yalla.Application.Platform.BranchTierView"][];
            /**
             * @description The thumbnail of the first branch's cover photo, in the order of Branches:
             *     root-relative (`/api/photos/{id}/thumbnail`) for an uploaded photo, absolute for a migrated
             *     one. Absent when no branch has a cover.
             */
            coverThumbnailUrl?: string | null;
            /**
             * Format: date-time
             * @description When the venue was created.
             */
            createdAtUtc: string;
            /** @description The first branch's cuisine, as the listing form saved it. */
            cuisine?: string | null;
            /**
             * Format: date-time
             * @description When it was deleted, if it was. Never cleared.
             */
            deletedAtUtc?: string | null;
            /** @description The first branch's district, as the listing form saved it. */
            district?: string | null;
            /** @description Whether the venue is switched on at all. */
            isActive: boolean;
            /** @description Soft-deleted. Never a hard delete; the venue refuses every change. */
            isDeleted: boolean;
            /** @description Suspended venues keep every row but disappear from diner browsing. */
            isSuspended: boolean;
            /** @description Its name. */
            name: string;
            /**
             * Format: int32
             * @description How many branches have at least one such issue.
             */
            notReadyBranchCount: number;
            /**
             * Format: int32
             * @description Tabs open or closing right now, across every branch.
             */
            openTabCount: number;
            /**
             * Format: int32
             * @description How many of those branches are on the paid tier.
             */
            paidBranchCount: number;
            /**
             * @description The first thing a guest would find missing at the first branch that has one, in the order of
             *     Branches - with that branch's name - or absent when nothing is. Codes:
             *     `no-tables`, `no-menu`, `incomplete-dishes` (with `count`), `no-hours`,
             *     `no-photo`. Never set for a deleted venue.
             */
            readinessIssue?: components["schemas"]["Yalla.Application.Platform.VenueReadinessIssue"] | null;
            /**
             * Format: int32
             * @description Published reviews across every branch.
             */
            reviewCount: number;
            /** @description Unique URL segment for the brand. */
            slug: string;
            /**
             * @description The four booleans above as one value: 4 Deleted, else 2 Suspended, else 3 Inactive (switched off),
             *     else 1 Active.
             */
            status: components["schemas"]["Yalla.Application.Platform.VenueStatus"];
            /**
             * @description What a <b>branch</b> pays for. Stored per branch, never per venue: a chain with four locations
             *     is four paying customers. The venue-level view is a rollup.
             */
            subscriptionTier: components["schemas"]["Yalla.Domain.Enums.SubscriptionTier"];
            /**
             * Format: date-time
             * @description When it was suspended, if it is.
             */
            suspendedAtUtc?: string | null;
            /**
             * Format: int32
             * @description How many <b>active</b> tables across all of them. A table kept only for its history is not one the
             *     room has, the same rule the readiness checklist counts by.
             */
            tableCount: number;
            /**
             * @description 1 Free (no branch paid, or no branch at all), 2 Mixed (some), 3 Paid (every one) - what the list's
             *     tier column shows, with PaidBranchCount of BranchCount.
             */
            tierMix: components["schemas"]["Yalla.Application.Platform.TierMix"];
            /** @description What kind of place a venue is. Drives the shipped reservation-policy defaults. */
            type: components["schemas"]["Yalla.Domain.Enums.VenueType"];
            /**
             * Format: uuid
             * @description The venue.
             */
            venueId: string;
        };
        /** @description One weekday's count. */
        "Yalla.Application.Platform.WeekdayCount": {
            /**
             * Format: int32
             * @description Bookings whose visit fell on that weekday.
             */
            count: number;
            /** @description 0 Sunday … 6 Saturday, as System.DayOfWeek. */
            dayOfWeek: components["schemas"]["System.DayOfWeek"];
        };
        /** @description One booking as its manage link shows it, to somebody holding nothing but the link. */
        "Yalla.Application.Public.PublicBookingView": {
            /**
             * Format: date-time
             * @description For a booking waiting on a short-notice decision, when the venue's chance to answer runs out - the
             *     page counts down to it and reads the link again until the booking is decided. Null otherwise.
             */
            approvalExpiresAtUtc?: string | null;
            /** @description Where to go. */
            branchAddress: string;
            /** @description Which location. */
            branchName: string;
            /**
             * @description Whether cancelling would do anything - false once the booking is already cancelled, missed or
             *     finished. <b>Not</b> the deadline: cancelling past the deadline is allowed and merely recorded.
             */
            canCancel: boolean;
            /**
             * Format: date-time
             * @description The instant past which cancelling is recorded as late. Absolute rather than a number of minutes
             *     so the page does not have to reimplement the arithmetic, and so a policy edit cannot silently
             *     move a deadline the diner has already been shown.
             */
            cancellationDeadlineUtc: string;
            /** @description Whether this booking's cancellation, if it has one, arrived past the deadline. */
            cancelledAfterDeadline: boolean;
            /** @description The short code quoted at the door. */
            code: string;
            /**
             * @description Why a booking that was waiting was declined - the venue said no, or nobody answered in time - so
             *     the page can apologise for the right thing. Null for a booking that was not declined.
             */
            declinedBecause?: components["schemas"]["Yalla.Domain.Enums.DeclineReason"] | null;
            /**
             * Format: date
             * @description The booked date, as the diner reads it off the confirmation.
             */
            localDate: string;
            /**
             * Format: time
             * @description The booked wall-clock start.
             */
            localStartTime: string;
            /**
             * @description The note the diner typed for the venue when booking, or absent (K9). Theirs to see again; it
             *     says nothing the link holder did not write.
             */
            note?: string | null;
            /**
             * Format: int32
             * @description How many people.
             */
            partySize: number;
            /**
             * @description The room the table is in - "Hall", "Terrace" - or absent for a table in no room. Said beside the
             *     table label, because "table 4" alone does not tell somebody arriving which room to walk into.
             */
            roomName?: string | null;
            /** @description Lifecycle of a booking. Every member is the result of somebody doing something. */
            status: components["schemas"]["Yalla.Domain.Enums.ReservationStatus"];
            /** @description The table, as printed on the floor. */
            tableLabel: string;
            /**
             * @description The branch's IANA zone. Every time here is wall-clock in it, and a diner reading this on a
             *     phone set to another zone must not be shown a converted time.
             */
            timeZoneId: string;
            /** @description The venue, as the confirmation names it. */
            venueName: string;
        };
        /** @description One branch on the browse list. */
        "Yalla.Application.Public.PublicBranchCard": {
            /** @description Where it is. */
            address: string;
            /**
             * Format: uuid
             * @description The id, for the menu and availability routes.
             */
            branchId: string;
            /** @description The other half of a printed link. */
            branchSlug: string;
            /**
             * Format: int32
             * @description How many tables have nobody sitting at them right now, walk-in-only stools included - the same
             *     tables the branch page's `tableCount` counts and its plan draws, so the two can never read
             *     "3 of 2 free" and zero means every seat is taken. The one volatile number here, and the reason
             *     the browse list is cached for seconds rather than minutes.
             */
            freeTableCount: number;
            /** @description Whether it is inside an opening block at this moment, in its own zone. */
            isOpenNow: boolean;
            /** @description The branch's name. */
            name: string;
            /**
             * @description The branch's IANA zone, e.g. `Asia/Yerevan`. A slot a diner picks after browsing is a
             *     wall-clock time at the branch, and a phone set to another zone has to render it in this one
             *     rather than guess - the diner app guessed `Asia/Yerevan`, because this list is the only
             *     public read in front of its venue and booking screens and it did not say.
             */
            timeZoneId: string;
        };
        /** @description One branch's details screen: everything on the card, and the rest. */
        "Yalla.Application.Public.PublicBranchDetail": {
            /** @description A paragraph from the venue, or absent. */
            about?: string | null;
            /**
             * @description Whether the diner app may book here: online bookings switched on <b>and</b> the reservation policy
             *     saved by somebody at the venue (K9). False means hide the booking button.
             */
            acceptsAppBookings: boolean;
            /** @description Whether the public page offers booking. */
            acceptsWebBookings: boolean;
            /** @description Keys: `outdoorSeating`, `wifi`, `parking`, `cardPayment`, `vegan`. */
            amenities: string[];
            /**
             * Format: date-time
             * @description When the live half was read.
             */
            asOfUtc: string;
            /** @description Pictures beyond the cover, in the venue's order. */
            gallery: components["schemas"]["Yalla.Application.Media.PhotoView"][];
            /** @description The card, exactly as the list serves it. */
            listing: components["schemas"]["Yalla.Application.Public.PublicBranchListing"];
            /** @description Weekly wall-clock hours; `day` 0 = Sunday. */
            openingHours: components["schemas"]["Yalla.Application.BranchSettings.OpeningHoursView"][];
            /** @description Published contact number, or absent. */
            phoneE164?: string | null;
            /** @description The newest three published reviews, by when they were first written. The rest are paged on the reviews route. */
            recentReviews: components["schemas"]["Yalla.Application.Public.PublicReviewView"][];
            /**
             * @description The rooms a diner picks from, each with its photos and the live pins on them - the same payload as
             *     `GET /api/public/branches/{id}/rooms`.
             */
            rooms: components["schemas"]["Yalla.Application.Public.PublicRoom"][];
            /**
             * Format: int32
             * @description Active tables on the plan.
             */
            tableCount: number;
            /** @description http(s), or absent. */
            websiteUrl?: string | null;
        };
        /** @description One branch on the diner app's Explore list, search results and map. */
        "Yalla.Application.Public.PublicBranchListing": {
            /** @description Street address. */
            address: string;
            /** @description `"popular"` and/or `"new"`, derived - see `BranchBadgeRules`. */
            badges: string[];
            /**
             * Format: uuid
             * @description The branch id every other route takes. The app's `Place.id`.
             */
            branchId: string;
            /** @description Which location, e.g. "Cascade". */
            branchName: string;
            /** @description The branch half. */
            branchSlug: string;
            /** @description The hero picture, or absent. */
            coverPhoto?: components["schemas"]["Yalla.Application.Media.PhotoView"] | null;
            /** @description Free text from the venue, or absent when not set. */
            cuisine?: string | null;
            /**
             * Format: double
             * @description From the `lat`/`lng` the caller sent, to 0.1 km. Absent when none was sent.
             */
            distanceKm?: number | null;
            /**
             * @description The part of town, e.g. "Kentron" - what the app prints after the venue type and the cuisine. Free
             *     text from the venue, or absent when not set. Search matches it.
             */
            district?: string | null;
            /**
             * Format: int32
             * @description Active tables with nobody at them.
             */
            freeTableCount: number;
            /** @description Inside an opening block now, in the branch's zone. */
            isOpenNow: boolean;
            /**
             * Format: double
             * @description WGS84.
             */
            latitude: number;
            /**
             * Format: double
             * @description WGS84.
             */
            longitude: number;
            /**
             * Format: int32
             * @description 1-4, or absent when not set.
             */
            priceLevel?: number | null;
            /**
             * Format: double
             * @description Average stars to one decimal; absent when nobody has reviewed it.
             */
            rating?: number | null;
            /**
             * Format: int32
             * @description How many reviews.
             */
            reviewCount: number;
            /** @description The branch's IANA zone. */
            timeZoneId: string;
            /**
             * Format: uuid
             * @description The venue's id.
             */
            venueId: string;
            /** @description The brand name, what the card is titled with. */
            venueName: string;
            /** @description The venue half of the public link. */
            venueSlug: string;
            /** @description What kind of place a venue is. Drives the shipped reservation-policy defaults. */
            venueType: components["schemas"]["Yalla.Domain.Enums.VenueType"];
        };
        /** @description What a link to this branch should look like when it is pasted into WhatsApp or Telegram. */
        "Yalla.Application.Public.PublicBranchMeta": {
            /** @description The path this branch lives at, for `og:url`. */
            canonicalPath: string;
            /** @description What the venue is. Stable enough to cache. */
            description: string;
            /** @description The branch cover photo, or the venue's, or null. */
            imageUrl?: string | null;
            /** @description The locale tag to advertise. */
            locale: string;
            /** @description Venue and branch, as one line. */
            title: string;
        };
        /** @description One branch's public page. */
        "Yalla.Application.Public.PublicBranchPage": {
            /**
             * @description Whether the diner app may book here: AcceptsWebBookings<b>and</b> a reservation
             *     policy somebody at the venue has saved (K9). Read live, like AcceptsWebBookings.
             */
            acceptsAppBookings: boolean;
            /**
             * @description Whether this branch takes bookings from this page. <b>False unless somebody switched it on</b> -
             *     see Yalla.Domain.Venues.Branch.AcceptsWebBookings. When false the page shows the
             *     room, the menu and the hours and offers no booking, which is a perfectly good page.
             */
            acceptsWebBookings: boolean;
            /** @description Street address, as a person would read it. */
            address: string;
            /**
             * Format: date-time
             * @description When the server read the live half of this page. FreeTableCount,
             *     IsOpenNow and each table's `isFree` are true as of this instant and no
             *     later; the rest is stable. The page shows the staleness rather than implying there is none,
             *     because this link is cached for seconds and shared for days.
             */
            asOfUtc: string;
            /**
             * Format: int32
             * @description How many days ahead this branch takes bookings, which is the maximum of the date input.
             */
            bookingWindowDays: number;
            /**
             * Format: uuid
             * @description The id the menu and availability routes take.
             */
            branchId: string;
            /** @description The branch's name. */
            branchName: string;
            /** @description The branch half. */
            branchSlug: string;
            /**
             * @description The venue card's picture, or null when the owner has not set one. Part of the cached plan, not
             *     the live stitch: it changes once during onboarding, and a stale cover is not a claim about the
             *     room.
             */
            coverPhoto?: components["schemas"]["Yalla.Application.Media.PhotoView"] | null;
            /**
             * @description The rooms, in diner shape: each room with its photos, and the tables with their pins and whether
             *     each is free. <b>No QR tokens and no staff state</b> - see Yalla.Application.Public.PublicFloorTable.
             */
            floorPlan: components["schemas"]["Yalla.Application.Public.PublicFloorPlan"];
            /**
             * Format: int32
             * @description Tables with nobody at them right now, bookable or walk-in only, so it is always out of
             *     TableCount and always the number of tables the plan draws with
             *     `isFree` true.
             */
            freeTableCount: number;
            /**
             * @description Whether it is open at this moment, decided in the branch's own zone.
             *
             *     <b>This is the only "is it worth going" signal, and there is deliberately no second one.</b> An
             *     earlier draft carried a `status` of Open/Closed beside it, which was computed from this
             *     field and therefore said nothing new under a name that implied venue lifecycle. A branch that is
             *     suspended, deleted or switched off never reaches this response at all - every query behind it
             *     filters those out and the route answers 404 - so "shut tonight" is this field being false, and
             *     "this venue is gone" is the 404. Two names for one fact is how a mapper picks the wrong one.
             */
            isOpenNow: boolean;
            /**
             * Format: double
             * @description For the map pin.
             */
            latitude: number;
            /**
             * Format: double
             * @description For the map pin.
             */
            longitude: number;
            /** @description The weekly hours. */
            openingHours: components["schemas"]["Yalla.Application.BranchSettings.OpeningHoursView"][];
            /**
             * @description The branch's contact number in E.164, or null when nobody has supplied one. The only way a
             *     diner on this page can ask about a high chair or a wheelchair ramp.
             */
            phoneE164?: string | null;
            /**
             * @description The reservation rules a diner needs, and <b>only</b> those - see
             *     Yalla.Application.Public.PublicReservationPolicy for what is deliberately withheld.
             */
            policy: components["schemas"]["Yalla.Application.Public.PublicReservationPolicy"];
            /**
             * Format: int32
             * @description How many tables there are - every table on the plan, bookable or not - so the count has a
             *     denominator.
             */
            tableCount: number;
            /**
             * @description The branch's IANA zone. Every time on this page is rendered in it - a tourist's phone is on the
             *     wrong zone, and a tourist is a named primary user of this surface.
             */
            timeZoneId: string;
            /** @description The venue's name. */
            venueName: string;
            /** @description The venue half of the link. */
            venueSlug: string;
            /** @description What kind of place a venue is. Drives the shipped reservation-policy defaults. */
            venueType: components["schemas"]["Yalla.Domain.Enums.VenueType"];
        };
        /** @description The rooms of one branch, with every pin's live state. */
        "Yalla.Application.Public.PublicBranchRooms": {
            /**
             * Format: date-time
             * @description When the states were derived.
             */
            asOfUtc: string;
            /**
             * Format: uuid
             * @description The branch.
             */
            branchId: string;
            /** @description The rooms that have at least one photo, lowest `displayOrder` first. */
            rooms: components["schemas"]["Yalla.Application.Public.PublicRoom"][];
        };
        /** @description The rooms as a diner sees them: each with its photos, and every table with its pin. */
        "Yalla.Application.Public.PublicFloorPlan": {
            /** @description The rooms, lowest `displayOrder` first, each with its photos in order. */
            areas: components["schemas"]["Yalla.Application.BranchSettings.FloorAreaView"][];
            /** @description Every active table, pinned or not, so the page's free count is out of the whole branch. */
            tables: components["schemas"]["Yalla.Application.Public.PublicFloorTable"][];
        };
        /** @description One table on the public page. */
        "Yalla.Application.Public.PublicFloorTable": {
            /** @description Which room it is in, by name. Null for none. */
            areaName?: string | null;
            /**
             * @description Whether a diner can book it: bookable <b>and</b> pinned on a room photo. A table with no pin is
             *     not offered to diners, so it reads false here however the venue set it.
             */
            isBookable: boolean;
            /** @description Whether anybody is sitting at it right now. */
            isFree: boolean;
            /** @description What is printed on it. */
            label: string;
            /**
             * Format: uuid
             * @description The room photo it is pinned on, or null.
             */
            photoId?: string | null;
            /**
             * Format: double
             * @description Where the pin sits on that photo, 0-1 across; null with no pin.
             */
            photoX?: number | null;
            /**
             * Format: double
             * @description 0-1 down; null with no pin.
             */
            photoY?: number | null;
            /**
             * Format: int32
             * @description How many it seats.
             */
            seats: number;
        };
        /** @description The reservation rules a diner needs in order to book, and nothing else. */
        "Yalla.Application.Public.PublicReservationPolicy": {
            /**
             * Format: int32
             * @description How long before the start a diner may still cancel freely. On the page because a deadline
             *     nobody was told about is a deadline that produces no-shows rather than cancellations.
             */
            cancellationDeadlineMinutes: number;
            /**
             * Format: int32
             * @description How far ahead a booking must be made, which is what greys out the next available slot.
             */
            minLeadMinutes: number;
            /**
             * Format: int32
             * @description How long the table is held. The diner is told this before booking because it is the answer to
             *     "can we linger?", and finding out at the table is worse.
             */
            turnTimeMinutes: number;
        };
        /** @description A page of a branch's published reviews, newest first by when each was written. */
        "Yalla.Application.Public.PublicReviewPage": {
            /** Format: uuid */
            branchId: string;
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: double */
            rating?: number | null;
            /** Format: int32 */
            reviewCount: number;
            reviews: components["schemas"]["Yalla.Application.Public.PublicReviewView"][];
        };
        /** @description One published review. */
        "Yalla.Application.Public.PublicReviewView": {
            /**
             * @description "Anahit S." - a first name and an initial, "Yalla diner" when the name cannot be shown. Never the
             *     full name, a number, an email or any id. See `BranchReview.PublicAuthorName`.
             */
            authorName: string;
            /**
             * Format: date-time
             * @description First written. The list is ordered by this, newest first.
             */
            createdAtUtc: string;
            /** @description Whether it was changed after it was first written. */
            edited: boolean;
            /**
             * Format: int32
             * @description 1-5.
             */
            rating: number;
            /**
             * Format: uuid
             * @description The review's id.
             */
            reviewId: string;
            /** @description Absent when the diner left stars only. */
            text?: string | null;
            /**
             * Format: date-time
             * @description When the rating or text last changed.
             */
            updatedAtUtc: string;
        };
        /** @description A room a diner can pick: its photos in order, each with its live pins. */
        "Yalla.Application.Public.PublicRoom": {
            /**
             * Format: int32
             * @description Lowest first.
             */
            displayOrder: number;
            /** @description Hall, Terrace, VIP. */
            name: string;
            /** @description Its photos, in the order the venue chose. Never empty: a room with no photo is not listed. */
            photos: components["schemas"]["Yalla.Application.Public.PublicRoomPhoto"][];
            /**
             * Format: uuid
             * @description The room.
             */
            roomId: string;
        };
        /** @description One photo of a room, and the tables pinned on it. */
        "Yalla.Application.Public.PublicRoomPhoto": {
            /** @description The picture. */
            photo: components["schemas"]["Yalla.Application.Media.PhotoView"];
            /** @description The active tables pinned on it, by label. */
            tables: components["schemas"]["Yalla.Application.Public.PublicTableMarker"][];
        };
        /** @description One table's pin on a room photo, with its live state. */
        "Yalla.Application.Public.PublicTableMarker": {
            /** @description False for walk-in-only seats, which are pinned so a diner can see them but not booked. */
            isBookable: boolean;
            /** @description What is printed on it. */
            label: string;
            /**
             * Format: double
             * @description 0-1 across the photo.
             */
            photoX: number;
            /**
             * Format: double
             * @description 0-1 down the photo.
             */
            photoY: number;
            /**
             * Format: int32
             * @description How many it seats. There is no minimum party size in the model.
             */
            seats: number;
            /**
             * @description What a client should draw for a table: its physical Yalla.Domain.Enums.TableStatus with the
             *     reservation overlay applied.
             */
            state: components["schemas"]["Yalla.Domain.Enums.DerivedTableState"];
            /**
             * Format: uuid
             * @description The table id the booking flow takes.
             */
            tableId: string;
        };
        /** @description One venue on the browse list, with its branches. */
        "Yalla.Application.Public.PublicVenueCard": {
            /** @description Its active branches. */
            branches: components["schemas"]["Yalla.Application.Public.PublicBranchCard"][];
            /** @description The venue's name. */
            name: string;
            /** @description What kind of place a venue is. Drives the shipped reservation-policy defaults. */
            type: components["schemas"]["Yalla.Domain.Enums.VenueType"];
            /** @description The public identity. Half of a printed link. */
            venueSlug: string;
        };
        "Yalla.Application.Reports.AdjustmentLine": {
            /**
             * Format: int32
             * @description How many.
             */
            count: number;
            /** @description Why money is coming off a bill. */
            kind: components["schemas"]["Yalla.Domain.Enums.AdjustmentKind"];
            /** @description What the manager typed. */
            reason: string;
            /**
             * Format: uuid
             * @description Who authorised it.
             */
            staffMemberId: string;
            /** @description Their name. */
            staffName: string;
            /**
             * Format: int64
             * @description What they came to.
             */
            totalAmd: number;
        };
        /** @description One number, beside what it was over the previous equivalent period. */
        "Yalla.Application.Reports.Compared": {
            /**
             * Format: double
             * @description The change as a fraction, or null when there is nothing to compare against.
             */
            readonly changeFraction?: number | null;
            /**
             * Format: double
             * @description The same measure over the equivalent period immediately before. Null when there is no prior
             *     data at all - which is <b>not</b> the same as zero, and a client must render it differently: a
             *     venue's first week has no previous week, and "down 100%" would be a lie about it.
             */
            previous?: number | null;
            /**
             * Format: double
             * @description This period.
             */
            value: number;
        };
        "Yalla.Application.Reports.DailyRevenue": {
            /**
             * Format: date
             * @description The branch's own day.
             */
            localDate: string;
            /**
             * Format: int64
             * @description Taken that day, in whole dram.
             */
            revenueAmd: number;
            /**
             * Format: int32
             * @description How many tabs closed.
             */
            tabs: number;
        };
        "Yalla.Application.Reports.DurationBucket": {
            /**
             * Format: int32
             * @description How many sittings fell in it.
             */
            sessions: number;
            /**
             * Format: int32
             * @description The top of this bucket, in minutes. The last one is open-ended.
             */
            upToMinutes: number;
        };
        "Yalla.Application.Reports.HourBucket": {
            /**
             * Format: int32
             * @description Local hour of day, 0 to 23.
             */
            hour: number;
            /**
             * Format: int32
             * @description Sittings that were in progress during that hour.
             */
            sessions: number;
        };
        "Yalla.Application.Reports.HourlyRevenue": {
            /**
             * Format: int32
             * @description Local hour of day.
             */
            hour: number;
            /**
             * Format: int64
             * @description Taken in that hour, in whole dram.
             */
            revenueAmd: number;
        };
        "Yalla.Application.Reports.LeadTimeBucket": {
            /**
             * Format: int32
             * @description How many were made that far ahead.
             */
            bookings: number;
            /**
             * Format: int32
             * @description Top of this bucket, in hours before the sitting.
             */
            upToHours: number;
        };
        "Yalla.Application.Reports.MenuItemPerformance": {
            /** @description Which section of the menu it sits in. */
            categoryName: string;
            /**
             * Format: uuid
             * @description The item.
             */
            menuItemId: string;
            /** @description Its name now, not the snapshot on the line. */
            name: string;
            /**
             * Format: int32
             * @description How many were ordered.
             */
            quantity: number;
            /**
             * Format: int64
             * @description What they came to.
             */
            revenueAmd: number;
        };
        "Yalla.Application.Reports.MenuReport": {
            /**
             * @description <b>The report that changes behaviour.</b> Items with no line in the period at all. A dish nobody
             *                 orders is inventory that spoils and menu space that could sell something else, and no venue
             *                 knows which those are - they are, by definition, the ones nobody mentions.
             */
            neverOrdered: components["schemas"]["Yalla.Application.Reports.MenuItemPerformance"][];
            /** @description What was asked for. */
            scope: components["schemas"]["Yalla.Application.Reports.ReportScope"];
            /** @description Most ordered. */
            topByCount: components["schemas"]["Yalla.Application.Reports.MenuItemPerformance"][];
            /** @description Most valuable, which is frequently a different list. */
            topByRevenue: components["schemas"]["Yalla.Application.Reports.MenuItemPerformance"][];
            /** @description Voided lines by item and reason. A dish voided often is mis-described or badly made. */
            voids: components["schemas"]["Yalla.Application.Reports.VoidLine"][];
        };
        "Yalla.Application.Reports.OccupancyReport": {
            /** @description In progress by local hour of day. */
            byHour: components["schemas"]["Yalla.Application.Reports.HourBucket"][];
            /** @description Started, by local weekday. */
            byWeekday: components["schemas"]["Yalla.Application.Reports.WeekdayBucket"][];
            /** @description Sittings seated against a booking. */
            fromReservations: components["schemas"]["Yalla.Application.Reports.Compared"];
            /** @description What was asked for. */
            scope: components["schemas"]["Yalla.Application.Reports.ReportScope"];
            /**
             * Format: int64
             * @description Seats the room has, times the days in the period.
             */
            seatsAvailable: number;
            /** @description Seats occupied across every sitting. */
            seatsFilled: components["schemas"]["Yalla.Application.Reports.Compared"];
            /** @description Sittings that started in the period. */
            sessions: components["schemas"]["Yalla.Application.Reports.Compared"];
            /** @description Actual against policy. */
            turnTime: components["schemas"]["Yalla.Application.Reports.TurnTimeDistribution"];
            /** @description Sittings with no booking behind them. */
            walkIns: components["schemas"]["Yalla.Application.Reports.Compared"];
        };
        /** @description A date range in the <b>branch's local dates</b>, inclusive of both ends. */
        "Yalla.Application.Reports.ReportRange": {
            /**
             * Format: int32
             * @description How many local days the range covers.
             */
            readonly days: number;
            /**
             * Format: date
             * @description First day included.
             */
            fromLocalDate: string;
            /**
             * Format: date
             * @description Last day included.
             */
            toLocalDate: string;
        };
        /** @description Which branches a report covers, and over what. */
        "Yalla.Application.Reports.ReportScope": {
            /** @description One branch, or every branch of a venue for an owner's rollup. */
            branchIds: string[];
            /** @description The local date range. */
            range: components["schemas"]["Yalla.Application.Reports.ReportRange"];
            /** @description The zone the local dates were interpreted in. */
            timeZoneId: string;
        };
        "Yalla.Application.Reports.ReservationReport": {
            /** @description Bookings made for a sitting in the period. */
            booked: components["schemas"]["Yalla.Application.Reports.Compared"];
            /** @description Cancellations over bookings. */
            cancellationRate: components["schemas"]["Yalla.Application.Reports.Compared"];
            /** @description Those called off, by anyone. */
            cancelled: components["schemas"]["Yalla.Application.Reports.Compared"];
            /**
             * @description Called off inside the branch's own cancellation deadline. Distinguished from an ordinary
             *     cancellation because a table given up in time is resold and one given up at 19:50 is not.
             */
            lateCancellations: components["schemas"]["Yalla.Application.Reports.Compared"];
            /** @description How far ahead people book - what `BookingWindowDays` should be set from. */
            leadTime: components["schemas"]["Yalla.Application.Reports.LeadTimeBucket"][];
            /** @description Those where grace ran out and the table was released. */
            noShow: components["schemas"]["Yalla.Application.Reports.Compared"];
            /** @description No-shows over bookings. The number the whole reminder feature exists to move. */
            noShowRate: components["schemas"]["Yalla.Application.Reports.Compared"];
            /** @description What was asked for. */
            scope: components["schemas"]["Yalla.Application.Reports.ReportScope"];
            /** @description Those the party turned up for. */
            seated: components["schemas"]["Yalla.Application.Reports.Compared"];
            /**
             * @description Booked from the public page by somebody with no registered device. <b>These people cannot be
             *     reminded</b>: no app means no push channel, so the reminder, the late nudge and one-tap cancel -
             *     the entire no-show story - do not reach them. This is the number that decides whether an SMS or
             *     Telegram channel is worth paying for. See `docs/reports.md`.
             */
            webBookingsWithoutAnApp: components["schemas"]["Yalla.Application.Reports.Compared"];
        };
        "Yalla.Application.Reports.RevenueReport": {
            /** @description Comps and discounts, with who authorised them. */
            adjustments: components["schemas"]["Yalla.Application.Reports.AdjustmentLine"][];
            /** @description What they came to altogether. */
            adjustmentsTotalAmd: components["schemas"]["Yalla.Application.Reports.Compared"];
            /** @description Per person on a tab. A different question from per tab, and the one a menu is priced against. */
            averagePerHeadAmd: components["schemas"]["Yalla.Application.Reports.Compared"];
            /** @description Per tab. */
            averageTabAmd: components["schemas"]["Yalla.Application.Reports.Compared"];
            /** @description Day by day, in local dates. */
            byDay: components["schemas"]["Yalla.Application.Reports.DailyRevenue"][];
            /** @description Hour by hour, in local hours. */
            byHour: components["schemas"]["Yalla.Application.Reports.HourlyRevenue"][];
            /** @description Taken in cash. */
            cashAmd: components["schemas"]["Yalla.Application.Reports.Compared"];
            /** @description Taken in the app. Zero until there is a wallet rail; the column is here so the day it exists nothing has to change. */
            inAppAmd: components["schemas"]["Yalla.Application.Reports.Compared"];
            /** @description What was asked for. */
            scope: components["schemas"]["Yalla.Application.Reports.ReportScope"];
            /** @description Of which service charge. */
            serviceChargeAmd: components["schemas"]["Yalla.Application.Reports.Compared"];
            /** @description Taken in the period. */
            totalAmd: components["schemas"]["Yalla.Application.Reports.Compared"];
        };
        /** @description What the venue needs to run the floor, and nothing more. */
        "Yalla.Application.Reports.StaffReport": {
            /**
             * Format: int32
             * @description How many people worked the period.
             */
            activeStaff: number;
            /** @description Orders keyed in by staff, across the branch. */
            ordersEntered: components["schemas"]["Yalla.Application.Reports.Compared"];
            /** @description What was asked for. */
            scope: components["schemas"]["Yalla.Application.Reports.ReportScope"];
            /** @description Sittings closed, across the branch. */
            tablesTurned: components["schemas"]["Yalla.Application.Reports.Compared"];
        };
        /** @description How long parties actually stay, against what the policy assumes. */
        "Yalla.Application.Reports.TurnTimeDistribution": {
            /** @description The whole shape, so the tail is visible rather than summarised away. */
            buckets: components["schemas"]["Yalla.Application.Reports.DurationBucket"][];
            /**
             * Format: int32
             * @description How many sittings the distribution was computed from.
             */
            closedSessions: number;
            /**
             * Format: int32
             * @description The middle sitting. Null when nothing closed in the period.
             */
            medianMinutes?: number | null;
            /**
             * Format: double
             * @description The fraction of sittings that ran past the policy's turn time. The single number to put next to
             *     the chart, and the one that says whether the policy needs changing.
             */
            overPolicyFraction: number;
            /**
             * Format: int32
             * @description Nine sittings in ten finish inside this.
             */
            p90Minutes?: number | null;
            /**
             * Format: int32
             * @description What the branch's policy assumes.
             */
            policyTurnTimeMinutes: number;
        };
        "Yalla.Application.Reports.VoidLine": {
            /**
             * Format: int32
             * @description How many times.
             */
            count: number;
            /**
             * Format: uuid
             * @description The item.
             */
            menuItemId: string;
            /** @description Its name. */
            name: string;
            /** @description Why it was taken off, in the waiter's words. */
            reason: string;
        };
        "Yalla.Application.Reports.WeekdayBucket": {
            /** @description Local day of week. */
            day: components["schemas"]["System.DayOfWeek"];
            /**
             * Format: int32
             * @description Sittings that started on that weekday.
             */
            sessions: number;
        };
        /**
         * @description One booking waiting for the floor to say yes or no, with what the floor needs to know about its
         *     table to decide.
         */
        "Yalla.Application.Reservations.AwaitingApproval": {
            /**
             * Format: date-time
             * @description When the chance to answer runs out - null for a booking with no deadline, which waits for
             *     the venue as long as it takes (a large party next week, a branch that approves every booking).
             */
            approvalExpiresAtUtc?: string | null;
            /** @description The party sitting at the table right now, or null when nobody is. */
            currentSitting?: components["schemas"]["Yalla.Application.Reservations.AwaitingCurrentSitting"] | null;
            /** @description The next booking after this one on the same table that day, or null when there is none. */
            nextBooking?: components["schemas"]["Yalla.Application.Reservations.AwaitingNextBooking"] | null;
            /**
             * @description The booking before this one on the same table that day - still to come, sitting there, gone
             *     home or never turned up - or null when there is none. Cancelled bookings are not counted.
             */
            previousBooking?: components["schemas"]["Yalla.Application.Reservations.AwaitingPreviousBooking"] | null;
            /** @description The booking, as every client sees it - code, start, party, table, room, guest. */
            reservation: components["schemas"]["Yalla.Application.Reservations.ReservationView"];
            /** @description Why a booking needs a human before it is promised. */
            trigger: components["schemas"]["Yalla.Domain.Enums.ApprovalTrigger"];
        };
        /** @description The party at the table of a booking awaiting approval, right now. */
        "Yalla.Application.Reservations.AwaitingCurrentSitting": {
            /**
             * Format: int32
             * @description How many, when a waiter seated them or they came on a booking; null when a diner's scan opened the
             *     table, which only guesses.
             */
            partySize?: number | null;
            /**
             * Format: date-time
             * @description Since when they have been sitting there.
             */
            seatedAtUtc: string;
        };
        /** @description The booking after one awaiting approval, on its table, that day. */
        "Yalla.Application.Reservations.AwaitingNextBooking": {
            /**
             * Format: time
             * @description When it starts, on the branch's wall clock.
             */
            localStartTime: string;
            /**
             * Format: int32
             * @description How many it is for.
             */
            partySize: number;
            /**
             * Format: uuid
             * @description The later booking.
             */
            reservationId: string;
            /**
             * Format: date-time
             * @description When it starts.
             */
            startUtc: string;
        };
        /** @description The booking before one awaiting approval, on its table, that day. */
        "Yalla.Application.Reservations.AwaitingPreviousBooking": {
            /** @description Who it is for. */
            guestName: string;
            /**
             * @description Their number, E.164, so the floor can call and ask how long they will be. Null for a platform
             *     admin reading the list.
             */
            guestPhone?: string | null;
            /**
             * Format: time
             * @description When it starts, on the branch's wall clock.
             */
            localStartTime: string;
            /**
             * Format: int32
             * @description How many it is for.
             */
            partySize: number;
            /**
             * Format: uuid
             * @description The earlier booking.
             */
            reservationId: string;
            /**
             * Format: date-time
             * @description When it starts.
             */
            startUtc: string;
            /** @description Lifecycle of a booking. Every member is the result of somebody doing something. */
            status: components["schemas"]["Yalla.Domain.Enums.ReservationStatus"];
        };
        /** @description Every table in a branch, answered for one requested slot, in one round trip. */
        "Yalla.Application.Reservations.BranchAvailability": {
            /**
             * Format: date-time
             * @description The instant these answers were computed for.
             */
            asOfUtc: string;
            /** Format: uuid */
            branchId: string;
            branchName: string;
            /**
             * Format: int32
             * @description The branch's clearing time between sittings.
             */
            bufferMinutes: number;
            /**
             * Format: int32
             * @description How long before the start a diner may still cancel freely - the branch's setting as it stands
             *     now, which is what a cancellation is judged against.
             */
            cancellationDeadlineMinutes: number;
            /**
             * Format: date-time
             * @description The instant past which cancelling the slot asked about is recorded as late: the requested
             *     start less Yalla.Application.Reservations.BranchAvailability.CancellationDeadlineMinutes.
             */
            cancellationDeadlineUtc?: string | null;
            /**
             * Format: date
             * @description The local date asked about, as the diner picked it.
             */
            localDate: string;
            /**
             * Format: time
             * @description The local time asked about.
             */
            localTime: string;
            /** Format: int32 */
            partySize: number;
            /**
             * Format: date-time
             * @description The requested slot's end: start plus the branch's turn time. The diner is never asked how
             *     long they intend to stay.
             */
            requestedEndUtc: string;
            /**
             * Format: date-time
             * @description The requested slot as an instant.
             */
            requestedStartUtc: string;
            tables: components["schemas"]["Yalla.Application.Reservations.TableAvailability"][];
            /** @description IANA zone, so a client can render the UTC instants below in local time itself. */
            timeZoneId: string;
            /**
             * Format: int32
             * @description The branch's turn time, so a client can explain the window it is being shown.
             */
            turnTimeMinutes: number;
            /**
             * @description A rule that refused the whole request before any table was considered - the date is too far
             *     out, the slot is too soon, the branch is shut. Null when the request itself was fine.
             */
            unavailableReason?: components["schemas"]["Yalla.Domain.Occupancy.ReservationRejectionReason"] | null;
        };
        /** @description One day at a branch, answered every half hour: which start times have a table for this party. */
        "Yalla.Application.Reservations.BranchDaySlots": {
            /** Format: uuid */
            branchId: string;
            /**
             * Format: date
             * @description The local date asked about, as `YYYY-MM-DD`.
             */
            date: string;
            /** Format: int32 */
            partySize: number;
            /**
             * @description Every start time on the day whose whole sitting fits one opening block, earliest first. A time
             *     the branch is shut for is left out rather than struck - it was never on offer.
             */
            slots: components["schemas"]["Yalla.Application.Reservations.DaySlot"][];
            /**
             * Format: int32
             * @description Minutes between listed start times. Always Yalla.Application.Reservations.DaySlotStep.Minutes.
             */
            stepMinutes: number;
            /**
             * @description Why the whole day is refused, when it is: the branch is shut all day
             *     (`OutsideOpeningHours`, and no slots), the day is past or every time left today is too
             *     soon (`LeadTimeTooShort`), or it is further out than the branch books
             *     (`OutsideBookingWindow`). Null when at least one time could be judged on its tables.
             */
            unavailableReason?: components["schemas"]["Yalla.Domain.Occupancy.ReservationRejectionReason"] | null;
        };
        /** @description One start time on the day, and whether a table is free for it. */
        "Yalla.Application.Reservations.DaySlot": {
            /**
             * Format: int32
             * @description How many tables the single-slot read would offer at this time. Zero when struck.
             */
            freeTableCount: number;
            /**
             * @description Whether at least one table can be booked for this party at this time: a bookable table pinned
             *     on a photo of its room that seats them, within the branch's seat-overhang limit, with no
             *     booking or sitting running into the sitting once clearing time is allowed for.
             */
            isAvailable: boolean;
            /**
             * @description True when a booking made at this time will land waiting for approval: the time is at short
             *     notice (today at the branch, or under six hours away - the floor decides, within fifteen
             *     minutes), the branch approves every booking by hand, or the party is over its threshold. Asked
             *     per time, so on tomorrow's picker the first few hours can say yes and the evening no. The same
             *     answer every table in the single-slot read gives.
             */
            requiresApproval: boolean;
            /**
             * Format: date-time
             * @description The same start as an instant.
             */
            startUtc: string;
            /** @description The local wall-clock start, `HH:mm` - what the chip says. */
            time: string;
            /**
             * @description Why nothing is free, when nothing is. `LeadTimeTooShort` or `OutsideBookingWindow`
             *     when the time itself is refused; otherwise the tables' reason - `TableAlreadyBooked` (or
             *     `TableCurrentlyOccupied`) when tables that fit the party are taken, else the commonest
             *     reason across the tables, e.g. `PartyExceedsCapacity` when no table seats them. Null
             *     when available.
             */
            unavailableReason?: components["schemas"]["Yalla.Domain.Occupancy.ReservationRejectionReason"] | null;
        };
        /** @description What extending the hold did. */
        "Yalla.Application.Reservations.ExtendHoldResult": {
            /**
             * Format: int32
             * @description How long was added, from the branch's policy.
             */
            extensionMinutes: number;
            /**
             * Format: int32
             * @description Always zero after a successful extension. Stated so the app can grey the button out rather than
             *     letting the diner tap it and be told no.
             */
            extensionsRemaining: number;
            /**
             * Format: date-time
             * @description Until when the table is now held.
             */
            holdExpiresAtUtc: string;
            /**
             * Format: uuid
             * @description The booking.
             */
            reservationId: string;
            /** @description True when this command had already been applied. */
            wasReplay: boolean;
        };
        /** @description A diner's own bookings, split the way the app shows them. */
        "Yalla.Application.Reservations.MyReservations": {
            /** @description Everything else - completed, cancelled, missed - most recent first. */
            past: components["schemas"]["Yalla.Application.Reservations.ReservationView"][];
            /** @description Bookings that have not finished yet, soonest first. */
            upcoming: components["schemas"]["Yalla.Application.Reservations.ReservationView"][];
        };
        /**
         * Format: int32
         * @description Why a booking was let go, and whether it counts against the diner.
         *
         *     Values: 1 NoShow, 2 CancelledByVenue.
         * @enum {integer}
         */
        "Yalla.Application.Reservations.ReleaseOutcome": 1 | 2;
        /** @description What releasing did. */
        "Yalla.Application.Reservations.ReservationReleaseResult": {
            /**
             * @description Whether this one goes on the diner's record. Stated in the response so a client can say so
             *     rather than the waiter having to remember which button does what.
             */
            countsTowardNoShowThreshold: boolean;
            /** @description Which outcome was recorded. */
            outcome: components["schemas"]["Yalla.Application.Reservations.ReleaseOutcome"];
            /** @description The booking in its new state. */
            reservation: components["schemas"]["Yalla.Application.Reservations.ReservationView"];
            /**
             * @description True when the table was held for this booking and has been freed. False when somebody else is
             *     sitting there - the release still stands, and the floor is left telling the truth.
             */
            tableFreed: boolean;
            /**
             * Format: uuid
             * @description The table this booking was for.
             */
            tableId: string;
            /** @description Its label, for the confirmation the waiter sees. */
            tableLabel: string;
            /** @description The <b>physical</b> state of a table: what somebody did to it. */
            tableStatus: components["schemas"]["Yalla.Domain.Enums.TableStatus"];
            /** @description True when the booking had already been released and this is that answer. */
            wasReplay: boolean;
        };
        /** @description One booking as every client sees it. */
        "Yalla.Application.Reservations.ReservationView": {
            /**
             * Format: date-time
             * @description When the venue's chance to answer runs out, for a booking waiting on a short-notice decision;
             *     null for every other booking, and once it is decided.
             */
            approvalExpiresAtUtc?: string | null;
            /** @description Why the booking is waiting for a human, when it is. Null for a confirmed booking. */
            awaitingApprovalBecause?: components["schemas"]["Yalla.Domain.Enums.ApprovalTrigger"] | null;
            /** Format: uuid */
            branchId: string;
            branchName: string;
            /**
             * Format: date-time
             * @description The instant past which cancelling is recorded as late: the start less the branch's
             *     cancellation deadline as it stands, which is what a cancellation made now is judged against.
             *     Cancelling after it is still allowed - recorded in Yalla.Application.Reservations.ReservationView.CancelledAfterDeadline, never
             *     refused.
             */
            cancellationDeadlineUtc: string;
            cancellationReason?: string | null;
            /**
             * @description Whether the cancellation came in past the branch's free-cancellation deadline. Recorded,
             *     never punished here.
             */
            cancelledAfterDeadline: boolean;
            /** Format: date-time */
            cancelledAtUtc?: string | null;
            /** Format: uuid */
            clientCommandId: string;
            /** @description The short code the diner quotes at the door. */
            code: string;
            /** Format: date-time */
            confirmedAtUtc?: string | null;
            /**
             * @description Why a booking that was waiting for the venue was declined: a member of staff said no, or
             *     nobody answered in time. Null for every booking that was not declined - a venue letting an
             *     accepted booking go is `CancelledByVenue` without one.
             */
            declinedBecause?: components["schemas"]["Yalla.Domain.Enums.DeclineReason"] | null;
            /**
             * Format: date-time
             * @description Start plus the branch's turn time, fixed when the booking was made.
             */
            endUtc: string;
            guestName: string;
            guestPhone: string;
            /** Format: uuid */
            id: string;
            /** Format: date */
            localDate: string;
            /**
             * Format: time
             * @description Wall-clock end, derived from the stored interval for display.
             */
            localEndTime: string;
            /** Format: time */
            localStartTime: string;
            /**
             * @description The plaintext manage token, <b>returned exactly once</b> - in the response to the request
             *     that created this booking - and null on every later read.
             */
            manageToken?: string | null;
            /** @description The diner's note to the venue - "window table", "a high chair" - or absent (K9). */
            note?: string | null;
            /** Format: int32 */
            partySize: number;
            /**
             * Format: uuid
             * @description The room the table is in - its `FloorArea`, the room a diner picked it from - or absent for
             *     a table in no room.
             */
            roomId?: string | null;
            /** @description The room's name - "Hall", "Terrace" - or absent with Yalla.Application.Reservations.ReservationView.RoomId. */
            roomName?: string | null;
            /** Format: date-time */
            startUtc: string;
            /** @description Lifecycle of a booking. Every member is the result of somebody doing something. */
            status: components["schemas"]["Yalla.Domain.Enums.ReservationStatus"];
            /** Format: uuid */
            tableId: string;
            tableLabel: string;
            timeZoneId: string;
            /** @description True when this booking already existed and was returned rather than created. */
            wasReplay: boolean;
        };
        "Yalla.Application.Reservations.TableAvailability": {
            /** Format: int32 */
            floorAreaDisplayOrder: number;
            /** Format: uuid */
            floorAreaId?: string | null;
            floorAreaName?: string | null;
            /** @description Whether this table can be booked for this party at this time. */
            isAvailable: boolean;
            isBookable: boolean;
            label: string;
            /** Format: uuid */
            nextReservationId?: string | null;
            /** Format: date-time */
            nextReservationStartUtc?: string | null;
            /**
             * Format: uuid
             * @description The room photo the table is pinned on. Never null here: a table with no pin is not offered to
             *     diners, so availability leaves it out.
             */
            photoId: string;
            /**
             * Format: double
             * @description Where the pin sits on Yalla.Application.Reservations.TableAvailability.PhotoId, 0-1 across.
             */
            photoX: number;
            /**
             * Format: double
             * @description Where the pin sits on Yalla.Application.Reservations.TableAvailability.PhotoId, 0-1 down.
             */
            photoY: number;
            /** @description The <b>physical</b> state of a table: what somebody did to it. */
            physicalStatus: components["schemas"]["Yalla.Domain.Enums.TableStatus"];
            /**
             * @description True when booking this table will land as `PendingApproval` rather than confirmed: the
             *     slot is at short notice (today at the branch, or under six hours away - the floor decides,
             *     within fifteen minutes), the branch approves every booking by hand, or the party is over its
             *     threshold. Not a refusal, and worth saying before the diner commits.
             */
            requiresApproval: boolean;
            /** Format: int32 */
            seats: number;
            /**
             * @description What a client should draw for a table: its physical Yalla.Domain.Enums.TableStatus with the
             *     reservation overlay applied.
             */
            state: components["schemas"]["Yalla.Domain.Enums.DerivedTableState"];
            /** Format: uuid */
            tableId: string;
            /** @description The one specific reason it cannot, when it cannot. Null when it can. */
            unavailableReason?: components["schemas"]["Yalla.Domain.Occupancy.ReservationRejectionReason"] | null;
            /** @description Start of the window on offer. The requested slot, when the table is available. */
            window?: components["schemas"]["Yalla.Application.Reservations.TableAvailabilityWindow"] | null;
        };
        /** @description One table's answer for the requested slot: can the diner have it, and if so, for how long. */
        "Yalla.Application.Reservations.TableAvailabilityWindow": {
            /**
             * Format: time
             * @description AvailableFromUtc as branch wall-clock time, for rendering.
             */
            availableFromLocal: string;
            /**
             * Format: date-time
             * @description The start of the slot, which is what was asked for.
             */
            availableFromUtc: string;
            /**
             * Format: time
             * @description AvailableUntilUtc as branch wall-clock time.
             */
            availableUntilLocal?: string | null;
            /**
             * Format: date-time
             * @description When the table has to be clear again - the next booking's start less the branch's clearing time.
             *     Null when nothing is booked after it.
             */
            availableUntilUtc?: string | null;
            /**
             * @description True when nothing is booked after this slot. Explicit, so a client never has to read a null as
             *     either "unbounded" or "missing".
             */
            hasNoLaterBooking: boolean;
            /**
             * @description True when the window is shorter than the branch's usual sitting, so the client can say plainly
             *     that this table gives less time than normal.
             */
            isShorterThanTurnTime: boolean;
            /**
             * Format: int32
             * @description How long the table is free for, in minutes. Null when unbounded.
             */
            windowMinutes?: number | null;
        };
        /** @description A page of a branch's reviews for moderation. */
        "Yalla.Application.Reviews.ModeratedReviewPage": {
            /** @description The page. */
            items: components["schemas"]["Yalla.Application.Reviews.ModeratedReviewView"][];
            /**
             * Format: int32
             * @description 1-based.
             */
            page: number;
            /**
             * Format: int32
             * @description Rows per page.
             */
            pageSize: number;
            /**
             * Format: int32
             * @description Rows across every page for this filter.
             */
            total: number;
        };
        /**
         * @description One review as a moderator sees it: the published fields, who wrote it, whether it is down and
         *     why, and how often diners have reported it.
         */
        "Yalla.Application.Reviews.ModeratedReviewView": {
            /** @description The public name, never the account's full name, number or email. */
            authorName: string;
            /**
             * Format: uuid
             * @description The branch it is about.
             */
            branchId: string;
            /**
             * Format: date-time
             * @description First written.
             */
            createdAtUtc: string;
            /**
             * Format: uuid
             * @description The account that wrote it.
             */
            dinerUserId: string;
            /** @description Taken down. */
            hidden: boolean;
            /**
             * Format: date-time
             * @description When it was taken down.
             */
            hiddenAtUtc?: string | null;
            /**
             * @description Taken down by the platform rather than the venue. A venue cannot put these back; the console
             *     shows them as the platform's decision.
             */
            hiddenByPlatform: boolean;
            /** @description The moderator's reason, when hidden. */
            hiddenReason?: string | null;
            /**
             * Format: date-time
             * @description The newest of those reports, or absent when there is none.
             */
            lastReportedAtUtc?: string | null;
            /**
             * Format: int32
             * @description 1-5.
             */
            rating: number;
            /**
             * Format: int32
             * @description How many diners reported it and nobody has dismissed. A platform admin dismissing the reports
             *     (`POST /api/platform/reviews/{id}/dismiss-reports`) brings this to zero for both tiers; a report
             *     filed after that counts again.
             */
            reportCount: number;
            /**
             * Format: uuid
             * @description The review.
             */
            reviewId: string;
            /** @description Absent when stars only. */
            text?: string | null;
            /**
             * Format: date-time
             * @description Last changed.
             */
            updatedAtUtc: string;
        };
        /** @description A new staff member. A PIN is required; email and password are for owners and managers. */
        "Yalla.Application.Staff.CreateStaffCommand": {
            /** Format: uuid */
            branchId?: string | null;
            email?: string | null;
            fullName: string;
            password?: string | null;
            phone: string;
            pin: string;
            /** @description What a staff member is allowed to do, coarsely. Authorisation itself is a later task. */
            role: components["schemas"]["Yalla.Domain.Enums.StaffRole"];
        };
        "Yalla.Application.Staff.StaffMemberView": {
            /** Format: uuid */
            branchId?: string | null;
            email?: string | null;
            fullName: string;
            hasPasswordSignIn: boolean;
            /** Format: uuid */
            id: string;
            isActive: boolean;
            isPinLocked: boolean;
            phone: string;
            /** @description What a staff member is allowed to do, coarsely. Authorisation itself is a later task. */
            role: components["schemas"]["Yalla.Domain.Enums.StaffRole"];
            /** Format: uuid */
            venueId?: string | null;
        };
        /**
         * @description A freshly issued sign-in link. ResetLink exists only here: the server keeps
         *     the token's hash and no read ever returns it, so this is the one copy.
         */
        "Yalla.Application.Staff.StaffSignInLink": {
            /** @description The address, as stored. */
            email: string;
            /**
             * Format: date-time
             * @description When the link stops working unused.
             */
            expiresAtUtc: string;
            /**
             * @description True when this person already had a password. It keeps working until the link is used, at
             *     which point it is replaced and every session they had open is ended.
             */
            replacedExistingSignIn: boolean;
            /** @description The link to hand over. Opening it is how they choose their password. */
            resetLink: string;
            /**
             * Format: uuid
             * @description Whose sign-in it is.
             */
            staffMemberId: string;
        };
        /**
         * @description Patch a staff member. BranchId is applied only when SetBranch
         *     is true, so that "make them venue-wide" (null) can be told apart from "leave it".
         */
        "Yalla.Application.Staff.UpdateStaffCommand": {
            /** Format: uuid */
            branchId?: string | null;
            fullName?: string | null;
            isActive?: boolean | null;
            phone?: string | null;
            role?: components["schemas"]["Yalla.Domain.Enums.StaffRole"] | null;
            setBranch: boolean;
        };
        /** @description A booking left stranded by a table going out of service. */
        "Yalla.Application.Tables.AffectedReservation": {
            /** @description The short code the diner quotes at the door. */
            code: string;
            /** @description Who to call. */
            guestName: string;
            /** @description What to call them on. This is the point of surfacing the list at all. */
            guestPhone: string;
            /**
             * Format: date
             * @description The booked date, as the diner sees it.
             */
            localDate: string;
            /**
             * Format: time
             * @description The booked time, as the diner sees it.
             */
            localStartTime: string;
            /**
             * Format: int32
             * @description How many, so the waiter can look for another table that fits.
             */
            partySize: number;
            /**
             * Format: uuid
             * @description The booking, so the waiter can release it from this screen.
             */
            reservationId: string;
            /**
             * Format: date-time
             * @description When they are expected.
             */
            startUtc: string;
            /** @description Lifecycle of a booking. Every member is the result of somebody doing something. */
            status: components["schemas"]["Yalla.Domain.Enums.ReservationStatus"];
        };
        /** @description The outcome of one table state change. */
        "Yalla.Application.Tables.TableStateChangeResult": {
            /** @description Bookings this table still has tonight, when it has just been marked out of service. */
            affectedReservations: components["schemas"]["Yalla.Application.Tables.AffectedReservation"][];
            /** Format: date-time */
            atUtc: string;
            /** Format: uuid */
            branchId: string;
            /** Format: uuid */
            clientCommandId: string;
            /**
             * Format: date-time
             * @description When the table has to be clear again: the next booking's start less the branch buffer.
             */
            freeUntilUtc?: string | null;
            /** @description The <b>physical</b> state of a table: what somebody did to it. */
            fromStatus: components["schemas"]["Yalla.Domain.Enums.TableStatus"];
            /**
             * Format: date-time
             * @description Start of the next relevant booking, when there is one.
             */
            nextReservationStartUtc?: string | null;
            /**
             * Format: int64
             * @description Money still owed, when the change left an unresolved tab behind.
             */
            outstandingAmd?: number | null;
            /** Format: uuid */
            reservationId?: string | null;
            /**
             * @description What a client should draw for a table: its physical Yalla.Domain.Enums.TableStatus with the
             *     reservation overlay applied.
             */
            state: components["schemas"]["Yalla.Domain.Enums.DerivedTableState"];
            /** Format: uuid */
            tabId?: string | null;
            /** Format: uuid */
            tableId: string;
            tableLabel: string;
            /**
             * Format: uuid
             * @description The occupancy opened or closed by this change.
             */
            tableSessionId?: string | null;
            /** @description The <b>physical</b> state of a table: what somebody did to it. */
            toStatus: components["schemas"]["Yalla.Domain.Enums.TableStatus"];
            warnings: components["schemas"]["Yalla.Application.Tables.TableStateWarning"][];
            /**
             * @description True when this command had already been applied and the result was replayed from the audit
             *     log rather than performed again. Callers can treat it exactly like a fresh success.
             */
            wasReplay: boolean;
        };
        /** @description A warning that accompanies a <i>successful</i> transition. */
        "Yalla.Application.Tables.TableStateWarning": {
            /** @description Stable slug clients branch on, e.g. `upcoming-reservation`. */
            code: string;
            /** @description Text for the waiter, e.g. `table 7 reserved 20:00`. */
            message: string;
        };
        /**
         * @description What a scan or a join hands back: the device's tab-scoped token, the tab as this person is
         *     allowed to see it, and which case they landed in.
         */
        "Yalla.Application.Tabs.TabAccessResult": {
            /** @description Which table-state case applied. */
            outcome: components["schemas"]["Yalla.Application.Tabs.TabOpenOutcome"];
            /** @description The tab, projected through this participant's own permissions. */
            tab: components["schemas"]["Yalla.Application.Tabs.TabView"];
            /** @description The participant token. No account behind it - see `docs/auth.md`. */
            token: components["schemas"]["Yalla.Application.Auth.TabParticipantTokenResult"];
            /**
             * @description True when the `clientCommandId` had already been applied and this is the original answer
             *     again. Treat exactly like a fresh success.
             */
            wasReplay: boolean;
        };
        /** @description One comp or discount, as the diner sees it. */
        "Yalla.Application.Tabs.TabAdjustmentView": {
            /**
             * Format: uuid
             * @description The adjustment row.
             */
            adjustmentId: string;
            /**
             * Format: int64
             * @description The flat amount, when it is one.
             */
            amountAmd?: number | null;
            /**
             * Format: date-time
             * @description When it was applied.
             */
            appliedAtUtc: string;
            /** @description True once it was reversed. It stays on the record, marked. */
            isVoided: boolean;
            /** @description Why money is coming off a bill. */
            kind: components["schemas"]["Yalla.Domain.Enums.AdjustmentKind"];
            /**
             * Format: uuid
             * @description The line it applies to, or null for one against the whole tab.
             */
            lineId?: string | null;
            /**
             * Format: double
             * @description The percentage, when it is one.
             */
            percent?: number | null;
            /** @description What the manager typed. */
            reason: string;
            /**
             * Format: int64
             * @description What it took off, in whole dram.
             */
            reductionAmd: number;
        };
        /** @description An invitation to a tab. One token, two ways to hand it over. */
        "Yalla.Application.Tabs.TabJoinTokenResult": {
            /**
             * Format: date-time
             * @description Thirty minutes from issue. The host refreshes by asking for another.
             */
            expiresAtUtc: string;
            /** @description The same token as a link, for WhatsApp or Telegram and the friend who is late. */
            shareUrl: string;
            /**
             * Format: uuid
             * @description The tab it joins.
             */
            tabId: string;
            /** @description The opaque value. Render it as a QR on the host's screen. */
            token: string;
        };
        /** @description One item on the tab, as snapshotted when it was ordered. */
        "Yalla.Application.Tabs.TabLineView": {
            /** @description True when the item belongs to the table and is split across those present. */
            isShared: boolean;
            /**
             * @description True when a waiter keyed it in for nobody in particular. It splits across the people at the table
             *     when it was ordered, exactly like a shared line, and SharedWithCount says how
             *     many.
             */
            isTableAttributed: boolean;
            /**
             * @description True once staff took it off the bill. <b>The line stays here, labelled.</b> It is excluded from
             *     every total, and a diner watching their bill must still see that the coffee was removed.
             */
            isVoided: boolean;
            /**
             * Format: uuid
             * @description The order line.
             */
            lineId: string;
            /**
             * Format: int64
             * @description Unit price times quantity, in whole dram. <b>Zero once voided.</b>
             */
            lineTotalAmd: number;
            /**
             * Format: uuid
             * @description The item, so the client can link back to the menu entry.
             */
            menuItemId: string;
            /** @description The item name as it read on the menu when ordered. */
            name: string;
            /** @description The kitchen note that was sent with it, e.g. "no onions". */
            note?: string | null;
            /**
             * Format: uuid
             * @description Who a waiter keyed the order in for, when the waiter knew. The line is that person's - on their
             *     `myLines` and their share - though PlacedByParticipantId is null.
             */
            onBehalfOfParticipantId?: string | null;
            /**
             * Format: uuid
             * @description The order it was part of, so the client can group a round together.
             */
            orderId: string;
            /** @description Kitchen-facing progress of one order placed against a tab. */
            orderStatus: components["schemas"]["Yalla.Domain.Enums.TabOrderStatus"];
            /** @description Their name at the time of reading. */
            placedByDisplayName?: string | null;
            /**
             * Format: uuid
             * @description Who ordered it from their phone. Null when a waiter keyed it in.
             */
            placedByParticipantId?: string | null;
            /**
             * Format: int32
             * @description How many.
             */
            quantity: number;
            /**
             * Format: int32
             * @description How many people a shared line is split between. <b>From the line's own participant snapshot, not
             *     the current roster</b>: a friend who joined ten minutes after the bottle was poured is not on it,
             *     and a badge computed from the roster would silently re-split every existing line each time
             *     somebody else scanned the code.
             */
            sharedWithCount: number;
            /**
             * Format: int64
             * @description Unit price in whole dram as it stood when ordered.
             */
            unitPriceAmd: number;
            /**
             * Format: date-time
             * @description When it was removed.
             */
            voidedAtUtc?: string | null;
            /** @description Why, in the waiter's own words. */
            voidReason?: string | null;
        };
        /**
         * Format: int32
         * @description Which of the four table-state cases a scan landed in. See `docs/tabs.md`.
         *
         *     Values: 1 OpenedNewSession, 2 OpenedOnExistingSession, 3 JoinedExistingTab.
         * @enum {integer}
         */
        "Yalla.Application.Tabs.TabOpenOutcome": 1 | 2 | 3;
        /** @description Who is at the table, as the other diners see them: a name, a face, and whether they are in yet. */
        "Yalla.Application.Tabs.TabParticipantSummary": {
            /** @description Their name on the tab. */
            displayName: string;
            /**
             * Format: uuid
             * @description The participant row.
             */
            participantId: string;
            /**
             * @description Their diner account's profile picture, when they scanned signed in and have one. Absent
             *     otherwise; draw initials. The URLs are relative to the API.
             */
            photo?: components["schemas"]["Yalla.Application.Media.PhotoView"] | null;
            /** @description Whether a participant opened the tab or joined it. */
            role: components["schemas"]["Yalla.Domain.Enums.ParticipantRole"];
            /** @description Whether a participant is allowed on the tab. */
            status: components["schemas"]["Yalla.Domain.Enums.ParticipantStatus"];
        };
        /** @description One person on a tab, with their flags. Not an account - see `docs/auth.md`. */
        "Yalla.Application.Tabs.TabParticipantView": {
            /** @description The stored flag: whether the host allows them to add items. */
            canOrder: boolean;
            /**
             * @description The flag applied to the moment: approved, allowed to order, and the tab still open. This is
             *     what the ordering endpoints will enforce, computed by the same rule.
             */
            canOrderNow: boolean;
            /** @description Whether they may settle against the tab. Implies CanSeeTableTotal. */
            canPay: boolean;
            /** @description Whether they may see the table aggregate and other people's items. */
            canSeeTableTotal: boolean;
            /** @description What the host sees. The participant can change their own. */
            displayName: string;
            /**
             * Format: date-time
             * @description When they scanned or joined.
             */
            joinedAtUtc: string;
            /**
             * Format: uuid
             * @description The participant row.
             */
            participantId: string;
            /**
             * @description Their profile picture, when the phone that scanned was signed in to a diner account that has
             *     one. Absent for a guest who scanned without an account - most of them - and for an account
             *     since deleted. The URLs are relative to the API.
             */
            photo?: components["schemas"]["Yalla.Application.Media.PhotoView"] | null;
            /** @description Whether a participant opened the tab or joined it. */
            role: components["schemas"]["Yalla.Domain.Enums.ParticipantRole"];
            /** @description Whether a participant is allowed on the tab. */
            status: components["schemas"]["Yalla.Domain.Enums.ParticipantStatus"];
        };
        /**
         * @description A tab as staff see it: every phone on the table, with roles and flags, and the money. Staff are
         *     not participants and are not subject to the host's visibility flags.
         */
        "Yalla.Application.Tabs.TabStaffView": {
            adjustments: components["schemas"]["Yalla.Application.Tabs.TabAdjustmentView"][];
            /** Format: uuid */
            branchId: string;
            /** Format: date-time */
            closedAtUtc?: string | null;
            /** Format: uuid */
            diningTableId: string;
            /** Format: uuid */
            hostParticipantId?: string | null;
            lines: components["schemas"]["Yalla.Application.Tabs.TabLineView"][];
            /** Format: int64 */
            maxSequence: number;
            /** Format: date-time */
            openedAtUtc: string;
            participants: components["schemas"]["Yalla.Application.Tabs.TabParticipantView"][];
            /** Format: double */
            serviceChargePercent: number;
            /** @description How the people on a tab agreed to split the bill. */
            settlementMode: components["schemas"]["Yalla.Domain.Enums.SettlementMode"];
            settlementModeLocked: boolean;
            /** @description Lifecycle of a tab. */
            status: components["schemas"]["Yalla.Domain.Enums.TabStatus"];
            /** Format: uuid */
            tabId: string;
            tableLabel: string;
            timeZoneId: string;
            /** Format: int64 */
            tipsAmd: number;
            /** @description The table aggregate, in whole dram. Server-computed; the client only displays it. */
            totals: components["schemas"]["Yalla.Application.Tabs.TabTotalsView"];
        };
        /** @description The table aggregate, in whole dram. Server-computed; the client only displays it. */
        "Yalla.Application.Tabs.TabTotalsView": {
            /** Format: int64 */
            paidAmd: number;
            /** Format: int64 */
            remainingAmd: number;
            /** Format: int64 */
            serviceChargeAmd: number;
            /** Format: int64 */
            subtotalAmd: number;
            /** Format: int64 */
            totalAmd: number;
        };
        /** @description A tab as one participant is allowed to see it. */
        "Yalla.Application.Tabs.TabView": {
            /**
             * @description Comps and discounts, with the reason the manager typed, for the same reason voided lines are
             *     shown: a total that drops with no visible cause makes people distrust the app. <b>Every one when
             *     TableTotalVisible; otherwise only those on one of
             *     MyLines</b>, whole. One off the whole tab, or off somebody else's line, is
             *     table money - a percentage off the whole tab and what it took off are the subtotal - and the
             *     caller's part of it reaches them through `/shares`.
             */
            adjustments: components["schemas"]["Yalla.Application.Tabs.TabAdjustmentView"][];
            /**
             * Format: uuid
             * @description The branch.
             */
            branchId: string;
            /** @description The branch's name, for the same reason. */
            branchName: string;
            /**
             * Format: date-time
             * @description When it closed, if it has.
             */
            closedAtUtc?: string | null;
            /** @description The table default for a joiner's `CanSeeTableTotal`. */
            hideTotalFromGuests: boolean;
            /**
             * Format: uuid
             * @description Who hosts. Null on a tab staff opened that nobody has scanned onto yet.
             */
            hostParticipantId?: string | null;
            /**
             * Format: int64
             * @description The tab's newest event position. On every tab response, so a client knows where it stands
             *     without a second call to `/events` purely to ask.
             */
            maxSequence: number;
            /** @description The caller's own participant row, with every flag and whether they may order right now. */
            me: components["schemas"]["Yalla.Application.Tabs.TabParticipantView"];
            /**
             * Format: int64
             * @description What the caller's own unsplit lines come to, in whole dram. Always present. Shared and
             *     table-attributed lines on MyLines carry `isShared` or
             *     `isTableAttributed` and are apportioned by `/shares`, not here.
             */
            myItemsSubtotalAmd: number;
            /**
             * @description The caller's own items, always present: one they ordered, or a waiter keyed in on their behalf,
             *     and a shared item they were at the table for - and a table-attributed line they were at the table
             *     for only with TableTotalVisible, because those can be the whole bill. See
             *     M:Yalla.Application.Tabs.TabProjection.IsOwnLine(Yalla.Application.Tabs.TabLineSnapshot,System.Guid,System.Boolean).
             */
            myLines: components["schemas"]["Yalla.Application.Tabs.TabLineView"][];
            /**
             * Format: date-time
             * @description When the tab opened.
             */
            openedAtUtc: string;
            /**
             * @description Who is at the table. Everyone still on the tab for an approved participant; only the caller
             *     themself while they are pending, because a pending joiner may see their own state and nothing else.
             */
            participants: components["schemas"]["Yalla.Application.Tabs.TabParticipantSummary"][];
            /**
             * Format: double
             * @description The branch's service charge as it stood when this tab opened, snapshotted onto the tab.
             *     <b>Present for everyone</b>, including a guest whose host has hidden the total: the percentage
             *     is a fact about the venue rather than an aggregate, and the bill has to state it from the first
             *     item. It was manager-only, sitting on the reservation policy behind `ManagerOrAbove`.
             */
            serviceChargePercent: number;
            /** @description How the people on a tab agreed to split the bill. */
            settlementMode: components["schemas"]["Yalla.Domain.Enums.SettlementMode"];
            /** @description True once a payment has landed; the split can no longer change. */
            settlementModeLocked: boolean;
            /** @description Lifecycle of a tab. */
            status: components["schemas"]["Yalla.Domain.Enums.TabStatus"];
            /**
             * Format: uuid
             * @description The tab.
             */
            tabId: string;
            /** @description The table as printed on the floor, e.g. 7 or T12. */
            tableLabel: string;
            /** @description Every line on the tab with who placed it, voided ones included. Absent when the total is hidden. */
            tableLines?: components["schemas"]["Yalla.Application.Tabs.TabLineView"][] | null;
            /** @description The table aggregate. <b>Absent</b> when not visible - never zero, never null-as-free. */
            tableTotal?: components["schemas"]["Yalla.Application.Tabs.TabTotalsView"] | null;
            /** @description Whether the three members below are present. */
            tableTotalVisible: boolean;
            /**
             * @description The branch's IANA zone, e.g. `Asia/Yerevan`. <b>Every time on this response is to be
             *     rendered in it, never in the device's.</b> A tourist's phone is on the wrong zone, and a diner
             *     who has just landed is the exact person least able to work out the offset - and without this the
             *     client had to make a second call to a different endpoint to find out.
             */
            timeZoneId: string;
            /**
             * Format: int64
             * @description The tips handed over with the tab's succeeded payments, in whole dram. <b>Outside the balance</b>:
             *     not in `tableTotal.paidAmd` or `remainingAmd`, which is why it is here and not in
             *     TableTotal. Absent with the table total, because a tip is money the table
             *     paid.
             */
            tipsAmd?: number | null;
            /**
             * @description The venue's name, for the top of the bill. On the tab so a phone that has only scanned a code
             *     need not make a second, public read to say where it is.
             */
            venueName: string;
        };
        /** @description One branch of the venue as the console lists it: enough to pick it and address it. */
        "Yalla.Application.Venues.ManagedBranchView": {
            /**
             * Format: uuid
             * @description The branch; what every `/api/branches/{branchId}` route is addressed by.
             */
            branchId: string;
            /** @description False for a branch the platform has switched off. It is listed so the switcher can say so. */
            isActive: boolean;
            /** @description Its display name. */
            name: string;
            /** @description Its URL-safe handle. */
            slug: string;
            /**
             * @description What a <b>branch</b> pays for. Stored per branch, never per venue: a chain with four locations
             *     is four paying customers. The venue-level view is a rollup.
             */
            subscriptionTier: components["schemas"]["Yalla.Domain.Enums.SubscriptionTier"];
            /**
             * Format: int32
             * @description How many tables it has, active or not.
             */
            tableCount: number;
            /** @description IANA time zone, so the console can show the branch's own clock. */
            timeZoneId: string;
            /**
             * Format: uuid
             * @description Its venue. Always the venue this view is of.
             */
            venueId: string;
        };
        /** @description The venue an owner or manager signs in to, with the branches their own staff row covers. */
        "Yalla.Application.Venues.ManagedVenueView": {
            /**
             * @description Every branch the caller covers, active ones first, then by name. Inactive branches are listed
             *     and flagged rather than hidden, because an owner may still open one.
             */
            branches: components["schemas"]["Yalla.Application.Venues.ManagedBranchView"][];
            /** @description Soft-deleted by the platform; nothing can be changed. */
            isDeleted: boolean;
            /** @description The platform has suspended it for non-payment; diners cannot book, staff can still configure. */
            isSuspended: boolean;
            /** @description Its display name. */
            name: string;
            /** @description The URL-safe handle its public page lives under. */
            slug: string;
            /** @description What kind of place a venue is. Drives the shipped reservation-policy defaults. */
            type: components["schemas"]["Yalla.Domain.Enums.VenueType"];
            /**
             * Format: uuid
             * @description The venue.
             */
            venueId: string;
        };
        /**
         * Format: int32
         * @description Who caused a logged change.
         *
         *     Values: 1 Diner, 2 Staff, 3 System.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.ActorType": 1 | 2 | 3;
        /**
         * Format: int32
         * @description Why money is coming off a bill.
         *
         *     Values: 1 Discount, 2 Comp.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.AdjustmentKind": 1 | 2;
        /**
         * Format: int32
         * @description Why a booking needs a human before it is promised.
         *
         *     Values: 1 BranchApprovesEveryBooking, 2 LargeParty, 3 NoShowHistory, 4 ShortNotice.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.ApprovalTrigger": 1 | 2 | 3 | 4;
        /**
         * Format: int32
         * @description How much of the tab a request for the bill is about. Only a Yalla.Domain.Enums.ServiceRequestPreset.TheBill
         *     request carries one.
         *
         *     Values: 1 WholeBill, 2 MyShare.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.BillScope": 1 | 2;
        /**
         * Format: int32
         * @description Why a booking that was waiting for the venue was declined.
         *
         *     Values: 1 StaffDeclined, 2 NoAnswer.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.DeclineReason": 1 | 2;
        /**
         * Format: int32
         * @description What a client should draw for a table: its physical Yalla.Domain.Enums.TableStatus with the
         *     reservation overlay applied.
         *
         *     Values: 1 Free, 2 ReservedSoon, 3 Held, 4 Occupied, 5 OutOfService.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.DerivedTableState": 1 | 2 | 3 | 4 | 5;
        /**
         * Format: int32
         * @description Whether a participant opened the tab or joined it.
         *
         *     Values: 1 Host, 2 Guest.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.ParticipantRole": 1 | 2;
        /**
         * Format: int32
         * @description Whether a participant is allowed on the tab.
         *
         *     Values: 1 PendingApproval, 2 Approved, 3 Removed.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.ParticipantStatus": 1 | 2 | 3;
        /**
         * Format: int32
         * @description Lifecycle of a payment attempt.
         *
         *     Values: 1 Reserved, 2 Succeeded, 3 Failed, 4 Released.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.PaymentStatus": 1 | 2 | 3 | 4;
        /**
         * Format: int32
         * @description Where a booking was made from.
         *
         *     Values: 0 Unknown, 1 App, 2 Web, 3 Staff.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.ReservationChannel": 0 | 1 | 2 | 3;
        /**
         * Format: int32
         * @description Lifecycle of a booking. Every member is the result of somebody doing something.
         *
         *     Values: 1 PendingApproval, 2 Confirmed, 4 Seated, 5 Completed, 6 CancelledByDiner, 7 CancelledByVenue, 8 NoShow.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.ReservationStatus": 1 | 2 | 4 | 5 | 6 | 7 | 8;
        /**
         * Format: int32
         * @description What a table is asking for. Presets only - see `docs/tabs.md`.
         *
         *     Values: 1 Napkins, 2 Water, 3 TheBill, 4 Other.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.ServiceRequestPreset": 1 | 2 | 3 | 4;
        /**
         * Format: int32
         * @description How the people on a tab agreed to split the bill.
         *
         *     Values: 1 HostPaysEverything, 2 EveryonePaysOwnItems, 3 AnyonePaysAnyAmount.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.SettlementMode": 1 | 2 | 3;
        /**
         * Format: int32
         * @description How hot a dish is, so the diner does not have to ask.
         *
         *     Values: 0 NotSpicy, 1 Mild, 2 Medium, 3 Hot.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.SpiceLevel": 0 | 1 | 2 | 3;
        /**
         * Format: int32
         * @description What a staff member is allowed to do, coarsely. Authorisation itself is a later task.
         *
         *     Values: 0 Unknown, 1 Owner, 2 Manager, 3 Waiter, 4 Kitchen, 5 PlatformAdmin, 6 GeneralManager.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.StaffRole": 0 | 1 | 2 | 3 | 4 | 5 | 6;
        /**
         * Format: int32
         * @description Optional hint from the diner about how long they expect to stay. Advisory only:
         *     `Reservation.EndUtc` is derived from the branch turn time, not from this.
         *
         *     Values: 1 OneHour, 2 TwoHours, 3 ThreeHoursPlus.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.StayHint": 1 | 2 | 3;
        /**
         * Format: int32
         * @description What a <b>branch</b> pays for. Stored per branch, never per venue: a chain with four locations
         *     is four paying customers. The venue-level view is a rollup.
         *
         *     Values: 1 Free, 2 Paid.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.SubscriptionTier": 1 | 2;
        /**
         * Format: int32
         * @description What happened on a tab, for the catch-up stream.
         *
         *     Values: 1 TabOpened, 2 ParticipantJoined, 3 ParticipantApproved, 4 ParticipantRejected, 5 ParticipantRemoved, 6 ParticipantPermissionsChanged, 7 ParticipantRenamed, 8 HostReassigned, 9 SettlementModeChanged, 10 OrderPlaced, 11 OrderStatusChanged, 12 LineVoided, 13 AdjustmentAdded, 14 AdjustmentVoided, 15 PaymentRecorded, 16 ServiceRequested, 17 ServiceRequestAcknowledged, 18 TabClosing, 19 TabClosed, 20 TabAbandoned.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.TabEventType": 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;
        /**
         * Format: int32
         * @description How a party came to occupy a table.
         *
         *     Values: 1 Reservation, 2 WalkIn.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.TableSessionSource": 1 | 2;
        /**
         * Format: int32
         * @description The <b>physical</b> state of a table: what somebody did to it.
         *
         *     Values: 1 Free, 2 Held, 4 Occupied, 5 OutOfService.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.TableStatus": 1 | 2 | 4 | 5;
        /**
         * Format: int32
         * @description Kitchen-facing progress of one order placed against a tab.
         *
         *     Values: 1 New, 2 InKitchen, 3 Ready, 4 Served, 5 Voided.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.TabOrderStatus": 1 | 2 | 3 | 4 | 5;
        /**
         * Format: int32
         * @description Lifecycle of a tab.
         *
         *     Values: 1 Open, 2 Closing, 3 Closed, 4 Abandoned.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.TabStatus": 1 | 2 | 3 | 4;
        /**
         * Format: int32
         * @description What kind of place a venue is. Drives the shipped reservation-policy defaults.
         *
         *     Values: 1 Cafe, 2 Restaurant, 3 Bar.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.VenueType": 1 | 2 | 3;
        /**
         * Format: int32
         * @description Which app store the device came from. Expo needs it and so does message formatting.
         *
         *     Values: 0 Unknown, 1 Ios, 2 Android.
         * @enum {integer}
         */
        "Yalla.Domain.Identity.DevicePlatform": 0 | 1 | 2;
        /**
         * Format: int32
         * @description Why a table cannot be booked for a particular slot.
         *
         *     Values: 1 LeadTimeTooShort, 2 OutsideBookingWindow, 3 OutsideOpeningHours, 4 PartyExceedsCapacity, 5 SeatOverhangExceeded, 6 TableNotBookable, 7 TableOutOfService, 8 TableAlreadyBooked, 9 LocalTimeDoesNotExist, 10 TableCurrentlyOccupied.
         * @enum {integer}
         */
        "Yalla.Domain.Occupancy.ReservationRejectionReason": 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    loginDiner: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.LoginDinerRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Auth.DinerSignInResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `invalid-credentials`: the identifier and password do not match a usable account. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `too-many-attempts` for this identifier, or too many requests from this address. Wait. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    refreshDinerToken: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.RefreshTokenRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Auth.RefreshResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The handle is unknown, expired, revoked, or was already spent. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    registerDiner: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.RegisterDinerRequest"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Auth.DinerSignInResult"];
                };
            };
            /** @description A field is malformed. `context.field` names it: `username`, `email`, `password`, `phoneE164` or `displayName`. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `username-taken`, `email-taken`, or `phone-in-use` - the number already has an account, and the app should offer *log in with a code instead*. `context.field` names the input either way. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.IdentifierTakenProblem"];
                };
            };
            /** @description Too many sign-ups from this address. Wait, then retry. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    requestDinerCode: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.RequestDinerCodeRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Auth.VerificationCodeRequestResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many codes requested for this number or from this address. Wait, then retry. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    signOutDiner: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.RefreshTokenRequest"];
            };
        };
        responses: {
            /** @description No Content */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    claimTelegramVerification: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                challengeId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.ClaimTelegramVerificationRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Auth.TelegramVerificationClaim"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `invalid-credentials`: the number was proved but its account is deactivated. The challenge is spent and no token is issued. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `telegram-verification-expired`: the challenge is unknown, past its deadline, already claimed, or not this caller's. Start again. */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Polling faster than `pollAfterMs`. Slow down. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    startTelegramVerification: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.StartTelegramVerificationRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Auth.TelegramVerificationStart"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many starts from this address. Wait, then retry. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    verifyDinerCode: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.VerifyDinerCodeRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Auth.DinerSignInResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `verification-code-invalid`: the code was wrong, with `context.attemptsRemaining` - zero when nothing is live for the number, which means ask for a new code rather than try again. `verification-code-expired`, with no context: codes last five minutes. `invalid-credentials`: the code was right but the number's account is deactivated - the password sign-in's answer; the code is spent and no token is issued. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.VerificationCodeInvalidProblem"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The code is out of attempts. Request a new one. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getEnrolledStaffDevice: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Auth.EnrolledDeviceView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No device token, or the device was revoked. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    enrolStaffDevice: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.RedeemEnrolmentCodeRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Auth.DeviceEnrolmentResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The code is unknown or has expired. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The code has already been redeemed, or this `deviceId` is already enrolled at that branch - in which case the client should show its PIN screen instead. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    signInStaffWithPin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.StaffPinRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Auth.StaffSessionResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Wrong PIN, or the tablet is no longer enrolled. The two are not distinguished. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many wrong PINs. A manager clears the lockout - see the admin endpoints. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    renewStaffSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.RenewStaffSessionRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Auth.StaffSessionResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The session timed out or the tablet was revoked. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getStaffRoster: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Auth.StaffRosterEntry"][];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No device token, or the device was revoked. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    signOutStaffSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.RenewStaffSessionRequest"];
            };
        };
        responses: {
            /** @description No Content */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    refreshVenueUserToken: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.RefreshTokenRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Auth.RefreshResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The handle is unknown, expired, revoked, or was already spent. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    requestPasswordReset: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.RequestPasswordResetRequest"];
            };
        };
        responses: {
            /** @description Accepted */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    resetPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.ResetPasswordRequest"];
            };
        };
        responses: {
            /** @description No Content */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The new password is shorter than the minimum. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The link is unknown, spent or expired. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    signInVenueUser: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.VenueUserSignInRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Auth.VenueUserSignInResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The email and password do not match an account. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    signOutVenueUser: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.RefreshTokenRequest"];
            };
        };
        responses: {
            /** @description No Content */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getBranchAvailability: {
        parameters: {
            query?: {
                date?: string;
                excludeReservationId?: string;
                partySize?: number;
                time?: string;
            };
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reservations.BranchAvailability"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many availability queries from this address. Generous but finite - the endpoint is anonymous and a phone will poll it. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getBranchDaySlots: {
        parameters: {
            query: {
                date: string;
                excludeReservationId?: string;
                partySize?: number;
            };
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reservations.BranchDaySlots"];
                };
            };
            /** @description `date` is missing or is not a date. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many availability queries from this address. Generous but finite - the endpoint is anonymous and a phone will poll it. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    listBranchDevices: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Auth.StaffDeviceSummary"][];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    revokeBranchDevice: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                deviceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No Content */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such device at this branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    createDeviceEnrolmentCode: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Auth.DeviceEnrolmentCodeResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Not a manager or owner, or not for this branch. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    createFloorArea: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.BranchSettings.FloorAreaCommand"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.BranchSettings.FloorAreaView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    deleteFloorArea: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                areaId: string;
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No Content */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such area at this branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    updateFloorArea: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                areaId: string;
                branchId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.BranchSettings.FloorAreaCommand"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.BranchSettings.FloorAreaView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such area at this branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getFloorPlan: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.BranchSettings.FloorPlanView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    putFloorPlan: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.BranchSettings.ReplaceFloorPlanCommand"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.BranchSettings.FloorPlanReplaceResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch, or a room photo that is not this branch's. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `table-has-future-bookings`: a table left out of the plan has a booking still to come. Move or cancel the bookings in `context.bookings`, or keep the tables. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.FloorPlanChangedProblem"] | components["schemas"]["Yalla.Api.Errors.TableHasFutureBookingsProblem"];
                };
            };
            /** @description Missing or repeated labels or room names, or a table matched twice (`floor-plan-invalid`, `context.errors`); or a photo or pin rule, or `expectedVersion` missing (`validation-failed`, `context.fields` names each). */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.FloorPlanRejectedProblem"] | components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getBranchListing: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.BranchSettings.BranchListingView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    putBranchListing: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.BranchSettings.BranchListingCommand"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.BranchSettings.BranchListingView"];
                };
            };
            /** @description Coordinates out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `relocation-not-allowed`: the form moves the branch and the caller is not its owner or a platform admin. Or `forbidden`: not a manager of this branch. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch, or a gallery photo not uploaded for it. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Fields out of bounds; `context.fields` names each. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getBranchMenu: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Menus.BranchMenuView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The venue is suspended or no longer on Yalla. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    createMenuCategory: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.Menus.CreateMenuCategoryCommand"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Menus.MenuCategoryView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    deleteMenuCategory: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                categoryId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No Content */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Items in this category appear on orders. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    updateMenuCategory: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                categoryId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.Menus.UpdateMenuCategoryCommand"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Menus.MenuCategoryView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such category at this branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    createMenuItem: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                categoryId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.Menus.CreateMenuItemCommand"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Menus.MenuItemView"];
                };
            };
            /** @description The name is blank, or the price is negative. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    deleteMenuItem: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                itemId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Menus.MenuItemDeletionResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such item at this branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    updateMenuItem: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                itemId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.Menus.UpdateMenuItemCommand"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Menus.MenuItemView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such item at this branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `categoryId` names a category that is not on this branch. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    setMenuItemAvailability: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                itemId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.VenueAdminEndpoints.SetAvailabilityRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Menus.MenuItemView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getMenuForAdmin: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Menus.MenuCategoryView"][];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getOpeningHours: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.BranchSettings.OpeningHoursView"][];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    putOpeningHours: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.BranchSettings.OpeningHoursBlock"][];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.BranchSettings.OpeningHoursView"][];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Blocks overlap, or one opens and closes at the same minute; `context.fields` names each. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getBranchOrders: {
        parameters: {
            query?: {
                status?: components["schemas"]["Yalla.Domain.Enums.TabOrderStatus"];
            };
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Ordering.KitchenOrderView"][];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Not kitchen or floor staff at this branch. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    uploadBranchPhoto: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": string;
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Media.PhotoUploadResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Requires the Manager role, at a branch of the caller's own venue, on an account that is still active. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The upload is not a JPEG, PNG or WebP, or it is larger than this system accepts. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `rate-limited`: more than the `diner-write` budget - ten uploads a minute per signed-in caller by default. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getBranchPublicProfile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.BranchSettings.PublicProfileView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    putBranchPublicProfile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.BranchSettings.PublicProfileCommand"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.BranchSettings.PublicProfileView"];
                };
            };
            /** @description `phoneE164` is not a valid E.164 number. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch, or `coverPhotoId` names a photo that was not uploaded for it. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getBranchReadiness: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.BranchSettings.BranchReadinessView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getMenuReport: {
        parameters: {
            query: {
                format?: string;
                from: string;
                rollUpVenue?: boolean;
                to: string;
            };
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reports.MenuReport"];
                };
            };
            /** @description The range is longer than a report will run; `context.max` says the limit. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getOccupancyReport: {
        parameters: {
            query: {
                format?: string;
                from: string;
                rollUpVenue?: boolean;
                to: string;
            };
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reports.OccupancyReport"];
                };
            };
            /** @description The range is longer than a report will run; `context.max` says the limit. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getReservationReport: {
        parameters: {
            query: {
                format?: string;
                from: string;
                rollUpVenue?: boolean;
                to: string;
            };
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reports.ReservationReport"];
                };
            };
            /** @description The range is longer than a report will run; `context.max` says the limit. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getRevenueReport: {
        parameters: {
            query: {
                format?: string;
                from: string;
                rollUpVenue?: boolean;
                to: string;
            };
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reports.RevenueReport"];
                };
            };
            /** @description The range is longer than a report will run; `context.max` says the limit. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getStaffReport: {
        parameters: {
            query: {
                format?: string;
                from: string;
                rollUpVenue?: boolean;
                to: string;
            };
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reports.StaffReport"];
                };
            };
            /** @description The range is longer than a report will run; `context.max` says the limit. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getReservationPolicy: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.BranchSettings.ReservationPolicyView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    putReservationPolicy: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.BranchSettings.ReservationPolicyCommand"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.BranchSettings.ReservationPolicyChangeResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description One or more fields are outside their bounds; `context.fields` names every one. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    listBranchReservations: {
        parameters: {
            query?: {
                Status?: components["schemas"]["Yalla.Domain.Enums.ReservationStatus"];
            };
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reservations.ReservationView"][];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Another venue's staff, a waiter, or a manager of a different branch of this venue. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `status` is missing or is not a booking status. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    listAwaitingApproval: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reservations.AwaitingApproval"][];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Not a waiter or above at this branch - a cook, a diner, another branch's staff. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    listBranchReviewsForModeration: {
        parameters: {
            query?: {
                filter?: string;
                page?: number;
                pageSize?: number;
            };
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reviews.ModeratedReviewPage"];
                };
            };
            /** @description `page`, `pageSize` or `filter` out of range; `context.field` names it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Another venue's staff, a waiter, or a manager of a different branch of this venue. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    setBranchReviewVisibility: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                reviewId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.SetReviewVisibilityRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reviews.ModeratedReviewView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller does not cover this branch, or is putting back a review the platform took down. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such review at this branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `hidden` missing, or `reason` missing (bound `required`) or over 500 characters (bound `max`) when hiding. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getOpenServiceRequests: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Ordering.ServiceRequestView"][];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Not staff at this branch. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    clearStaffPinLockout: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                staffMemberId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No Content */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such staff member in this branch's venue. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    deleteTable: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                tableId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.BranchSettings.TableDeletionResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such table at this branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `table-has-future-bookings`: the table has a booking still to come - move or cancel the bookings in `context.bookings` first. Also 409 (no context): a party is seated at the table, or another floor-plan save held the plan too long. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.TableHasFutureBookingsProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    freeTable: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                tableId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.TableStateRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tables.TableStateChangeResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch or table. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Someone else changed this table first. The body's `context` carries the table's current status and session, so the client can redraw it rather than showing a generic failure. Never retry automatically: retrying would seat a walk-in at a table a booking just took. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The transition is not one the state machine allows - freeing an empty table, or marking an occupied one out of service. The body's `context` lists the transitions that are legal from the current status. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    holdTable: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                tableId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.TableStateRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tables.TableStateChangeResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch or table. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Someone else changed this table first. The body's `context` carries the table's current status and session, so the client can redraw it rather than showing a generic failure. Never retry automatically: retrying would seat a walk-in at a table a booking just took. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The transition is not one the state machine allows - freeing an empty table, or marking an occupied one out of service. The body's `context` lists the transitions that are legal from the current status. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    openTabForStaff: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                tableId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.OpenTabForStaffRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tabs.TabStaffView"];
                };
            };
            /** @description Missing clientCommandId. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Not staff at this branch. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No table in service with that id at this branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `table-not-seated`: nobody is sitting there - seat the party first. (A table still Occupied after its last bill was paid is not refused: the party gets a new sitting and the new tab on it.) Also returned, with no `context`, when the table is out of service, the branch is not on a tier with tabs, or this `clientCommandId` opened a tab somewhere else. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.TableNotSeatedProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    markTableOutOfService: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                tableId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.TableStateRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tables.TableStateChangeResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch or table. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Someone else changed this table first. The body's `context` carries the table's current status and session, so the client can redraw it rather than showing a generic failure. Never retry automatically: retrying would seat a walk-in at a table a booking just took. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The transition is not one the state machine allows - freeing an empty table, or marking an occupied one out of service. The body's `context` lists the transitions that are legal from the current status. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    releaseTableHold: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                tableId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.TableStateRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tables.TableStateChangeResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch or table. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Someone else changed this table first. The body's `context` carries the table's current status and session, so the client can redraw it rather than showing a generic failure. Never retry automatically: retrying would seat a walk-in at a table a booking just took. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The transition is not one the state machine allows - freeing an empty table, or marking an occupied one out of service. The body's `context` lists the transitions that are legal from the current status. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    returnTableToService: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                tableId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.TableStateRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tables.TableStateChangeResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch or table. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Someone else changed this table first. The body's `context` carries the table's current status and session, so the client can redraw it rather than showing a generic failure. Never retry automatically: retrying would seat a walk-in at a table a booking just took. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The transition is not one the state machine allows - freeing an empty table, or marking an occupied one out of service. The body's `context` lists the transitions that are legal from the current status. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    seatHeldParty: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                tableId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.SeatHeldPartyRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tables.TableStateChangeResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch or table. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Someone else changed this table first. The body's `context` carries the table's current status and session, so the client can redraw it rather than showing a generic failure. Never retry automatically: retrying would seat a walk-in at a table a booking just took. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The transition is not one the state machine allows - freeing an empty table, or marking an occupied one out of service. The body's `context` lists the transitions that are legal from the current status. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    seatReservation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                tableId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.SeatReservationRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tables.TableStateChangeResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch or table. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Someone else changed this table first. The body's `context` carries the table's current status and session, so the client can redraw it rather than showing a generic failure. Never retry automatically: retrying would seat a walk-in at a table a booking just took. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The transition is not one the state machine allows - freeing an empty table, or marking an occupied one out of service. The body's `context` lists the transitions that are legal from the current status. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    seatWalkIn: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
                tableId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.SeatWalkInRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tables.TableStateChangeResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch or table. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Someone else changed this table first. The body's `context` carries the table's current status and session, so the client can redraw it rather than showing a generic failure. Never retry automatically: retrying would seat a walk-in at a table a booking just took. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The transition is not one the state machine allows - freeing an empty table, or marking an occupied one out of service. The body's `context` lists the transitions that are legal from the current status. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getBranchChanges: {
        parameters: {
            query?: {
                afterSequence?: number;
                limit?: number;
            };
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Floor.BranchChangePage"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getBranchFloor: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Floor.BranchFloorState"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getMyBranchReview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Diners.DinerReviewView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Needs a diner token. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such published branch, or no review by this diner. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    putBranchReview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.Diners.SubmitBranchReviewCommand"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Diners.DinerReviewView"];
                };
            };
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Diners.DinerReviewView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Needs a diner token. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `review-needs-visit` on a first write, with the window in `context`; or `phone-not-verified`. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ReviewNeedsVisitProblem"];
                };
            };
            /** @description No such published branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Rating or text out of bounds. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `rate-limited`: more than the `diner-write` budget - ten writes a minute per account by default - counted across reviews, reports and photo uploads. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    createBranchReview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.Diners.SubmitBranchReviewCommand"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Diners.DinerReviewView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Needs a diner token. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `review-needs-visit`, with the window in `context`; or `phone-not-verified`, with no `context`. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ReviewNeedsVisitProblem"];
                };
            };
            /** @description No such published branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description This diner has already reviewed it. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Rating or text out of bounds. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `rate-limited`: more than the `diner-write` budget - ten writes a minute per account by default - counted across reviews, reports and photo uploads. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    registerDinerDevice: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.RegisterDeviceRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Needs a verified diner. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getDinerFavorites: {
        parameters: {
            query?: {
                lat?: number;
                lng?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Diners.DinerFavoriteList"];
                };
            };
            /** @description `lat`/`lng` half sent or out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Needs a diner token. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    mergeDinerFavorites: {
        parameters: {
            query?: {
                lat?: number;
                lng?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.Diners.MergeFavoritesCommand"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Diners.DinerFavoriteList"];
                };
            };
            /** @description `lat`/`lng` half sent or out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Needs a diner token. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The merge would pass 500 favourites; nothing was written. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `branchIds` missing (bound `required`) or over 500 (bound `max`). */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description `rate-limited`: more than the `diner-write` budget - ten writes a minute per account by default - counted across favourites, reviews, reports and photo uploads. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    addDinerFavorite: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No Content */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Needs a diner token. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such published branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The account already keeps 500 favourites. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `rate-limited`: more than the `diner-write` budget - ten writes a minute per account by default - counted across favourites, reviews, reports and photo uploads. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    removeDinerFavorite: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No Content */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Needs a diner token. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `rate-limited`: more than the `diner-write` budget - ten writes a minute per account by default - counted across favourites, reviews, reports and photo uploads. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getDinerProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Diners.DinerProfileView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Needs a diner token. `session-revoked` when the token's session has ended - the account was deactivated or deleted, the password was set or changed, or the number's owner proved it. Every `/api/diner` route answers that the same way: refresh once, and sign out if the refresh is refused too. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The token is not a diner's - a tab participant has no account. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    updateDinerProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.UpdateDinerProfileRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Diners.DinerProfileView"];
                };
            };
            /** @description A field is malformed. `context.field` names it: `displayName`, `username` or `email`. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Needs a diner token. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `username-taken` or `email-taken`, with `context.field` naming the input. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.IdentifierTakenProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    deleteDinerAccount: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.DeleteDinerAccountRequest"];
            };
        };
        responses: {
            /** @description No Content */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `invalid-credentials`: the password or code is wrong, or the code has expired. `session-revoked`: the token's session has ended. Or no diner token. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `validation-failed` naming `password` or `code`, bound `required`: the proof this account needs was not sent. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description `too-many-attempts`: the account's attempts, or the code's, are spent. Or `rate-limited` per address. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    setDinerPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.SetDinerPasswordRequest"];
            };
        };
        responses: {
            /** @description No Content */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The new password breaks the rule. `context.field` is `newPassword`. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `invalid-credentials`: the current password was sent and is wrong. `session-revoked`: the token's session has ended. Or no diner token. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `currentPassword` was needed and not sent: the account has a password and this sign-in did not prove the phone in the last ten minutes. `context.field` is `currentPassword`. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    uploadDinerPhoto: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": string;
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Media.PhotoView"];
                };
            };
            /** @description No `file` part in the upload. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Needs a diner token. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `unsupported-image`: not a JPEG, PNG or WebP, or larger than this system accepts. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `rate-limited`: more than the `diner-write` budget - ten writes a minute per account by default. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    removeDinerPhoto: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No Content */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Needs a diner token. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getDinerNotifications: {
        parameters: {
            query?: {
                before?: string;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Diners.DinerNotificationPage"];
                };
            };
            /** @description `before` is not a cursor from this feed, or `limit` is out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Needs a diner token. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    markDinerNotificationsRead: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.Diners.MarkNotificationsReadCommand"];
            };
        };
        responses: {
            /** @description No Content */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Needs a diner token. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description More than 200 `ids` (bound `max`). */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getDinerOrders: {
        parameters: {
            query?: {
                status?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Diners.DinerOrderView"][];
                };
            };
            /** @description `status` is not `active` or `history`. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Needs a diner token. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getDinerOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Diners.DinerOrderView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Needs a diner token. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such order of this diner's. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    reportReview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reviewId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.Diners.ReportReviewCommand"];
            };
        };
        responses: {
            /** @description No Content */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Needs a diner token. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such published review. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The review is the caller's own. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `reason` missing (bound `required`) or not one of the five (bound `range`), or `note` over 500 characters (bound `max`). */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description `rate-limited`: more than the `diner-write` budget - ten writes a minute per account by default - counted across reviews, reports and photo uploads. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    moveOrderStatus: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.MoveOrderStatusRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Ordering.KitchenOrderView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Not kitchen or floor staff at the order's branch, or this role may not make that move. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The rail does not allow that transition. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getPhotoVariant: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                photoId: string;
                variant: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such photo or variant. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    listPlatformActivity: {
        parameters: {
            query?: {
                limit?: number;
                venueId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Platform.ActivityFeed"];
                };
            };
            /** @description `limit` out of range; `context.field` names it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Platform admin only. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    updateBranch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.Platform.UpdateBranchCommand"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Platform.BranchSummary"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Going Paid with an unfinished menu, or going Free with open tabs. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.BranchNotReadyProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    listPlatformBranchReviews: {
        parameters: {
            query?: {
                filter?: string;
                page?: number;
                pageSize?: number;
            };
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reviews.ModeratedReviewPage"];
                };
            };
            /** @description `page`, `pageSize` or `filter` out of range; `context.field` names it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getPlatformAdminProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Platform.PlatformAdminProfile"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Platform admin only. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    updatePlatformAdminProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.UpdatePlatformAdminProfileRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Platform.PlatformAdminProfile"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Platform admin only. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `fullName` missing, blank or over 200 characters. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    changePlatformAdminPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.ChangePlatformAdminPasswordRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Auth.RefreshResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Platform admin only. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `currentPassword` missing or wrong, or `newPassword` missing or too short - every one at once. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description Too many wrong current passwords, or the `auth` rate limit; `Retry-After` says how long to wait. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getOutboxHealth: {
        parameters: {
            query?: {
                deadLetterLimit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Messaging.OutboxHealthView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Platform admin only. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getPlatformOverview: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Platform.PlatformOverview"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Platform admin only. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    dismissPlatformReviewReports: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reviewId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reviews.ModeratedReviewView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such review. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    restorePlatformReviewReports: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reviewId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reviews.ModeratedReviewView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such review. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    setPlatformReviewVisibility: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reviewId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.SetReviewVisibilityRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reviews.ModeratedReviewView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such review. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `hidden` missing, or `reason` missing (bound `required`) or over 500 characters (bound `max`) when hiding. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    listVenues: {
        parameters: {
            query?: {
                dir?: string;
                includeDeleted?: boolean;
                page?: number;
                pageSize?: number;
                search?: string;
                sort?: string;
                status?: string;
                tier?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Platform.PagedResult`1[[Yalla.Application.Platform.VenueSummary, Yalla.Application, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]]"];
                };
            };
            /** @description `status`, `tier`, `sort` or `dir` is not a value it takes; `context.field` names it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    createVenue: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.Platform.CreateVenueCommand"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Platform.VenueDetail"];
                };
            };
            /** @description A field is out of range, or the body is malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The venue slug is already taken. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Required fields are missing; `context.fields` names every one. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getVenue: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                venueId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Platform.VenueDetail"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such venue. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    deleteVenue: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                venueId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Platform.VenueDetail"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such venue. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Open tabs or future bookings block the deletion; `context` lists them. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    updateVenue: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                venueId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.Platform.UpdateVenueCommand"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Platform.VenueDetail"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such venue. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The slug is taken, or the venue is deleted. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getVenueBookingsSummary: {
        parameters: {
            query?: {
                days?: number;
            };
            header?: never;
            path: {
                venueId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Platform.VenueBookingsSummary"];
                };
            };
            /** @description `days` is not 7 or 30; `context.field` names it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such venue. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    addBranch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                venueId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.Platform.CreateBranchCommand"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Platform.BranchSummary"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such venue. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The branch slug is taken within the venue. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    reactivateVenue: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                venueId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Platform.VenueDetail"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such venue. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    restoreVenue: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                venueId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Platform.VenueDetail"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such venue. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The venue's web address is now another venue's. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    suspendVenue: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                venueId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Platform.VenueDetail"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such venue. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getPublicBooking: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Public.PublicBookingView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The link is not valid. Deliberately indistinguishable from an expired one. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    cancelPublicBooking: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.CancelBookingRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Public.PublicBookingView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The link is not valid. Deliberately indistinguishable from an expired one. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getPublicBranches: {
        parameters: {
            query?: {
                category?: components["schemas"]["Yalla.Domain.Enums.VenueType"];
                lat?: number;
                lng?: number;
                q?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Public.PublicBranchListing"][];
                };
            };
            /** @description `lat` without `lng`, or either out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getPublicBranchDetail: {
        parameters: {
            query?: {
                lat?: number;
                lng?: number;
            };
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Public.PublicBranchDetail"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch, or it is not published. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getPublicAvailability: {
        parameters: {
            query: {
                date?: string;
                excludeReservationId?: string;
                partySize: number;
                time?: string;
            };
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reservations.BranchAvailability"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch, or it is not published. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getPublicDaySlots: {
        parameters: {
            query: {
                date: string;
                excludeReservationId?: string;
                partySize: number;
            };
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reservations.BranchDaySlots"];
                };
            };
            /** @description `date` or `partySize` is missing or malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch, or it is not published. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getPublicMenu: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Menus.BranchMenuView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch, or it is not published. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getPublicBranchMeta: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Public.PublicBranchMeta"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch, or it is not published. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getPublicBranchReviews: {
        parameters: {
            query?: {
                page?: number;
            };
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Public.PublicReviewPage"];
                };
            };
            /** @description `page` below 1, or past the last page that can exist. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch, or it is not published. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getPublicBranchRooms: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Public.PublicBranchRooms"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch, or it is not published. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getPublicBranch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branchSlug: string;
                venueSlug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Public.PublicBranchPage"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No branch is published at that pairing. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    searchPublicBranches: {
        parameters: {
            query?: {
                category?: components["schemas"]["Yalla.Domain.Enums.VenueType"];
                lat?: number;
                lng?: number;
                q?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Public.PublicBranchListing"][];
                };
            };
            /** @description `q` too long, or a half or out-of-range position. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getPublicVenues: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Public.PublicVenueCard"][];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    createReservation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.CreateReservationRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reservations.ReservationView"];
                };
            };
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reservations.ReservationView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `phone-not-verified`: the account registered with a number it has never proved. Send the diner through the code flow (`request-code`, `verify-code`) first; reading and cancelling bookings stay open meanwhile. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such branch or table. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Someone else took that table between the diner seeing it free and confirming. The body's `context` carries the clashing window and a fresh availability snapshot, so the app can redraw the floor and show what changed rather than only saying no. Never retried automatically: this answer will not change on a repeat. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description A branch rule refused the booking. Each rule has its own `code` - `reservation-party-exceeds-capacity`, `reservation-outside-opening-hours` and so on - with the numbers behind it in `context`, so the app can say which table to pick instead rather than showing a generic failure. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The table's booking lock could not be had in time. `context.retryable` is true: unlike the 409, this one is worth retrying - with the same `clientCommandId`, so a retry that crosses with a late-committing original is recognised as a replay. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.LockTimeoutProblem"];
                };
            };
        };
    };
    approveReservation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.DecideReservationRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reservations.ReservationView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Not a waiter or above at this booking's branch. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such booking. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `reservation-approval-expired`: too late to answer - the short-notice answer window (`approvalExpiresAtUtc`) has closed, or the booking was already declined because nobody answered in time (`declinedBecause` 2); approving also once the booking has started. `context` carries `reservationId`, `status`, `startUtc` and `approvalExpiresAtUtc`. Drop the request from the panel: the diner is told the venue did not answer in time. `conflicting-state`: the booking is not waiting for approval. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    cancelReservation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.CancelReservationRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reservations.ReservationView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description This booking belongs to somebody else. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such booking. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The booking is not in a state that permits this - cancelling one that is already seated, or approving one that was never pending. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    extendReservationHold: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.ExtendHoldRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reservations.ExtendHoldResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Not the diner who made the booking (`forbidden`), or `phone-not-verified`: the account registered with a number it has never proved. Send the diner through the code flow (`request-code`, `verify-code`) first; reading and cancelling bookings stay open meanwhile. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such booking. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Refused, with one of three codes - branch on it. `hold-not-active`: the booking has not started, so nothing is held yet, or it is not confirmed. `hold-already-extended`: the one extension is used. `extensions-not-offered`: the branch offers none - not the diner's doing, so never tell them they already let the venue know. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.HoldExtensionRefusedProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    markReservationNoShow: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.MarkNoShowRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reservations.ReservationReleaseResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Not staff at this booking's branch. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such booking. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The booking cannot be released. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    rejectReservation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.DecideReservationRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reservations.ReservationView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Not a waiter or above at this booking's branch. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such booking. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `reservation-approval-expired`: too late to answer - the short-notice answer window (`approvalExpiresAtUtc`) has closed, or the booking was already declined because nobody answered in time (`declinedBecause` 2); approving also once the booking has started. `context` carries `reservationId`, `status`, `startUtc` and `approvalExpiresAtUtc`. Drop the request from the panel: the diner is told the venue did not answer in time. `conflicting-state`: the booking is not waiting for approval. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    releaseReservation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.ReleaseReservationRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reservations.ReservationReleaseResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Not staff at this booking's branch. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such booking. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The booking is not in a state that can be released - it was already seated, completed or cancelled by the diner. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    rescheduleReservation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reservationId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.RescheduleReservationRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reservations.ReservationView"];
                };
            };
            /** @description `diningTableId` names a table at another branch. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `phone-not-verified`: the account registered with a number it has never proved. Send the diner through the code flow (`request-code`, `verify-code`) first; reading and cancelling bookings stay open meanwhile. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such booking, or it is somebody else's - one answer for both; or no such table. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `reservation-not-changeable`: the booking is finished with or has started. `table-already-booked` / `table-currently-occupied`: the new slot is taken - Someone else took that table between the diner seeing it free and confirming. The body's `context` carries the clashing window and a fresh availability snapshot, so the app can redraw the floor and show what changed rather than only saying no. Never retried automatically: this answer will not change on a repeat. `concurrent-update`: the booking was cancelled, approved or seated while this was in flight; read it again. `bookings-not-accepted`, `web-bookings-not-accepted`, `branch-unavailable`: the branch stopped taking bookings. `client-command-id-in-use`: the id belongs to another command or to a different change. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description A branch rule refused the booking. Each rule has its own `code` - `reservation-party-exceeds-capacity`, `reservation-outside-opening-hours` and so on - with the numbers behind it in `context`, so the app can say which table to pick instead rather than showing a generic failure. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The table's booking lock could not be had in time. `context.retryable` is true: unlike the 409, this one is worth retrying - with the same `clientCommandId`, so a retry that crosses with a late-committing original is recognised as a replay. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.LockTimeoutProblem"];
                };
            };
        };
    };
    getMyReservations: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Reservations.MyReservations"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    acknowledgeServiceRequest: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Ordering.ServiceRequestView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Not staff. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    voidTabAdjustment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                adjustmentId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Ordering.AdjustmentView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Requires the Manager role. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    regenerateTableQr: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tableId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.BranchSettings.FloorTableView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such table. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getTab: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tabId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tabs.TabView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description This token is for a different tab, the participant was removed, or the tab closed longer ago than the receipt grace period. Decided by the policy, before the handler runs. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such tab. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    abandonTab: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tabId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.AbandonTabRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Ordering.TabTotalsSnapshot"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Requires the Manager role. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    addTabAdjustment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tabId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.AddAdjustmentRequest"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Ordering.AdjustmentView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Requires the Manager role. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    beginClosingTab: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tabId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tabs.TabStaffView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The tab is not open. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    setTabDisplayName: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tabId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.SetDisplayNameRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tabs.TabParticipantView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description This token is for a different tab, the participant was removed, or the tab closed longer ago than the receipt grace period. Decided by the policy, before the handler runs. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getTabEvents: {
        parameters: {
            query?: {
                afterSequence?: number;
                limit?: number;
            };
            header?: never;
            path: {
                tabId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Ordering.TabEventPage"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description This token is for a different tab, the participant was removed, or the tab closed longer ago than the receipt grace period. Decided by the policy, before the handler runs. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    createTabJoinToken: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tabId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tabs.TabJoinTokenResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Only the host of this tab may do this. The caller is on the tab but is not its host. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The tab is being settled; nobody new can join it. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    leaveTab: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tabId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tabs.TabParticipantView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description This token is for a different tab, the participant was removed, or the tab closed longer ago than the receipt grace period. Decided by the policy, before the handler runs. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller hosts the tab and nobody approved is left to hand it to. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    voidTabLine: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lineId: string;
                tabId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.VoidLineRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Ordering.OrderView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such line on this tab. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `line-already-paid`: the tab has been paid against, so this would be a refund. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.LineAlreadyPaidProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    placeOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tabId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.PlaceOrderRequest"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Ordering.OrderView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description This token is for a different tab, the participant was removed, or the tab closed longer ago than the receipt grace period. Decided by the policy, before the handler runs. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `tab-not-accepting-orders`: the bill has been asked for. Show the bill, not the menu. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.MenuItemUnavailableProblem"] | components["schemas"]["Yalla.Api.Errors.TabNotAcceptingOrdersProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getTabForStaff: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tabId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tabs.TabStaffView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such tab. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    approveTabParticipant: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                participantId: string;
                tabId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tabs.TabParticipantView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Only the host of this tab may do this. The caller is on the tab but is not its host. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such participant on this tab. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The participant is not in a state that permits this - approving someone removed, rejecting someone already approved, removing the host. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    setTabParticipantPermissions: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                participantId: string;
                tabId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.SetParticipantPermissionsRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tabs.TabParticipantView"];
                };
            };
            /** @description `canPay` is true while `canSeeTableTotal` is false. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Only the host of this tab may do this. The caller is on the tab but is not its host. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such participant on this tab. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The participant is not in a state that permits this - approving someone removed, rejecting someone already approved, removing the host. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `canSeeTableTotal` is false on the host's own row. `context.field` is `canSeeTableTotal`. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    rejectTabParticipant: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                participantId: string;
                tabId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tabs.TabParticipantView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Only the host of this tab may do this. The caller is on the tab but is not its host. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such participant on this tab. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The participant is not in a state that permits this - approving someone removed, rejecting someone already approved, removing the host. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    removeTabParticipant: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                participantId: string;
                tabId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tabs.TabParticipantView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Only the host of this tab may do this. The caller is on the tab but is not its host. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such participant on this tab. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The participant is not in a state that permits this - approving someone removed, rejecting someone already approved, removing the host. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    recordCashPayment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tabId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.RecordCashRequest"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Ordering.CashPaymentView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Not staff at this branch. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `payment-exceeds-remaining`: more was offered than is owed. **Show `context.remainingAmd`** - the waiter is at the table and needs the number. Also returned when another payment landed first, in which case the balance has moved. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.PaymentExceedsRemainingProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    reassignTabHost: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tabId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.ReassignHostRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tabs.TabStaffView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such tab or participant. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The participant is not approved, is already the host, or the tab is closed. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    raiseServiceRequest: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tabId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.RaiseServiceRequest"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Ordering.ServiceRequestView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description This token is for a different tab, the participant was removed, or the tab closed longer ago than the receipt grace period. Decided by the policy, before the handler runs. Or `billScope` 1 WholeBill from somebody the table total is hidden from. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `billScope` or `tipPercent` refused - on a preset other than 3, a tip with no scope, a tip outside 0 to 25, or a scope that leaves nothing to pay. `context.fields` names each. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description `service-request-rate-limited`: too many, too fast. `context.windowMinutes` says how long to wait. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ServiceRequestRateLimitedProblem"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    setTabSettlementMode: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tabId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.SetSettlementModeRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tabs.TabView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Only the host of this tab may do this. The caller is on the tab but is not its host. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The settlement mode is locked. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getTabShares: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tabId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Ordering.TabSharesView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description This token is for a different tab, the participant was removed, or the tab closed longer ago than the receipt grace period. Decided by the policy, before the handler runs. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    placeOrderAsStaff: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tabId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.PlaceOrderRequest"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Ordering.OrderView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Not staff, or another branch's tab. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `tab-not-accepting-orders`: the bill has been asked for. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.MenuItemUnavailableProblem"] | components["schemas"]["Yalla.Api.Errors.TabNotAcceptingOrdersProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    joinTab: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.JoinTabRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tabs.TabAccessResult"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The invitation is unknown, revoked or expired. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The tab is being settled or is closed; nobody new can join. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    openTab: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.OpenTabRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tabs.TabAccessResult"];
                };
            };
            /** @description Missing device id or clientCommandId. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No table in service carries that QR code. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The table is out of service, or the tab there is being settled and takes no new people. Also returned when this `clientCommandId` was used by a different device. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    openTabByBooking: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.OpenTabByBookingRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Tabs.TabAccessResult"];
                };
            };
            /** @description Missing device id or clientCommandId. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `phone-not-verified`: the account registered with a number it has never proved. Send the diner through the code flow (`request-code`, `verify-code`) first; reading and cancelling bookings stay open meanwhile. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `booking-not-found`: none of the caller's bookings has that code. Somebody else's booking answers exactly the same. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `booking-too-early` (`context.earliestUtc` says when), `booking-ended`, or `booking-not-active` (`context.status` says why), or `booking-table-occupied` (another party is still seated there) - branch on the code. And, as on the scan, the table out of service, the tab there being settled, or this `clientCommandId` used by another device - those with no `context`. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.BookingTabRefusedProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    getManagedVenue: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                venueId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Venues.ManagedVenueView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Another venue's staff, a waiter or kitchen hand, or an account that has been deactivated. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such venue. Only a platform admin can reach this. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    listStaff: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                venueId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Staff.StaffMemberView"][];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    createStaff: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                venueId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.Staff.CreateStaffCommand"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Staff.StaffMemberView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The role asked for is above what the caller may assign, or a branch manager is putting somebody at another branch or at none. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description A branch manager with no `branchId`, or a general manager with one. `context.field` is `branchId`. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    updateStaff: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                staffMemberId: string;
                venueId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Application.Staff.UpdateStaffCommand"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Staff.StaffMemberView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Changing your own role, editing someone you could not have created, or a branch manager reaching past their branch. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such staff member in this venue. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The resulting role and branch do not fit: a branch manager with none, or a general manager with one. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    setStaffPin: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                staffMemberId: string;
                venueId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.VenueAdminEndpoints.SetPinRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Staff.StaffMemberView"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated but not allowed to perform this action. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Too many requests in the window, or a one-time credential is out of attempts. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
    issueStaffSignIn: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                staffMemberId: string;
                venueId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Yalla.Api.Endpoints.VenueAdminEndpoints.IssueSignInRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Yalla.Application.Staff.StaffSignInLink"];
                };
            };
            /** @description The request violated a domain rule or arrived malformed. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No usable token was presented, or the one presented was rejected. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Not allowed to issue a sign-in for this person: yourself, an equal, or someone above you. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description No such staff member in this venue. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description A waiter or kitchen hand signs in with a PIN; the person is deactivated; or that address already has an account. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description `email` is missing, not an address, or longer than 320 characters; `context.field` names it. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.ValidationFailedProblem"];
                };
            };
            /** @description Too many sign-ins issued in the last minute. Wait, then retry. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
            /** @description Unexpected failure. Quote the traceId from the body. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
                };
            };
        };
    };
}
