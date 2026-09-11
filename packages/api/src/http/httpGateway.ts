import type { FloorPlanData } from '@yalla/floorplan/types';
import { createDinerAuth, type DinerAuth } from '../auth/endpoints';
import type { AuthSession } from '../auth/session';
import type { ApiClient, RequestOptions } from '../client';
import type {
  Booking,
  CreateBookingCommand,
  MyBookings,
  PhoneChallenge,
  TableUnavailableReason,
  VenueSummary,
  VerifiedPhone,
} from '../contracts/booking';
import type {
  ScanResult,
  TabInvite,
  TabParticipantChange,
  WaiterCall,
  WaiterCallReason,
} from '../contracts/tab';
import {
  BookingBusyError,
  BookingCommandInUseError,
  BookingRejectedError,
  BranchUnavailableError,
  ExpiredCodeError,
  ExtensionsNotOfferedError,
  HoldAlreadyExtendedError,
  HoldNotActiveError,
  LeadTimeExceededError,
  MenuItemUnavailableError,
  NotTabHostError,
  RateLimitedError,
  HostCannotLeaveError,
  InviteExpiredError,
  ServiceRequestRateLimitedError,
  TabAccessEndedError,
  TabClosedError,
  TabNotAcceptingOrdersError,
  TableOutOfServiceError,
  TableTakenError,
  TabsNotEnabledError,
  TooManyAttemptsError,
  UnknownTableCodeError,
  WrongCodeError,
} from '../contracts/errors';
import {
  ApiError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../errors';
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
import {
  booking,
  dinerTab,
  participantChange,
  reservationState,
  settlementModeCode,
} from './dinerMapping';
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
   * This install's device id, which `POST /api/tabs/open` and `/join` require.
   *
   * A promise because it is read from storage once. Absent on a surface that
   * never scans a table — the web booking page — where a scan says so.
   */
  readonly deviceId?: (() => Promise<string>) | undefined;
  /** The zone to convert slots in when the caller did not pass one. */
  readonly defaultTimeZoneId?: string | undefined;
  readonly dinerAuth?: DinerAuth | undefined;
}

/** Resend is allowed once the backend's code-request window has passed. */
const RESEND_AFTER_MS = 60_000;

/** `ReservationChannel`: 1 App, 2 Web. */
const CHANNEL_CODE = { app: 1, web: 2 } as const;

/**
 * Every 422 `reservation-*` refusal, in the table sheet's vocabulary, so the
 * confirm screen says the sentence the sheet would have said. The lead-time
 * one is handled apart because it carries the earliest time that still works.
 */
