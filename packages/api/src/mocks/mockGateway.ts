import { createDinerMockContext, type MockGateway, type MockGatewayOptions } from './diner/context';
import { branchesMethods } from './diner/branches';
import { favoritesMethods } from './diner/favorites';
import { notificationsMethods } from './diner/notifications';
import { takeawayMethods } from './diner/takeaway';
import { messagesMethods } from './diner/messages';
import { venuesMethods } from './diner/venues';
import { phoneProofMethods } from './diner/phoneProof';
import { bookingsMethods } from './diner/bookings';
import { tabsMethods } from './diner/tabs';
import { preOrdersMethods } from './diner/preOrders';
import { accountMethods } from './diner/account';
import { orderingMethods } from './diner/ordering';

export { haversineKm } from './diner/context';
export type { MockGateway, MockGatewayOptions, MockVisit } from './diner/context';

export function createMockGateway(options: MockGatewayOptions = {}): MockGateway {
  const ctx = createDinerMockContext(options);

  return {
    ...branchesMethods(ctx),
    ...favoritesMethods(ctx),
    ...notificationsMethods(ctx),
    ...takeawayMethods(ctx),
    ...messagesMethods(ctx),
    ...venuesMethods(ctx),
    ...phoneProofMethods(ctx),
    ...bookingsMethods(ctx),
    ...tabsMethods(ctx),
    ...preOrdersMethods(ctx),
    ...accountMethods(ctx),
    ...orderingMethods(ctx),
  };
}
