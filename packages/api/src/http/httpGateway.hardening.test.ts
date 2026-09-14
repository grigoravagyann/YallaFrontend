import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import type { CreateBookingCommand } from '../contracts/booking';
import {
  BookingsNotAcceptedError,
  CannotReportOwnReviewError,
  InvalidCredentialsError,
  PhoneNotVerifiedError,
  ReviewNeedsVisitError,
  TabAccessEndedError,
  TooManyAttemptsError,
  TooManyFavoritesError,
} from '../contracts/errors';
import { NotFoundError, SessionRevokedError, ValidationError } from '../errors';
import type { components } from '../generated/schema';
import {
  BASE_URL,
  fakeBackend,
  problemReply,
  type FakeReply,
  type FakeRoute,
} from './fakeBackend.testkit';
import { createHttpGateway } from './httpGateway';

/**
 * The diner gateway against the hardening contract (K1, K2, K8, K9) and the
 * addendum (favourites K11, notifications K12, review reports), coded ahead of
 * the backend packages, so every route and body is the contract's.
 */

type Schemas = components['schemas'];

const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';

const LISTING = {
  branchId: BRANCH,
  venueId: '0b5f3c1e-0000-4000-8000-0000000000aa',
  venueSlug: 'lumen',
  branchSlug: 'cascade',
  venueName: 'Lumen Coffee',
  branchName: 'Cascade',
  venueType: 1,
  address: 'Test address',
  latitude: 40.1843,
  longitude: 44.5129,
  timeZoneId: 'Asia/Yerevan',
  isOpenNow: true,
  freeTableCount: 4,
  reviewCount: 0,
  badges: [],
  coverPhoto: {
    photoId: 'p1',
    thumbnailUrl: '/api/photos/p1/thumbnail',
    cardUrl: '/api/photos/p1/card',
    fullUrl: '/api/photos/p1/full',
  },
} as Schemas['Yalla.Application.Public.PublicBranchListing'];

const DETAIL = {
  listing: LISTING,
  amenities: [],
  openingHours: [],
  gallery: [],
  tableCount: 0,
  acceptsWebBookings: true,
  recentReviews: [],
  tableMarkers: [],
  asOfUtc: '2026-09-14T10:00:00Z',
};

const VIEW = {
  id: '6f1d0a2e-0000-4000-8000-00000000000a',
  code: '482913',
  status: 2,
  branchId: BRANCH,
  branchName: 'Cascade',
  tableId: 'tbl-7',
  tableLabel: '7',
  partySize: 2,
  startUtc: '2026-09-20T15:30:00Z',
  endUtc: '2026-09-20T17:00:00Z',
  localDate: '2026-09-20',
  localStartTime: '19:30:00',
  localEndTime: '21:00:00',
  timeZoneId: 'Asia/Yerevan',
  cancellationDeadlineUtc: '2026-09-20T13:30:00Z',
  cancelledAfterDeadline: false,
  clientCommandId: 'cmd-1',
  guestName: 'Test Diner',
  guestPhone: '+37491000101',
  wasReplay: false,
};

const COMMAND: CreateBookingCommand = {
  commandId: 'cmd-1',
  branchId: BRANCH,
  tableId: 'tbl-7',
  slotUtc: '2026-09-20T15:30:00.000Z',
  timeZoneId: 'Asia/Yerevan',
  partySize: 2,
  guestName: 'Test Diner',
  guestPhone: '+37491000101',
  channel: 'app',
};

function gatewayOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  const gateway = createHttpGateway(backend.client({ getToken: () => 'diner-token' }), {
    audience: 'diner',
    deviceId: () => Promise.resolve('device-1'),
  });
  return { backend, gateway };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('the position the phone sends', () => {
  it('is rounded to three decimals on the list, the detail and the favourites', async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/public/branches': { body: [] },
      [`GET /api/public/branches/${BRANCH}`]: { body: DETAIL },
      'GET /api/diner/favorites': { body: { items: [] } },
    });
    const position = { latitude: 40.18431, longitude: 44.51289 };

    await gateway.listBranches({ position });
    await gateway.getBranchDetail(BRANCH, position);
    await gateway.listFavorites(position);

    expect(backend.requests).toHaveLength(3);
    for (const request of backend.requests) {
      expect(`lat=${request.query.get('lat')}&lng=${request.query.get('lng')}`).toBe(
        'lat=40.184&lng=44.513',
      );
    }
  });
});

