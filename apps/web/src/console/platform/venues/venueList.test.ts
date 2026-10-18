import type { ConsoleVenue } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  filterVenues,
  isFiltered,
  nextSort,
  sortVenues,
  type VenueListFilters,
} from './venueList';

/** The venues list's narrowing and ordering, apart from the screen. */

function venue(name: string, extra: Partial<ConsoleVenue> = {}): ConsoleVenue {
  return {
    id: name.toLowerCase(),
    name,
    slug: name.toLowerCase().replace(/\s+/gu, '-'),
    type: 'cafe',
    status: 'active',
    branchCount: 1,
    tableCount: 10,
    subscriptionTier: 'free',
    paidBranchCount: 0,
    createdAtUtc: null,
    suspendedAtUtc: null,
    ...extra,
  };
}

const VENUES = [
  venue('Alpha', { rating: 4.1, tableCount: 5 }),
  venue('Bravo', { rating: null, tableCount: 30, status: 'suspended' }),
  venue('Charlie', { rating: 4.9, tableCount: 12, status: 'deleted' }),
  venue('Delta', { branchCount: 2, paidBranchCount: 1, district: 'Arabkir' }),
];

const names = (list: readonly ConsoleVenue[]) => list.map((v) => v.name);
const filters = (change: Partial<VenueListFilters>) => ({ ...DEFAULT_FILTERS, ...change });

describe('filtering the venues list', () => {
  it('hides the deleted ones by default and shows only them under Deleted', () => {
    expect(names(filterVenues(VENUES, DEFAULT_FILTERS, 'en'))).toEqual(['Alpha', 'Bravo', 'Delta']);
    expect(names(filterVenues(VENUES, filters({ status: 'deleted' }), 'en'))).toEqual(['Charlie']);
    expect(filterVenues(VENUES, filters({ status: 'all' }), 'en')).toHaveLength(4);
  });

  it('filters by the tier summary', () => {
    expect(names(filterVenues(VENUES, filters({ tier: 'mixed' }), 'en'))).toEqual(['Delta']);
    expect(names(filterVenues(VENUES, filters({ tier: 'paid' }), 'en'))).toEqual([]);
  });

  it('searches the district too, ignoring case', () => {
    expect(names(filterVenues(VENUES, filters({ query: 'ARAB' }), 'en'))).toEqual(['Delta']);
  });

  it('knows when anything narrows the list', () => {
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
    expect(isFiltered(filters({ query: '  ' }))).toBe(false);
    expect(isFiltered(filters({ tier: 'free' }))).toBe(true);
  });
});

describe('sorting the venues list', () => {
  it('puts a venue with no rating after every rated one, whichever way', () => {
    expect(names(sortVenues(VENUES, 'rating', -1, 'en'))).toEqual([
      'Charlie',
      'Alpha',
      'Bravo',
      'Delta',
    ]);
    expect(names(sortVenues(VENUES, 'rating', 1, 'en'))).toEqual([
      'Alpha',
      'Charlie',
      'Bravo',
      'Delta',
    ]);
  });

  it('sorts tables by number and names alphabetically', () => {
    expect(names(sortVenues(VENUES, 'tables', -1, 'en'))[0]).toBe('Bravo');
    expect(names(sortVenues(VENUES, 'name', -1, 'en'))[0]).toBe('Delta');
  });

  it('turns the same column round, and starts a number column at the top', () => {
    expect(nextSort({ key: 'name', direction: 1 }, 'name')).toEqual({ key: 'name', direction: -1 });
    expect(nextSort({ key: 'name', direction: 1 }, 'rating')).toEqual({
      key: 'rating',
      direction: -1,
    });
  });
});
