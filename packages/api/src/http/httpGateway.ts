import type { FloorPlanData } from '@yalla/floorplan/types';
import { createDinerAuth, type DinerAuth } from '../auth/endpoints';
import type { AuthSession } from '../auth/session';
import type { ApiClient } from '../client';
import type { PhoneChallenge, VenueSummary, VerifiedPhone } from '../contracts/booking';
import {
  EndpointNotWiredError,
  ExpiredCodeError,
  RateLimitedError,
  TooManyAttemptsError,
  WrongCodeError,
} from '../contracts/errors';
import { ApiError, NotFoundError, TooManyRequestsError, UnauthorizedError } from '../errors';
import type { YallaGateway } from '../gateway';
import type {
  BranchMenu,
  DinerTabView,
  PlaceOrderResult,
  TabEventPage,
  TabShares,
} from '../contracts/ordering';
import type { components } from '../generated/schema';
import {
  availabilityFromResponse,
  floorFromAvailability,
  floorFromState,
  localDateTime,
} from './mapping';

type Schemas = components['schemas'];

/**
 * Who is holding the phone or the tablet.
 *
 * The floor endpoint is staff-only, so a diner reads the room from the
 * anonymous availability endpoint, which carries the same geometry. The staff
 * screen reads the richer floor view, which also says who was seated when.
 */
export type GatewayAudience = 'diner' | 'staff';

export interface HttpGatewayOptions {
  readonly audience: GatewayAudience;
  /** The diner session; phone verification signs it in. */
  readonly auth?: AuthSession | undefined;
  /**
   * Where the methods this task has not wired yet still come from.
   *
   * Bookings, tabs, menus and waiter calls stay on the mock until the pattern
   * proven here is extended to them — see the list at the bottom of this file.
   * Passing the mock explicitly keeps that decision visible at the call site
   * rather than buried in a default.
   */
  readonly fallback: YallaGateway;
  /** The zone to convert slots in when the caller did not pass one. */
  readonly defaultTimeZoneId?: string | undefined;
  readonly dinerAuth?: DinerAuth | undefined;
}

/** Resend is allowed once the backend's code-request window has passed. */
const RESEND_AFTER_MS = 60_000;

/**
 * The real data source, over HTTP, typed from the generated schema.
 *
 * Paths and payloads are the backend's. Anything the backend does not have yet
 * is said so with {@link EndpointNotWiredError}, never faked: the one thing a
 * data layer must not do is show a success that did not happen.
 */
