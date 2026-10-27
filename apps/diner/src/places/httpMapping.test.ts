import type { BranchDetail, BranchListing, BranchMenu, BranchReviewPage } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  distanceFor,
  menuFromApi,
  placeFromDetail,
  placeFromListing,
  reviewFromApi,
  reviewPageFromApi,
} from './httpMapping';
import { nextReviewPage } from './model';
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
  district: null,
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
  features: null,
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

  it('keeps a bar a bar, rather than listing it as a restaurant', () => {
    expect(placeFromListing({ ...LISTING, venueType: 'bar' }, CONTEXT).type).toBe('bar');
    expect(placeFromListing({ ...LISTING, venueType: 'restaurant' }, CONTEXT).type).toBe(
      'restaurant',
    );
  });

  it('carries the district the venue set, and none when it is blank or unset', () => {
    expect(placeFromListing({ ...LISTING, district: ' Kentron ' }, CONTEXT).district).toBe(
      'Kentron',
    );
    expect(placeFromListing({ ...LISTING, district: '  ' }, CONTEXT).district).toBeNull();
    expect(placeFromListing(LISTING, CONTEXT).district).toBeNull();
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
    specialDays: [
      { date: '2026-12-31', note: 'Ամանոր', blocks: [{ opensAt: '18:00', closesAt: '03:00' }] },
    ],
    gallery: [],
    tableCount: 1,
    acceptsWebBookings: false,
    acceptsAppBookings: false,
    ratingCounts: [0, 0, 0, 1, 1],
    recentReviews: [
      {
        reviewId: 'r',
        authorName: 'Anahit S.',
        rating: 5,
        text: null,
        createdAtUtc: '2026-09-01T10:00:00Z',
        updatedAtUtc: '2026-09-02T10:00:00Z',
        edited: true,
        reply: null,
      },
    ],
    rooms: [],
    asOfUtc: '2026-09-14T10:00:00Z',
  };

  it('maps hours, reviews and the booking gate the screens read', () => {
    // A Monday in Yerevan, 14:00 local.
    const place = placeFromDetail(detail, CONTEXT);

    expect(place.hours).toEqual([{ day: 1, open: '09:00', close: '23:00' }]);
    expect(place.specialDays).toEqual([
      { date: '2026-12-31', note: 'Ամանոր', blocks: [{ open: '18:00', close: '03:00' }] },
    ]);
    expect(place.openState.isOpen).toBe(true);
    expect(place.photos).toEqual(['https://api/p/f']);
    expect(place.website).toBe('https://lumen.am');
    expect(place.phone).toBeUndefined();
    expect(place.acceptsAppBookings).toBe(false);
    expect(place.reviews).toEqual([
      {
        id: 'r',
        author: 'Anahit S.',
        rating: 5,
        text: '',
        date: '2026-09-02',
        edited: true,
        reply: null,
      },
    ]);
    expect(place.rooms).toEqual([]);
    expect(place).not.toHaveProperty('menu');
    // A server from before takeaway: no button (2026-10-22).
    expect(place.takeaway).toEqual({ enabled: false, prepMinutes: 20 });
  });

  it("carries the place's takeaway: the button and the info card's time", () => {
    const place = placeFromDetail(
      { ...detail, takeaway: { enabled: true, prepMinutes: 25 } },
      CONTEXT,
    );
    expect(place.takeaway).toEqual({ enabled: true, prepMinutes: 25 });
  });

  it('carries every room and every photo, each pin on the photo it stands on', () => {
    const photo = (photoId: string, width: number | null, height: number | null) => ({
      photoId,
      thumbnailUrl: `https://api/${photoId}/t`,
      cardUrl: `https://api/${photoId}/c`,
      fullUrl: `https://api/${photoId}/f`,
      width,
      height,
    });
    const pin = (tableId: string, status: 'free' | 'outOfService', isBookable = true) => ({
      tableId,
      label: tableId,
      seats: 4,
      isBookable,
      status,
      x: 0.25,
      y: 0.75,
    });
    const place = placeFromDetail(
      {
        ...detail,
        rooms: [
          {
            roomId: 'hall',
            name: 'Hall',
            displayOrder: 0,
            photos: [
              { photo: photo('h1', 1600, 1200), tables: [pin('1', 'free')] },
              { photo: photo('h2', null, null), tables: [pin('2', 'outOfService', false)] },
            ],
          },
          {
            roomId: 'terrace',
            name: 'Terrace',
            displayOrder: 1,
            photos: [{ photo: photo('t1', 1200, 1600), tables: [] }],
          },
        ],
      },
      CONTEXT,
    );

    expect(place.rooms.map((room) => [room.roomId, room.name])).toEqual([
      ['hall', 'Hall'],
      ['terrace', 'Terrace'],
    ]);
    expect(place.rooms[0]!.photos[0]).toEqual({
      photoId: 'h1',
      url: 'https://api/h1/f',
      thumbUrl: 'https://api/h1/t',
      width: 1600,
      height: 1200,
      tables: [
        {
          tableId: '1',
          label: '1',
          status: 'free',
          isBookable: true,
          capacityMin: 1,
          capacityMax: 4,
          x: 0.25,
          y: 0.75,
        },
      ],
    });
    expect(place.rooms[0]!.photos[1]).toMatchObject({
      photoId: 'h2',
      width: null,
      height: null,
      tables: [{ tableId: '2', status: 'outOfService', isBookable: false }],
    });
    expect(place.rooms[1]!.photos.map((entry) => entry.photoId)).toEqual(['t1']);
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
      // Monday 16:00 in Yerevan; the server says shut too.
      const at = { ...CONTEXT, now: new Date('2026-09-14T12:00:00Z') };
      const shut = { ...split, listing: { ...split.listing, isOpenNow: false } };
      expect(placeFromDetail(shut, at).openState).toMatchObject({
        isOpen: false,
        opensAt: '18:00',
        closesAt: '23:00',
      });
    });

    it("keeps the server's open-now, which knows what the hours do not", () => {
      // Monday 16:00, between the blocks, but the server says open: the
      // hours only say until or from when, never whether (VC3 wire §1).
      const at = { ...CONTEXT, now: new Date('2026-09-14T12:00:00Z') };
      expect(placeFromDetail(split, at).openState.isOpen).toBe(true);
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
    reply: null,
  });
  const page = (number: number, count: number, total: number): BranchReviewPage => ({
    branchId: 'b1',
    rating: 4,
    reviewCount: total,
    page: number,
    pageSize: 20,
    reviews: Array.from({ length: count }, (_, i) => review((number - 1) * 20 + i)),
    ratingCounts: [0, 0, 0, total, 0],
  });

  it('asks for the next page only while the last was full and the total says there is more', () => {
    expect(nextReviewPage(reviewPageFromApi(page(1, 20, 25), 'Asia/Yerevan'))).toBe(2);
    expect(nextReviewPage(reviewPageFromApi(page(2, 5, 25), 'Asia/Yerevan'))).toBeUndefined();
    expect(nextReviewPage(reviewPageFromApi(page(1, 20, 20), 'Asia/Yerevan'))).toBeUndefined();
    expect(nextReviewPage(null)).toBeUndefined();
  });
});

