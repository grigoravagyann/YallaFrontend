/**
 * GENERATED FILE — do not edit.
 *
 * Source: http://127.0.0.1:5086/swagger/v1/swagger.json
 * Regenerate with: pnpm api:generate
 */

/* eslint-disable */
export interface paths {
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
         *     A wrong code spends one of five attempts. The sixth attempt is refused outright with 429: the code is dead and a new one is needed.
         */
        post: operations["verifyDinerCode"];
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
         * @description Every table in the branch with its floor-plan geometry, its derived state at the requested time, whether it can be booked for this party - and if not, the one specific reason - and the window the diner may have. Assembled in a single query. Returns no guest names and no money. Omit date and time for 'now, at the branch'.
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
        /** Remove a floor area; its tables stay, with no area */
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
        /** Canvas size, areas, and every table with its geometry */
        get: operations["getFloorPlan"];
        /**
         * Replace the whole plan in one atomic call
         * @description The editor sends the finished layout: canvas, areas and tables together. It lands whole or not at all.
         *
         *     - Tables match by `id`, then by `label`, so an editor that lost the ids still edits the same tables and their **QR codes survive**. A QR token is never regenerated by an edit.
         *     - Every table must sit inside the canvas; labels must be unique. Violations are 422 naming the tables.
         *     - **Overlapping tables are a warning, not an error.** Real rooms have stools under bars.
         *     - A table omitted from the plan is deleted only if it has never been used. One with any reservation, session or tab is **deactivated** instead, and `deactivatedTables` says so.
         */
        put: operations["putFloorPlan"];
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
        /** The full menu, including unavailable items */
        get: operations["getMenuForAdmin"];
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
         * Add an item
         * @description Ingredients, allergens, portion size, prep minutes and a photo URL are **required**. They are what a diner would otherwise ask a waiter; optional fields stay blank and the feature is worthless. Photo upload is out of scope - a URL is accepted for now.
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
         * Edit an item, including its price
         * @description A price change never affects existing order lines, which snapshotted the price they were placed at.
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
         */
        put: operations["putOpeningHours"];
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
         * @description Every field, as one form. Out-of-range values are **refused, never clamped** - a turn time of 5 minutes or 12 hours gets a 400 that says so.
         *
         *     **Existing bookings are never touched.** If the new window or turn time would not have allowed some of them, `affectedExistingReservations` says how many and `affectedReservationIds` which; they stay exactly as booked. The new rules apply to future bookings only.
         */
        put: operations["putReservationPolicy"];
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
         * @description A table with any reservation, session or tab is **deactivated**, not deleted - deleting it would orphan financial and occupancy records. The response says which happened. Only a table that has never been used is removed outright.
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
         * Name, address, coordinates, timezone, canvas size, active flag, tier
         * @description `subscriptionTier` is set here, per branch. Moving a branch to Free switches off tabs and ordering there; the tab endpoints answer `feature-not-enabled`.
         */
        patch: operations["updateBranch"];
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
         * Venues, with search and paging
         * @description Each row carries its branch count, table count, paid-branch count and the tier rollup - Paid only when every branch is paid, because billing is per branch.
         */
        get: operations["listVenues"];
        put?: never;
        /**
         * Create a venue with its first branch
         * @description A venue with no branch is useless, so the first branch is created in the same transaction. A failure creates neither. The branch's `subscriptionTier` defaults to Free.
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
         * @description **Soft delete only.** Reservations, tabs and payments hang off the venue and are never removed. Refused while any tab is open or any confirmed booking is still in the future - the response names which.
         */
        delete: operations["deleteVenue"];
        options?: never;
        head?: never;
        /** Name, type, slug, active flag */
        patch: operations["updateVenue"];
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
         * @description Idempotent on `clientCommandId`: a retry returns the original booking and creates nothing, answering 200 rather than 201. Lands as `Confirmed`, or `PendingApproval` when the branch approves every booking, the party is over the branch's threshold, or the diner is over the rolling no-show threshold.
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
         * @description Scoped to the acting staff member's own branch and venue. A manager of one venue cannot decide another's bookings by guessing an id.
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
         * @description Refuses a booking that was already confirmed: the diner has been told it is theirs.
         */
        post: operations["rejectReservation"];
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
         *     - The caller's **own items and own subtotal are always present**, whatever the flags.
         *     - The **table total and other people's items appear only with `canSeeTableTotal`**, and only once approved. When hidden they are **absent from the body** - not zero, not null - with `tableTotalVisible: false` beside the gap, so no client can render a hidden total as a free bill.
         *     - A **pending** participant sees their own row and nothing else.
         *
         *     Menu prices are not part of this view and stay visible through the menu, so a guest without the total can always work out what their own order costs.
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
         * @description A status change, never a delete. Their items and any payment they made are financial records and survive them leaving. The host cannot remove themself; staff reassign the host first.
         */
        post: operations["removeTabParticipant"];
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
    "/api/venues/{venueId}/staff": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Everyone who works for the venue */
        get: operations["listStaff"];
        put?: never;
        /**
         * Add a staff member, with a PIN
         * @description A manager may create waiters and kitchen staff; an owner or platform admin may create managers and owners. Nobody creates a role above their own. Email and password are for people who use the admin panel.
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
        /** @description Body for a diner cancelling their own booking. */
        "Yalla.Api.Endpoints.CancelReservationRequest": {
            /** @description Optional free text, recorded on the booking. */
            reason?: string | null;
        };
        /** @description Body for booking a table. */
        "Yalla.Api.Endpoints.CreateReservationRequest": {
            /**
             * Format: uuid
             * @description The branch being booked.
             */
            branchId: string;
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
        /** @description Body of `POST /api/tabs/join`. */
        "Yalla.Api.Endpoints.JoinTabRequest": {
            /** @description See Yalla.Api.Endpoints.OpenTabRequest.DeviceId. */
            deviceId: string;
            /** @description Optional display name. */
            displayName?: string | null;
            /** @description The invitation from the host's QR or share link. Thirty-minute lifetime. */
            joinToken: string;
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
        /** @description Body of `POST /api/tabs/{tabId}/reassign-host`. */
        "Yalla.Api.Endpoints.ReassignHostRequest": {
            /**
             * Format: uuid
             * @description The approved participant who takes over.
             */
            newHostParticipantId: string;
        };
        /** @description Body of `POST /api/auth/staff/enrol`. */
        "Yalla.Api.Endpoints.RedeemEnrolmentCodeRequest": {
            /** @description The one-time enrolment code a manager generated for this branch. */
            code: string;
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
            /**
             * Format: int32
             * @description How many people sat down.
             */
            partySize: number;
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
            /**
             * Format: int32
             * @description Overrides the booked size when the number who turned up differs.
             */
            partySize?: number | null;
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
            /**
             * Format: int32
             * @description How many people sat down.
             */
            partySize: number;
            /** @description Optional free text for the audit log. */
            reason?: string | null;
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
        /** @description Body of a state-change request that needs nothing beyond the table. */
        "Yalla.Api.Endpoints.TableStateRequest": {
            /**
             * Format: uuid
             * @description The caller's own id for this command. <b>Required.</b> The staff tablet queues changes while
             *     the wifi is down and replays them on reconnect, so the same request arrives twice; this is
             *     what makes the second arrival return the first one's result instead of acting again.
             */
            clientCommandId: string;
            /** @description Optional free text for the audit log. */
            reason?: string | null;
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
        "Yalla.Application.BranchSettings.FloorAreaCommand": {
            /** Format: int32 */
            displayOrder: number;
            name: string;
        };
        /** @description An area as the editor sends it. `Id` matches an existing area; null means new. */
        "Yalla.Application.BranchSettings.FloorAreaInput": {
            /** Format: int32 */
            displayOrder: number;
            /** Format: uuid */
            id?: string | null;
            name: string;
        };
        "Yalla.Application.BranchSettings.FloorAreaView": {
            /** Format: int32 */
            displayOrder: number;
            /** Format: uuid */
            id: string;
            name: string;
        };
        /**
         * @description The plan as applied, plus what the editor should know: overlaps (warnings, not errors), and
         *     which omitted tables were deactivated rather than deleted because they have history.
         */
        "Yalla.Application.BranchSettings.FloorPlanReplaceResult": {
            deactivatedTables: string[];
            /** @description Canvas size, areas, and every table with its geometry. Inactive tables are included, flagged. */
            plan: components["schemas"]["Yalla.Application.BranchSettings.FloorPlanView"];
            removedTables: string[];
            warnings: string[];
        };
        /** @description Canvas size, areas, and every table with its geometry. Inactive tables are included, flagged. */
        "Yalla.Application.BranchSettings.FloorPlanView": {
            areas: components["schemas"]["Yalla.Application.BranchSettings.FloorAreaView"][];
            /** Format: uuid */
            branchId: string;
            /** Format: int32 */
            floorHeight: number;
            /** Format: int32 */
            floorWidth: number;
            tables: components["schemas"]["Yalla.Application.BranchSettings.FloorTableView"][];
        };
        /**
         * @description A table as the editor sends it. `Id` matches an existing table; null means new - unless a
         *     table with that label already exists in the branch, in which case it is that table, so its QR
         *     code survives an editor that lost the id.
         */
        "Yalla.Application.BranchSettings.FloorTableInput": {
            /** @description Names an area in the same plan, by name. Null for no area. */
            floorAreaName?: string | null;
            /** Format: int32 */
            height: number;
            /** Format: uuid */
            id?: string | null;
            isBookable: boolean;
            label: string;
            /** Format: double */
            rotationDegrees: number;
            /** Format: int32 */
            seats: number;
            /** @description Footprint of a table on the floor plan. */
            shape: components["schemas"]["Yalla.Domain.Enums.TableShape"];
            /** Format: int32 */
            width: number;
            /** Format: int32 */
            x: number;
            /** Format: int32 */
            y: number;
        };
        "Yalla.Application.BranchSettings.FloorTableView": {
            /** Format: uuid */
            floorAreaId?: string | null;
            /** Format: int32 */
            height: number;
            /** Format: uuid */
            id: string;
            isActive: boolean;
            isBookable: boolean;
            label: string;
            qrToken: string;
            /** Format: double */
            rotationDegrees: number;
            /** Format: int32 */
            seats: number;
            /** @description Footprint of a table on the floor plan. */
            shape: components["schemas"]["Yalla.Domain.Enums.TableShape"];
            /** @description The <b>physical</b> state of a table: what somebody did to it. */
            status: components["schemas"]["Yalla.Domain.Enums.TableStatus"];
            /** Format: int32 */
            width: number;
            /** Format: int32 */
            x: number;
            /** Format: int32 */
            y: number;
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
        /** @description The whole plan, replaced in one atomic call. */
        "Yalla.Application.BranchSettings.ReplaceFloorPlanCommand": {
            areas: components["schemas"]["Yalla.Application.BranchSettings.FloorAreaInput"][];
            /** Format: int32 */
            floorHeight: number;
            /** Format: int32 */
            floorWidth: number;
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
            /** @description Every field of the owned Yalla.Domain.Venues.ReservationPolicy, as read. */
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
        };
        /** @description What deleting a table did: removed outright, or deactivated because it has history. */
        "Yalla.Application.BranchSettings.TableDeletionResult": {
            deactivated: boolean;
            deleted: boolean;
            label: string;
            message: string;
            /** Format: uuid */
            tableId: string;
        };
        /** @description Everything needed to draw one branch's floor from above, as of one instant. */
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
            /** Format: int32 */
            floorHeight: number;
            /** Format: int32 */
            floorWidth: number;
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
            /** Format: int32 */
            height: number;
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
            /** Format: int32 */
            partySize?: number | null;
            /** @description The <b>physical</b> state of a table: what somebody did to it. */
            physicalStatus: components["schemas"]["Yalla.Domain.Enums.TableStatus"];
            /** Format: double */
            rotationDegrees: number;
            /** Format: date-time */
            seatedAtUtc?: string | null;
            /** Format: int32 */
            seats: number;
            /** @description Footprint of a table on the floor plan. */
            shape: components["schemas"]["Yalla.Domain.Enums.TableShape"];
            /**
             * @description What a client should draw for a table: its physical Yalla.Domain.Enums.TableStatus with the
             *     reservation overlay applied.
             */
            state: components["schemas"]["Yalla.Domain.Enums.DerivedTableState"];
            /** Format: uuid */
            tableId: string;
            /** Format: int32 */
            width: number;
            /** Format: int32 */
            x: number;
            /** Format: int32 */
            y: number;
        };
        "Yalla.Application.Menus.CreateMenuCategoryCommand": {
            /** Format: int32 */
            displayOrder: number;
            name: string;
        };
        /**
         * @description A new item. Ingredients, allergens, portion size, prep minutes and a photo are <b>required</b>:
         *     they are what a diner would otherwise ask a waiter, and optional fields stay blank.
         */
        "Yalla.Application.Menus.CreateMenuItemCommand": {
            allergens: string;
            description: string;
            /** Format: int32 */
            displayOrder: number;
            ingredients: string;
            name: string;
            photoUrl: string;
            portionSize: string;
            /** Format: int32 */
            prepMinutes: number;
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
        "Yalla.Application.Menus.MenuItemView": {
            allergens: string;
            /** Format: uuid */
            categoryId: string;
            description: string;
            /** Format: int32 */
            displayOrder: number;
            /** Format: uuid */
            id: string;
            ingredients: string;
            isAvailable: boolean;
            name: string;
            photoUrl: string;
            portionSize: string;
            /** Format: int32 */
            prepMinutes: number;
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
        /** @description Patch an item. Only supplied fields change; a supplied field must still be non-blank. */
        "Yalla.Application.Menus.UpdateMenuItemCommand": {
            allergens?: string | null;
            description?: string | null;
            /** Format: int32 */
            displayOrder?: number | null;
            ingredients?: string | null;
            name?: string | null;
            photoUrl?: string | null;
            portionSize?: string | null;
            /** Format: int32 */
            prepMinutes?: number | null;
            /** Format: int64 */
            priceAmd?: number | null;
            spiceLevel?: components["schemas"]["Yalla.Domain.Enums.SpiceLevel"] | null;
        };
        "Yalla.Application.Platform.BranchSummary": {
            address: string;
            /** Format: uuid */
            branchId: string;
            /** Format: int32 */
            floorHeight: number;
            /** Format: int32 */
            floorWidth: number;
            isActive: boolean;
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
            /** Format: int32 */
            tableCount: number;
            timeZoneId: string;
            /** Format: uuid */
            venueId: string;
        };
        /** @description Add a branch. The tier is per branch - a chain with four locations pays four times. */
        "Yalla.Application.Platform.CreateBranchCommand": {
            address: string;
            /** Format: int32 */
            floorHeight: number;
            /** Format: int32 */
            floorWidth: number;
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
        "Yalla.Application.Platform.PagedResult`1[[Yalla.Application.Platform.VenueSummary, Yalla.Application, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]]": {
            items: components["schemas"]["Yalla.Application.Platform.VenueSummary"][];
            /** Format: int32 */
            page: number;
            /** Format: int32 */
            pageSize: number;
            /** Format: int32 */
            totalCount: number;
        };
        /** @description Patch a branch. Every field optional; only the ones supplied change. Coordinates and address travel together. */
        "Yalla.Application.Platform.UpdateBranchCommand": {
            address?: string | null;
            /** Format: int32 */
            floorHeight?: number | null;
            /** Format: int32 */
            floorWidth?: number | null;
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
        "Yalla.Application.Platform.VenueDetail": {
            branches: components["schemas"]["Yalla.Application.Platform.BranchSummary"][];
            /** @description One venue as the platform sees it, with the per-branch tier rolled up. */
            venue: components["schemas"]["Yalla.Application.Platform.VenueSummary"];
        };
        /** @description One venue as the platform sees it, with the per-branch tier rolled up. */
        "Yalla.Application.Platform.VenueSummary": {
            /** Format: int32 */
            branchCount: number;
            /** Format: date-time */
            deletedAtUtc?: string | null;
            isActive: boolean;
            isDeleted: boolean;
            isSuspended: boolean;
            name: string;
            /** Format: int32 */
            paidBranchCount: number;
            slug: string;
            /**
             * @description What a <b>branch</b> pays for. Stored per branch, never per venue: a chain with four locations
             *     is four paying customers. The venue-level view is a rollup.
             */
            subscriptionTier: components["schemas"]["Yalla.Domain.Enums.SubscriptionTier"];
            /** Format: date-time */
            suspendedAtUtc?: string | null;
            /** Format: int32 */
            tableCount: number;
            /** @description What kind of place a venue is. Drives the shipped reservation-policy defaults. */
            type: components["schemas"]["Yalla.Domain.Enums.VenueType"];
            /** Format: uuid */
            venueId: string;
        };
        /**
         * Format: int32
         * @description Why a booking needs a human before it is promised.
         *
         *     Values: 1 BranchApprovesEveryBooking, 2 LargeParty, 3 NoShowHistory.
         * @enum {integer}
         */
        "Yalla.Application.Reservations.ApprovalTrigger": 1 | 2 | 3;
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
            /** Format: int32 */
            floorHeight: number;
            /** Format: int32 */
            floorWidth: number;
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
        /** @description A diner's own bookings, split the way the app shows them. */
        "Yalla.Application.Reservations.MyReservations": {
            /** @description Everything else - completed, cancelled, missed - most recent first. */
            past: components["schemas"]["Yalla.Application.Reservations.ReservationView"][];
            /** @description Bookings that have not finished yet, soonest first. */
            upcoming: components["schemas"]["Yalla.Application.Reservations.ReservationView"][];
        };
        /** @description One booking as every client sees it. */
        "Yalla.Application.Reservations.ReservationView": {
            /** @description Why the booking is waiting for a human, when it is. Null for a confirmed booking. */
            awaitingApprovalBecause?: components["schemas"]["Yalla.Application.Reservations.ApprovalTrigger"] | null;
            /** Format: uuid */
            branchId: string;
            branchName: string;
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
            /** Format: int32 */
            partySize: number;
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
        /** @description One table's answer for the requested slot: can the diner have it, and if so, for how long. */
        "Yalla.Application.Reservations.TableAvailability": {
            /**
             * Format: time
             * @description The same window in the branch's wall clock, for display.
             */
            availableFromLocal?: string | null;
            /**
             * Format: date-time
             * @description Start of the window on offer. The requested slot, when the table is available.
             */
            availableFromUtc?: string | null;
            /**
             * Format: int32
             * @description Length of the window in minutes. Null when there is no limit.
             */
            availableMinutes?: number | null;
            /** Format: time */
            availableUntilLocal?: string | null;
            /**
             * Format: date-time
             * @description When the table stops being theirs: the next booking's start less the branch's clearing
             *     time. <b>Null means no limit</b> - nothing is booked after them.
             */
            availableUntilUtc?: string | null;
            /** Format: int32 */
            floorAreaDisplayOrder: number;
            /** Format: uuid */
            floorAreaId?: string | null;
            floorAreaName?: string | null;
            /** Format: int32 */
            height: number;
            /** @description Whether this table can be booked for this party at this time. */
            isAvailable: boolean;
            isBookable: boolean;
            label: string;
            /**
             * @description True when a later booking closes the window. False means the table has no limit at all,
             *     which is the answer a diner would rather have and the one this flag exists to let a client
             *     sort on.
             */
            limitedByNextBooking: boolean;
            /**
             * Format: uuid
             * @description The booking that closes the window, when there is one.
             */
            nextReservationId?: string | null;
            /** Format: date-time */
            nextReservationStartUtc?: string | null;
            /** @description The <b>physical</b> state of a table: what somebody did to it. */
            physicalStatus: components["schemas"]["Yalla.Domain.Enums.TableStatus"];
            /**
             * @description True when booking this table will land as `PendingApproval` rather than confirmed -
             *     a party over the branch's threshold. Not a refusal, and worth saying before the diner
             *     commits.
             */
            requiresApproval: boolean;
            /** Format: double */
            rotationDegrees: number;
            /** Format: int32 */
            seats: number;
            /** @description Footprint of a table on the floor plan. */
            shape: components["schemas"]["Yalla.Domain.Enums.TableShape"];
            /**
             * @description What a client should draw for a table: its physical Yalla.Domain.Enums.TableStatus with the
             *     reservation overlay applied.
             */
            state: components["schemas"]["Yalla.Domain.Enums.DerivedTableState"];
            /** Format: uuid */
            tableId: string;
            /** @description The one specific reason it cannot, when it cannot. Null when it can. */
            unavailableReason?: components["schemas"]["Yalla.Domain.Occupancy.ReservationRejectionReason"] | null;
            /** Format: int32 */
            width: number;
            /** Format: int32 */
            x: number;
            /** Format: int32 */
            y: number;
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
        /** @description The outcome of one table state change. */
        "Yalla.Application.Tables.TableStateChangeResult": {
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
             * Format: uuid
             * @description The order line.
             */
            lineId: string;
            /**
             * Format: int64
             * @description Unit price times quantity, in whole dram.
             */
            lineTotalAmd: number;
            /** @description The item name as it read on the menu when ordered. */
            name: string;
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
             * Format: int64
             * @description Unit price in whole dram as it stood when ordered.
             */
            unitPriceAmd: number;
        };
        /**
         * Format: int32
         * @description Which of the four table-state cases a scan landed in. See `docs/tabs.md`.
         *
         *     Values: 1 OpenedNewSession, 2 OpenedOnExistingSession, 3 JoinedExistingTab.
         * @enum {integer}
         */
        "Yalla.Application.Tabs.TabOpenOutcome": 1 | 2 | 3;
        /** @description Who is at the table, as the other diners see them: a name and whether they are in yet. */
        "Yalla.Application.Tabs.TabParticipantSummary": {
            /** @description Their name on the tab. */
            displayName: string;
            /**
             * Format: uuid
             * @description The participant row.
             */
            participantId: string;
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
            /** Format: uuid */
            branchId: string;
            /** Format: date-time */
            closedAtUtc?: string | null;
            /** Format: uuid */
            diningTableId: string;
            /** Format: uuid */
            hostParticipantId?: string | null;
            /** Format: date-time */
            openedAtUtc: string;
            participants: components["schemas"]["Yalla.Application.Tabs.TabParticipantView"][];
            /** @description How the people on a tab agreed to split the bill. */
            settlementMode: components["schemas"]["Yalla.Domain.Enums.SettlementMode"];
            settlementModeLocked: boolean;
            /** @description Lifecycle of a tab. */
            status: components["schemas"]["Yalla.Domain.Enums.TabStatus"];
            /** Format: uuid */
            tabId: string;
            tableLabel: string;
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
             * Format: uuid
             * @description The branch.
             */
            branchId: string;
            /**
             * Format: date-time
             * @description When it closed, if it has.
             */
            closedAtUtc?: string | null;
            /** @description The table default for a joiner's `CanSeeTableTotal`. */
            hideTotalFromGuests: boolean;
            /**
             * Format: uuid
             * @description Who hosts. Null only on a tab built by hand with no host.
             */
            hostParticipantId?: string | null;
            /** @description The caller's own participant row, with every flag and whether they may order right now. */
            me: components["schemas"]["Yalla.Application.Tabs.TabParticipantView"];
            /**
             * Format: int64
             * @description What the caller's own unshared lines come to, in whole dram. Always present. Shared lines are
             *     listed in MyLines with `isShared` set and are apportioned by the
             *     splitting task, not here.
             */
            myItemsSubtotalAmd: number;
            /** @description The caller's own items - placed by them, or shared with them. Always present. */
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
            /** @description Every live line on the tab with who placed it. Absent when the total is hidden. */
            tableLines?: components["schemas"]["Yalla.Application.Tabs.TabLineView"][] | null;
            /** @description The table aggregate. <b>Absent</b> when not visible - never zero, never null-as-free. */
            tableTotal?: components["schemas"]["Yalla.Application.Tabs.TabTotalsView"] | null;
            /** @description Whether the two members below are present. */
            tableTotalVisible: boolean;
        };
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
         * @description Lifecycle of a booking. Every member is the result of somebody doing something.
         *
         *     Values: 1 PendingApproval, 2 Confirmed, 4 Seated, 5 Completed, 6 CancelledByDiner, 7 CancelledByVenue, 8 NoShow.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.ReservationStatus": 1 | 2 | 4 | 5 | 6 | 7 | 8;
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
         *     Values: 0 PlatformAdmin, 1 Owner, 2 Manager, 3 Waiter, 4 Kitchen.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.StaffRole": 0 | 1 | 2 | 3 | 4;
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
         * @description How a party came to occupy a table.
         *
         *     Values: 1 Reservation, 2 WalkIn.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.TableSessionSource": 1 | 2;
        /**
         * Format: int32
         * @description Footprint of a table on the floor plan.
         *
         *     Values: 1 Rectangle, 2 Round.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.TableShape": 1 | 2;
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
         *     Values: 1 Cafe, 2 Restaurant.
         * @enum {integer}
         */
        "Yalla.Domain.Enums.VenueType": 1 | 2;
        /**
         * Format: int32
         * @description Why a table cannot be booked for a particular slot.
         *
         *     Values: 1 LeadTimeTooShort, 2 OutsideBookingWindow, 3 OutsideOpeningHours, 4 PartyExceedsCapacity, 5 SeatOverhangExceeded, 6 TableNotBookable, 7 TableOutOfService, 8 TableAlreadyBooked, 9 LocalTimeDoesNotExist.
         * @enum {integer}
         */
        "Yalla.Domain.Occupancy.ReservationRejectionReason": 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
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
            /** @description The code was wrong or has expired. Codes last five minutes. */
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
            /** @description The code has already been redeemed. */
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
            /** @description Tables outside the canvas or repeated labels; `context` names them. */
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
            /** @description A required field is missing or blank. */
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
            /** @description Two blocks on one day overlap. */
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
            /** @description A field is outside its bounds; the message names it. */
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
            /** @description A party is seated at the table. */
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
                includeDeleted?: boolean;
                page?: number;
                pageSize?: number;
                search?: string;
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
            /** @description A field is missing or out of range. */
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
                    "application/problem+json": components["schemas"]["Yalla.Api.Errors.UnifiedErrorEnvelope"];
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
            /** @description Not a manager of this booking's branch. */
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
            /** @description Not a manager of this booking's branch. */
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
            /** @description The role asked for is above what the caller may assign. */
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
            /** @description Changing your own role, or editing someone you could not have created. */
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
}
