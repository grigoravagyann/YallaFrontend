import type { BranchDetail, BranchListing, BranchMenu, BranchReviewPage } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  distanceFor,
  menuFromApi,
  placeFromDetail,
  placeFromListing,
  reviewPageFromApi,
} from './httpMapping';
import { nextReviewPage, tablePhotoOf } from './model';
import { bookingRulesInput, floorPlanParams } from './navigation';

const LISTING: BranchListing = {
  branchId: 'b1',
  venueId: 'v1',
  venueSlug: 'lumen',
  branchSlug: 'cascade',
  venueName: 'Lumen Coffee',
  branchName: 'Cascade',
  venueType: 'cafe',
  cuisine: null,
  priceLevel: null,
  address: '12 Abovyan Street',
  latitude: null,
  longitude: null,
  distanceKm: null,
  timeZoneId: 'Asia/Yerevan',
  isOpenNow: true,
  freeTableCount: 3,
  rating: null,
  reviewCount: 0,
  badges: ['new'],
  coverPhoto: null,
};

const CONTEXT = { now: new Date('2026-09-14T10:00:00Z'), locale: 'en' as const, position: null };

describe('placeFromListing', () => {
  it('keeps the unknown unknown: no rating, no coordinates, no distance, no photo', () => {
    const place = placeFromListing(LISTING, CONTEXT);

    expect(place.rating).toBeNull();
    expect(place.ratingCount).toBe(0);
    expect(place.coords).toBeNull();
    expect(place.distanceKm).toBeNull();
    expect(place.photos).toEqual([]);
    expect(place.cuisine).toBe('');
    expect(place.openState).toEqual({ isOpen: true, todayLabel: '' });
  });

  it('names the branch beside the venue, so two branches of one venue differ', () => {
    expect(placeFromListing(LISTING, CONTEXT).name).toBe('Lumen Coffee · Cascade');
    expect(placeFromListing({ ...LISTING, branchName: 'lumen coffee' }, CONTEXT).name).toBe(
      'Lumen Coffee',
    );
    expect(placeFromListing({ ...LISTING, branchName: '  ' }, CONTEXT).name).toBe('Lumen Coffee');
  });

  it('carries the slugs and both names from the listing, never the ids in their place', () => {
    const place = placeFromListing(
      {
        ...LISTING,
        branchId: '0b8f6a1e-3c1d-4f7a-9d2e-5a6b7c8d9e0f',
        venueId: 'ffff0000-1111-2222-3333-444455556666',
      },
      CONTEXT,
    );

    expect(place).toMatchObject({
      venueSlug: 'lumen',
      branchSlug: 'cascade',
      venueName: 'Lumen Coffee',
      branchName: 'Cascade',
    });
    // A list card does not know whether the app may book; the place's page does.
    expect(place.acceptsAppBookings).toBeNull();
  });

  it('prefers the server distance, and computes one from the phone when there is none', () => {
    const located = { ...LISTING, latitude: 40.1843, longitude: 44.5129 };
    expect(distanceFor({ ...located, distanceKm: 0.3 }, null)).toBe(0.3);
    expect(distanceFor(located, null)).toBeNull();
    // Republic Square to Abovyan 12: about a kilometre as the crow flies.
    const km = distanceFor(located, { latitude: 40.1777, longitude: 44.5126 });
    expect(km).toBeGreaterThan(0.5);
    expect(km).toBeLessThan(1);
  });
});

describe('the floor plan is opened with slugs', () => {
  const GUID = '0b8f6a1e-3c1d-4f7a-9d2e-5a6b7c8d9e0f';

  it('hands over the slugs, names and zone of the place', () => {
    const place = placeFromListing({ ...LISTING, branchId: GUID, venueId: GUID }, CONTEXT);
    const params = floorPlanParams(place);

    expect(params).toEqual({
      branchId: GUID,
      venueId: GUID,
      venueSlug: 'lumen',
      branchSlug: 'cascade',
      venueName: 'Lumen Coffee',
      branchName: 'Cascade',
      timeZoneId: 'Asia/Yerevan',
    });
    expect(bookingRulesInput(params)).toEqual({ venueSlug: 'lumen', branchSlug: 'cascade' });
  });

  it('refuses to read booking rules with a GUID where a slug belongs', () => {
    expect(bookingRulesInput({ venueSlug: GUID, branchSlug: 'cascade' })).toBeNull();
    expect(bookingRulesInput({ venueSlug: 'lumen', branchSlug: GUID })).toBeNull();
    // The old bug: the venue's id and the branch's slug.
    const place = placeFromListing(LISTING, CONTEXT);
    expect(
      bookingRulesInput({
        ...floorPlanParams(place),
        venueSlug: place.venueId.replace('v1', GUID),
      }),
    ).toBeNull();
  });

  it('asks with nothing when a deep link brought no slugs', () => {
    expect(bookingRulesInput({})).toBeNull();
    expect(bookingRulesInput({ venueSlug: ' ', branchSlug: 'cascade' })).toBeNull();
  });
});

