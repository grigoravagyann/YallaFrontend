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

/**
 * The public page's gateways, built on first use rather than on import.
 *
 * Functions rather than module-level constants, for the same reason
 * {@link readConfig} is one: resolving the config throws when `VITE_API_URL` is
 * missing, and a throw during module evaluation is a blank page with a message
 * in a console nobody has open. `main.tsx` checks the config first and renders
 * the failure into the document — but that guarantee only holds while importing
 * a component does not itself resolve the config, and a module-level
 * `readConfig()` here made it hold by import order alone. Importing
 * `BookingDone` for a test was enough to break it.
 *
 * Everything is built once and kept: the gateway identities are handed to
 * `GatewayProvider` and end up in React Query's dependency lists, so a fresh
 * instance per call would be a re-render on every access.
 */
interface PublicRuntime {
  readonly usingMockData: boolean;
  readonly dinerGateway: YallaGateway;
  readonly publicGateway: PublicGateway;
  readonly appUrl: string | null;
}

let runtime: PublicRuntime | null = null;

function publicRuntime(): PublicRuntime {
  if (runtime) return runtime;

  const config = readConfig();

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
  const diner: YallaGateway = resolveGateway({
    dataSource: config.dataSource,
    baseUrl: config.api?.baseUrl,
    auth,
    audience: 'diner',
    mockLatencyMs: 200,
  });

  /** The unauthenticated half: slug resolution, the published profile, the manage link. */
  const publicSide: PublicGateway = resolvePublicGateway({
    dataSource: config.dataSource,
    baseUrl: config.api?.baseUrl,
    gateway: diner,
    mockLatencyMs: 200,
  });

  runtime = {
    usingMockData: config.dataSource === 'mock',
    dinerGateway: diner,
    publicGateway: publicSide,
    appUrl: config.appUrl,
  };
  return runtime;
}

export function usingMockData(): boolean {
  return publicRuntime().usingMockData;
}

export function dinerGateway(): YallaGateway {
  return publicRuntime().dinerGateway;
}

export function publicGateway(): PublicGateway {
  return publicRuntime().publicGateway;
}

/** Where the diner app can be installed, or `null` when it is not published. */
export function appUrl(): string | null {
  return publicRuntime().appUrl;
}
