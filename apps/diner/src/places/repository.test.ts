import type {
  BranchDetail,
  BranchListing,
  BranchReviewPage,
  BranchTableMarkers,
  YallaGateway,
} from '@yalla/api';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as RepositoryModule from './repository';

/**
 * The HTTP place repository against a fake gateway.
 *
 * Every assertion is about which gateway call was made and what came back, so
 * swapping the mock repository in fails the suite: the mock makes no calls.
 */

// The app's data source is chosen when `data/gateway` is imported; these stand
// in for the phone-only modules that import pulls in.
vi.mock('expo-constants', () => ({ default: { expoConfig: null, expoGoConfig: null } }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(() => Promise.resolve(null)),
  setItemAsync: vi.fn(() => Promise.resolve()),
  deleteItemAsync: vi.fn(() => Promise.resolve()),
}));
vi.mock('./devicePosition', () => ({ readDevicePosition: vi.fn(() => Promise.resolve(null)) }));

type Repository = typeof RepositoryModule;
let repository: Repository;

beforeAll(async () => {
  vi.stubEnv('EXPO_PUBLIC_DATA_SOURCE', 'real');
  vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://localhost:5086');
  repository = await import('./repository');
});

afterEach(() => {
  vi.clearAllMocks();
});

const LISTING: BranchListing = {
  branchId: 'b1',
  venueId: 'v1',
  venueSlug: 'lumen',
  branchSlug: 'cascade',
  venueName: 'Lumen Coffee',
  branchName: 'Cascade',
  venueType: 'cafe',
  cuisine: 'Coffee',
  priceLevel: null,
  address: '12 Abovyan Street',
  latitude: 40.18,
  longitude: 44.51,
  distanceKm: null,
  timeZoneId: 'Asia/Yerevan',
  isOpenNow: true,
  freeTableCount: 3,
  rating: 4.5,
  reviewCount: 2,
  badges: ['popular'],
  coverPhoto: null,
};

const DETAIL: BranchDetail = {
  listing: LISTING,
  about: 'A bright café.',
  websiteUrl: null,
  phoneE164: null,
  amenities: [],
  openingHours: [],
  gallery: [],
  tableCount: 2,
  acceptsWebBookings: true,
  acceptsAppBookings: true,
  recentReviews: [],
  tableMarkers: [],
  asOfUtc: '2026-09-14T10:00:00Z',
};

function fakeGateway(overrides: Partial<YallaGateway> = {}) {
  return {
    listBranches: vi.fn(() => Promise.resolve([LISTING])),
    searchBranches: vi.fn(() =>
      Promise.resolve([
        { ...LISTING, branchId: 'popular', badges: ['popular'] },
        { ...LISTING, branchId: 'new', badges: ['new'] },
        { ...LISTING, branchId: 'both', badges: ['new', 'popular'] },
      ] as BranchListing[]),
    ),
    getBranchDetail: vi.fn(() => Promise.resolve(DETAIL)),
    getBranchTableMarkers: vi.fn(() => Promise.resolve(null)),
    getBranchMenuDetail: vi.fn(() => Promise.resolve(null)),
    getBranchReviews: vi.fn(() => Promise.resolve(null)),
    ...overrides,
  } as unknown as Pick<
    YallaGateway,
    | 'listBranches'
    | 'searchBranches'
    | 'getBranchDetail'
    | 'getBranchTableMarkers'
    | 'getBranchMenuDetail'
    | 'getBranchReviews'
  > &
    Record<string, ReturnType<typeof vi.fn>>;
}

const clock = { now: () => new Date('2026-09-14T10:00:00Z'), locale: () => 'en' as const };

describe('createHttpPlaceRepository', () => {
  it('narrows a search by badge on the client, since the route has no badge filter', async () => {
    const gateway = fakeGateway();
    const places = repository.createHttpPlaceRepository({ gateway, ...clock });

    const found = await places.search('lumen', { badge: 'popular', type: 'cafe' });

    expect(found.map((place) => place.id)).toEqual(['popular', 'both']);
    expect(gateway.searchBranches).toHaveBeenCalledWith({ query: 'lumen', venueType: 'cafe' });
  });

  it('reads a place without its menu, and surfaces a failed menu instead of an empty one', async () => {
    const failure = new Error('menu is down');
    const gateway = fakeGateway({ getBranchMenuDetail: vi.fn(() => Promise.reject(failure)) });
    const places = repository.createHttpPlaceRepository({ gateway, ...clock });

    const place = await places.getById('b1');
    expect(place?.id).toBe('b1');
    expect(place?.about).toBe('A bright café.');
    expect(gateway.getBranchMenuDetail).not.toHaveBeenCalled();

    await expect(places.menu('b1')).rejects.toBe(failure);
  });

  it('answers null for an unknown place, and an empty menu for one with nothing published', async () => {
    const gateway = fakeGateway({ getBranchDetail: vi.fn(() => Promise.resolve(null)) });
    const places = repository.createHttpPlaceRepository({ gateway, ...clock });

    expect(await places.getById('gone')).toBeNull();
    expect(await places.menu('b1')).toEqual([]);
  });

  it('draws no tables when the branch has no cover photo to place them on', async () => {
    const markers = {
      branchId: 'b1',
      photo: null,
      asOfUtc: '2026-09-14T10:00:00Z',
      tables: [
        { tableId: 't', label: '5', seats: 4, isBookable: true, status: 'free', x: 0.2, y: 0.4 },
      ],
    } as unknown as BranchTableMarkers;
    const gateway = fakeGateway({ getBranchTableMarkers: vi.fn(() => Promise.resolve(markers)) });
    const places = repository.createHttpPlaceRepository({ gateway, ...clock });

    expect(await places.tables('b1')).toEqual({ photo: null, tables: [] });
    expect(gateway.getBranchTableMarkers).toHaveBeenCalledWith('b1');
  });

  it('pages reviews through the reviews route', async () => {
    const page: BranchReviewPage = {
      branchId: 'b1',
      rating: 4,
      reviewCount: 21,
      page: 2,
      pageSize: 20,
      reviews: [
        {
          reviewId: 'r21',
          authorName: 'Anahit S.',
          rating: 4,
          text: null,
          createdAtUtc: '2026-09-01T10:00:00Z',
          updatedAtUtc: '2026-09-01T10:00:00Z',
          edited: false,
        },
      ],
    };
    const gateway = fakeGateway({ getBranchReviews: vi.fn(() => Promise.resolve(page)) });
    const places = repository.createHttpPlaceRepository({ gateway, ...clock });

    const answer = await places.reviewPage('b1', 2);

    expect(gateway.getBranchReviews).toHaveBeenCalledWith({ branchId: 'b1', page: 2 });
    expect(answer).toMatchObject({ total: 21, page: 2, pageSize: 20 });
    expect(answer?.reviews.map((review) => review.id)).toEqual(['r21']);
  });
});

describe('which place repository the app runs on', () => {
  it('is the HTTP one when EXPO_PUBLIC_DATA_SOURCE=real', () => {
    expect(repository.placeRepositorySource).toBe('http');
  });

  it('is the mock only when asked for', async () => {
    vi.resetModules();
    vi.stubEnv('EXPO_PUBLIC_DATA_SOURCE', 'mock');
    const mocked = await import('./repository');
    expect(mocked.placeRepositorySource).toBe('mock');
    vi.stubEnv('EXPO_PUBLIC_DATA_SOURCE', 'real');
  });
});
