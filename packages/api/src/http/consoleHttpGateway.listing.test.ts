import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { createApiClient } from '../client';
import {
  FloorPlanChangedError,
  FloorPlanInvalidError,
  RelocationNotAllowedError,
  ReviewHiddenByPlatformError,
} from '../contracts/errors';
import type { VenueListingInput } from '../contracts/listing';
import { ForbiddenError, ValidationError } from '../errors';
import type { components } from '../generated/schema';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';

const BASE = 'https://api.test.yalla.am';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function problem(status: number, code: string, context?: Record<string, unknown>) {
  return json(status, {
    type: 'about:blank',
    title: 'Problem',
    status,
    detail: code,
    code,
    traceId: 'trace',
    ...(context ? { context } : {}),
  });
}

function gatewayOver(fetchImpl: typeof globalThis.fetch) {
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('refresh-0'),
    refreshTokens: vi.fn(),
  });
  return createConsoleHttpGateway(
    createApiClient({ baseUrl: BASE, fetch: fetchImpl, getToken: () => 'held-token' }),
    { auth, identity: createMemoryIdentityStore() },
  );
}

function sentBody(fetchImpl: ReturnType<typeof vi.fn>, call = 0): unknown {
  const [, init] = fetchImpl.mock.calls[call] as [RequestInfo | URL, RequestInit | undefined];
  const body = init?.body;
  return typeof body === 'string' ? JSON.parse(body) : body;
}

function sent(fetchImpl: ReturnType<typeof vi.fn>, call = 0): string {
  const [input, init] = fetchImpl.mock.calls[call] as [RequestInfo | URL, RequestInit | undefined];
  return `${init?.method ?? 'GET'} ${input instanceof Request ? input.url : String(input)}`;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

const WIRE_PHOTO = {
  photoId: 'p1',
  thumbnailUrl: '/api/photos/p1/thumbnail',
  cardUrl: '/api/photos/p1/card',
  fullUrl: '/api/photos/p1/full',
};

const LISTING: VenueListingInput = {
  cuisine: null,
  about: null,
  priceLevel: null,
  websiteUrl: null,
  amenities: [],
  galleryPhotoIds: null,
  address: null,
  district: null,
  latitude: null,
  longitude: null,
};

/** The diner app's listing, as the venue console reads and writes it. */
describe('the branch listing over HTTP', () => {
  it('reads absent fields as nulls and makes gallery links absolute', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(200, {
        amenities: ['wifi'],
        address: '12 Abovyan Street',
        district: ' Kentron ',
        latitude: 40.18,
        longitude: 44.51,
        gallery: [WIRE_PHOTO],
      }),
    );

    const listing = await gatewayOver(fetchImpl).getBranchListing('b-1');

    expect(sent(fetchImpl)).toBe(`GET ${BASE}/api/branches/b-1/listing`);
    expect(listing).toMatchObject({
      cuisine: null,
      about: null,
      priceLevel: null,
      websiteUrl: null,
      amenities: ['wifi'],
      address: '12 Abovyan Street',
      district: 'Kentron',
      latitude: 40.18,
      longitude: 44.51,
    });
    expect(listing.gallery[0]?.cardUrl).toBe(`${BASE}/api/photos/p1/card`);
  });

  it('reads an absent district as null — a branch that never named its area', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        json(200, { amenities: [], address: 'a', latitude: 1, longitude: 2, gallery: [] }),
      );

    expect((await gatewayOver(fetchImpl).getBranchListing('b-1')).district).toBeNull();
  });

  it('always sends the district, a blank one as null, since every field is replaced', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        json(200, { amenities: [], address: 'a', latitude: 1, longitude: 2, gallery: [] }),
      );

    await gatewayOver(fetchImpl).updateBranchListing({
      branchId: 'b-1',
      listing: { ...LISTING, district: '   ' },
    });

    expect(sentBody(fetchImpl)).toHaveProperty('district', null);
  });

  it('puts every field, blanks as nulls, the gallery in order, and the address with the pin', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        json(200, { amenities: [], address: 'a', latitude: 1, longitude: 2, gallery: [] }),
      );

    await gatewayOver(fetchImpl).updateBranchListing({
      branchId: 'b-1',
      listing: {
        cuisine: '  Armenian ',
        about: '   ',
        priceLevel: 2,
        websiteUrl: '',
        amenities: ['wifi', 'vegan'],
        galleryPhotoIds: ['p2', 'p1'],
        address: '  Test address 1 ',
        district: '  Arabkir ',
        latitude: 40.1,
        longitude: 44.5,
      },
    });

    expect(sent(fetchImpl)).toBe(`PUT ${BASE}/api/branches/b-1/listing`);
    expect(sentBody(fetchImpl)).toEqual({
      cuisine: 'Armenian',
      about: null,
      priceLevel: 2,
      websiteUrl: null,
      amenities: ['wifi', 'vegan'],
      galleryPhotoIds: ['p2', 'p1'],
      address: 'Test address 1',
      district: 'Arabkir',
      latitude: 40.1,
      longitude: 44.5,
    });
  });

  it('surfaces a 422 with every field it names, and the bound of each', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      problem(422, 'validation-failed', {
        fields: [
          { field: 'websiteUrl', message: 'Must be absolute.' },
          { field: 'priceLevel', message: 'Out of range.', bound: 'range', min: 1, max: 4 },
        ],
      }),
    );

    const refusal = await caught(
      gatewayOver(fetchImpl).updateBranchListing({
        branchId: 'b-1',
        listing: { ...LISTING, priceLevel: 9, websiteUrl: 'nope' },
      }),
    );

    expect(refusal).toBeInstanceOf(ValidationError);
    expect((refusal as ValidationError).violations).toEqual([
      { field: 'websiteUrl', message: 'Must be absolute.' },
      { field: 'priceLevel', message: 'Out of range.', bound: 'range', min: 1, max: 4 },
    ]);
  });

  it('reads a manager moving the branch as its own refusal (K5)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(problem(403, 'relocation-not-allowed'));
    expect(
      await caught(
        gatewayOver(fetchImpl).updateBranchListing({
          branchId: 'b-1',
          listing: { ...LISTING, address: 'Test address 2', latitude: 40.2, longitude: 44.6 },
        }),
      ),
    ).toBeInstanceOf(RelocationNotAllowedError);
  });
});