describe('a review posted after midnight in Yerevan', () => {
  it("carries the branch's date, not the UTC one", () => {
    const posted = {
      reviewId: 'r-late',
      authorName: 'Anahit S.',
      rating: 5,
      text: 'late',
      createdAtUtc: '2026-10-15T21:40:00Z', // 01:40 on the 16th in Yerevan
      updatedAtUtc: '2026-10-15T21:40:00Z',
      edited: false,
      reply: null,
    };
    expect(reviewFromApi(posted, 'Asia/Yerevan').date).toBe('2026-10-16');
  });

  it("dates the venue's reply in the branch's zone too, and keeps who signed it", () => {
    const answered = {
      reviewId: 'r-late',
      authorName: 'Anahit S.',
      rating: 5,
      text: 'late',
      createdAtUtc: '2026-10-15T08:00:00Z',
      updatedAtUtc: '2026-10-15T08:00:00Z',
      edited: false,
      reply: {
        text: 'Thank you!',
        authorName: 'Aram Hakobyan',
        authorRole: 'generalManager' as const,
        createdAtUtc: '2026-10-15T21:40:00Z',
        updatedAtUtc: '2026-10-15T21:40:00Z',
        edited: false,
      },
    };
    expect(reviewFromApi(answered, 'Asia/Yerevan').reply).toEqual({
      text: 'Thank you!',
      authorName: 'Aram Hakobyan',
      authorRole: 'generalManager',
      date: '2026-10-16',
      edited: false,
      // Answered after the review's last change.
      reviewEditedAfter: false,
    });
  });
});
