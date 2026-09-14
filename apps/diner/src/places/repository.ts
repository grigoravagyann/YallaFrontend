import type { YallaGateway } from '@yalla/api';
import { currentLocale } from '@yalla/i18n';
import { gateway, usingMockData } from '../data/gateway';
import { readDevicePosition } from './devicePosition';
import {
  coverUrl,
  markerFromApi,
  placeFromDetail,
  placeFromListing,
  type PlaceMappingContext,
} from './httpMapping';
import { mockPlaces, type PlaceSeed } from './mockPlaces';
import {
  openStateFor,
  tablePhotoOf,
  type Coordinates,
  type Place,
  type PlaceBadge,
  type PlaceTables,
  type PlaceType,
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
  /**
   * Live table markers, with the photo they sit on. Refetched more often than
   * the place itself, so the screen draws them on this photo rather than on a
   * cover the place's older read may still hold.
   */
  tables(placeId: string): Promise<PlaceTables>;
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

  const byDistance = (a: PlaceSeed, b: PlaceSeed) =>
    (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);

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
      const seed = seeds.find((place) => place.id === placeId);
      return { photo: seed ? tablePhotoOf(seed) : null, tables: seed?.tables ?? [] };
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP — the backend's `/api/public/branches` routes, through the gateway.
// ---------------------------------------------------------------------------

export interface HttpPlaceRepositoryOptions {
  readonly gateway?: Pick<
    YallaGateway,
    | 'listBranches'
    | 'searchBranches'
    | 'getBranchDetail'
    | 'getBranchTableMarkers'
    | 'getBranchMenuDetail'
  >;
  /** The phone's position, or null when it is unknown. Never prompts. */
  readonly position?: () => Promise<Coordinates | null>;
  readonly now?: () => Date;
  readonly locale?: () => ReturnType<typeof currentLocale>;
}

export function createHttpPlaceRepository(
  options: HttpPlaceRepositoryOptions = {},
): PlaceRepository {
  const source = options.gateway ?? gateway;
  const position = options.position ?? (() => Promise.resolve(null));
  const now = options.now ?? (() => new Date());
  const locale = options.locale ?? currentLocale;

  async function context(): Promise<PlaceMappingContext> {
    return { now: now(), locale: locale(), position: await position() };
  }

  /** The server sorts nearest first when it has a position; unknown distances go last. */
  const nearestFirst = (a: Place, b: Place) =>
    (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);

  return {
    async listNearby() {
      const ctx = await context();
      const listings = await source.listBranches(ctx.position ? { position: ctx.position } : {});
      const places = listings.map((listing) => placeFromListing(listing, ctx));
      return ctx.position ? places.sort(nearestFirst) : places;
    },

    async search(query, filter) {
      const ctx = await context();
      const listings = await source.searchBranches({
        query,
        ...(filter?.type ? { venueType: filter.type } : {}),
        ...(ctx.position ? { position: ctx.position } : {}),
      });
      // The route has no badge filter; badges are on every card, so narrow here.
      return listings
        .filter((listing) => !filter?.badge || listing.badges.includes(filter.badge))
        .map((listing) => placeFromListing(listing, ctx));
    },

    async getById(placeId) {
      const ctx = await context();
      const [detail, menu] = await Promise.all([
        source.getBranchDetail(placeId, ctx.position ?? undefined),
        // The menu is a tab on the page, not the page: a failed menu read
        // leaves the tab empty rather than taking the whole place down.
        source.getBranchMenuDetail(placeId).catch(() => null),
      ]);
      return detail ? placeFromDetail(detail, menu, ctx) : null;
    },

    async tables(placeId) {
      const markers = await source.getBranchTableMarkers(placeId);
      const photo = coverUrl(markers?.photo);
      // No cover photo means nothing to draw the markers on.
      return { photo, tables: photo && markers ? markers.tables.map(markerFromApi) : [] };
    },
  };
}

/** The app's one place source, chosen the same way `gateway` is. */
export const placeRepository: PlaceRepository = usingMockData
  ? createMockPlaceRepository()
  : createHttpPlaceRepository({ position: readDevicePosition });
