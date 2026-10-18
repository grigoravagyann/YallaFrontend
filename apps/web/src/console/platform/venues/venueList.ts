import { venueTierSummary, type ConsoleVenue } from '@yalla/api';

/**
 * The venues list's filters and sort, as pure functions (Venues artboard's
 * `renderVals`): the list reads the whole platform once and narrows it here,
 * so typing in the search box never waits on the network.
 */

/**
 * `live` — active and suspended — is the default: a deleted venue is hidden
 * until somebody asks for it (HANDOFF section 3), and counted in the header
 * so it is never mistaken for gone.
 */
export type StatusFilter = 'live' | 'active' | 'suspended' | 'deleted' | 'all';
export const STATUS_FILTERS: readonly StatusFilter[] = [
  'live',
  'active',
  'suspended',
  'deleted',
  'all',
];

/** By the tier summary: every branch paid, none, or some. */
export type TierFilter = 'all' | 'paid' | 'free' | 'mixed';
export const TIER_FILTERS: readonly TierFilter[] = ['all', 'paid', 'free', 'mixed'];

export type SortKey = 'name' | 'rating' | 'tables';
/** 1 ascending, -1 descending. */
export type SortDirection = 1 | -1;

export interface VenueListFilters {
  readonly query: string;
  readonly status: StatusFilter;
  readonly tier: TierFilter;
}

export const DEFAULT_FILTERS: VenueListFilters = { query: '', status: 'live', tier: 'all' };

export function isFiltered(filters: VenueListFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.status !== DEFAULT_FILTERS.status ||
    filters.tier !== DEFAULT_FILTERS.tier
  );
}

function statusMatches(venue: ConsoleVenue, status: StatusFilter): boolean {
  switch (status) {
    case 'all':
      return true;
    case 'live':
      return venue.status !== 'deleted';
    default:
      return venue.status === status;
  }
}

function tierMatches(venue: ConsoleVenue, tier: TierFilter): boolean {
  return tier === 'all' || venueTierSummary(venue).kind === tier;
}

/** The name, the web address and the district, which is what a person remembers a venue by. */
function haystack(venue: ConsoleVenue, locale: string): string {
  return [venue.name, venue.slug, venue.district ?? '', venue.cuisine ?? '']
    .join(' ')
    .toLocaleLowerCase(locale);
}

export function filterVenues(
  venues: readonly ConsoleVenue[],
  filters: VenueListFilters,
  locale: string,
): ConsoleVenue[] {
  const needle = filters.query.trim().toLocaleLowerCase(locale);
  return venues.filter(
    (venue) =>
      statusMatches(venue, filters.status) &&
      tierMatches(venue, filters.tier) &&
      (!needle || haystack(venue, locale).includes(needle)),
  );
}

/**
 * Name A–Z first; a number column starts with the largest. A venue with no
 * rating yet goes after every rated one whichever way the column is turned —
 * "no reviews" is not a score of nought, and sorting it as one would put a new
 * venue at the top of "worst rated".
 */
export function sortVenues(
  venues: readonly ConsoleVenue[],
  key: SortKey,
  direction: SortDirection,
  locale: string,
): ConsoleVenue[] {
  const byName = (a: ConsoleVenue, b: ConsoleVenue) => a.name.localeCompare(b.name, locale);
  return [...venues].sort((a, b) => {
    if (key === 'name') return byName(a, b) * direction;
    const av = key === 'rating' ? a.rating : a.tableCount;
    const bv = key === 'rating' ? b.rating : b.tableCount;
    const aMissing = av === null || av === undefined;
    const bMissing = bv === null || bv === undefined;
    if (aMissing || bMissing) return aMissing === bMissing ? byName(a, b) : aMissing ? 1 : -1;
    return (av - bv) * direction || byName(a, b);
  });
}

/** Clicking a column: the same one turns it round; a new one starts where it reads best. */
export function nextSort(
  current: { readonly key: SortKey; readonly direction: SortDirection },
  key: SortKey,
): { key: SortKey; direction: SortDirection } {
  if (current.key === key) return { key, direction: current.direction === 1 ? -1 : 1 };
  return { key, direction: key === 'name' ? 1 : -1 };
}

/** Lower-case Latin letters and digits in hyphen-separated runs: the server's slug rule. */
export const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
