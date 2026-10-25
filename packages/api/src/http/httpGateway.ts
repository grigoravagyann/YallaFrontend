import type { ApiClient } from '../client';
import { ApiError } from '../errors';
import type { YallaGateway } from '../gateway';
import { createDinerHttpContext, type HttpGatewayOptions } from './diner/context';
import { venuesMethods } from './diner/venues';
import { branchesMethods } from './diner/branches';
import { favoritesMethods } from './diner/favorites';
import { notificationsMethods } from './diner/notifications';
import { takeawayMethods } from './diner/takeaway';
import { messagesMethods } from './diner/messages';
import { phoneProofMethods } from './diner/phoneProof';
import { accountMethods } from './diner/account';
import { tabsMethods } from './diner/tabs';
import { bookingsMethods } from './diner/bookings';
import { preOrdersMethods } from './diner/preOrders';
import { orderingMethods } from './diner/ordering';

export type { GatewayAudience, HttpGatewayOptions, TabTokenStorage } from './diner/context';

/**
 * The real data source, over HTTP, typed from the generated schema.
 *
 * Paths and payloads are the backend's. Anything the backend does not have yet
 * is said so with {@link EndpointNotWiredError}, never faked: the one thing a
 * data layer must not do is show a success that did not happen.
 *
 * The methods live per feature in `diner/*`, sharing `diner/context.ts`.
 */
export function createHttpGateway(client: ApiClient, options: HttpGatewayOptions): YallaGateway {
  const ctx = createDinerHttpContext(client, options);

  return {
    ...venuesMethods(ctx),
    ...branchesMethods(ctx),
    ...favoritesMethods(ctx),
    ...notificationsMethods(ctx),
    ...takeawayMethods(ctx),
    ...messagesMethods(ctx),
    ...phoneProofMethods(ctx),
    ...accountMethods(ctx),
    ...tabsMethods(ctx),
    ...bookingsMethods(ctx),
    ...preOrdersMethods(ctx),
    ...orderingMethods(ctx),
  };
}

/** Re-exported so screens that inspect the error need one import. */
export { ApiError };