const REJECTION_REASON: Readonly<Record<string, TableUnavailableReason>> = {
  'reservation-outside-booking-window': 'tooFarAhead',
  'reservation-outside-opening-hours': 'closed',
  'reservation-party-exceeds-capacity': 'tooSmall',
  'reservation-seat-overhang-exceeded': 'tooLarge',
  'reservation-table-not-bookable': 'notBookable',
  'reservation-table-out-of-service': 'outOfService',
  'reservation-local-time-does-not-exist': 'invalidTime',
};

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
  const { audience, auth } = options;
  const dinerAuth = options.dinerAuth ?? createDinerAuth(client);
  const defaultZone = options.defaultTimeZoneId ?? 'Asia/Yerevan';
  const deviceId =
    options.deviceId ??
    (() => Promise.reject(new Error('This surface has no device id, so it cannot open a tab.')));

  /**
   * tabId → the participant token that tab issued this device.
   *
   * Kept apart from the diner's `AuthSession` on purpose. Every call on a tab
   * carries this token and `skipAuth`, so the client's refresh-on-401 — which
   * spends the diner's rotating refresh token — can never fire for a tab whose
   * participant token was refused. In memory only, like the active tab itself:
   * a tab is a table somebody is sitting at, and it does not outlive the app.
   */
  const tabTokens = new Map<string, string>();

  function tabAuth(tabId: string): Omit<RequestOptions, 'method' | 'body'> {
    const token = tabTokens.get(tabId);
    if (!token) throw new TabAccessEndedError({ url: `/api/tabs/${tabId}`, tabId });
    return { skipAuth: true, headers: { authorization: `Bearer ${token}` } };
  }

  /**
   * A refused participant token, said as what it means.
   *
   * The server answers a token for a closed tab, or for somebody taken off it,
   * with a bare 401 or 403 and nothing to tell the cases apart — so this does
   * not try. Reads treat both as "this tab is over for you"; changes treat only
   * 401 that way, because a 403 there is a rule (not the host, bill asked for).
   */
  function ended(error: unknown, tabId: string, statuses: readonly number[] = [401]): unknown {
    if (error instanceof ApiError && statuses.includes(error.status) && !error.problem?.code) {
      return new TabAccessEndedError({ url: error.url, tabId, status: error.status });
    }
    if (error instanceof UnauthorizedError) {
      return new TabAccessEndedError({ url: error.url, tabId, status: 401 });
    }
    return error;
  }

  /** A host action refused because the caller is not the host. */
  function hostError(error: unknown, tabId: string): unknown {
    if (error instanceof ForbiddenError && error.problem?.code === 'forbidden') {
      return new NotTabHostError({ url: error.url });
    }
    return ended(error, tabId);
  }

  /**
   * Admitted to a tab: keep its token, and say which of the three it was.
   *
   * `outcome` 1 and 2 opened a tab; 3 put this device on an existing one. A
   * device that scans a tab it is already approved on comes back as 3 with
   * itself approved, and a replay of the same scan says `wasReplay` — both are
   * "already on", not a pending joiner.
   */
  function admitted(result: Schemas['Yalla.Application.Tabs.TabAccessResult']): ScanResult {
    tabTokens.set(result.token.tabId, result.token.accessToken);
    const tab = dinerTab(result.tab, new Date().toISOString());
    if (tab.me.status === 'pendingApproval') return { kind: 'joinPending', tab };
    if ((result.outcome === 1 || result.outcome === 2) && !result.wasReplay) {
      return { kind: 'tabOpened', tab };
    }
    return { kind: 'alreadyOn', tab };
  }

  /**
   * A refused scan, as the error the scan screen says something specific about.
   *
   * The out-of-service and settling refusals share the generic
   * `conflicting-state` code, so the table label is read from the server's own
   * sentence — the only place it is. Anything unrecognised is a closed tab,
   * which carries the right next step: ask a member of staff.
   */
  function rethrowScan(error: unknown): never {
    if (error instanceof NotFoundError) {
      throw new UnknownTableCodeError({ url: error.url });
    }
    if (error instanceof ApiError) {
      const code = error.problem?.code;
      if (code === 'feature-not-enabled') {
        throw new TabsNotEnabledError({ url: error.url, requestId: error.requestId });
      }
      if (code === 'branch-unavailable') {
        throw new BranchUnavailableError({ url: error.url, requestId: error.requestId });
      }
      if (error.status === 409) {
        const label = /Table (.+?) is out of service/u.exec(error.problem?.detail ?? '')?.[1];
        if (label) throw new TableOutOfServiceError({ url: error.url, tableLabel: label });
        throw new TabClosedError({ url: error.url, tabId: '' });
      }
    }
    throw error;
  }

  /** A server-relative photo url, made absolute so a phone can load it. */
  function absolute(url: string): string {
    if (!url.startsWith('/')) return url;
    try {
      return new URL(
        url,
        client.baseUrl.endsWith('/') ? client.baseUrl : `${client.baseUrl}/`,
      ).toString();
    } catch {
      return url;
    }
  }

  function withAbsolutePhotos(menu: BranchMenu): BranchMenu {
    return {
      ...menu,
      categories: menu.categories.map((category) => ({
        ...category,
        items: category.items.map((item) => ({
          ...item,
          photo: {
            ...item.photo,
            thumbnailUrl: absolute(item.photo.thumbnailUrl),
            cardUrl: absolute(item.photo.cardUrl),
            fullUrl: absolute(item.photo.fullUrl),
          },
        })),
      })),
    };
  }

  async function participantAction(
    tabId: string,
    participantId: string,
    action: 'approve' | 'reject' | 'remove',
  ): Promise<TabParticipantChange> {
    try {
      const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabParticipantView']>(
        `/api/tabs/${tabId}/participants/${participantId}/${action}`,
        undefined,
        tabAuth(tabId),
      );
      return participantChange(data);
    } catch (error) {
      throw hostError(error, tabId);
    }
  }

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
    const venues = venueSummariesFromCards(data ?? []);
    for (const venue of venues) {
      for (const branch of venue.branches) venueNames.set(branch.id, venue.name);
    }
    return venues;
  }

  /**
   * Branch id to venue name, from the last browse read.
   *
   * `ReservationView` names the branch and not the venue. Rather than invent
   * one, a booking carries the venue name this device has actually seen, and
   * `null` until it has seen one.
   */
  const venueNames = new Map<string, string>();

  function toBooking(view: Schemas['Yalla.Application.Reservations.ReservationView']): Booking {
    return booking(view, venueNames.get(view.branchId) ?? null);
  }

  type ReservationViewWire = Schemas['Yalla.Application.Reservations.ReservationView'];

  /** `GET /api/reservations/mine`, as the wire has it. */
  async function mineViews(): Promise<readonly ReservationViewWire[][]> {
    const { data } =
      await client.get<Schemas['Yalla.Application.Reservations.MyReservations']>(
        '/api/reservations/mine',
      );
    return [data.upcoming ?? [], data.past ?? []];
  }

  /** The caller's bookings, split upcoming and past **by the server**. */
  async function mine(): Promise<MyBookings> {
    const [upcoming = [], past = []] = await mineViews();
    return { upcoming: upcoming.map(toBooking), past: past.map(toBooking) };
  }

  async function findMineView(reservationId: string): Promise<ReservationViewWire | null> {
    const [upcoming = [], past = []] = await mineViews();
    return [...upcoming, ...past].find((entry) => entry.id === reservationId) ?? null;
  }

  async function findMine(reservationId: string): Promise<Booking | null> {
    const view = await findMineView(reservationId);
    return view ? toBooking(view) : null;
  }

  /**
   * A refused booking, as the error the confirm screen branches on.
   *
   * Every code the create route answers with gets its own type, because each
   * has a different next step: a taken table sends the diner back to the room
   * (with the room from the 409, when it came), a lead-time refusal names the
   * earliest time that works, a rule names itself, a lock timeout asks for
   * another tap with the same command id. Anything else is rethrown as the
   * client mapped it, and the screen treats it as an unknown outcome.
   */
  function rethrowBooking(error: unknown, command: CreateBookingCommand): never {
    if (!(error instanceof ApiError) || !error.problem) throw error;
    const context = error.problem.context ?? {};
    const code = error.problem.code;
    const base = { url: error.url, requestId: error.requestId };

    switch (code) {
      case 'table-currently-occupied':
      case 'table-already-booked': {
        const room = context['availability'] as
          Schemas['Yalla.Application.Reservations.BranchAvailability'] | undefined;
        throw new TableTakenError({
          ...base,
          tableId: String(context['tableId'] ?? command.tableId),
          tableLabel: String(context['tableLabel'] ?? ''),
          reason: code === 'table-currently-occupied' ? 'occupied' : 'alreadyBooked',
          floor: room && Array.isArray(room.tables) ? floorFromAvailability(room) : null,
        });
      }
      case 'reservation-lead-time-too-short':
        throw new LeadTimeExceededError({
          ...base,
          leadTimeMinutes: Number(context['minLeadMinutes'] ?? 0),
          earliestSlotUtc: String(context['earliestStartUtc'] ?? ''),
        });
      case 'reservation-lock-timeout':
        throw new BookingBusyError(base);
      case 'client-command-id-in-use':
        throw new BookingCommandInUseError(base);
      case 'branch-unavailable':
        throw new BranchUnavailableError(base);
      default:
        if (code && error.status === 422 && code.startsWith('reservation-')) {
          throw new BookingRejectedError({
            ...base,
            reason: REJECTION_REASON[code] ?? code,
            partySize: command.partySize,
          });
        }
        throw error;
    }
  }

  /**
   * `POST /api/reservations/{id}/cancel`, with the one retry rule it needs.
   *
   * Already cancelled is the outcome the diner asked for. This endpoint takes
   * no `clientCommandId`, so a retry after a lost response is
   * indistinguishable from a second tap, and both land as a 409. Reading the
   * booking back and reporting success when it is genuinely cancelled is the
   * honest resolution; reporting a conflict would tell somebody their
   * cancellation failed when it did not.
   */
  async function cancelView(reservationId: string, reason?: string): Promise<ReservationViewWire> {
    try {
      const { data } = await client.post<ReservationViewWire>(
        `/api/reservations/${reservationId}/cancel`,
        reason ? { reason } : {},
      );
      return data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const current = await findMineView(reservationId);
        // 6 CancelledByDiner, 7 CancelledByVenue.
        if (current && (current.status === 6 || current.status === 7)) return current;
      }
      throw error;
    }
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

    /** `GET /api/public/branches/{venueSlug}/{branchSlug}`: the window and the lead time. */
    async getBookingRules({ venueSlug, branchSlug }) {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Public.PublicBranchPage']>(
          `/api/public/branches/${venueSlug}/${branchSlug}`,
          { skipAuth: true },
        );
        return {
          bookingWindowDays: data.bookingWindowDays,
          minLeadMinutes: data.policy.minLeadMinutes,
        };
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
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

    async requestPhoneCode(phoneE164, options): Promise<PhoneChallenge> {
      try {
        // The diner's language, so the SMS arrives in it rather than in the
        // server's default.
        const result = await dinerAuth.requestCode({
          phoneE164,
          ...(options?.localeCode ? { localeCode: options.localeCode } : {}),
        });
        const now = Date.now();
        return {
          // The backend keys the challenge on the number itself.
          challengeId: phoneE164,
          phoneE164,
          expiresAtUtc: new Date(now + result.expiresInSeconds * 1000).toISOString(),
          resendAvailableAtUtc: new Date(now + RESEND_AFTER_MS).toISOString(),
          maxAttempts: result.maxAttempts,
          devCode: result.developmentCode ?? undefined,
        };
      } catch (error) {
        if (error instanceof TooManyRequestsError) {
          // Only a time the server gave. The per-number window is an hour and
          // sends no Retry-After; the per-address one sends it.
          throw new RateLimitedError({
            url: error.url,
            retryAtUtc:
              error.retryAfterSeconds !== null
                ? new Date(Date.now() + error.retryAfterSeconds * 1000).toISOString()
                : null,
          });
        }
        throw error;
      }
    },

    async verifyPhoneCode({ challengeId, code, localeCode }): Promise<VerifiedPhone> {
      try {
        const result = await dinerAuth.verifyCode({
          phoneE164: challengeId,
          code,
          ...(localeCode ? { localeCode } : {}),
        });
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
          // What the server said is left, and nothing when it said nothing:
          // defaulting to 0 read "0 attempts left" after the first slip.
          const remaining = error.problem?.context?.['attemptsRemaining'];
          throw new WrongCodeError({
            url: error.url,
            attemptsRemaining: typeof remaining === 'number' ? remaining : null,
          });
        }
        if (error instanceof TooManyRequestsError)
          throw new TooManyAttemptsError({ url: error.url });
        throw error;
      }
    },

    // --- The shared tab ---------------------------------------------------------
    //
    // Real, all of it. The table scan and the invitation are anonymous and hand
    // back a participant token scoped to that one tab; every call on the tab
    // after that carries that token, never the phone's diner session. These
    // were all answered by the mock, which is why no real tab was ever reached.

    /** `POST /api/tabs/open`: the table's QR, this device, and the scan's command id. */
    async scanTableCode(command): Promise<ScanResult> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabAccessResult']>(
          '/api/tabs/open',
          {
            qrToken: command.tableCode,
            deviceId: await deviceId(),
            clientCommandId: command.commandId,
            ...(command.displayName ? { displayName: command.displayName } : {}),
          } satisfies Schemas['Yalla.Api.Endpoints.OpenTabRequest'],
          { skipAuth: true },
        );
        return admitted(data);
      } catch (error) {
        rethrowScan(error);
      }
    },

    /** `POST /api/tabs/join`: a host's invitation — never the table scan. */
    async joinTab(command): Promise<ScanResult> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabAccessResult']>(
          '/api/tabs/join',
          {
            joinToken: command.joinToken,
            deviceId: await deviceId(),
            ...(command.displayName ? { displayName: command.displayName } : {}),
          } satisfies Schemas['Yalla.Api.Endpoints.JoinTabRequest'],
          { skipAuth: true },
        );
        return admitted(data);
      } catch (error) {
        // Unknown, revoked or older than thirty minutes all answer 401.
        if (error instanceof UnauthorizedError || error instanceof NotFoundError) {
          throw new InviteExpiredError({ url: error.url, requestId: error.requestId });
        }
        if (error instanceof ApiError && error.status === 409) {
          throw new TabClosedError({ url: error.url, tabId: '' });
        }
        throw error;
      }
    },

    /**
     * `POST /api/tabs/{tabId}/leave`. A guest comes off the tab; a host hands it
     * to the approved guest who has been on it longest, and with nobody to hand
     * it to the server refuses with 409.
     */
    async leaveTab({ tabId }): Promise<void> {
      try {
        await client.post(`/api/tabs/${tabId}/leave`, undefined, tabAuth(tabId));
        tabTokens.delete(tabId);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          throw new HostCannotLeaveError({ url: error.url, tabId, requestId: error.requestId });
        }
        throw ended(error, tabId);
      }
    },

    /**
     * `POST /api/tabs/{tabId}/join-tokens`. Each call issues a fresh invitation
     * and revokes the last, which is what "new link" is.
     */
    async createTabInvite({ tabId }): Promise<TabInvite> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabJoinTokenResult']>(
          `/api/tabs/${tabId}/join-tokens`,
          undefined,
          tabAuth(tabId),
        );
        return {
          tabId: data.tabId,
          token: data.token,
          url: data.shareUrl,
          expiresAtUtc: data.expiresAtUtc,
        };
      } catch (error) {
        throw hostError(error, tabId);
      }
    },

    approveJoin: ({ tabId, participantId }) => participantAction(tabId, participantId, 'approve'),
    rejectJoin: ({ tabId, participantId }) => participantAction(tabId, participantId, 'reject'),
    removeParticipant: ({ tabId, participantId }) =>
      participantAction(tabId, participantId, 'remove'),

    async setParticipantPermissions({
      tabId,
      participantId,
      permissions,
    }): Promise<TabParticipantChange> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabParticipantView']>(
          `/api/tabs/${tabId}/participants/${participantId}/permissions`,
          {
            canOrder: permissions.canOrder,
            canSeeTableTotal: permissions.canSeeTableTotal,
            canPay: permissions.canPay,
          } satisfies Schemas['Yalla.Api.Endpoints.SetParticipantPermissionsRequest'],
          tabAuth(tabId),
        );
        return participantChange(data);
      } catch (error) {
        throw hostError(error, tabId);
      }
    },

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
      let data: Schemas['Yalla.Application.Ordering.ServiceRequestView'];
      try {
        ({ data } = await client.post<Schemas['Yalla.Application.Ordering.ServiceRequestView']>(
          `/api/tabs/${tabId}/service-requests`,
          { preset: SERVICE_PRESET_CODE[reason] },
          tabAuth(tabId),
        ));
      } catch (error) {
        // Not a failure to report: the table has asked several times in a short
        // window, and a waiter already knows.
        if (error instanceof ApiError && error.problem?.code === 'service-request-rate-limited') {
          const window = error.problem.context?.['windowMinutes'];
          throw new ServiceRequestRateLimitedError({
            url: error.url,
            windowMinutes: typeof window === 'number' ? window : null,
            requestId: error.requestId,
          });
        }
        throw ended(error, tabId);
      }
      return {
        id: data.serviceRequestId,
        tabId: data.tabId,
        reason,
        requestedAtUtc: data.createdAtUtc,
      };
    },

    // --- Bookings ---------------------------------------------------------------
    //
    // Real, all four. They were answered by the mock even against a real
    // backend, so no reservation ever reached it.

    /**
     * `POST /api/reservations`, in the branch's wall-clock date and time.
     *
     * The server answers 201 for a new booking and 200 for a replay of the same
     * `clientCommandId`, with the same body; both are a booking.
     */
    async createBooking(command): Promise<Booking> {
      const { date, time } = localDateTime(command.slotUtc, command.timeZoneId);
      try {
        const { data } = await client.post<
          Schemas['Yalla.Application.Reservations.ReservationView']
        >('/api/reservations', {
          branchId: command.branchId,
          tableId: command.tableId,
          date,
          time,
          partySize: command.partySize,
          guestName: command.guestName,
          guestPhone: command.guestPhone,
          clientCommandId: command.commandId,
          channel: CHANNEL_CODE[command.channel],
        } satisfies Schemas['Yalla.Api.Endpoints.CreateReservationRequest']);
        return toBooking(data);
      } catch (error) {
        rethrowBooking(error, command);
      }
    },

    listBookings: mine,

    /** There is no `GET /api/reservations/{id}`; `/mine` is the read. */
    getBooking: findMine,

    async cancelBooking(bookingId): Promise<Booking> {
      return toBooking(await cancelView(bookingId));
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
      const found = await findMineView(reservationId);
      return found ? reservationState(found) : null;
    },

    /** The lock-screen cancel. Same route, same already-cancelled rule, as the screen's. */
    async cancelReservation({ reservationId, reason }): Promise<ReservationState> {
      return reservationState(await cancelView(reservationId, reason));
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
        // Each refusal by its own code. This used to read every 409 as "already
        // extended", which told a diner at a branch that offers no extensions —
        // or one tapping days early — that they had already let them know.
        if (error instanceof ApiError && error.status === 409) {
          const base = { url: error.url, reservationId, requestId: error.requestId };
          switch (error.problem?.code) {
            case 'hold-already-extended':
              throw new HoldAlreadyExtendedError({
                ...base,
                serverDetail: error.problem.detail ?? null,
              });
            case 'hold-not-active':
              throw new HoldNotActiveError(base);
            case 'extensions-not-offered':
              throw new ExtensionsNotOfferedError(base);
          }
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
        // device read it. Photo urls come back server-relative, and a phone has
        // no page origin to resolve them against.
        return withAbsolutePhotos(branchMenu(data, new Date().toISOString()));
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async getDinerTab(tabId): Promise<DinerTabView | null> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Tabs.TabView']>(
          `/api/tabs/${tabId}`,
          tabAuth(tabId),
        );
        return dinerTab(data, new Date().toISOString());
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw ended(error, tabId, [401, 403]);
      }
    },

    async getTabEvents({ tabId, afterSequence }): Promise<TabEventPage> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Ordering.TabEventPage']>(
          `/api/tabs/${tabId}/events`,
          { ...tabAuth(tabId), query: { afterSequence } },
        );
        return tabEventPage(data);
      } catch (error) {
        throw ended(error, tabId, [401, 403]);
      }
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
          tabAuth(command.tabId),
        );
        return placeOrderResult(data);
      } catch (error) {
        // A 403 stays a 403: it is the ordering policy (pending, not allowed,
        // bill asked for), and the tray refetches the tab to say which.
        rethrowOrdering(ended(error, command.tabId));
      }
    },

    async getTabShares(tabId): Promise<TabShares | null> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Ordering.TabSharesView']>(
          `/api/tabs/${tabId}/shares`,
          tabAuth(tabId),
        );
        // No `hostParticipantId` on this response, so `isHost` is reported false
        // rather than guessed. The screen marks the host from the tab read.
        return tabShares(data);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw ended(error, tabId, [401, 403]);
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
          tabAuth(command.tabId),
        );
        return dinerTab(data, new Date().toISOString());
      } catch (error) {
        throw hostError(error, command.tabId);
      }
    },
  };
}

/** Re-exported so screens that inspect the error need one import. */
export { ApiError };
