import type { ApiClient } from '../client';
import type { ConsoleGateway } from '../consoleGateway';
import { ForbiddenError } from '../errors';
import { createConsoleHttpContext, type ConsoleHttpGatewayOptions } from './console/context';
import { venuesMethods } from './console/venues';
import { platformHomeMethods } from './console/platformHome';
import { venueAccountMethods } from './console/venueAccount';
import { floorPlanMethods } from './console/floorPlan';
import { menuMethods } from './console/menu';
import { photosMethods } from './console/photos';
import { hoursMethods } from './console/hours';
import { publicPageMethods } from './console/publicPage';
import { policyMethods } from './console/policy';
import { bookingsMethods } from './console/bookings';
import { reviewsMethods } from './console/reviews';
import { staffMethods } from './console/staff';
import { shiftsMethods } from './console/shifts';
import { devicesMethods } from './console/devices';
import { reportsMethods } from './console/reports';
import { preOrdersMethods } from './console/preOrders';
import { takeawayMethods } from './console/takeaway';
import { messagesMethods } from './console/messages';
import { activityMethods } from './console/activity';

export { createMemoryIdentityStore } from './console/context';
export type { ConsoleHttpGatewayOptions, ConsoleIdentityStore } from './console/context';

/**
 * The console over HTTP.
 *
 * Two tiers of venue read. Venue *management* — listing, creating, suspending
 * — is the platform tier: `/api/platform/venues`, guarded by
 * `PlatformAdminOnly` server-side, and a venue user calling it gets a 403 that
 * surfaces as a plain refusal rather than a retry loop. The venue *a person
 * runs* is `GET /api/venues/{venueId}/manage`, the one read an owner or a
 * manager is allowed, and the one the venue section learns its branches from.
 * Nothing here sends a role or a scope — the token carries both.
 *
 * Every method maps a real endpoint. Nothing is faked: a fabricated
 * "suspended" would be worse than any error.
 *
 * The methods live per feature in `console/*`, sharing `console/context.ts`.
 */
export function createConsoleHttpGateway(
  client: ApiClient,
  options: ConsoleHttpGatewayOptions,
): ConsoleGateway {
  const ctx = createConsoleHttpContext(client, options);

  return {
    ...venuesMethods(ctx),
    ...platformHomeMethods(ctx),
    ...venueAccountMethods(ctx),
    ...floorPlanMethods(ctx),
    ...menuMethods(ctx),
    ...photosMethods(ctx),
    ...hoursMethods(ctx),
    ...publicPageMethods(ctx),
    ...policyMethods(ctx),
    ...bookingsMethods(ctx),
    ...reviewsMethods(ctx),
    ...staffMethods(ctx),
    ...shiftsMethods(ctx),
    ...devicesMethods(ctx),
    ...reportsMethods(ctx),
    ...preOrdersMethods(ctx),
    ...takeawayMethods(ctx),
    ...messagesMethods(ctx),
    ...activityMethods(ctx),
  };
}

/** Re-exported so a screen inspecting the refusal needs one import. */
export { ForbiddenError };
