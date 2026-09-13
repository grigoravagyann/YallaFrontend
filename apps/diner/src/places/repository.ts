import { currentLocale } from '@yalla/i18n';
import { usingMockData } from '../data/gateway';
import { mockPlaces, type PlaceSeed } from './mockPlaces';
import {
  openStateFor,
  type Place,
  type PlaceBadge,
  type PlaceType,
  type TablePhotoMarker,
} from './model';

/**
 * Where the browse screens get their places.
 *
 * One interface, two implementations: the in-memory mock the app runs on today,
 * and an HTTP one that will sit on the backend's browse endpoints once they
 * exist. Screens reach either only through `hooks.ts`, never directly, so the
 * swap is a change of data source and not of any component.
 */

export interface PlaceFilter {
  /** Explore's chips: only places carrying this badge. */
  readonly badge?: PlaceBadge;
  /** The map's legend: only places of this type. */
  readonly type?: PlaceType;
}

export interface PlaceRepository {
  /** Every place around the diner, nearest first. */
  listNearby(): Promise<readonly Place[]>;
  /** One place, or `null` when the id is unknown — a 404, not a failure. */
  getById(placeId: string): Promise<Place | null>;
  /** Name, cuisine and address match, case-insensitive, then `filter` narrows. */
  search(query: string, filter?: PlaceFilter): Promise<readonly Place[]>;
  /** Live table markers. Refetched more often than the place itself. */
  tables(placeId: string): Promise<readonly TablePhotoMarker[]>;
}

/** Thrown by the HTTP repository until the backend publishes these endpoints. */
export class PlaceApiNotImplementedError extends Error {
  constructor(operation: string) {
    super(`not implemented: places.${operation}`);
    this.name = 'PlaceApiNotImplementedError';
  }
}

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

export interface MockPlaceRepositoryOptions {
  /** Round-trip delay, so loading skeletons are visible while developing. */
  readonly latencyMs?: number;
  /** The clock `openState` is judged against. Defaults to the real one. */
  readonly now?: () => Date;
  /** The language today's hours are read out in. Defaults to the active locale. */
  readonly locale?: () => ReturnType<typeof currentLocale>;
  readonly seeds?: readonly PlaceSeed[];
}

function wait(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

function matches(place: PlaceSeed, needle: string): boolean {
  if (needle === '') return true;
  const haystack = `${place.name} ${place.cuisine} ${place.address}`.toLowerCase();
  return haystack.includes(needle);
}

function passes(place: PlaceSeed, filter: PlaceFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.badge !== undefined && !place.badges.includes(filter.badge)) return false;
  if (filter.type !== undefined && place.type !== filter.type) return false;
  return true;
}

export function createMockPlaceRepository(
  options: MockPlaceRepositoryOptions = {},
): PlaceRepository {
  const latencyMs = options.latencyMs ?? 350;
  const now = options.now ?? (() => new Date());
  const locale = options.locale ?? currentLocale;
  const seeds = options.seeds ?? mockPlaces;

  const hydrate = (seed: PlaceSeed): Place => ({
    ...seed,
    openState: openStateFor(seed.hours, now(), seed.timeZoneId, locale()),
  });

  const byDistance = (a: PlaceSeed, b: PlaceSeed) => a.distanceKm - b.distanceKm;

  return {
    async listNearby() {
      await wait(latencyMs);
      return [...seeds].sort(byDistance).map(hydrate);
    },
    async getById(placeId) {
      await wait(latencyMs);
      const seed = seeds.find((place) => place.id === placeId);
      return seed ? hydrate(seed) : null;
    },
    async search(query, filter) {
      await wait(latencyMs);
      const needle = query.trim().toLowerCase();
      return seeds
        .filter((place) => matches(place, needle) && passes(place, filter))
        .sort(byDistance)
        .map(hydrate);
    },
    async tables(placeId) {
      await wait(latencyMs);
      return seeds.find((place) => place.id === placeId)?.tables ?? [];
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP — the shape the real one drops into. Every method rejects with
// `PlaceApiNotImplementedError` until the backend has browse endpoints, so a
// screen on real data shows its "not available yet" state rather than hanging.
// ---------------------------------------------------------------------------

export function createHttpPlaceRepository(): PlaceRepository {
  const refuse = (operation: string) => Promise.reject(new PlaceApiNotImplementedError(operation));
  return {
    listNearby: () => refuse('listNearby'),
    getById: () => refuse('getById'),
    search: () => refuse('search'),
    tables: () => refuse('tables'),
  };
}

/** The app's one place source, chosen the same way `gateway` is. */
export const placeRepository: PlaceRepository = usingMockData
  ? createMockPlaceRepository()
  : createHttpPlaceRepository();
