import {
  createApiClient,
  createAuthSession,
  createDinerAuth,
  createMemoryTokenStorage,
  resolveGateway,
  resolvePublicGateway,
  type AuthSession,
  type PublicGateway,
  type YallaGateway,
} from '@yalla/api';
import { readConfig } from '../config';

const config = readConfig();

export const usingMockData = config.dataSource === 'mock';

/**
 * The visitor's session, held **in memory only**.
 *
 * Two reasons, and the weaker one is the spec's "no `localStorage` or
 * `sessionStorage`". The stronger one is what this token is: verifying a phone
 * number signs the person in as a diner, and a shared or borrowed phone that
 * kept that token would let the next person open the link and see a stranger's
 * bookings. A web visitor gets exactly one booking's worth of session, and
 * closing the tab ends it.
 *
 * What survives instead is the manage-booking link, which is scoped to one
 * booking and can be kept safely — see `ManageBookingRoute`.
 */
const auth: AuthSession = createAuthSession({
  storage: createMemoryTokenStorage(),
  // The refresh goes through a *bare* client with no session attached, so a 401
  // on the refresh endpoint itself cannot trigger another refresh. Against the
  // mock there is nothing to refresh against and saying so is better than a
  // silent no-op that looks like an expired session.
  refreshTokens: config.api
    ? createDinerAuth(createApiClient({ baseUrl: config.api.baseUrl })).refreshTokens
    : () => Promise.reject(new Error('The mock data source has no token session.')),
});

/**
 * The live half: the room, per-table availability, the menu, verification and
 * the booking itself.
 *
 * The same gateway the phone app runs, in its `diner` audience. Not a
 * convenience — a second implementation of the availability mapping would be a
 * second opinion about which tables are free, and the whole promise of this
 * page is that its number is the same number the venue's own staff screen is
 * looking at.
 */
export const dinerGateway: YallaGateway = resolveGateway({
  dataSource: config.dataSource,
  baseUrl: config.api?.baseUrl,
  auth,
  audience: 'diner',
  mockLatencyMs: 200,
});

/** The unauthenticated half: slug resolution, the published profile, the manage link. */
export const publicGateway: PublicGateway = resolvePublicGateway({
  dataSource: config.dataSource,
  baseUrl: config.api?.baseUrl,
  gateway: dinerGateway,
  mockLatencyMs: 200,
});

/** Where the diner app can be installed, or `null` when it is not published. */
export const appUrl = config.appUrl;