export function createHttpGateway(client: ApiClient, options: HttpGatewayOptions): YallaGateway {
  const { audience, auth, fallback } = options;
  const dinerAuth = options.dinerAuth ?? createDinerAuth(client);
  const defaultZone = options.defaultTimeZoneId ?? 'Asia/Yerevan';

  /**
   * A 404 on a *collection* route is the route missing, not the resource.
   * The backend has no venue catalogue yet; say so in a way the screen can
   * render as "not available" rather than as a bug.
   */
  function notWired(endpoint: string, error: unknown): never {
    if (error instanceof NotFoundError) {
      throw new EndpointNotWiredError({ url: error.url, endpoint });
    }
    throw error;
  }

  async function availability(
    branchId: string,
    query: { date?: string; time?: string; partySize?: number },
  ): Promise<Schemas['Yalla.Application.Reservations.BranchAvailability']> {
    const { data } = await client.get<Schemas['Yalla.Application.Reservations.BranchAvailability']>(
      `/api/branches/${branchId}/availability`,
      { query, skipAuth: true },
    );
    return data;
  }

  return {
    // --- Browse -------------------------------------------------------------

    async listVenues(): Promise<readonly VenueSummary[]> {
      try {
        const { data } = await client.get<readonly VenueSummary[]>('/api/venues', {
          skipAuth: true,
        });
        return data;
      } catch (error) {
        return notWired('listVenues', error);
      }
    },

    async getVenue(venueId): Promise<VenueSummary | null> {
      try {
        const { data } = await client.get<VenueSummary>(`/api/venues/${venueId}`, {
          skipAuth: true,
        });
        return data;
      } catch (error) {
        return notWired('getVenue', error);
      }
    },

    // --- Floor ----------------------------------------------------------------

    async getFloorPlan(branchId): Promise<FloorPlanData | null> {
      try {
        if (audience === 'staff') {
          const { data } = await client.get<Schemas['Yalla.Application.Floor.BranchFloorState']>(
            `/api/branches/${branchId}/tables/floor`,
          );
          return floorFromState(data);
        }
        // No date, time or party size: the backend answers for "now, one
        // person", which is exactly the room as it stands.
        return floorFromAvailability(await availability(branchId, {}));
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async getTableAvailability({ branchId, slotUtc, partySize, timeZoneId }) {
      const { date, time } = localDateTime(slotUtc, timeZoneId ?? defaultZone);
      return availabilityFromResponse(await availability(branchId, { date, time, partySize }));
    },

    // --- Phone verification: the diner sign-in ---------------------------------

    async requestPhoneCode(phoneE164): Promise<PhoneChallenge> {
      try {
        const result = await dinerAuth.requestCode({ phoneE164 });
        const now = Date.now();
        return {
          // The backend keys the challenge on the number itself.
          challengeId: phoneE164,
          phoneE164,
          expiresAtUtc: new Date(now + result.expiresInSeconds * 1000).toISOString(),
          resendAvailableAtUtc: new Date(now + RESEND_AFTER_MS).toISOString(),
          devCode: result.developmentCode ?? undefined,
        };
      } catch (error) {
        if (error instanceof TooManyRequestsError) {
          throw new RateLimitedError({
            url: error.url,
            retryAtUtc: new Date(Date.now() + RESEND_AFTER_MS).toISOString(),
          });
        }
        throw error;
      }
    },

    async verifyPhoneCode({ challengeId, code }): Promise<VerifiedPhone> {
      try {
        const result = await dinerAuth.verifyCode({ phoneE164: challengeId, code });
        await auth?.signIn({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresInSeconds: result.expiresInSeconds,
        });
        return {
          // The bearer token is the proof now; screens keep treating this as an
          // opaque token and the gateway supplies it from the session.
          verificationToken: result.accessToken,
          phoneE164: challengeId,
        };
      } catch (error) {
        // 401 covers both "wrong" and "expired"; the code slug tells them apart.
        if (error instanceof UnauthorizedError) {
          if (error.code?.includes('expired')) throw new ExpiredCodeError({ url: error.url });
          const remaining = error.problem?.context?.['attemptsRemaining'];
          throw new WrongCodeError({
            url: error.url,
            attemptsRemaining: typeof remaining === 'number' ? remaining : 0,
          });
        }
        if (error instanceof TooManyRequestsError)
          throw new TooManyAttemptsError({ url: error.url });
        throw error;
      }
    },

    // --- Still on the mock ------------------------------------------------------
    //
    // Everything below is answered by `fallback`. The backend has the endpoints
    // for bookings and tabs; what it does not have is agreement with the shapes
    // these screens were built on (see the README's contract notes), so they
    // follow in the next task once the four screens above are proven on a real
    // phone. `callWaiter` has no backend endpoint at all and the mock already
    // raises `EndpointNotWiredError` for it.

    createBooking: (command) => fallback.createBooking(command),
    listBookings: () => fallback.listBookings(),
    getBooking: (bookingId) => fallback.getBooking(bookingId),
    cancelBooking: (bookingId) => fallback.cancelBooking(bookingId),
    scanTableCode: (command) => fallback.scanTableCode(command),
    getTab: (tabId) => fallback.getTab(tabId),
    leaveTab: (input) => fallback.leaveTab(input),
    getBranchMenu: (branchId) => fallback.getBranchMenu(branchId),
    createTabInvite: (input) => fallback.createTabInvite(input),
    approveJoin: (input) => fallback.approveJoin(input),
    rejectJoin: (input) => fallback.rejectJoin(input),
    removeParticipant: (input) => fallback.removeParticipant(input),
    setParticipantPermissions: (input) => fallback.setParticipantPermissions(input),
    setTabDefaultPermissions: (input) => fallback.setTabDefaultPermissions(input),
    callWaiter: (input) => fallback.callWaiter(input),

    // --- Ordering and the bill ---------------------------------------------
    //
    // None of this exists on the server. The domain entities do — `MenuItem`
    // carries the descriptive fields, `TabOrderLine` the snapshots, `TabEvent`
    // its sequence — but no endpoint exposes any of them, so every one of these
    // says so by name rather than falling back to the mock. A diner shown an
    // invented bill is the worst failure this app has.
    async getBranchMenuDetail(): Promise<BranchMenu | null> {
      throw new EndpointNotWiredError({ url: '', endpoint: 'getBranchMenuDetail' });
    },

    async getDinerTab(): Promise<DinerTabView | null> {
      throw new EndpointNotWiredError({ url: '', endpoint: 'getDinerTab' });
    },

    async getTabEvents(): Promise<TabEventPage> {
      throw new EndpointNotWiredError({ url: '', endpoint: 'getTabEvents' });
    },

    async placeOrder(): Promise<PlaceOrderResult> {
      throw new EndpointNotWiredError({ url: '', endpoint: 'placeOrder' });
    },

    async getTabShares(): Promise<TabShares | null> {
      throw new EndpointNotWiredError({ url: '', endpoint: 'getTabShares' });
    },

    async setSettlementMode(): Promise<DinerTabView> {
      throw new EndpointNotWiredError({ url: '', endpoint: 'setSettlementMode' });
    },
  };
}

/** Re-exported so screens that inspect the error need one import. */
export { ApiError };
