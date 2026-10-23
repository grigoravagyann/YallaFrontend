import type { OnMyWayResult, PreOrderResult } from '../contracts/preOrder';
import type { RunningLateResult } from '../contracts/onMyWay';
import type { TakeawayAvailability, TakeawayOrder } from '../contracts/takeaway';
import {
  onMyWayResultFromWire,
  preOrderResultFromWire,
  replacePreOrderBody,
  rethrowPreOrderRefusal,
  runningLateResultFromWire,
  type WireOnMyWayResult,
  type WirePreOrderResult,
  type WireRunningLateResult,
} from './preOrderMapping';
import {
  placeTakeawayOrderBody,
  rethrowTakeawayRefusal,
  takeawayAvailabilityFromWire,
  takeawayOrderFromWire,
  type WireTakeawayAvailability,
  type WireTakeawayOrder,
} from './takeawayMapping';
import type {
  ConversationSubjectRef,
  DinerConversation,
  DinerUnreadMessages,
  SentMessage,
} from '../contracts/messages';
import {
  dinerConversationFromWire,
  rethrowMessageRefusal,
  sendMessageBody,
  sentMessageFromWire,
  unreadMessagesFromWire,
  type WireDinerConversation,
  type WireDinerMessageResult,
  type WireUnreadMessages,
} from './messagesMapping';
import type { FloorPlanData } from '../contracts/tableFloor';
import { createDinerAuth, type DinerAuth } from '../auth/endpoints';
import type { AuthSession } from '../auth/session';
import type { ApiClient, RequestOptions } from '../client';
import type {
  Booking,
  DaySlots,
  MyBookings,
  PhoneChallenge,
  PhoneProofChannels,
  VenueSummary,
  TelegramChallenge,
  TelegramClaimResult,
  VerifiedPhone,
} from '../contracts/booking';
import type {
  DinerPhotoFile,
  DinerProfileView,
  DinerSignInResult,
  RegisterDinerCommand,
  UpdateDinerProfileCommand,
} from '../contracts/dinerAccount';
import type { Photo } from '../contracts/menuAdmin';
import type {
  ScanResult,
  TabInvite,
  TabParticipantChange,
  WaiterCall,
  WaiterCallReason,
} from '../contracts/tab';
import type { FavoriteBranch } from '../contracts/favorites';
import { MAX_FAVORITES } from '../contracts/favorites';
import type { DinerNotificationPage } from '../contracts/notifications';
import {
  CannotReportOwnReviewError,
  ReviewNeedsVisitError,
  TooManyFavoritesError,
  BookingEndedError,
  BookingNotActiveError,
  BookingTableOccupiedError,
  BookingNotFoundError,
  BookingTooEarlyError,
  BranchUnavailableError,
  EmailTakenError,
  ExpiredCodeError,
  ExtensionsNotOfferedError,
  HoldAlreadyExtendedError,
  HoldNotActiveError,
  InvalidCredentialsError,
  MenuItemUnavailableError,
  NotTabHostError,
  PhoneInUseError,
  PhoneNotVerifiedError,
  RateLimitedError,
  SmsUnavailableError,
  HostCannotLeaveError,
  InviteExpiredError,
  ServiceRequestRateLimitedError,
  TabAccessEndedError,
  TabClosedError,
  TabNotAcceptingOrdersError,
  TableOutOfServiceError,
  TableRequestClosedError,
  TabsNotEnabledError,
  TelegramUnavailableError,
  TooManyAttemptsError,
  UnknownTableCodeError,
  UsernameTakenError,
  WrongCodeError,
} from '../contracts/errors';
import {
  ApiError,
  ForbiddenError,
  NotFoundError,
  SessionRevokedError,
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
import { rethrowBookingRefusal } from './bookingRefusal';
import { guestRecordFromWire } from './guestRecordMapping';
import { admissionRefusal, scanTurnedAway } from './admissionMapping';
import {
  availabilityFromResponse,
  daySlotsFromWire,
  floorFromAvailability,
  slotFloorFromResponse,
  floorFromState,
  localDateTime,
  type WireDaySlots,
} from './mapping';
import type { ExtendHoldOutcome, ReservationState } from '../contracts/push';
import {
  booking,
  dinerProfile,
  dinerTab,
  participantChange,
  reservationState,
  reservationStatus,
  settlementModeCode,
} from './dinerMapping';
import {
  clampBranchSearch,
  type BranchDetail,
  type BranchListing,
  type BranchReviewPage,
  type BranchSearchQuery,
  type BranchRooms,
  type DinerOrder,
  type MyBranchReview,
} from '../contracts/places';
import {
  branchDetailFromWire,
  branchListingFromWire,
  favoritesFromWire,
  notificationPageFromWire,
  dinerOrderFromWire,
  myReviewFromWire,
  reviewPageFromWire,
  branchRoomsFromWire,
  venueTypeCode,
  type WireBranchDetail,
  type WireBranchListing,
  type WireDinerOrder,
  type WireDinerReview,
  type WireFavoriteList,
  type WireNotificationPage,
  type WireReviewPage,
  type WireRooms,
} from './placesMapping';
import { photoRejectionFrom } from './photoErrors';
import { absolutePhoto } from './photoUrl';
import { venueSummariesFromCards } from './publicMapping';
import {
  billRequest,
  billScopeCode,
  branchMenu,
  placeOrderResult,
  tabEventPage,
  tabShares,
  type RequestView,
} from './staffMapping';
import { photo } from './venueSettingsMapping';

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
  /**
   * Where the participant tokens tabs issued this device are kept between
   * launches. Absent, they live as long as the gateway.
   */
  readonly tabTokens?: TabTokenStorage | undefined;
}

/**
 * tabId → participant token, kept where a reload finds it: the keychain on a
 * phone, localStorage on the web. Read once, written whole on every change.
 */
export interface TabTokenStorage {
  read(): Promise<Readonly<Record<string, string>>>;
  write(tokens: Readonly<Record<string, string>>): Promise<void>;
}

