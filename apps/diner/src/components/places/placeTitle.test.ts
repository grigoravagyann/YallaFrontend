import type { BranchListing } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { placeFromListing } from '../../places/httpMapping';
import { placeTitle } from './placeTitle';

describe('placeTitle', () => {
  it('puts the venue and the branch on separate lines, and both in the label', () => {
    expect(
      placeTitle({
        name: 'Lavash Restaurant · Northern Avenue',
        venueName: 'Lavash Restaurant',
        branchName: 'Northern Avenue',
      }),
    ).toEqual({
      venue: 'Lavash Restaurant',
      branch: 'Northern Avenue',
      label: 'Lavash Restaurant · Northern Avenue',
    });
  });

  it('adds no branch line when the branch is blank or named like the venue', () => {
    expect(placeTitle({ name: 'Dolmama', venueName: 'Dolmama', branchName: '  ' })).toEqual({
      venue: 'Dolmama',
      branch: null,
      label: 'Dolmama',
    });
    expect(
      placeTitle({ name: 'Dolmama', venueName: 'Dolmama', branchName: 'dolmama' }).branch,
    ).toBe(null);
  });

  it('falls back to the display name when the venue name is missing', () => {
    expect(placeTitle({ name: 'Green Bean', venueName: '', branchName: 'Mashtots' })).toEqual({
      venue: 'Green Bean',
      branch: 'Mashtots',
      label: 'Green Bean · Mashtots',
    });
  });

  it('splits a place mapped from the API listing', () => {
    const listing: BranchListing = {
      branchId: 'b1',
      venueId: 'v1',
      venueSlug: 'lavash',
      branchSlug: 'northern-avenue',
      venueName: 'Lavash Restaurant',
      branchName: 'Northern Avenue',
      venueType: 'restaurant',
      cuisine: null,
      priceLevel: null,
      address: '1 Northern Avenue, Yerevan',
      latitude: null,
      longitude: null,
      distanceKm: null,
      timeZoneId: 'Asia/Yerevan',
      isOpenNow: true,
      freeTableCount: 2,
      rating: null,
      reviewCount: 0,
      badges: [],
      coverPhoto: null,
    };
    const place = placeFromListing(listing, {
      now: new Date('2026-09-14T10:00:00Z'),
      locale: 'en',
      position: null,
    });
    const title = placeTitle(place);
    expect(title.venue).toBe('Lavash Restaurant');
    expect(title.branch).toBe('Northern Avenue');
    expect(title.label).toBe(place.name);
  });
});
