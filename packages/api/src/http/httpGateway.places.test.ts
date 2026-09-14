import { describe, expect, it } from 'vitest';
import { PhoneNotVerifiedError } from '../contracts/errors';
import { UnauthorizedError, ValidationError } from '../errors';
import type { components } from '../generated/schema';
import { BASE_URL, fakeBackend, problemReply } from './fakeBackend.testkit';
import { createHttpGateway } from './httpGateway';

type Listing = components['schemas']['Yalla.Application.Public.PublicBranchListing'];
type Detail = components['schemas']['Yalla.Application.Public.PublicBranchDetail'];
type Order = components['schemas']['Yalla.Application.Diners.DinerOrderView'];

const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';

/** A listing as the wire sends it: null keys omitted, enums as integers. */
const LISTING: Listing = {
  branchId: BRANCH,
  venueId: '0b5f3c1e-0000-4000-8000-0000000000aa',
  venueSlug: 'lumen',
  branchSlug: 'cascade',
  venueName: 'Lumen Coffee',
  branchName: 'Cascade',
  venueType: 1,
  address: '12 Abovyan Street, Yerevan',
  latitude: 40.1843,
  longitude: 44.5129,
  timeZoneId: 'Asia/Yerevan',
  isOpenNow: true,
  freeTableCount: 4,
  reviewCount: 0,
  badges: ['new', 'someday-a-new-badge'],
  coverPhoto: {
    photoId: 'p1',
    thumbnailUrl: '/api/photos/p1/thumbnail',
    cardUrl: '/api/photos/p1/card',
    fullUrl: '/api/photos/p1/full',
  },
} as Listing;

function gatewayOver(routes: Parameters<typeof fakeBackend>[0]) {
  const backend = fakeBackend(routes);
  return { backend, gateway: createHttpGateway(backend.client(), { audience: 'diner' }) };
}

describe('places over /api/public/branches', () => {
  it('lists anonymously, sends the position as lat/lng, and maps the wire honestly', async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/public/branches': { body: [{ ...LISTING, distanceKm: 0.3 }] },
    });

    const [listing] = await gateway.listBranches({
      position: { latitude: 40.18, longitude: 44.51 },
    });

    const request = backend.requests[0]!;
    expect(request.headers.get('authorization')).toBeNull();
    expect(request.query.get('lat')).toBe('40.18');
    expect(request.query.get('lng')).toBe('44.51');
    expect(listing).toMatchObject({
      branchId: BRANCH,
      venueType: 'cafe',
      // Absent on the wire means unknown, never zero or empty.
      cuisine: null,
      priceLevel: null,
      rating: null,
      reviewCount: 0,
      distanceKm: 0.3,
      badges: ['new'],
    });
    expect(listing?.coverPhoto?.cardUrl).toBe(`${BASE_URL}/api/photos/p1/card`);
  });

  it('searches with q and the category code, and leaves out a position it was not given', async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/public/branches/search': { body: [] },
    });

    await gateway.searchBranches({ query: '  lumen ', venueType: 'restaurant' });

    const query = backend.requests[0]!.query;
    expect(query.get('q')).toBe('lumen');
    expect(query.get('category')).toBe('2');
    expect(query.has('lat')).toBe(false);
  });

  it('cuts a search to the 100 characters the server takes, rather than earning a 400', async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/public/branches/search': { body: [] },
    });

    await gateway.searchBranches({ query: `  ${'a'.repeat(99)} ${'b'.repeat(40)}` });

    const q = backend.requests[0]!.query.get('q')!;
    expect(q.length).toBeLessThanOrEqual(100);
    // Cut at 100, then the trailing space the cut left is trimmed too.
    expect(q).toBe('a'.repeat(99));
  });

  it('reads a detail, slicing HH:mm:ss and dropping markers that were never placed', async () => {
    const detail: Detail = {
      listing: { ...LISTING, rating: 4.5, reviewCount: 2 } as Listing,
      amenities: ['wifi'],
      openingHours: [{ day: 1, opensAt: '18:00:00', closesAt: '02:00:00', closesNextDay: true }],
      gallery: [],
      tableCount: 2,
      acceptsWebBookings: false,
      recentReviews: [
        {
          reviewId: 'r1',
          authorName: 'Anahit S.',
          rating: 5,
          createdAtUtc: '2026-09-10T10:00:00Z',
          updatedAtUtc: '2026-09-11T10:00:00Z',
        },
      ],
      tableMarkers: [
        {
          tableId: 't1',
          label: '1',
          seats: 4,
          isBookable: true,
          state: 3,
          photoX: 0.2,
          photoY: 0.4,
        },
        { tableId: 't2', label: '2', seats: 2, isBookable: true, state: 1 } as never,
      ],
      asOfUtc: '2026-09-14T10:00:00Z',
    } as Detail;
    const { gateway } = gatewayOver({ [`GET /api/public/branches/${BRANCH}`]: { body: detail } });

    const read = await gateway.getBranchDetail(BRANCH);

    expect(read?.listing.rating).toBe(4.5);
    expect(read?.openingHours).toEqual([
      { day: 1, opensAt: '18:00', closesAt: '02:00', closesNextDay: true },
    ]);
    expect(read?.recentReviews[0]?.text).toBeNull();
    expect(read?.tableMarkers).toEqual([
      { tableId: 't1', label: '1', seats: 4, isBookable: true, status: 'reserved', x: 0.2, y: 0.4 },
    ]);
  });

  it('answers null for an unknown branch rather than failing', async () => {
    const { gateway } = gatewayOver({
      [`GET /api/public/branches/${BRANCH}`]: problemReply(404, 'not-found'),
      [`GET /api/public/branches/${BRANCH}/table-markers`]: problemReply(404, 'not-found'),
    });

    await expect(gateway.getBranchDetail(BRANCH)).resolves.toBeNull();
    await expect(gateway.getBranchTableMarkers(BRANCH)).resolves.toBeNull();
  });
});