describe('rooms with photos over HTTP (K6)', () => {
  const wirePhoto = {
    photoId: 'p1',
    thumbnailUrl: '/api/photos/p1/thumbnail',
    cardUrl: '/api/photos/p1/card',
    fullUrl: '/api/photos/p1/full',
    width: 1600,
    height: 1200,
  };
  const plan = {
    branchId: 'b-1',
    areas: [
      { id: 'a2', name: 'Terrace', displayOrder: 1, photos: [] },
      { id: 'a1', name: 'Hall', displayOrder: 0, photos: [wirePhoto] },
    ],
    tables: [
      {
        id: 't1',
        label: '1',
        seats: 2,
        floorAreaId: 'a1',
        isBookable: true,
        isActive: true,
        isDeletable: false,
        status: 4,
        qrToken: 'qr',
        photoId: 'p1',
        photoX: 0.25,
        photoY: 0.5,
      },
      // Nulls are omitted on the wire: a table with no pin has no photo keys at all.
      {
        id: 't2',
        label: '2',
        seats: 4,
        isBookable: true,
        isActive: true,
        isDeletable: true,
        status: 1,
        qrToken: 'qr2',
      },
    ],
    version: 'v7',
  };

  it('reads rooms in order with absolute photo links, and tables with a pin, a state and whether they can go', async () => {
    const read = await gatewayOver(vi.fn().mockResolvedValue(json(200, plan))).getFloorPlan('b-1');

    expect(read).not.toHaveProperty('floorWidth');
    expect(read.areas.map((area) => area.name)).toEqual(['Hall', 'Terrace']);
    expect(read.areas[0]!.photos[0]).toMatchObject({
      photoId: 'p1',
      fullUrl: `${BASE}/api/photos/p1/full`,
    });
    expect(read.tables[0]).toMatchObject({
      floorAreaId: 'a1',
      status: 'occupied',
      isDeletable: false,
      pin: { photoId: 'p1', x: 0.25, y: 0.5 },
    });
    expect(read.tables[1]).toMatchObject({ floorAreaId: null, status: 'free', pin: null });
    expect(read.version).toBe('v7');
  });

  it("saves each room's photo ids and each table's pin as the three wire fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(200, {
        plan: { ...plan, version: 'v8' },
        warnings: ['w'],
        deactivatedTables: [],
        removedTables: [],
      }),
    );

    const saved = await gatewayOver(fetchImpl).replaceFloorPlan({
      branchId: 'b-1',
      command: {
        expectedVersion: 'v7',
        areas: [{ id: 'a1', name: 'Hall', displayOrder: 0, photoIds: ['p1'] }],
        tables: [
          {
            id: 't1',
            label: '1',
            seats: 2,
            floorAreaName: 'Hall',
            isBookable: true,
            pin: { photoId: 'p1', x: 0.25, y: 0.5 },
          },
          { label: '2', seats: 4, floorAreaName: null, isBookable: false, pin: null },
        ],
      },
    });

    expect(sent(fetchImpl)).toBe(`PUT ${BASE}/api/branches/b-1/floor-plan`);
    expect(sentBody(fetchImpl)).toEqual({
      expectedVersion: 'v7',
      areas: [{ id: 'a1', name: 'Hall', displayOrder: 0, photoIds: ['p1'] }],
      tables: [
        {
          id: 't1',
          label: '1',
          seats: 2,
          floorAreaName: 'Hall',
          isBookable: true,
          photoId: 'p1',
          photoX: 0.25,
          photoY: 0.5,
        },
        {
          id: null,
          label: '2',
          seats: 4,
          floorAreaName: null,
          isBookable: false,
          photoId: null,
          photoX: null,
          photoY: null,
        },
      ],
    });
    expect(saved.plan.version).toBe('v8');
    expect(saved.warnings).toEqual(['w']);
  });

  it('reads a new room with its photos, as POST answers it', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        json(201, { id: 'a3', name: 'VIP', displayOrder: 2, photos: [wirePhoto] }),
      );
    const area = await gatewayOver(fetchImpl).createFloorArea({
      branchId: 'b-1',
      name: 'VIP',
      displayOrder: 2,
    });
    expect(area.photos[0]!.cardUrl).toBe(`${BASE}/api/photos/p1/card`);
  });

  it('reads a stale version as FloorPlanChangedError with the version the server has', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(problem(409, 'floor-plan-changed', { currentVersion: 'v9' }));
    const refusal = await caught(
      gatewayOver(fetchImpl).replaceFloorPlan({
        branchId: 'b-1',
        command: { areas: [], tables: [], expectedVersion: 'v7' },
      }),
    );
    expect(refusal).toBeInstanceOf(FloorPlanChangedError);
    expect((refusal as FloorPlanChangedError).currentVersion).toBe('v9');
  });

  it('keeps FloorPlanInvalidError for the plan refusal and a ValidationError for a photo or pin rule', async () => {
    const command = { areas: [], tables: [], expectedVersion: 'v1' };

    const invalid = await caught(
      gatewayOver(
        vi.fn().mockResolvedValue(
          problem(422, 'floor-plan-invalid', {
            duplicateLabels: ['7'],
            errors: ['Repeated: 7.'],
          }),
        ),
      ).replaceFloorPlan({ branchId: 'b-1', command }),
    );
    expect(invalid).toBeInstanceOf(FloorPlanInvalidError);
    expect((invalid as FloorPlanInvalidError).duplicateLabels).toEqual(['7']);
    expect((invalid as FloorPlanInvalidError).errors).toEqual(['Repeated: 7.']);
    expect(invalid).not.toHaveProperty('tablesOutsideCanvas');

    const malformed = await caught(
      gatewayOver(
        vi.fn().mockResolvedValue(
          problem(422, 'validation-failed', {
            fields: [
              { field: 'areas[0].photoIds[1]', message: 'In two rooms.', bound: 'conflict' },
            ],
          }),
        ),
      ).replaceFloorPlan({ branchId: 'b-1', command }),
    );
    expect(malformed).toBeInstanceOf(ValidationError);
    expect(malformed).not.toBeInstanceOf(FloorPlanInvalidError);
    expect((malformed as ValidationError).violations[0]).toMatchObject({
      field: 'areas[0].photoIds[1]',
      bound: 'conflict',
    });
  });
});