/**
 * A coordinate cut to three decimals — about 110 m — before it leaves the phone.
 *
 * Two reasons. The server caches browse answers by query string, and a GPS fix
 * that wobbles in the sixth decimal made every request a cache miss. And a
 * diner's exact position is more than a "nearest first" list needs to know;
 * a hundred metres sorts the same list.
 */
function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * The browse query string: `q`, `category` (1 Cafe, 2 Restaurant), and `lat`
 * with `lng` — both or neither, which the server enforces with a 400, rounded
 * to three decimals. `q` is cut to the server's 100 characters, which it would
 * otherwise refuse with a 400.
 */
function branchQuery(query: BranchSearchQuery | undefined): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const q = clampBranchSearch(query?.query);
  if (q) out['q'] = q;
  if (query?.venueType) out['category'] = venueTypeCode(query.venueType);
  const position = query?.position;
  if (position && Number.isFinite(position.latitude) && Number.isFinite(position.longitude)) {
    out['lat'] = roundCoordinate(position.latitude);
    out['lng'] = roundCoordinate(position.longitude);
  }
  return out;
}

/**
 * `acceptsFreeByUtc` on a booking body, only when one was agreed: an older
 * server then sees exactly the body it always did.
 *
 * Booking times, ahead of the generated request shapes — the bodies are built
 * with `satisfies` against them and this adds the one key they do not have
 * yet. After `api:generate` it can go back inline.
 */
function withFreeBy<T extends object>(
  body: T,
  acceptsFreeByUtc: string | null | undefined,
): T & { readonly acceptsFreeByUtc?: string } {
  return acceptsFreeByUtc ? { ...body, acceptsFreeByUtc } : body;
}

/** Trimmed, and blank as `null` — the server's own reading of an optional note. */
function noteOrNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed === '' ? null : trimmed;
}

/** Resend is allowed once the backend's code-request window has passed. */
const RESEND_AFTER_MS = 60_000;