describe('the diner review', () => {
  const route = `/api/diner/branches/${BRANCH}/review`;

  it('saves through the upsert, trimming the text and sending blank as null', async () => {
    const { gateway, backend } = gatewayOver({
      [`PUT ${route}`]: {
        body: {
          reviewId: 'r1',
          branchId: BRANCH,
          rating: 4,
          createdAtUtc: '2026-09-14T10:00:00Z',
          updatedAtUtc: '2026-09-14T10:00:00Z',
        },
      },
    });

    const saved = await gateway.saveMyBranchReview({ branchId: BRANCH, rating: 4, text: '   ' });

    expect(backend.requests[0]?.body).toEqual({ rating: 4, text: null });
    expect(saved).toMatchObject({ rating: 4, text: null });
  });

  it('names the unverified phone, and keeps the validation error typed', async () => {
    const unverified = gatewayOver({ [`PUT ${route}`]: problemReply(403, 'phone-not-verified') });
    await expect(
      unverified.gateway.saveMyBranchReview({ branchId: BRANCH, rating: 5 }),
    ).rejects.toBeInstanceOf(PhoneNotVerifiedError);

    const invalid = gatewayOver({
      [`PUT ${route}`]: problemReply(422, 'validation-failed', {
        fields: [{ field: 'rating', message: '1-5' }],
      }),
    });
    await expect(
      invalid.gateway.saveMyBranchReview({ branchId: BRANCH, rating: 9 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('reads "not written yet" as null', async () => {
    const { gateway } = gatewayOver({ [`GET ${route}`]: problemReply(404, 'not-found') });
    await expect(gateway.getMyBranchReview(BRANCH)).resolves.toBeNull();
  });
});

describe('the diner orders', () => {
  const ORDER: Order = {
    orderId: 'o1',
    tabId: 'tab1',
    branchId: BRANCH,
    venueName: 'Lumen Coffee',
    branchName: 'Cascade',
    kind: 'dineIn',
    status: 'preparing',
    kitchenStatus: 2,
    tableLabel: '5',
    partySize: 2,
    placedAtUtc: '2026-09-14T09:00:00Z',
    totalAmd: 2400,
    items: [
      {
        lineId: 'l1',
        name: 'Flat white',
        quantity: 2,
        unitPriceAmd: 1200,
        lineTotalAmd: 2400,
        isVoided: false,
      },
    ],
    timeline: [{ status: 'confirmed', atUtc: '2026-09-14T09:00:00Z' }],
    canCancel: false,
  } as Order;

  it('lists with the segment and maps each order', async () => {
    const { gateway, backend } = gatewayOver({ 'GET /api/diner/orders': { body: [ORDER] } });

    const [order] = await gateway.listDinerOrders('active');

    expect(backend.requests[0]?.query.get('status')).toBe('active');
    expect(order).toMatchObject({
      orderId: 'o1',
      status: 'preparing',
      coverPhoto: null,
      estimatedReadyAtUtc: null,
      canCancel: false,
    });
    expect(order?.items[0]?.note).toBeNull();
  });

  it("passes a 401 through for a stranger and answers null for somebody else's order", async () => {
    const { gateway } = gatewayOver({
      'GET /api/diner/orders': problemReply(401, 'unauthenticated'),
      'GET /api/diner/orders/o2': problemReply(404, 'not-found'),
    });

    await expect(gateway.listDinerOrders()).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(gateway.getDinerOrder('o2')).resolves.toBeNull();
  });
});