describe('the app booking gate and the booking note (K9)', () => {
  it('reads acceptsAppBookings from the detail and the page, and a server without it as booking', async () => {
    const { gateway } = gatewayOver({
      [`GET /api/public/branches/${BRANCH}`]: { body: { ...DETAIL, acceptsAppBookings: false } },
      'GET /api/public/branches/lumen/cascade': {
        body: { bookingWindowDays: 14, policy: { minLeadMinutes: 30 }, acceptsAppBookings: false },
      },
      'GET /api/public/branches/lumen/older': {
        body: { bookingWindowDays: 14, policy: { minLeadMinutes: 30 } },
      },
    });

    expect((await gateway.getBranchDetail(BRANCH))?.acceptsAppBookings).toBe(false);
    expect(await gateway.getBookingRules({ venueSlug: 'lumen', branchSlug: 'cascade' })).toEqual({
      bookingWindowDays: 14,
      minLeadMinutes: 30,
      acceptsAppBookings: false,
    });
    expect(
      (await gateway.getBookingRules({ venueSlug: 'lumen', branchSlug: 'older' }))
        ?.acceptsAppBookings,
    ).toBe(true);
  });

  it('sends the note trimmed, blank as null, and reads it back on the booking', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/reservations': (request) => ({
        status: 201,
        body: { ...VIEW, note: (request.body as { note: string | null }).note },
      }),
    });

    const booking = await gateway.createBooking({ ...COMMAND, note: '  A quiet corner.  ' });
    expect(backend.requests[0]?.body).toMatchObject({ note: 'A quiet corner.' });
    expect(booking.note).toBe('A quiet corner.');

    const plain = await gateway.createBooking({ ...COMMAND, commandId: 'cmd-2', note: '   ' });
    expect(backend.requests[1]?.body).toMatchObject({ note: null });
    expect(plain.note).toBeNull();
  });

  it('names the gate, and keeps a note over the limit a field error', async () => {
    const gated = gatewayOver({
      'POST /api/reservations': problemReply(409, 'bookings-not-accepted', { branchId: BRANCH }),
    });
    const refusal = await caught(gated.gateway.createBooking(COMMAND));
    expect(refusal).toBeInstanceOf(BookingsNotAcceptedError);
    expect((refusal as BookingsNotAcceptedError).branchId).toBe(BRANCH);

    const field = { field: 'note', message: 'Too long.', bound: 'max', max: 500 };
    const invalid = gatewayOver({
      'POST /api/reservations': problemReply(422, 'validation-failed', { fields: [field] }),
    });
    const error = await caught(
      invalid.gateway.createBooking({ ...COMMAND, note: 'x'.repeat(501) }),
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).violations).toEqual([field]);
  });
});