describe('placeFromDetail', () => {
  const detail: BranchDetail = {
    listing: {
      ...LISTING,
      rating: 4.5,
      reviewCount: 2,
      latitude: 40.18,
      longitude: 44.51,
      coverPhoto: {
        photoId: 'p',
        thumbnailUrl: 'https://api/p/t',
        cardUrl: 'https://api/p/c',
        fullUrl: 'https://api/p/f',
        width: null,
        height: null,
      },
    },
    about: null,
    websiteUrl: 'https://lumen.am',
    phoneE164: null,
    amenities: ['wifi'],
    openingHours: [{ day: 1, opensAt: '09:00', closesAt: '23:00', closesNextDay: false }],
    gallery: [],
    tableCount: 1,
    acceptsWebBookings: false,
    acceptsAppBookings: false,
    recentReviews: [
      {
        reviewId: 'r',
        authorName: 'Anahit S.',
        rating: 5,
        text: null,
        createdAtUtc: '2026-09-01T10:00:00Z',
        updatedAtUtc: '2026-09-02T10:00:00Z',
        edited: true,
      },
    ],
    tableMarkers: [
      { tableId: 't', label: '5', seats: 4, isBookable: true, status: 'free', x: 0.25, y: 0.5 },
    ],
    asOfUtc: '2026-09-14T10:00:00Z',
  };

  it('maps hours, reviews, markers and the booking gate the screens read', () => {
    // A Monday in Yerevan, 14:00 local.
    const place = placeFromDetail(detail, CONTEXT);

    expect(place.hours).toEqual([{ day: 1, open: '09:00', close: '23:00' }]);
    expect(place.openState.isOpen).toBe(true);
    expect(place.photos).toEqual(['https://api/p/f']);
    expect(place.website).toBe('https://lumen.am');
    expect(place.phone).toBeUndefined();
    expect(place.acceptsAppBookings).toBe(false);
    expect(place.reviews).toEqual([
      { id: 'r', author: 'Anahit S.', rating: 5, text: '', date: '2026-09-02', edited: true },
    ]);
    expect(place.tables).toEqual([
      { tableId: 't', label: '5', status: 'free', capacityMin: 1, capacityMax: 4, x: 0.25, y: 0.5 },
    ]);
    expect(place).not.toHaveProperty('menu');
  });

  it('draws no markers when there is no cover photo to draw them on', () => {
    const bare = { ...detail, listing: { ...detail.listing, coverPhoto: null } };
    expect(placeFromDetail(bare, CONTEXT).tables).toEqual([]);
  });

  it('never takes a gallery photo for the one the tables are placed on', () => {
    expect(tablePhotoOf(placeFromDetail(detail, CONTEXT))).toBe('https://api/p/f');

    const galleryOnly = {
      ...detail,
      listing: { ...detail.listing, coverPhoto: null },
      gallery: [{ ...detail.listing.coverPhoto!, photoId: 'g', fullUrl: 'https://api/g/f' }],
    };
    const place = placeFromDetail(galleryOnly, CONTEXT);
    expect(place.photos).toEqual(['https://api/g/f']);
    expect(tablePhotoOf(place)).toBeNull();
  });

  describe('a split service: lunch 12:00–15:00, dinner 18:00–23:00 on Mondays', () => {
    const split: BranchDetail = {
      ...detail,
      openingHours: [
        { day: 1, opensAt: '12:00:00', closesAt: '15:00:00', closesNextDay: false },
        { day: 1, opensAt: '18:00:00', closesAt: '23:00:00', closesNextDay: false },
      ],
    };

    it('is open at 19:30, on the dinner block', () => {
      // Monday 19:30 in Yerevan.
      const at = { ...CONTEXT, now: new Date('2026-09-14T15:30:00Z') };
      expect(placeFromDetail(split, at).openState).toMatchObject({
        isOpen: true,
        opensAt: '18:00',
        closesAt: '23:00',
      });
    });

    it('is closed between the two, and says when dinner opens', () => {
      // Monday 16:00 in Yerevan.
      const at = { ...CONTEXT, now: new Date('2026-09-14T12:00:00Z') };
      expect(placeFromDetail(split, at).openState).toMatchObject({
        isOpen: false,
        opensAt: '18:00',
        closesAt: '23:00',
      });
    });
  });
});

describe('menuFromApi', () => {
  it('orders the sections and keeps what a diner reads', () => {
    const menu: BranchMenu = {
      branchId: 'b1',
      fetchedAtUtc: '2026-09-14T10:00:00Z',
      categories: [
        { id: 'c2', name: 'Desserts', displayOrder: 2, items: [] },
        {
          id: 'c1',
          name: 'Coffee',
          displayOrder: 1,
          items: [{ name: 'Flat white', priceDram: 1200, description: '' } as never],
        },
      ],
    };
    expect(menuFromApi(menu)).toEqual([
      { section: 'Coffee', items: [{ name: 'Flat white', price: 1200 }] },
    ]);
    expect(menuFromApi(null)).toEqual([]);
  });
});

describe('review pages', () => {
  const review = (n: number) => ({
    reviewId: `r${n}`,
    authorName: 'Anahit S.',
    rating: 4,
    text: `visit ${n}`,
    createdAtUtc: '2026-09-01T10:00:00Z',
    updatedAtUtc: '2026-09-01T10:00:00Z',
    edited: false,
  });
  const page = (number: number, count: number, total: number): BranchReviewPage => ({
    branchId: 'b1',
    rating: 4,
    reviewCount: total,
    page: number,
    pageSize: 20,
    reviews: Array.from({ length: count }, (_, i) => review((number - 1) * 20 + i)),
  });

  it('asks for the next page only while the last was full and the total says there is more', () => {
    expect(nextReviewPage(reviewPageFromApi(page(1, 20, 25)))).toBe(2);
    expect(nextReviewPage(reviewPageFromApi(page(2, 5, 25)))).toBeUndefined();
    expect(nextReviewPage(reviewPageFromApi(page(1, 20, 20)))).toBeUndefined();
    expect(nextReviewPage(null)).toBeUndefined();
  });
});