/** `ReservationChannel`: 1 App, 2 Web. */
const CHANNEL_CODE = { app: 1, web: 2 } as const;

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
   * participant token was refused.
   *
   * Mirrored to `options.tabTokens` when there is one, so a reload or a deep
   * link to an open tab re-attaches with the token the scan earned instead of
   * meeting "the tab has closed". The server's refusal is what drops one.
   */
  const tabTokens = new Map<string, string>();
  const tabTokenStore = options.tabTokens;
  const tabTokensLoaded: Promise<void> = tabTokenStore
    ? tabTokenStore
        .read()
        .then((stored) => {
          for (const [tabId, token] of Object.entries(stored)) {
            // A token this gateway was handed since launch is newer.
            if (!tabTokens.has(tabId)) tabTokens.set(tabId, token);
          }
        })
        .catch(() => undefined)
    : Promise.resolve();

  function persistTabTokens(): void {
    if (!tabTokenStore) return;
    void tabTokenStore.write(Object.fromEntries(tabTokens)).catch(() => undefined);
  }

  function keepTabToken(tabId: string, token: string): void {
    tabTokens.set(tabId, token);
    persistTabTokens();
  }

  function forgetTabToken(tabId: string): void {
    if (tabTokens.delete(tabId)) persistTabTokens();
  }

  async function tabAuth(tabId: string): Promise<Omit<RequestOptions, 'method' | 'body'>> {
    await tabTokensLoaded;
    const token = tabTokens.get(tabId);
    if (!token) {
      throw new TabAccessEndedError({ url: `/api/tabs/${tabId}`, tabId, notOnDevice: true });
    }
    return { skipAuth: true, headers: { authorization: `Bearer ${token}` } };
  }

  /**
   * The table scan and the invitation: anonymous routes, but a signed-in diner's
   * token goes with them, because the server links the tab place to the account
   * that carried one — and review eligibility (K8) counts only a linked place.
   *
   * Still `skipAuth` with the header set by hand, so a refused token can never
   * spend the rotating refresh token, and a session that cannot produce a token
   * scans anonymously rather than not at all.
   */
  async function openingAuth(): Promise<Omit<RequestOptions, 'method' | 'body'>> {
    if (auth?.getState() !== 'signedIn') return { skipAuth: true };
    const token = await auth.getAccessToken().catch(() => null);
    return token
      ? { skipAuth: true, headers: { authorization: `Bearer ${token}` } }
      : { skipAuth: true };
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
    if (error instanceof TabAccessEndedError) return error;
    if (error instanceof ApiError && statuses.includes(error.status) && !error.problem?.code) {
      forgetTabToken(tabId);
      return new TabAccessEndedError({ url: error.url, tabId, status: error.status });
    }
    if (error instanceof UnauthorizedError) {
      forgetTabToken(tabId);
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
    keepTabToken(result.token.tabId, result.token.accessToken);
    const tab = dinerTab(result.tab, new Date().toISOString(), client.baseUrl);
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
  /**
   * A refused "I'm at my table", as the error a screen can explain.
   *
   * Every 404 on this route is about the *booking*, never about a table: what
   * was sent was a booking code, and answering it with "that code does not
   * match a table" is the exact dead end this route was added to end. The 409s
   * it shares with the scan — the table out of service, a tab being settled —
   * fall through to the scan's own reading, so one sentence covers both doors.
   */
  function rethrowBookingTab(error: unknown): never {
    if (error instanceof ApiError) {
      const context = error.problem?.context ?? {};
      const text = (value: unknown): string | undefined =>
        typeof value === 'string' ? value : undefined;
      const facts = {
        url: error.url,
        requestId: error.requestId,
        reservationId: text(context['reservationId']),
        startUtc: text(context['startUtc']),
        endUtc: text(context['endUtc']),
      };

      switch (error.problem?.code) {
        case 'phone-not-verified':
          throw new PhoneNotVerifiedError({ url: error.url, requestId: error.requestId });
        case 'booking-not-found':
          throw new BookingNotFoundError({ url: error.url, requestId: error.requestId });
        case 'booking-too-early':
          throw new BookingTooEarlyError({ ...facts, earliestUtc: text(context['earliestUtc']) });
        case 'booking-ended':
          throw new BookingEndedError(facts);
        case 'booking-table-occupied':
          throw new BookingTableOccupiedError({
            ...facts,
            tableLabel: text(context['tableLabel']),
          });
        case 'booking-not-active':
          throw new BookingNotActiveError({
            ...facts,
            // The wire sends the number; the copy needs to know *which*
            // cancellation, because "you cancelled" and "the venue cancelled"
            // are not the same news to the person reading it.
            status:
              typeof context['status'] === 'number'
                ? reservationStatus(context['status'])
                : undefined,
          });
        default:
          break;
      }

      if (error instanceof NotFoundError) {
        throw new BookingNotFoundError({ url: error.url, requestId: error.requestId });
      }
    }

    rethrowScan(error);
  }

  function rethrowScan(error: unknown): never {
    if (error instanceof NotFoundError) {
      throw new UnknownTableCodeError({ url: error.url });
    }
    // Turned away a moment ago: before the generic 409s below.
    const turnedAway = scanTurnedAway(error);
    if (turnedAway) throw turnedAway;
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
        await tabAuth(tabId),
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
  async function mineWire(): Promise<Schemas['Yalla.Application.Reservations.MyReservations']> {
    const { data } =
      await client.get<Schemas['Yalla.Application.Reservations.MyReservations']>(
        '/api/reservations/mine',
      );
    return data;
  }

  /**
   * The caller's bookings, split upcoming and past **by the server**, with
   * their own guest record beside them (2026-10-20).
   */
  async function mine(): Promise<MyBookings> {
    const data = await mineWire();
    return {
      upcoming: (data.upcoming ?? []).map(toBooking),
      past: (data.past ?? []).map(toBooking),
      guestRecord: guestRecordFromWire(data.guestRecord),
    };
  }

  async function findMineView(reservationId: string): Promise<ReservationViewWire | null> {
    const data = await mineWire();
    return (
      [...(data.upcoming ?? []), ...(data.past ?? [])].find(
        (entry) => entry.id === reservationId,
      ) ?? null
    );
  }

  async function findMine(reservationId: string): Promise<Booking | null> {
    const view = await findMineView(reservationId);
    return view ? toBooking(view) : null;
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
  function rethrowOrdering(error: unknown, tabId: string): never {
    if (!(error instanceof ApiError) || !error.problem) throw error;
    const context = error.problem.context ?? {};
    // A waiter has not let the table order yet: said as itself, not a race.
    const admission = admissionRefusal(error, tabId);
    if (admission) throw admission;

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

  /** `GET /api/diner/me`: the account behind the session. */
  async function readProfile(): Promise<DinerProfileView> {
    const { data } =
      await client.get<Schemas['Yalla.Application.Diners.DinerProfileView']>('/api/diner/me');
    return dinerProfile(data, client.baseUrl);
  }

  /**
   * A 429 on any of the sign-in doors, as the screens' refusal.
   *
   * Only a time the server gave. The per-number window is an hour and sends no
   * Retry-After; the per-address one sends it.
   */
  function rateLimited(error: TooManyRequestsError): RateLimitedError {
    return new RateLimitedError({
      url: error.url,
      retryAtUtc:
        error.retryAfterSeconds !== null
          ? new Date(Date.now() + error.retryAfterSeconds * 1000).toISOString()
          : null,
    });
  }

  /**
   * Signed in: start the token session from what the server issued, and hand
   * the caller the same facts.
   *
   * The one place the diner session is started. Verify-code, register and
   * login all answer `DinerSignInResult`, and all three land here — so a fourth
   * door, or a change to what "signed in" means, is a change to one function.
   */
  async function signedIn(
    result: Schemas['Yalla.Application.Auth.DinerSignInResult'],
  ): Promise<DinerSignInResult> {
    await auth?.signIn({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresInSeconds: result.expiresInSeconds,
    });
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresInSeconds: result.expiresInSeconds,
      dinerUserId: result.dinerUserId,
      isNewAccount: result.isNewAccount,
    };
  }

  /**
   * The account refusals, each by its own code.
   *
   * Three 409s for three fields, and one 401 that is deliberately not an
   * {@link UnauthorizedError}: `invalid-credentials` means the password did not
   * match, not that a session ended, and a screen routing to sign-in over it
   * would send somebody already on the sign-in screen to the sign-in screen.
   * Anything unrecognised keeps the client's own mapping — a 400 is already a
   * `ValidationError` naming the field.
   */
  function rethrowAccount(error: unknown): never {
    if (error instanceof ApiError) {
      const base = { url: error.url, requestId: error.requestId };
      switch (error.problem?.code) {
        case 'username-taken':
          throw new UsernameTakenError(base);
        case 'email-taken':
          throw new EmailTakenError(base);
        case 'phone-in-use':
          throw new PhoneInUseError(base);
        case 'invalid-credentials':
          throw new InvalidCredentialsError(base);
        default:
          break;
      }
    }
    throw error;
  }

  /** `POST /api/auth/diner/register`, as the wire spells the command. */
  function registerBody(
    command: RegisterDinerCommand,
  ): Schemas['Yalla.Api.Endpoints.RegisterDinerRequest'] {
    return {
      username: command.username,
      email: command.email,
      password: command.password,
      phoneE164: command.phoneE164,
      displayName: command.displayName,
      localeCode: command.localeCode ?? null,
    };
  }

  /** `PUT /api/diner/me`: only the fields present, so an absent one is left alone. */
  function profileBody(
    command: UpdateDinerProfileCommand,
  ): Schemas['Yalla.Api.Endpoints.UpdateDinerProfileRequest'] {
    return {
      ...(command.displayName !== undefined ? { displayName: command.displayName } : {}),
      ...(command.username !== undefined ? { username: command.username } : {}),
      ...(command.email !== undefined ? { email: command.email } : {}),
    };
  }

  /**
   * The multipart body for an avatar. One `file` part, whichever platform.
   *
   * React Native's `FormData` takes `{ uri, name, type }` and reads the bytes
   * from the uri itself; the web's takes a `Blob`. The cast is the platform
   * difference and nothing else — the DOM typings do not know about the native
   * shape, and the native runtime does not care about the DOM's.
   */
  function photoForm(file: DinerPhotoFile): FormData {
    const form = new FormData();
    if (typeof Blob !== 'undefined' && file instanceof Blob) {
      const name = 'name' in file && typeof file.name === 'string' ? file.name : 'photo';
      form.append('file', file, name);
    } else {
      form.append('file', file as unknown as Blob);
    }
    return form;
  }

  async function availability(
    branchId: string,
    query: { date?: string; time?: string; partySize?: number; excludeReservationId?: string },
  ): Promise<Schemas['Yalla.Application.Reservations.BranchAvailability']> {
    const { data } = await client.get<Schemas['Yalla.Application.Reservations.BranchAvailability']>(
      `/api/branches/${branchId}/availability`,
      { query, skipAuth: true },
    );
    return data;
  }

  /**
   * `excludeReservationId`, only when there is one: the booking being changed,
   * which the server then ignores so its own table reads free. Absent is the
   * ordinary question and must stay byte-identical to it, for the server's
   * cache as much as for anything else.
   */
  function excluding(bookingId: string | undefined): { excludeReservationId?: string } {
    return bookingId ? { excludeReservationId: bookingId } : {};
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
          // Absent only from a server that predates the K9 gate, which books.
          acceptsAppBookings: data.acceptsAppBookings ?? true,
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

    async getSlotFloor({ branchId, slotUtc, partySize, timeZoneId, excludeBookingId }) {
      try {
        // The branch's wall clock, never the device's: the backend asks in
        // local date and time terms, and a tourist's phone on Moscow time would
        // otherwise book a table three hours from the one they picked.
        const { date, time } = localDateTime(slotUtc, timeZoneId ?? defaultZone);
        return slotFloorFromResponse(
          await availability(branchId, { date, time, partySize, ...excluding(excludeBookingId) }),
        );
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    /**
     * `GET /api/branches/{id}/availability/slots`, anonymous like the single
     * slot. The date is the branch's own calendar day, as the diner picked it.
     */
    async getDaySlots({ branchId, date, partySize, excludeBookingId }): Promise<DaySlots | null> {
      try {
        const { data } = await client.get<WireDaySlots>(
          `/api/branches/${branchId}/availability/slots`,
          { query: { date, partySize, ...excluding(excludeBookingId) }, skipAuth: true },
        );
        return daySlotsFromWire(data);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    // --- Places ---------------------------------------------------------------
    //
    // All anonymous reads except the diner's own review. Photo links arrive
    // root-relative and leave absolute, resolved against this client's origin.

    async listBranches(query): Promise<readonly BranchListing[]> {
      const { data } = await client.get<WireBranchListing[]>('/api/public/branches', {
        skipAuth: true,
        query: branchQuery(query),
      });
      return (data ?? []).map((wire) => branchListingFromWire(wire, client.baseUrl));
    },

    async searchBranches(query): Promise<readonly BranchListing[]> {
      const { data } = await client.get<WireBranchListing[]>('/api/public/branches/search', {
        skipAuth: true,
        query: branchQuery(query),
      });
      return (data ?? []).map((wire) => branchListingFromWire(wire, client.baseUrl));
    },

    async getBranchDetail(branchId, position): Promise<BranchDetail | null> {
      try {
        const { data } = await client.get<WireBranchDetail>(
          `/api/public/branches/${encodeURIComponent(branchId)}`,
          { skipAuth: true, query: branchQuery({ position }) },
        );
        return branchDetailFromWire(data, client.baseUrl);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async getBranchReviews({ branchId, page }): Promise<BranchReviewPage | null> {
      try {
        const { data } = await client.get<WireReviewPage>(
          `/api/public/branches/${encodeURIComponent(branchId)}/reviews`,
          { skipAuth: true, query: { page: page ?? 1 } },
        );
        return reviewPageFromWire(data);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async getBranchRooms(branchId): Promise<BranchRooms | null> {
      try {
        const { data } = await client.get<WireRooms>(
          `/api/public/branches/${encodeURIComponent(branchId)}/rooms`,
          { skipAuth: true },
        );
        return branchRoomsFromWire(data, client.baseUrl);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    /** `GET /api/diner/branches/{id}/review`. A 404 is "not written yet". */
    async getMyBranchReview(branchId): Promise<MyBranchReview | null> {
      try {
        const { data } = await client.get<WireDinerReview>(
          `/api/diner/branches/${encodeURIComponent(branchId)}/review`,
        );
        return myReviewFromWire(data);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    /**
     * `PUT /api/diner/branches/{id}/review` — the upsert, so a first review and
     * a revision are one call and a retry after a lost response cannot 409.
     */
    async saveMyBranchReview({ branchId, rating, text }): Promise<MyBranchReview> {
      try {
        const trimmed = typeof text === 'string' ? text.trim() : '';
        const { data } = await client.put<WireDinerReview>(
          `/api/diner/branches/${encodeURIComponent(branchId)}/review`,
          { rating, text: trimmed === '' ? null : trimmed },
        );
        return myReviewFromWire(data);
      } catch (error) {
        if (error instanceof ForbiddenError && error.problem?.code === 'phone-not-verified') {
          throw new PhoneNotVerifiedError({ url: error.url, requestId: error.requestId });
        }
        if (error instanceof ForbiddenError && error.problem?.code === 'review-needs-visit') {
          throw new ReviewNeedsVisitError({ url: error.url, requestId: error.requestId });
        }
        throw error;
      }
    },

    /**
     * `POST /api/diner/reviews/{reviewId}/report`. The one 409 the route has is
     * the diner's own review; a repeat report answers 204 like the first.
     */
    async reportReview({ reviewId, reason, note }): Promise<void> {
      try {
        await client.post(`/api/diner/reviews/${encodeURIComponent(reviewId)}/report`, {
          reason,
          note: noteOrNull(note),
        } satisfies Schemas['Yalla.Application.Diners.ReportReviewCommand']);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          throw new CannotReportOwnReviewError({ url: error.url, requestId: error.requestId });
        }
        throw error;
      }
    },

    // --- Favourites (K11) -----------------------------------------------------------
    //
    // The diner's own token, `Diner` policy: an unverified account may keep
    // hearts. The position rides along like the browse list's, rounded the same.

    async listFavorites(position): Promise<readonly FavoriteBranch[]> {
      const { data } = await client.get<WireFavoriteList>('/api/diner/favorites', {
        query: branchQuery({ position }),
      });
      return favoritesFromWire(data, client.baseUrl);
    },

    async addFavorite(branchId): Promise<void> {
      try {
        await client.put(`/api/diner/favorites/${encodeURIComponent(branchId)}`);
      } catch (error) {
        // The route's one 409 is the cap. A 404 (unknown or inactive) passes through.
        if (error instanceof ApiError && error.status === 409) {
          throw new TooManyFavoritesError({
            url: error.url,
            requestId: error.requestId,
            max: MAX_FAVORITES,
          });
        }
        throw error;
      }
    },

    async removeFavorite(branchId): Promise<void> {
      await client.delete(`/api/diner/favorites/${encodeURIComponent(branchId)}`);
    },

    async mergeFavorites(branchIds, position): Promise<readonly FavoriteBranch[]> {
      try {
        const { data } = await client.put<WireFavoriteList>(
          '/api/diner/favorites',
          {
            branchIds: [...new Set(branchIds)],
          } satisfies Schemas['Yalla.Application.Diners.MergeFavoritesCommand'],
          { query: branchQuery({ position }) },
        );
        return favoritesFromWire(data, client.baseUrl);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          throw new TooManyFavoritesError({
            url: error.url,
            requestId: error.requestId,
            max: MAX_FAVORITES,
          });
        }
        throw error;
      }
    },

    // --- The notifications feed (K12) ------------------------------------------------

    async listNotifications(query): Promise<DinerNotificationPage> {
      const { data } = await client.get<WireNotificationPage>('/api/diner/notifications', {
        query: {
          ...(query?.before ? { before: query.before } : {}),
          ...(query?.limit !== undefined ? { limit: query.limit } : {}),
        },
      });
      return notificationPageFromWire(data);
    },

    async getUnreadNotificationCount(): Promise<number> {
      const { data } = await client.get<WireNotificationPage>('/api/diner/notifications', {
        query: { limit: 1 },
      });
      return data?.unreadCount ?? 0;
    },

    async markNotificationsRead(command): Promise<void> {
      await client.post('/api/diner/notifications/read', {
        upTo: command.upTo ?? null,
        ids: command.ids ? [...command.ids] : null,
      } satisfies Schemas['Yalla.Application.Diners.MarkNotificationsReadCommand']);
    },

    // --- The diner's orders -----------------------------------------------------

    async listDinerOrders(segment): Promise<readonly DinerOrder[]> {
      const { data } = await client.get<WireDinerOrder[]>('/api/diner/orders', {
        ...(segment ? { query: { status: segment } } : {}),
      });
      return (data ?? []).map((wire) => dinerOrderFromWire(wire, client.baseUrl));
    },

    async getDinerOrder(orderId): Promise<DinerOrder | null> {
      try {
        const { data } = await client.get<WireDinerOrder>(
          `/api/diner/orders/${encodeURIComponent(orderId)}`,
        );
        return dinerOrderFromWire(data, client.baseUrl);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    // --- Takeaway (2026-10-22) --------------------------------------------------
    //
    // The diner's own orders only; somebody else's answers 404, as for an id
    // that is no order. Every refusal is read by `takeawayMapping.ts`.

    async getTakeawayAvailability(branchId): Promise<TakeawayAvailability> {
      const { data } = await client.get<WireTakeawayAvailability>(
        `/api/diner/branches/${encodeURIComponent(branchId)}/takeaway`,
      );
      return takeawayAvailabilityFromWire(data);
    },

    async placeTakeawayOrder(command): Promise<TakeawayOrder> {
      try {
        const { data } = await client.post<WireTakeawayOrder>(
          '/api/diner/takeaway-orders',
          placeTakeawayOrderBody(command),
        );
        return takeawayOrderFromWire(data);
      } catch (error) {
        rethrowTakeawayRefusal(error);
      }
    },

    async getTakeawayOrder(orderId): Promise<TakeawayOrder | null> {
      try {
        const { data } = await client.get<WireTakeawayOrder>(
          `/api/diner/takeaway-orders/${encodeURIComponent(orderId)}`,
        );
        return takeawayOrderFromWire(data);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async cancelTakeawayOrder(orderId): Promise<TakeawayOrder> {
      try {
        // No body: only while sent; after that it is a phone call.
        const { data } = await client.post<WireTakeawayOrder>(
          `/api/diner/takeaway-orders/${encodeURIComponent(orderId)}/cancel`,
        );
        return takeawayOrderFromWire(data);
      } catch (error) {
        rethrowTakeawayRefusal(error);
      }
    },

    // --- Messages with the venue (2026-10-23) ---------------------------------
    //
    // The diner's own subjects only; somebody else's answers 404, as an id that
    // is no booking does. Every refusal is read by `messagesMapping.ts`.

    async getConversation(subject: ConversationSubjectRef): Promise<DinerConversation | null> {
      const id = encodeURIComponent(subject.id);
      try {
        const { data } =
          subject.kind === 'takeaway'
            ? await client.get<WireDinerConversation>(
                `/api/diner/takeaway-orders/${id}/conversation`,
              )
            : await client.get<WireDinerConversation>(`/api/diner/reservations/${id}/conversation`);
        return dinerConversationFromWire(data, subject);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async sendGuestMessage(command): Promise<SentMessage> {
      const id = encodeURIComponent(command.subject.id);
      const body = sendMessageBody(command);
      try {
        const { data } =
          command.subject.kind === 'takeaway'
            ? await client.post<WireDinerMessageResult>(
                `/api/diner/takeaway-orders/${id}/conversation/messages`,
                body,
              )
            : await client.post<WireDinerMessageResult>(
                `/api/diner/reservations/${id}/conversation/messages`,
                body,
              );
        return sentMessageFromWire(data);
      } catch (error) {
        rethrowMessageRefusal(error);
      }
    },

    async markConversationRead(subject): Promise<void> {
      const id = encodeURIComponent(subject.id);
      if (subject.kind === 'takeaway') {
        await client.post(`/api/diner/takeaway-orders/${id}/conversation/read`);
      } else {
        await client.post(`/api/diner/reservations/${id}/conversation/read`);
      }
    },

    async getUnreadMessages(): Promise<DinerUnreadMessages> {
      const { data } = await client.get<WireUnreadMessages>('/api/diner/messages/unread');
      return unreadMessagesFromWire(data);
    },

    // --- Phone verification: the diner sign-in ---------------------------------

    async getPhoneProofChannels(): Promise<PhoneProofChannels> {
      const channels = await dinerAuth.phoneProofChannels();
      return { sms: channels.sms, telegram: channels.telegram };
    },

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
        if (error instanceof TooManyRequestsError) throw rateLimited(error);
        // No SMS provider on this backend. Only this code: any other 503 is an
        // outage, and telling the diner to use Telegram for it would be a guess.
        if (error instanceof ApiError && error.status === 503 && error.code === 'sms-unavailable') {
          throw new SmsUnavailableError({ url: error.url, requestId: error.requestId });
        }
        throw error;
      }
    },

    async verifyPhoneCode({ challengeId, code, localeCode }): Promise<VerifiedPhone> {
      try {
        // The session's token when there is one, so an account verifying its
        // own number keeps its password; an unreadable session is anonymous.
        const bearer = (await options.auth?.getAccessToken().catch(() => null)) ?? null;
        const result = await signedIn(
          await dinerAuth.verifyCode(
            {
              phoneE164: challengeId,
              code,
              ...(localeCode ? { localeCode } : {}),
            },
            bearer,
          ),
        );
        return {
          // The bearer token is the proof now; screens keep treating this as an
          // opaque token and the gateway supplies it from the session.
          verificationToken: result.accessToken,
          phoneE164: challengeId,
        };
      } catch (error) {
        // A revoked session is not a wrong code: the caller's own token was
        // refused, and the screen signs out rather than asking for digits again.
        if (error instanceof SessionRevokedError) throw error;
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

    // --- Telegram verification: the other diner sign-in ---------------------------

    async startTelegramVerification(options): Promise<TelegramChallenge> {
      try {
        const bearer = (await auth?.getAccessToken().catch(() => null)) ?? null;
        const result = await dinerAuth.telegramStart(
          options?.localeCode ? { localeCode: options.localeCode } : {},
          bearer,
        );
        return {
          challengeId: result.challengeId,
          deepLinkUrl: result.deepLinkUrl,
          expiresAtUtc: new Date(Date.now() + result.expiresInSeconds * 1000).toISOString(),
          pollAfterMs: result.pollAfterMs,
        };
      } catch (error) {
        // A backend with Telegram switched off serves no such route at all.
        if (error instanceof NotFoundError) throw new TelegramUnavailableError({ url: error.url });
        if (error instanceof TooManyRequestsError) throw rateLimited(error);
        throw error;
      }
    },

    async claimTelegramVerification(challengeId, options): Promise<TelegramClaimResult> {
      try {
        const bearer = (await auth?.getAccessToken().catch(() => null)) ?? null;
        const answer = await dinerAuth.telegramClaim(
          challengeId,
          options?.localeCode ? { localeCode: options.localeCode } : {},
          bearer,
        );
        // `state` is a string on the wire and `signIn` is set only on
        // `verified`: anything short of both is still pending.
        if (answer.state !== 'verified' || !answer.signIn) return { state: 'pending' };
        // The same session start as a passed code.
        const result = await signedIn(answer.signIn);
        // The number the bot confirmed: from the answer when it says, else from
        // the profile the new session can now read.
        const phoneE164 = answer.phoneE164 || (await readProfile()).phoneE164;
        return {
          state: 'verified',
          verified: { verificationToken: result.accessToken, phoneE164 },
        };
      } catch (error) {
        if (error instanceof SessionRevokedError) throw error;
        if (error instanceof TooManyRequestsError) throw rateLimited(error);
        // 410 `telegram-verification-expired`: the challenge aged out, or was
        // never this backend's. The same refusal as an expired code.
        if (error instanceof ApiError && error.status === 410)
          throw new ExpiredCodeError({ url: error.url });
        throw error;
      }
    },

    // --- The account --------------------------------------------------------------

    /**
     * `POST /api/auth/diner/register`. Signs the diner in on the way out, like
     * verify-code. Rate limited like request-code, so the 429 is the same
     * {@link RateLimitedError} with the server's `Retry-After` when it sent one.
     */
    async registerDiner(command): Promise<DinerSignInResult> {
      try {
        return await signedIn(await dinerAuth.register(registerBody(command)));
      } catch (error) {
        if (error instanceof TooManyRequestsError) {
          throw new RateLimitedError({
            url: error.url,
            retryAtUtc:
              error.retryAfterSeconds !== null
                ? new Date(Date.now() + error.retryAfterSeconds * 1000).toISOString()
                : null,
          });
        }
        rethrowAccount(error);
      }
    },

    /** `POST /api/auth/diner/login`. Ten misses in fifteen minutes burns the identifier. */
    async loginDiner(command): Promise<DinerSignInResult> {
      try {
        return await signedIn(
          await dinerAuth.login({
            identifier: command.identifier,
            password: command.password,
            localeCode: command.localeCode ?? null,
          }),
        );
      } catch (error) {
        if (error instanceof TooManyRequestsError)
          throw new TooManyAttemptsError({ url: error.url });
        rethrowAccount(error);
      }
    },

    /** `GET /api/diner/me`, under the diner's own token. */
    getDinerProfile: readProfile,

    async updateDinerProfile(command): Promise<DinerProfileView> {
      try {
        const { data } = await client.put<Schemas['Yalla.Application.Diners.DinerProfileView']>(
          '/api/diner/me',
          profileBody(command),
        );
        return dinerProfile(data, client.baseUrl);
      } catch (error) {
        rethrowAccount(error);
      }
    },

    /**
     * `PUT /api/diner/me/password`. `currentPassword` is sent only when given:
     * an SMS-made account has none to send, and the server reads its absence as
     * "first password", not as an empty one.
     */
    async setDinerPassword(command): Promise<void> {
      try {
        await client.put('/api/diner/me/password', {
          ...(command.currentPassword !== undefined
            ? { currentPassword: command.currentPassword }
            : {}),
          newPassword: command.newPassword,
        } satisfies Schemas['Yalla.Api.Endpoints.SetDinerPasswordRequest']);
      } catch (error) {
        rethrowAccount(error);
      }
    },

    /**
     * `POST /api/diner/me/photo`, multipart, through the client — so the diner's
     * token, the refresh-on-401 and the typed errors all apply. No progress bar:
     * an avatar is one small square, not an eight-megabyte menu photo.
     */
    async uploadDinerPhoto(file): Promise<Photo> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Media.PhotoView']>(
          '/api/diner/me/photo',
          photoForm(file),
        );
        return absolutePhoto(client.baseUrl, photo(data));
      } catch (error) {
        throw photoRejectionFrom(error);
      }
    },

    async removeDinerPhoto(): Promise<void> {
      await client.delete('/api/diner/me/photo');
    },

    /**
     * `DELETE /api/diner/me` (K2), with the password or the code in the body —
     * or neither, when the bearer carries a phone proof from the last ten minutes.
     *
     * Deliberately does **not** sign the session out: the server has already
     * revoked it, and the caller's sign-out also clears the diner-scoped cache,
     * which this layer cannot see. The next diner call answers
     * `SessionRevokedError` until it does.
     */
    async deleteDinerAccount({ password, code }): Promise<void> {
      try {
        await client.delete('/api/diner/me', {
          body: {
            password: password ?? null,
            code: code ?? null,
          } satisfies Schemas['Yalla.Api.Endpoints.DeleteDinerAccountRequest'],
        });
      } catch (error) {
        if (error instanceof TooManyRequestsError) {
          throw new TooManyAttemptsError({ url: error.url });
        }
        if (error instanceof ForbiddenError && error.problem?.code === 'phone-not-verified') {
          throw new PhoneNotVerifiedError({ url: error.url, requestId: error.requestId });
        }
        rethrowAccount(error);
      }
    },

    // --- The shared tab ---------------------------------------------------------
    //
    // Real, all of it. The table scan and the invitation need no account and
    // hand back a participant token scoped to that one tab; every call on the
    // tab after that carries that token, never the phone's diner session. These
    // were all answered by the mock, which is why no real tab was ever reached.

    /**
     * `POST /api/tabs/open`: the table's QR, this device, and the scan's command
     * id — plus the diner's token when signed in, see {@link openingAuth}.
     */
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
          await openingAuth(),
        );
        return admitted(data);
      } catch (error) {
        rethrowScan(error);
      }
    },

    /**
     * `POST /api/tabs/open-by-booking`: the diner's booking code, this device,
     * and the same command id semantics as the scan.
     *
     * The one opening that **requires** an account. The scan works without a
     * session; this route answers only to the account that made the booking,
     * so it goes out under the diner's own token — and must never be given
     * `skipAuth`, which would turn every attempt into a 401.
     */
    async openTabByBooking(command): Promise<ScanResult> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabAccessResult']>(
          '/api/tabs/open-by-booking',
          {
            bookingCode: command.bookingCode,
            deviceId: await deviceId(),
            clientCommandId: command.commandId,
            ...(command.displayName ? { displayName: command.displayName } : {}),
          } satisfies Schemas['Yalla.Api.Endpoints.OpenTabByBookingRequest'],
        );
        return admitted(data);
      } catch (error) {
        rethrowBookingTab(error);
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
          await openingAuth(),
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
        await client.post(`/api/tabs/${tabId}/leave`, undefined, await tabAuth(tabId));
        forgetTabToken(tabId);
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
          await tabAuth(tabId),
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

    /**
     * `POST /api/tabs/{tabId}/display-name`, under this phone's participant
     * token. Not a host action: anybody on the tab names themselves. A 400 or
     * 422 for a blank or overlong name stays the client's `ValidationError`.
     */
    async setTabDisplayName(tabId, displayName): Promise<TabParticipantChange> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabParticipantView']>(
          `/api/tabs/${tabId}/display-name`,
          { displayName } satisfies Schemas['Yalla.Api.Endpoints.SetDisplayNameRequest'],
          await tabAuth(tabId),
        );
        return participantChange(data);
      } catch (error) {
        throw ended(error, tabId, [401, 403]);
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
          await tabAuth(tabId),
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
    async callWaiter({ tabId, reason, bill }): Promise<WaiterCall> {
      // Sent only with a bill: the server refuses either on any other preset.
      const body = {
        preset: SERVICE_PRESET_CODE[reason],
        ...(bill ? { billScope: billScopeCode(bill.scope), tipPercent: bill.tipPercent } : {}),
      } satisfies Schemas['Yalla.Api.Endpoints.RaiseServiceRequest'];
      let data: RequestView;
      try {
        ({ data } = await client.post<RequestView>(
          `/api/tabs/${tabId}/service-requests`,
          body,
          await tabAuth(tabId),
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
        // The bill, on a tab a waiter has not let in yet: nothing is on it.
        throw admissionRefusal(error, tabId) ?? ended(error, tabId);
      }
      return {
        id: data.serviceRequestId,
        tabId: data.tabId,
        reason,
        requestedAtUtc: data.createdAtUtc,
        // The server's amounts for the scope asked about, so the sheet's
        // success state says the number the waiter is bringing.
        bill: billRequest(data),
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
      // Checked against the request shape by `satisfies` while `acceptsFreeByUtc`
      // is ahead of it (booking times); inline again once the schema has it.
      const body = {
        branchId: command.branchId,
        tableId: command.tableId,
        date,
        time,
        partySize: command.partySize,
        guestName: command.guestName,
        guestPhone: command.guestPhone,
        clientCommandId: command.commandId,
        channel: CHANNEL_CODE[command.channel],
        note: noteOrNull(command.note),
      } satisfies Schemas['Yalla.Api.Endpoints.CreateReservationRequest'];
      try {
        const { data } = await client.post<
          Schemas['Yalla.Application.Reservations.ReservationView']
        >('/api/reservations', withFreeBy(body, command.acceptsFreeByUtc));
        return toBooking(data);
      } catch (error) {
        rethrowBookingRefusal(error, command);
      }
    },

    listBookings: mine,

    /** There is no `GET /api/reservations/{id}`; `/mine` is the read. */
    getBooking: findMine,

    async cancelBooking(bookingId): Promise<Booking> {
      return toBooking(await cancelView(bookingId));
    },

    /**
     * `POST /api/reservations/{id}/reschedule`, in the branch's wall-clock date
     * and time like a new booking. 200 with the booking as it now stands —
     * same id, same code — for a change and for a replay of one alike.
     */
    async rescheduleBooking(command): Promise<Booking> {
      const { date, time } = localDateTime(command.slotUtc, command.timeZoneId);
      const body = {
        date,
        time,
        partySize: command.partySize,
        diningTableId: command.tableId,
        clientCommandId: command.commandId,
      } satisfies Schemas['Yalla.Api.Endpoints.RescheduleReservationRequest'];
      try {
        const { data } = await client.post<
          Schemas['Yalla.Application.Reservations.ReservationView']
        >(
          `/api/reservations/${command.bookingId}/reschedule`,
          withFreeBy(body, command.acceptsFreeByUtc),
        );
        return toBooking(data);
      } catch (error) {
        rethrowBookingRefusal(error, {
          branchId: null,
          tableId: command.tableId,
          partySize: command.partySize,
        });
      }
    },

    /**
     * `POST /api/reservations/{id}/table-requests/{requestId}/answer` — the
     * earlier guest's yes or no. The server answers with the booking as it now
     * stands; a bodiless answer is read back from `/mine` rather than guessed.
     */
    async answerTableRequest({ bookingId, requestId, accept, commandId }): Promise<Booking> {
      let data: ReservationViewWire | undefined;
      try {
        ({ data } = await client.post<ReservationViewWire | undefined>(
          `/api/reservations/${bookingId}/table-requests/${requestId}/answer`,
          { accept, clientCommandId: commandId },
        ));
      } catch (error) {
        // Lapsed, let go by the later guest, or answered on another device.
        if (
          error instanceof ApiError &&
          (error.status === 409 ||
            error.status === 410 ||
            (error.status === 404 && (error.code ?? '').includes('table-request')))
        ) {
          throw new TableRequestClosedError({ url: error.url, requestId, status: error.status });
        }
        throw error;
      }
      if (data && typeof data === 'object' && typeof data.id === 'string') return toBooking(data);
      const current = await findMine(bookingId);
      if (!current) {
        throw new NotFoundError({
          url: `/api/reservations/${bookingId}/table-requests/${requestId}/answer`,
        });
      }
      return current;
    },

    // --- Pre-orders (2026-10-21) --------------------------------------------
    //
    // The diner's own booking only; somebody else's answers 404, as for an id
    // that is no booking. Every refusal is read by `preOrderMapping.ts`.

    async replacePreOrder(command): Promise<PreOrderResult> {
      try {
        const { data } = await client.put<WirePreOrderResult>(
          `/api/reservations/${command.reservationId}/pre-order`,
          replacePreOrderBody(command, command.clientCommandId),
        );
        return preOrderResultFromWire(data);
      } catch (error) {
        rethrowPreOrderRefusal(error);
      }
    },

    async clearPreOrder({ reservationId, clientCommandId }): Promise<PreOrderResult> {
      try {
        const { data } = await client.post<WirePreOrderResult>(
          `/api/reservations/${reservationId}/pre-order/clear`,
          { clientCommandId },
        );
        return preOrderResultFromWire(data);
      } catch (error) {
        rethrowPreOrderRefusal(error);
      }
    },

    async confirmOnMyWay(reservationId): Promise<OnMyWayResult> {
      try {
        // No body. "Can't come" is the booking's ordinary cancel.
        const { data } = await client.post<WireOnMyWayResult>(
          `/api/reservations/${reservationId}/on-my-way`,
        );
        return onMyWayResultFromWire(data);
      } catch (error) {
        rethrowPreOrderRefusal(error);
      }
    },

    async reportRunningLate({ reservationId, minutes }): Promise<RunningLateResult> {
      try {
        // Outside the window: `on-my-way-not-open`, as for on my way.
        const { data } = await client.post<WireRunningLateResult>(
          `/api/reservations/${reservationId}/running-late`,
          { minutes },
        );
        return runningLateResultFromWire(data);
      } catch (error) {
        rethrowPreOrderRefusal(error);
      }
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
          await tabAuth(tabId),
        );
        return dinerTab(data, new Date().toISOString(), client.baseUrl);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw ended(error, tabId, [401, 403]);
      }
    },

    async getTabEvents({ tabId, afterSequence }): Promise<TabEventPage> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Ordering.TabEventPage']>(
          `/api/tabs/${tabId}/events`,
          { ...(await tabAuth(tabId)), query: { afterSequence } },
        );
        return tabEventPage(data);
      } catch (error) {
        throw ended(error, tabId, [401, 403]);
      }
    },

    /**
     * One order for the whole tray.
     *
     * Naming a guest — `onBehalfOfParticipantId`, or a line's `participantId` —
     * is staff-only on the wire (a phone gets 403), and a diner's lines are
     * their own by construction. `isShared` is the only per-line attribution a
     * phone can send.
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
          await tabAuth(command.tabId),
        );
        return placeOrderResult(data);
      } catch (error) {
        // A 403 stays a 403: it is the ordering policy (pending, not allowed,
        // bill asked for), and the tray refetches the tab to say which.
        rethrowOrdering(ended(error, command.tabId), command.tabId);
      }
    },

    async getTabShares(tabId): Promise<TabShares | null> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Ordering.TabSharesView']>(
          `/api/tabs/${tabId}/shares`,
          await tabAuth(tabId),
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
          await tabAuth(command.tabId),
        );
        return dinerTab(data, new Date().toISOString(), client.baseUrl);
      } catch (error) {
        throw hostError(error, command.tabId);
      }
    },
  };
}

/** Re-exported so screens that inspect the error need one import. */
export { ApiError };