describe('reviews (K8) and reporting one', () => {
  const route = `/api/diner/branches/${BRANCH}/review`;

  it("reads the server's edited flag, and a server without one from the timestamps", async () => {
    const { gateway } = gatewayOver({
      [`GET /api/public/branches/${BRANCH}/reviews`]: {
        body: {
          branchId: BRANCH,
          rating: 4,
          reviewCount: 3,
          page: 1,
          pageSize: 20,
          reviews: [
            {
              reviewId: 'r1',
              authorName: 'Anahit S.',
              rating: 5,
              createdAtUtc: 'a',
              updatedAtUtc: 'b',
              edited: false,
            },
            {
              reviewId: 'r2',
              authorName: 'Yalla diner',
              rating: 4,
              createdAtUtc: 'a',
              updatedAtUtc: 'a',
              edited: true,
            },
            {
              reviewId: 'r3',
              authorName: 'Test D.',
              rating: 3,
              createdAtUtc: 'a',
              updatedAtUtc: 'b',
            },
          ],
        },
      },
    });

    const page = await gateway.getBranchReviews({ branchId: BRANCH });
    expect(page?.reviews.map((review) => review.edited)).toEqual([false, true, true]);
  });

  it("reads the diner's own review with its public name and whether it is hidden", async () => {
    const base = {
      reviewId: 'r1',
      branchId: BRANCH,
      rating: 4,
      createdAtUtc: '2026-09-14T10:00:00Z',
      updatedAtUtc: '2026-09-14T10:00:00Z',
    };
    const current = gatewayOver({
      [`GET ${route}`]: { body: { ...base, publicAuthorName: 'Anahit S.', hidden: true } },
    });
    expect(await current.gateway.getMyBranchReview(BRANCH)).toMatchObject({
      publicAuthorName: 'Anahit S.',
      hidden: true,
    });

    const older = gatewayOver({ [`GET ${route}`]: { body: base } });
    expect(await older.gateway.getMyBranchReview(BRANCH)).toMatchObject({
      publicAuthorName: null,
      hidden: false,
    });
  });

  it('names a first review with no visit', async () => {
    const { gateway } = gatewayOver({ [`PUT ${route}`]: problemReply(403, 'review-needs-visit') });
    expect(
      await caught(gateway.saveMyBranchReview({ branchId: BRANCH, rating: 5 })),
    ).toBeInstanceOf(ReviewNeedsVisitError);
  });

  it('reports with the reason and the trimmed note, blank as null', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/diner/reviews/r1/report': { status: 204 },
    });

    await gateway.reportReview({
      reviewId: 'r1',
      reason: 'personal-info',
      note: '  A phone number.  ',
    });
    await gateway.reportReview({ reviewId: 'r1', reason: 'spam', note: '  ' });

    expect(backend.requests.map((r) => r.body)).toEqual([
      { reason: 'personal-info', note: 'A phone number.' },
      { reason: 'spam', note: null },
    ]);
  });

  it("reads the route's one 409 as the diner's own review, and passes a 404 through", async () => {
    const own = gatewayOver({
      'POST /api/diner/reviews/r1/report': problemReply(409, 'conflicting-state'),
    });
    expect(
      await caught(own.gateway.reportReview({ reviewId: 'r1', reason: 'spam' })),
    ).toBeInstanceOf(CannotReportOwnReviewError);

    const gone = gatewayOver({
      'POST /api/diner/reviews/r2/report': problemReply(404, 'not-found'),
    });
    expect(
      await caught(gone.gateway.reportReview({ reviewId: 'r2', reason: 'spam' })),
    ).toBeInstanceOf(NotFoundError);
  });
});

describe('favourites (K11)', () => {
  it('lists under the diner token with each listing mapped and its photo absolute', async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/diner/favorites': {
        body: {
          items: [{ branchId: BRANCH, createdAtUtc: '2026-09-14T10:00:00Z', listing: LISTING }],
        },
      },
    });

    const [favorite] = await gateway.listFavorites();

    expect(backend.requests[0]?.headers.get('authorization')).toBe('Bearer diner-token');
    expect(backend.requests[0]?.query.has('lat')).toBe(false);
    expect(favorite).toMatchObject({
      branchId: BRANCH,
      createdAtUtc: '2026-09-14T10:00:00Z',
      listing: { branchId: BRANCH, venueType: 'cafe', rating: null },
    });
    expect(favorite?.listing.coverPhoto?.cardUrl).toBe(`${BASE_URL}/api/photos/p1/card`);
  });

  it('saves, unsaves and merges on their routes, sending each id once', async () => {
    const { gateway, backend } = gatewayOver({
      [`PUT /api/diner/favorites/${BRANCH}`]: { status: 204 },
      [`DELETE /api/diner/favorites/${BRANCH}`]: { status: 204 },
      'PUT /api/diner/favorites': {
        body: {
          items: [{ branchId: BRANCH, createdAtUtc: '2026-09-14T10:00:00Z', listing: LISTING }],
        },
      },
    });

    await gateway.addFavorite(BRANCH);
    await gateway.removeFavorite(BRANCH);
    const merged = await gateway.mergeFavorites([BRANCH, 'b-2', BRANCH]);

    expect(backend.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `PUT /api/diner/favorites/${BRANCH}`,
      `DELETE /api/diner/favorites/${BRANCH}`,
      'PUT /api/diner/favorites',
    ]);
    expect(backend.requests[2]?.body).toEqual({ branchIds: [BRANCH, 'b-2'] });
    expect(merged.map((f) => f.branchId)).toEqual([BRANCH]);
  });

  it('reads the 409 as the cap and passes a 404 through', async () => {
    const { gateway } = gatewayOver({
      [`PUT /api/diner/favorites/${BRANCH}`]: problemReply(409, 'conflicting-state'),
      'PUT /api/diner/favorites/b-gone': problemReply(404, 'not-found'),
      'PUT /api/diner/favorites': problemReply(409, 'conflicting-state'),
    });

    const cap = await caught(gateway.addFavorite(BRANCH));
    expect(cap).toBeInstanceOf(TooManyFavoritesError);
    expect((cap as TooManyFavoritesError).max).toBe(500);
    expect(await caught(gateway.mergeFavorites([BRANCH]))).toBeInstanceOf(TooManyFavoritesError);
    expect(await caught(gateway.addFavorite('b-gone'))).toBeInstanceOf(NotFoundError);
  });
});

