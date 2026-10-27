import type { ConsoleGateway } from '../consoleGateway';
import { createConsoleMockContext, type ConsoleMockOptions } from './console/context';
import { venuesMethods } from './console/venues';
import { platformHomeMethods } from './console/platformHome';
import { venueAccountMethods } from './console/venueAccount';
import { floorPlanMethods } from './console/floorPlan';
import { menuMethods } from './console/menu';
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
import { branchFeaturesMethods } from './console/branchFeatures';

export { MOCK_PLATFORM_PASSWORD, MOCK_VENUE_PASSWORD } from './console/context';
export type { ConsoleMockOptions } from './console/context';

/**
 * The console's mock backend.
 *
 * Built from the same `mockVenues` fixture the diner side uses, so a venue the
 * team suspends here is recognisably the venue a diner browses — one world, two
 * audiences, which is the point of putting both in one app.
 */
export function createConsoleMockGateway(options: ConsoleMockOptions = {}): ConsoleGateway {
  const ctx = createConsoleMockContext(options);

  return {
    ...venuesMethods(ctx),
    ...platformHomeMethods(ctx),
    ...venueAccountMethods(ctx),
    ...floorPlanMethods(ctx),
    ...branchFeaturesMethods(ctx),
    ...menuMethods(ctx),
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
