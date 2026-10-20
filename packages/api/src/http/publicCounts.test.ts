import { describe, expect, it } from 'vitest';
import type { components } from '../generated/schema';
import { branchDetailFromWire, reviewPageFromWire, ratingCountsFromWire } from './placesMapping';
import { publicBranchFromWire } from './publicMapping';

/**
 * Public page phase 5: two counts the page used to work out for itself.
 *
 * - `venueBranchCount` on the branch page: "All N branches" without reading
 *   the whole venue list.
 * - `ratingCounts` on the detail and on every reviews page: the star bars for
 *   any number of reviews, one star first.
 */

type Page = components['schemas']['Yalla.Application.Public.PublicBranchPage'];
type Detail = components['schemas']['Yalla.Application.Public.PublicBranchDetail'];
type ReviewPage = components['schemas']['Yalla.Application.Public.PublicReviewPage'];

const PAGE = {
  venueSlug: 'lumen-coffee',
  branchSlug: 'northern-avenue',
  branchId: 'b-1',
  venueName: 'Lumen Coffee',
  branchName: 'Northern Avenue',
  venueType: 1,
  address: 'Northern Avenue 5',
  timeZoneId: 'Asia/Yerevan',
  openingHours: [],
  specialDays: [],
  isOpenNow: true,
  freeTableCount: 2,
  tableCount: 8,
  floorPlan: { areas: [], tables: [] },
  acceptsWebBookings: true,
  acceptsAppBookings: true,
  bookingWindowDays: 14,
  policy: {
    turnTimeMinutes: 90,
    minLeadMinutes: 30,
    cancellationDeadlineMinutes: 120,
    unverifiedMaxPartySize: 6,
    unverifiedBookingsNeedApproval: true,
  },
  asOfUtc: '2026-10-20T10:00:00Z',
  venueBranchCount: 3,
} as unknown as Page;

describe('the branch count on the branch page', () => {
  it('reads how many branches the venue lists', () => {
    expect(publicBranchFromWire(PAGE).venueBranchCount).toBe(3);
  });

  it('reads at least this branch from a server that does not say', () => {
    const { venueBranchCount: _, ...older } = PAGE;
    expect(publicBranchFromWire(older as Page).venueBranchCount).toBe(1);
  });
});

describe('the star counts', () => {
  it('keeps five numbers, one star first', () => {
    expect(ratingCountsFromWire([1, 0, 2, 5, 9])).toEqual([1, 0, 2, 5, 9]);
  });

  it('reads a missing or malformed list as no reviews per star', () => {
    expect(ratingCountsFromWire(undefined)).toEqual([0, 0, 0, 0, 0]);
    expect(ratingCountsFromWire([3, 4])).toEqual([3, 4, 0, 0, 0]);
    expect(ratingCountsFromWire([1, -2, Number.NaN, 2.5, 7, 9])).toEqual([1, 0, 0, 0, 7]);
  });

  it('reads them on the detail and on a reviews page', () => {
    const detail = branchDetailFromWire(
      {
        listing: {
          branchId: 'b-1',
          venueId: 'v-1',
          venueSlug: 'lumen-coffee',
          branchSlug: 'northern-avenue',
          venueName: 'Lumen Coffee',
          branchName: 'Northern Avenue',
          venueType: 1,
          address: 'Northern Avenue 5',
          timeZoneId: 'Asia/Yerevan',
          isOpenNow: true,
          freeTableCount: 2,
          reviewCount: 6,
          rating: 4.2,
          badges: [],
        },
        ratingCounts: [0, 1, 0, 2, 3],
        asOfUtc: '2026-10-20T10:00:00Z',
      } as unknown as Detail,
      'https://api.test.yalla.am',
    );
    expect(detail.ratingCounts).toEqual([0, 1, 0, 2, 3]);

    const page = reviewPageFromWire({
      branchId: 'b-1',
      rating: 4.2,
      reviewCount: 6,
      page: 2,
      pageSize: 20,
      reviews: [],
      ratingCounts: [0, 1, 0, 2, 3],
    } as unknown as ReviewPage);
    expect(page.ratingCounts).toEqual([0, 1, 0, 2, 3]);
  });
});