describe('the notifications feed (K12)', () => {
  const PAGE = {
    items: [
      {
        notificationId: 'n-8',
        kind: 'booking-reminder',
        params: { tableLabel: '7', partySize: 2 },
        branchId: BRANCH,
        branchName: 'Cascade',
        reservationId: 'res-1',
        createdAtUtc: '2026-09-14T10:00:00Z',
        read: false,
      },
      {
        notificationId: 'n-7',
        kind: 'a-kind-from-a-newer-server',
        createdAtUtc: '2026-09-13T10:00:00Z',
        read: true,
      },
    ],
    nextCursor: 'n-7',
    unreadCount: 4,
  };

  it('pages with before and limit, and reads absent keys as null', async () => {
    const { gateway, backend } = gatewayOver({ 'GET /api/diner/notifications': { body: PAGE } });

    const page = await gateway.listNotifications({ before: 'n-9', limit: 20 });

    expect(backend.requests[0]?.query.toString()).toBe('before=n-9&limit=20');
    expect(page.items[0]).toMatchObject({
      kind: 'booking-reminder',
      params: { tableLabel: '7' },
      read: false,
    });
    expect(page.items[1]).toEqual({
      notificationId: 'n-7',
      kind: 'a-kind-from-a-newer-server',
      params: {},
      branchId: null,
      branchName: null,
      reservationId: null,
      tabId: null,
      orderId: null,
      createdAtUtc: '2026-09-13T10:00:00Z',
      read: true,
    });
    expect(page).toMatchObject({ nextCursor: 'n-7', unreadCount: 4 });
  });

  it('reads the unread count with the smallest page', async () => {
    const { gateway, backend } = gatewayOver({ 'GET /api/diner/notifications': { body: PAGE } });
    expect(await gateway.getUnreadNotificationCount()).toBe(4);
    expect(backend.requests[0]?.query.toString()).toBe('limit=1');
  });

  it('marks read up to one notification, or exactly the ids given', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/diner/notifications/read': { status: 204 },
    });

    await gateway.markNotificationsRead({ upTo: 'n-8' });
    await gateway.markNotificationsRead({ ids: ['n-1', 'n-2'] });

    expect(backend.requests.map((r) => r.body)).toEqual([
      { upTo: 'n-8', ids: null },
      { upTo: null, ids: ['n-1', 'n-2'] },
    ]);
  });
});