describe('branch readiness over HTTP', () => {
  it('reads the server checklist as it is', async () => {
    const wire: components['schemas']['Yalla.Application.BranchSettings.BranchReadinessView'] = {
      acceptsWebBookings: false,
      blockers: ['Nobody has reviewed the reservation policy; it is still on the defaults.'],
      branchId: 'b-1',
      deviceCount: 1,
      deviceEnrolled: true,
      floorPlanDrawn: true,
      incompleteMenuItemCount: 0,
      incompleteMenuItemIds: [],
      isReadyForDiners: false,
      menuCategoriesPresent: true,
      menuCategoryCount: 2,
      menuComplete: true,
      menuItemCount: 9,
      openingHoursDayCount: 6,
      openingHoursSet: true,
      reservationPolicyReviewed: false,
      staffCount: 3,
      staffEnrolled: true,
      tableCount: 12,
      tablesLabelled: true,
    };
    const fetchImpl = vi.fn().mockResolvedValue(json(200, wire));

    const readiness = await gatewayOver(fetchImpl).getBranchReadiness('b-1');

    expect(sent(fetchImpl)).toBe(`GET ${BASE}/api/branches/b-1/readiness`);
    expect(readiness).toEqual(wire);
  });
});

describe('review moderation over HTTP', () => {
  const WIRE_REVIEW = {
    reviewId: 'rv-1',
    branchId: 'b-1',
    rating: 2,
    authorName: 'Anahit S.',
    dinerUserId: 'd-1',
    createdAtUtc: '2026-09-10T10:00:00Z',
    updatedAtUtc: '2026-09-10T10:00:00Z',
    hidden: false,
  };

  it('pages the platform list and reads absent keys as nulls', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(json(200, { items: [WIRE_REVIEW], page: 2, pageSize: 20, total: 21 }));

    const page = await gatewayOver(fetchImpl).listPlatformBranchReviews('b-1', 2);

    expect(sent(fetchImpl)).toBe(
      `GET ${BASE}/api/platform/branches/b-1/reviews?page=2&pageSize=20`,
    );
    expect(page).toEqual({
      items: [
        {
          ...WIRE_REVIEW,
          text: null,
          hiddenReason: null,
          hiddenAtUtc: null,
          hiddenByPlatform: false,
        },
      ],
      page: 2,
      pageSize: 20,
      total: 21,
    });
  });

  it("reads the platform's takedown flag, and never reports it on a visible review", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(200, {
        items: [
          {
            ...WIRE_REVIEW,
            reviewId: 'rv-1',
            hidden: true,
            hiddenByPlatform: true,
            reportCount: 0,
          },
          {
            ...WIRE_REVIEW,
            reviewId: 'rv-2',
            hidden: false,
            hiddenByPlatform: true,
            reportCount: 0,
          },
        ],
        page: 1,
        pageSize: 20,
        total: 2,
      }),
    );

    const page = await gatewayOver(fetchImpl).listVenueBranchReviews('b-1');

    expect(page.items.map((item) => [item.reviewId, item.hiddenByPlatform])).toEqual([
      ['rv-1', true],
      ['rv-2', false],
    ]);
  });

  it('hides for the platform with the reason in the body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(200, {
        ...WIRE_REVIEW,
        hidden: true,
        hiddenReason: 'Personal information.',
        hiddenAtUtc: '2026-09-11T10:00:00Z',
      }),
    );

    const review = await gatewayOver(fetchImpl).setReviewVisibility('rv-1', {
      hidden: true,
      reason: 'Personal information.',
    });

    expect(sent(fetchImpl)).toBe(`PUT ${BASE}/api/platform/reviews/rv-1/visibility`);
    expect(sentBody(fetchImpl)).toEqual({ hidden: true, reason: 'Personal information.' });
    expect(review).toMatchObject({ hidden: true, hiddenReason: 'Personal information.' });
  });

  it('lists a branch for the venue with its filter and the report counts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(200, {
        items: [{ ...WIRE_REVIEW, reportCount: 3, lastReportedAtUtc: '2026-09-12T10:00:00Z' }],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    );

    const page = await gatewayOver(fetchImpl).listVenueBranchReviews('b-1', { filter: 'reported' });

    expect(sent(fetchImpl)).toBe(
      `GET ${BASE}/api/branches/b-1/reviews?page=1&pageSize=20&filter=reported`,
    );
    expect(page.items[0]).toMatchObject({
      reportCount: 3,
      lastReportedAtUtc: '2026-09-12T10:00:00Z',
    });
  });

  it("reads a venue's refused restore as the platform's takedown, and a refused hide as a plain 403", async () => {
    const restore = await caught(
      gatewayOver(
        vi.fn().mockResolvedValue(
          problem(403, 'forbidden', {
            operation: 'Showing a review the platform hid',
            requiredRole: 5,
          }),
        ),
      ).setVenueReviewVisibility('b-1', 'rv-1', { hidden: false, reason: null }),
    );
    expect(restore).toBeInstanceOf(ReviewHiddenByPlatformError);

    const fetchImpl = vi.fn().mockResolvedValue(problem(403, 'forbidden', { requiredRole: 5 }));
    const hide = await caught(
      gatewayOver(fetchImpl).setVenueReviewVisibility('b-1', 'rv-1', { hidden: true, reason: 'x' }),
    );
    expect(sent(fetchImpl)).toBe(`PUT ${BASE}/api/branches/b-1/reviews/rv-1/visibility`);
    expect(hide).toBeInstanceOf(ForbiddenError);
    expect(hide).not.toBeInstanceOf(ReviewHiddenByPlatformError);
  });

  it('keeps a restore refused for another role a plain 403: the person can no longer act at the branch', async () => {
    for (const context of [{ requiredRole: 2 }, undefined]) {
      const restore = await caught(
        gatewayOver(
          vi.fn().mockResolvedValue(problem(403, 'forbidden', context)),
        ).setVenueReviewVisibility('b-1', 'rv-1', { hidden: false, reason: null }),
      );
      expect(restore).toBeInstanceOf(ForbiddenError);
      expect(restore).not.toBeInstanceOf(ReviewHiddenByPlatformError);
    }
  });
});
