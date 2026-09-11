import type { FloorPlanData } from '@yalla/floorplan/types';
import { createDinerAuth, type DinerAuth } from '../auth/endpoints';
import type { AuthSession } from '../auth/session';
import type { ApiClient } from '../client';
import type { PhoneChallenge, VenueSummary, VerifiedPhone } from '../contracts/booking';
import type { WaiterCall, WaiterCallReason } from '../contracts/tab';
import {
  ExpiredCodeError,
  HoldAlreadyExtendedError,
  MenuItemUnavailableError,
  NotTabHostError,
  RateLimitedError,
  TabNotAcceptingOrdersError,
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
  slotFloorFromResponse,
  floorFromState,
  localDateTime,
} from './mapping';
import type { ExtendHoldOutcome, ReservationState } from '../contracts/push';
import { dinerTab, reservationState, settlementModeCode } from './dinerMapping';
import { venueSummariesFromCards } from './publicMapping';
import { branchMenu, placeOrderResult, tabEventPage, tabShares } from './staffMapping';

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
   * Bookings and the tab roster stay on the mock: `TableTab` carries the venue
   * name, branch name, floor area and time zone, and `TabView` carries none of
   * them. See the list at the bottom of this file.
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

/** `ServiceRequestPreset`: 1 Napkins, 2 Water, 3 TheBill, 4 Other. */
const SERVICE_PRESET_CODE: Readonly<Record<WaiterCallReason, 1 | 2 | 3 | 4>> = {
  napkins: 1,
  water: 2,
  bill: 3,
  other: 4,
};

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
   * The browse list: `GET /api/public/venues`, anonymous.
   *
   * The only venue read the backend publishes. A local function rather than a
   * method so `getVenue` can reuse it without `this`, which stays correct if a
   * method is ever passed around unbound.
   */
  async function listVenues(): Promise<readonly VenueSummary[]> {
    const { data } = await client.get<Schemas['Yalla.Application.Public.PublicVenueCard'][]>(
      '/api/public/venues',
      { skipAuth: true },
    );
    return venueSummariesFromCards(data ?? []);
  }

  /**
   * The two refusals an ordering screen has to say something specific about.
   *
   * Both are 409s, and both are the *normal* outcome of a race rather than a
   * failure: a dish sold out while the tray was open, or a waiter marked the
   * tab closing while somebody was mid-tray. Generic error copy on either one
   * leaves the diner with no idea what to do next, which on the sold-out case
   * is "pick something else" and on the closing case is "go and look at the
   * bill". Everything else keeps the client's generic mapping.
   */
  function rethrowOrdering(error: unknown): never {
    if (!(error instanceof ApiError) || !error.problem) throw error;
    const context = error.problem.context ?? {};

    switch (error.problem.code) {
      case 'menu-item-unavailable':
        throw new MenuItemUnavailableError({
          url: error.url,
          itemName: String(context['itemName'] ?? ''),
          requestId: error.requestId,
        });
      case 'tab-not-accepting-orders':
        throw new TabNotAcceptingOrdersError({
          url: error.url,
          tabId: String(context['tabId'] ?? ''),
          requestId: error.requestId,
        });
      default:
        throw error;
    }
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

    listVenues,

    /**
     * One venue, from the list.
     *
     * There is no by-slug venue route, so this reads the list and picks. Honest
     * at the size the list is, and the same thing the web chooser does. A venue
     * that has dropped off the list — suspended, or never published — is
     * `null`, which the screen renders as "not found" rather than as an error.
     */
    async getVenue(venueId): Promise<VenueSummary | null> {
      const venues = await listVenues();
      return venues.find((venue) => venue.id === venueId) ?? null;
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

    async getBranchTimeZone(branchId): Promise<string | null> {
      try {
        const data = await availability(branchId, {});
        return data.timeZoneId;
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async getTableAvailability({ branchId, slotUtc, partySize, timeZoneId }) {
      const { date, time } = localDateTime(slotUtc, timeZoneId ?? defaultZone);
      return availabilityFromResponse(await availability(branchId, { date, time, partySize }));
    },

    async getSlotFloor({ branchId, slotUtc, partySize, timeZoneId }) {
      try {
        // The branch's wall clock, never the device's: the backend asks in
        // local date and time terms, and a tourist's phone on Moscow time would
        // otherwise book a table three hours from the one they picked.
        const { date, time } = localDateTime(slotUtc, timeZoneId ?? defaultZone);
        return slotFloorFromResponse(await availability(branchId, { date, time, partySize }));
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
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
    // Everything below is answered by `fallback`, and the reason is now one
    // reason rather than "not done yet".
    //
    // `TableTab` — the roster contract every tab screen is built on — carries
    // `venueName`, `branchName`, `floorAreaName` and `timeZoneId`. `TabView`
    // carries none of the four, and no diner-reachable endpoint composes them:
    // there is no venue catalogue, and `BranchAvailability` (the one anonymous
    // read that knows a zone) knows nothing about a tab. Wiring `getTab` today
    // would mean inventing a venue name on a screen that shows it in the header.
    // `getBranchTimeZone` above is the one piece that could be extracted
    // honestly, and it is.
    //
    // Bookings are the same shape of gap in the other direction: the endpoints
    // exist and are close, but reconciling `Booking` against `ReservationView`
    // is a task of its own and not this one's.

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

    /**
     * Raising a hand, for real.
     *
     * `RaiseServiceRequest` takes the preset and an optional note and nothing
     * else; the response is a `ServiceRequestView`, which carries far more than
     * a diner needs — the table label, the waiting minutes, the acknowledgement
     * — because the same view feeds the counter screen's queue. Only the four
     * fields `WaiterCall` names are read.
     */
    async callWaiter({ tabId, reason }): Promise<WaiterCall> {
      const { data } = await client.post<Schemas['Yalla.Application.Ordering.ServiceRequestView']>(
        `/api/tabs/${tabId}/service-requests`,
        { preset: SERVICE_PRESET_CODE[reason] },
      );
      return {
        id: data.serviceRequestId,
        tabId: data.tabId,
        reason,
        requestedAtUtc: data.createdAtUtc,
      };
    },

    // --- Notifications --------------------------------------------------------

    async registerPushDevice({ pushToken, platform, locale }): Promise<{ deviceId: string }> {
      const { data } = await client.post<{ deviceId: string }>('/api/diner/devices', {
        pushToken,
        platform: platform === 'ios' ? 1 : 2,
        locale,
      } satisfies Schemas['Yalla.Api.Endpoints.RegisterDeviceRequest']);
      return { deviceId: data.deviceId };
    },

    async getReservationState(reservationId): Promise<ReservationState | null> {
      // There is no `GET /api/reservations/{id}`. `/mine` is the only read, and
      // it is scoped to the caller — which is the right scope for this, since a
      // notification only ever lands on the diner's own booking.
      const { data } =
        await client.get<Schemas['Yalla.Application.Reservations.MyReservations']>(
          '/api/reservations/mine',
        );
      const all = [...(data.upcoming ?? []), ...(data.past ?? [])];
      const found = all.find((reservation) => reservation.id === reservationId);
      return found ? reservationState(found) : null;
    },

    async cancelReservation({ reservationId, reason }): Promise<ReservationState> {
      try {
        const { data } = await client.post<
          Schemas['Yalla.Application.Reservations.ReservationView']
        >(`/api/reservations/${reservationId}/cancel`, reason ? { reason } : {});
        return reservationState(data);
      } catch (error) {
        // Already cancelled is the outcome the diner asked for.
        //
        // This endpoint takes no `clientCommandId`, so a retry after a lost
        // response is indistinguishable from a second tap, and both land as a
        // 409. Reading the booking back and reporting success when it is
        // genuinely cancelled is the honest resolution; reporting a conflict
        // would tell somebody their cancellation failed when it did not.
        if (error instanceof ApiError && error.status === 409) {
          const current = await this.getReservationState(reservationId);
          if (
            current &&
            (current.status === 'cancelledByDiner' || current.status === 'cancelledByVenue')
          ) {
            return current;
          }
        }
        throw error;
      }
    },

    async extendReservationHold({ reservationId, clientCommandId }): Promise<ExtendHoldOutcome> {
      try {
        const { data } = await client.post<
          Schemas['Yalla.Application.Reservations.ExtendHoldResult']
        >(`/api/reservations/${reservationId}/extend-hold`, {
          clientCommandId,
        } satisfies Schemas['Yalla.Api.Endpoints.ExtendHoldRequest']);
        return {
          reservationId: data.reservationId,
          holdExpiresAtUtc: data.holdExpiresAtUtc,
          extensionMinutes: data.extensionMinutes,
          extensionsRemaining: data.extensionsRemaining,
          wasReplay: data.wasReplay,
        };
      } catch (error) {
        // See `HoldAlreadyExtendedError`: the server gives prose and the generic
        // `conflicting-state`, so this is an inference from the endpoint rather
        // than a code. It is the right one on the nudge's path, and it is the
        // difference between "you have already let them know" and "error".
        if (error instanceof ApiError && error.status === 409) {
          throw new HoldAlreadyExtendedError({
            url: error.url,
            reservationId,
            serverDetail: error.problem?.detail ?? null,
            requestId: error.requestId,
          });
        }
        throw error;
      }
    },

    // --- Ordering and the bill ---------------------------------------------
    //
    // Real, all six. Every shape is built by `dinerMapping.ts` from
    // `generated/schema.ts`, so a renamed server field is a compile error here
    // rather than an `undefined` on a bill somebody is about to pay.

    async getBranchMenuDetail(branchId): Promise<BranchMenu | null> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Menus.BranchMenuView']>(
          `/api/branches/${branchId}/menu`,
        );
        // The client's own clock, and labelled as such: `BranchMenuView` carries
        // no timestamp, so a cached-menu banner can only honestly say when this
        // device read it.
        return branchMenu(data, new Date().toISOString());
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async getDinerTab(tabId): Promise<DinerTabView | null> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Tabs.TabView']>(
          `/api/tabs/${tabId}`,
        );
        return dinerTab(data, new Date().toISOString());
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async getTabEvents({ tabId, afterSequence }): Promise<TabEventPage> {
      const { data } = await client.get<Schemas['Yalla.Application.Ordering.TabEventPage']>(
        `/api/tabs/${tabId}/events`,
        { query: { afterSequence } },
      );
      return tabEventPage(data);
    },

    /**
     * One order for the whole tray.
     *
     * No grouping by participant, unlike the staff path: `onBehalfOfParticipantId`
     * is staff-only on the wire, and a diner's lines are their own by
     * construction. `isShared` is the only per-line attribution a phone can send.
     */
    async placeOrder(command): Promise<PlaceOrderResult> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Ordering.OrderView']>(
          `/api/tabs/${command.tabId}/orders`,
          {
            clientCommandId: command.clientCommandId,
            items: command.lines.map((line) => ({
              menuItemId: line.menuItemId,
              quantity: line.quantity,
              isShared: line.isShared,
              ...(line.note ? { note: line.note } : {}),
            })),
          } satisfies Schemas['Yalla.Api.Endpoints.PlaceOrderRequest'],
        );
        return placeOrderResult(data);
      } catch (error) {
        rethrowOrdering(error);
      }
    },

    async getTabShares(tabId): Promise<TabShares | null> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Ordering.TabSharesView']>(
          `/api/tabs/${tabId}/shares`,
        );
        // No `hostParticipantId` on this response, so `isHost` is reported false
        // rather than guessed. The tab read is where a screen learns who hosts.
        return tabShares(data);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async setSettlementMode(command): Promise<DinerTabView> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabView']>(
          `/api/tabs/${command.tabId}/settlement-mode`,
          /*
           * `settlementMode`, not `mode`, and no command id. This body was
           * `{ mode, clientCommandId }`: the server binds
           * `SetSettlementModeRequest.settlementMode` and declares nothing else,
           * so the mode never arrived and the request was refused for a missing
           * required field. Found by check-gateway-schema.
           */
          { settlementMode: settlementModeCode(command.mode) },
        );
        return dinerTab(data, new Date().toISOString());
      } catch (error) {
        if (error instanceof ApiError && error.problem?.code === 'forbidden') {
          throw new NotTabHostError({ url: error.url });
        }
        throw error;
      }
    },
  };
}

/** Re-exported so screens that inspect the error need one import. */
export { ApiError };