describe('deleting the account (K2)', () => {
  async function signedIn(routes: Readonly<Record<string, FakeRoute>>) {
    const backend = fakeBackend(routes);
    const refreshTokens = vi.fn(async () => ({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      expiresInSeconds: 900,
    }));
    const auth = createAuthSession({
      storage: createMemoryTokenStorage('refresh-1'),
      refreshTokens,
    });
    await auth.signIn({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresInSeconds: 900,
    });
    const gateway = createHttpGateway(backend.client({ auth }), { audience: 'diner', auth });
    return { backend, gateway, refreshTokens };
  }

  it('sends the password in the body, and the next call answers as a revoked session with no refresh', async () => {
    const { backend, gateway, refreshTokens } = await signedIn({
      'DELETE /api/diner/me': { status: 204 },
      'GET /api/diner/me': problemReply(401, 'session-revoked'),
    });

    await gateway.deleteDinerAccount({ password: 'correct horse' });

    expect(backend.requests[0]).toMatchObject({
      method: 'DELETE',
      path: '/api/diner/me',
      body: { password: 'correct horse', code: null },
    });
    expect(backend.requests[0]?.headers.get('authorization')).toBe('Bearer access-1');
    expect(await caught(gateway.getDinerProfile())).toBeInstanceOf(SessionRevokedError);
    expect(refreshTokens).not.toHaveBeenCalled();
  });

  it('sends a code for an account with no password', async () => {
    const { backend, gateway } = await signedIn({ 'DELETE /api/diner/me': { status: 204 } });
    await gateway.deleteDinerAccount({ code: '123456' });
    expect(backend.requests[0]?.body).toEqual({ password: null, code: '123456' });
  });

  it.each<[string, FakeReply, abstract new (...args: never[]) => Error]>([
    ['a wrong password or code', problemReply(401, 'invalid-credentials'), InvalidCredentialsError],
    ['too many tries', problemReply(429, 'too-many-attempts'), TooManyAttemptsError],
    ['an unconfirmed number', problemReply(403, 'phone-not-verified'), PhoneNotVerifiedError],
    [
      'a missing password',
      problemReply(422, 'validation-failed', {
        fields: [{ field: 'password', message: 'Required.', bound: 'required' }],
      }),
      ValidationError,
    ],
  ])('reads %s as its own error, without spending the refresh token', async (_, reply, type) => {
    const { gateway, refreshTokens } = await signedIn({ 'DELETE /api/diner/me': reply });
    expect(await caught(gateway.deleteDinerAccount({ password: 'x' }))).toBeInstanceOf(type);
    expect(refreshTokens).not.toHaveBeenCalled();
  });
});

describe('naming yourself on the tab', () => {
  const TAB = '7d0c0000-0000-4000-8000-000000000001';
  const ME = '5a1e0000-0000-4000-8000-0000000000a1';
  const participant = {
    participantId: ME,
    displayName: 'Guest 2',
    role: 2,
    status: 2,
    canOrder: true,
    canOrderNow: true,
    canPay: false,
    canSeeTableTotal: false,
    joinedAtUtc: '2026-09-20T15:00:00Z',
  };
  const access = {
    outcome: 3,
    wasReplay: false,
    tab: {
      tabId: TAB,
      branchId: BRANCH,
      venueName: 'Lumen Coffee',
      branchName: 'Cascade',
      tableLabel: '7',
      status: 1,
      settlementMode: 3,
      settlementModeLocked: false,
      hideTotalFromGuests: false,
      me: participant,
      participants: [{ participantId: ME, displayName: 'Guest 2', role: 2, status: 2 }],
      myLines: [],
      tableTotalVisible: false,
      myItemsSubtotalAmd: 0,
      openedAtUtc: '2026-09-20T15:00:00Z',
      timeZoneId: 'Asia/Yerevan',
      serviceChargePercent: 10,
      maxSequence: 1,
      adjustments: [],
    },
    token: {
      accessToken: 'participant-token',
      branchId: BRANCH,
      canOrder: true,
      displayName: 'Guest 2',
      expiresAtUtc: '2026-09-21T03:00:00Z',
      participantId: ME,
      tabId: TAB,
    },
  };

  async function onTheTab(route: FakeRoute) {
    const setup = gatewayOver({
      'POST /api/tabs/open': { body: access },
      [`POST /api/tabs/${TAB}/display-name`]: route,
    });
    await setup.gateway.scanTableCode({ tableCode: 'a3f09c1e5b7d42e8', commandId: 'cmd-open' });
    return setup;
  }

  it('posts the name under the participant token and answers the participant', async () => {
    const { gateway, backend } = await onTheTab({
      body: { ...participant, displayName: 'Tigran' },
    });

    const change = await gateway.setTabDisplayName(TAB, 'Tigran');

    const request = backend.requests.at(-1)!;
    expect(`${request.method} ${request.path}`).toBe(`POST /api/tabs/${TAB}/display-name`);
    expect(request.body).toEqual({ displayName: 'Tigran' });
    expect(request.headers.get('authorization')).toBe('Bearer participant-token');
    expect(change).toMatchObject({ participantId: ME, displayName: 'Tigran', role: 'guest' });
  });

  it('reads a refused participant token as the tab being over for this phone', async () => {
    const { gateway } = await onTheTab({ status: 403 });
    expect(await caught(gateway.setTabDisplayName(TAB, 'Tigran'))).toBeInstanceOf(
      TabAccessEndedError,
    );
  });
});
