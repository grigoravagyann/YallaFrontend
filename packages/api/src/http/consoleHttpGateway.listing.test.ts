import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { createApiClient } from '../client';
import {
  CoverChangedError,
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
      latitude: 40.18,
      longitude: 44.51,
    });
    expect(listing.gallery[0]?.cardUrl).toBe(`${BASE}/api/photos/p1/card`);
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

describe('the floor plan over HTTP (K6)', () => {
  const wireTable = {
    id: 't1',
    label: '1',
    seats: 2,
    x: 0,
    y: 0,
    width: 80,
    height: 80,
    rotationDegrees: 0,
    shape: 1,
    isBookable: true,
    isActive: true,
    qrToken: 'qr',
    photoX: 0.25,
    photoY: 0.5,
  };
  const plan = {
    branchId: 'b-1',
    floorWidth: 1000,
    floorHeight: 800,
    tables: [wireTable],
    version: 'v7',
  };

  it('reads the pins and the version, and saves with the version and never a pin', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, plan))
      .mockResolvedValueOnce(json(200, { plan: { ...plan, version: 'v8' } }));
    const gateway = gatewayOver(fetchImpl);

    const read = await gateway.getFloorPlan('b-1');
    expect(read.version).toBe('v7');
    expect(read.tables[0]).toMatchObject({ photoX: 0.25, photoY: 0.5 });

    const saved = await gateway.replaceFloorPlan({
      branchId: 'b-1',
      command: {
        floorWidth: 1000,
        floorHeight: 800,
        areas: [],
        tables: [
          read.tables[0]!,
          {
            label: '2',
            seats: 2,
            x: 100,
            y: 0,
            width: 80,
            height: 80,
            rotationDegrees: 0,
            shape: 'round',
            isBookable: true,
          },
        ],
        expectedVersion: read.version,
      },
    });

    const body = sentBody(fetchImpl, 1) as { expectedVersion: string; tables: object[] };
    expect(body.expectedVersion).toBe('v7');
    expect(body.tables.map((table) => 'photoX' in table || 'photoY' in table)).toEqual([
      false,
      false,
    ]);
    expect(body.tables[1]).toMatchObject({ id: null, shape: 2 });
    expect(saved.plan.version).toBe('v8');
  });

  it('reads a stale version as FloorPlanChangedError with the version the server has', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(problem(409, 'floor-plan-changed', { currentVersion: 'v9' }));
    const refusal = await caught(
      gatewayOver(fetchImpl).replaceFloorPlan({
        branchId: 'b-1',
        command: { floorWidth: 1, floorHeight: 1, areas: [], tables: [], expectedVersion: 'v7' },
      }),
    );
    expect(refusal).toBeInstanceOf(FloorPlanChangedError);
    expect((refusal as FloorPlanChangedError).currentVersion).toBe('v9');
  });

  it('keeps FloorPlanInvalidError for the plan refusal and a ValidationError for a malformed request', async () => {
    const command = { floorWidth: 1, floorHeight: 1, areas: [], tables: [], expectedVersion: '' };

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

    const malformed = await caught(
      gatewayOver(
        vi.fn().mockResolvedValue(
          problem(422, 'validation-failed', {
            fields: [{ field: 'expectedVersion', message: 'Required.', bound: 'required' }],
          }),
        ),
      ).replaceFloorPlan({ branchId: 'b-1', command }),
    );
    expect(malformed).toBeInstanceOf(ValidationError);
    expect(malformed).not.toBeInstanceOf(FloorPlanInvalidError);
    expect((malformed as ValidationError).field).toBe('expectedVersion');
  });
});

describe('table photo positions over HTTP (K7)', () => {
  it('puts the changed pins on their own route and reads every table back', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(200, {
        coverPhotoId: 'cover-1',
        tables: [
          { tableId: 't1', label: '1', photoX: 0.4, photoY: 0.6 },
          { tableId: 't2', label: '2' },
        ],
      }),
    );

    const result = await gatewayOver(fetchImpl).saveTablePhotoPositions('b-1', {
      coverPhotoId: 'cover-1',
      positions: [
        { tableId: 't1', photoX: 0.4, photoY: 0.6 },
        { tableId: 't3', photoX: null, photoY: null },
      ],
    });

    expect(sent(fetchImpl)).toBe(`PUT ${BASE}/api/branches/b-1/table-photo-positions`);
    expect(sentBody(fetchImpl)).toEqual({
      coverPhotoId: 'cover-1',
      positions: [
        { tableId: 't1', photoX: 0.4, photoY: 0.6 },
        { tableId: 't3', photoX: null, photoY: null },
      ],
    });
    expect(result).toEqual({
      coverPhotoId: 'cover-1',
      tables: [
        { tableId: 't1', label: '1', photoX: 0.4, photoY: 0.6 },
        { tableId: 't2', label: '2', photoX: null, photoY: null },
      ],
    });
  });

  it('reads a changed cover as CoverChangedError with the cover the branch has now', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(problem(409, 'cover-changed', { currentCoverPhotoId: 'cover-2' }));
    const refusal = await caught(
      gatewayOver(fetchImpl).saveTablePhotoPositions('b-1', {
        coverPhotoId: 'cover-1',
        positions: [],
      }),
    );
    expect(refusal).toBeInstanceOf(CoverChangedError);
    expect((refusal as CoverChangedError).currentCoverPhotoId).toBe('cover-2');
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
      gatewayOver(vi.fn().mockResolvedValue(problem(403, 'forbidden'))).setVenueReviewVisibility(
        'b-1',
        'rv-1',
        { hidden: false, reason: null },
      ),
    );
    expect(restore).toBeInstanceOf(ReviewHiddenByPlatformError);

    const fetchImpl = vi.fn().mockResolvedValue(problem(403, 'forbidden'));
    const hide = await caught(
      gatewayOver(fetchImpl).setVenueReviewVisibility('b-1', 'rv-1', { hidden: true, reason: 'x' }),
    );
    expect(sent(fetchImpl)).toBe(`PUT ${BASE}/api/branches/b-1/reviews/rv-1/visibility`);
    expect(hide).toBeInstanceOf(ForbiddenError);
    expect(hide).not.toBeInstanceOf(ReviewHiddenByPlatformError);
  });
});
