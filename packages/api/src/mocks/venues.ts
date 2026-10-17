/**
 * Mock venue data for the diner browse flow.
 *
 * Typed against the shapes the real API will return, so swapping mock for real
 * is a change of data source only — not a change to any component.
 *
 * A branch's tables are pins on its rooms' photos, as the server models them
 * — see `roomFloors.ts`.
 */
import type { DerivedTableState, FloorPlanData } from '../contracts/tableFloor';
import { restaurantRoomFloor, roomFloor, type MockRoom, type MockTableSeed } from './roomFloors';

import type { VenueType } from '../contracts/booking';

export type { VenueType };

export interface Branch {
  readonly id: string;
  readonly venueId: string;
  readonly name: string;
  /** Straight-line distance from the diner. Mocked here; no location permission yet. */
  readonly distanceKm: number;
  /** IANA zone. Every time rendered for this branch must use it, never the device's. */
  readonly timeZoneId: string;
  /** ISO-8601 UTC instants for today's service. */
  readonly opensAtUtc: string;
  readonly closesAtUtc: string;
  readonly totalTables: number;
  readonly freeTables: number;
  readonly floor: FloorPlanData;
  /** Its rooms with their photos; `floor`'s tables are pinned on them. */
  readonly rooms: readonly MockRoom[];
}

export interface Venue {
  readonly id: string;
  readonly name: string;
  readonly type: VenueType;
  readonly branches: readonly Branch[];
}

const YEREVAN = 'Asia/Yerevan';

/** Yerevan is UTC+4, so a 09:00–01:00 local day is 05:00Z to 21:00Z. */
const OPENS = '2026-09-04T05:00:00Z';
const CLOSES_01 = '2026-09-04T21:00:00Z'; // 01:00 next day, local
const CLOSES_23 = '2026-09-04T19:00:00Z'; // 23:00 local
const CLOSES_22 = '2026-09-04T18:00:00Z'; // 22:00 local

/**
 * Build a plausible branch: its tables dealt across the named rooms, each room
 * with two photos the tables are pinned on, the first `freeCount` tables free
 * and the rest spread across the other derived states.
 */
function buildFloor(
  branchId: string,
  tableCount: number,
  freeCount: number,
  areas: readonly string[],
): { floor: FloorPlanData; rooms: readonly MockRoom[] } {
  const columns = Math.ceil(Math.sqrt(tableCount));
  const tables: MockTableSeed[] = Array.from({ length: tableCount }, (_, i) => {
    const row = Math.floor(i / columns);
    const isFree = i < freeCount;
    const busyStates: readonly DerivedTableState[] = [
      'occupied',
      'reservedSoon',
      'occupied',
      'held',
      'occupied',
      'outOfService',
    ];
    const state: DerivedTableState = isFree
      ? 'free'
      : (busyStates[(i - freeCount) % busyStates.length] ?? 'occupied');

    // A large table must exist or the pending-approval path (party above the
    // branch's instant-confirmation limit) is unreachable in the mock.
    const seats = i % 7 === 0 && i > 0 ? 8 : i % 5 === 0 ? 4 : i % 11 === 0 ? 6 : 2;

    return {
      id: `${branchId}-t${i + 1}`,
      label: String(i + 1),
      seats,
      room: areas[row % areas.length] ?? 'Hall',
      isBookable: state !== 'outOfService',
      state,
      nextReservationStartUtc: state === 'reservedSoon' ? '2026-09-04T16:00:00Z' : null,
      ...(state === 'occupied' ? { occupiedSinceUtc: '2026-09-04T13:40:00Z' } : {}),
    };
  });

  const built = roomFloor({
    branchId,
    rooms: areas.map((name) => ({ name, photos: 2 })),
    tables,
  });
  return { floor: built.plan, rooms: built.rooms };
}

function branch(
  venueId: string,
  id: string,
  name: string,
  distanceKm: number,
  totalTables: number,
  freeTables: number,
  closesAtUtc: string,
  areas: readonly string[],
): Branch {
  return {
    id,
    venueId,
    name,
    distanceKm,
    timeZoneId: YEREVAN,
    opensAtUtc: OPENS,
    closesAtUtc,
    totalTables,
    freeTables,
    ...buildFloor(id, totalTables, freeTables, areas),
  };
}

/** Thirty tables across three rooms, several photos each. */
const ARARAT = restaurantRoomFloor('b-ararat-opera');

export const mockVenues: readonly Venue[] = [
  // A chain: three branches with genuinely different availability. This venue is
  // why the branch screen exists at all — "Lumen has 14 free" is useless if they
  // are all at the branch across town.
  {
    id: 'v-lumen',
    name: 'Lumen Coffee',
    type: 'cafe',
    branches: [
      branch('v-lumen', 'b-lumen-north', 'Northern Avenue', 0.4, 22, 8, CLOSES_01, [
        'Windows',
        'Bar',
      ]),
      branch('v-lumen', 'b-lumen-cascade', 'Cascade', 1.2, 18, 5, CLOSES_23, ['Terrace', 'Hall']),
      branch('v-lumen', 'b-lumen-saryan', 'Saryan Street', 2.1, 14, 1, CLOSES_23, ['Hall']),
    ],
  },

  // Two branches, one of them completely full.
  {
    id: 'v-dolmama',
    name: 'Dolmama',
    type: 'restaurant',
    branches: [
      branch('v-dolmama', 'b-dolmama-pushkin', 'Pushkin Street', 0.9, 16, 3, CLOSES_23, [
        'Hall',
        'Courtyard',
      ]),
      branch('v-dolmama', 'b-dolmama-dalma', 'Dalma Garden', 4.6, 24, 0, CLOSES_22, ['Hall']),
    ],
  },

  // Single branch, nothing free — exercises the "fully booked" card. Deliberately
  // still listed: hiding busy venues makes the app look empty, showing them makes
  // it look used.
  {
    id: 'v-tumanyan',
    name: 'Tumanyan Shawarma',
    type: 'restaurant',
    branches: [
      branch('v-tumanyan', 'b-tumanyan-main', 'Tumanyan Street', 0.6, 12, 0, CLOSES_01, ['Hall']),
    ],
  },

  // Thirty tables across three rooms, several photos a room.
  // The floor's own free count is what the public page shows, so it is derived
  // from the fixture rather than asserted here.
  {
    id: 'v-ararat',
    name: 'Ararat Terrace',
    type: 'restaurant',
    branches: [
      {
        id: 'b-ararat-opera',
        venueId: 'v-ararat',
        name: 'Opera',
        distanceKm: 1.1,
        timeZoneId: YEREVAN,
        opensAtUtc: OPENS,
        closesAtUtc: CLOSES_01,
        totalTables: ARARAT.plan.tables.length,
        freeTables: ARARAT.plan.tables.filter((t) => t.state === 'free').length,
        floor: ARARAT.plan,
        rooms: ARARAT.rooms,
      },
    ],
  },

  // Single branch, lots of space.
  {
    id: 'v-greenbean',
    name: 'Green Bean',
    type: 'cafe',
    branches: [
      branch('v-greenbean', 'b-greenbean-main', 'Mashtots Avenue', 1.7, 20, 15, CLOSES_22, [
        'Windows',
        'Hall',
      ]),
    ],
  },

  // Two bars, so the Bars filter has something to find and something to
  // choose between: one late and busy, one quieter across town.
  {
    id: 'v-copperfox',
    name: 'Copper Fox',
    type: 'bar',
    branches: [
      branch('v-copperfox', 'b-copperfox-saryan', 'Saryan Street', 0.8, 14, 6, CLOSES_01, [
        'Bar',
        'Lounge',
      ]),
    ],
  },
  {
    id: 'v-vinoteka',
    name: 'Vinoteka',
    type: 'bar',
    branches: [
      branch('v-vinoteka', 'b-vinoteka-komitas', 'Komitas Avenue', 2.4, 10, 7, CLOSES_01, [
        'Cellar',
      ]),
    ],
  },
];

// ---------------------------------------------------------------------------
// Derived helpers. Pure, so screens stay free of arithmetic.
// ---------------------------------------------------------------------------

/** Free tables across every branch — the one number a hungry person wants. */
export function venueFreeTables(venue: Venue): number {
  return venue.branches.reduce((total, b) => total + b.freeTables, 0);
}

export function venueTotalTables(venue: Venue): number {
  return venue.branches.reduce((total, b) => total + b.totalTables, 0);
}

export function isFullyBooked(venue: Venue): boolean {
  return venueFreeTables(venue) === 0;
}

/** Nearest branch, used for the venue-level distance hint. */
export function nearestBranch(venue: Venue): Branch | null {
  return [...venue.branches].sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? null;
}

export function findVenue(venueId: string): Venue | null {
  return mockVenues.find((v) => v.id === venueId) ?? null;
}

export function findBranch(branchId: string): { venue: Venue; branch: Branch } | null {
  for (const venue of mockVenues) {
    const found = venue.branches.find((b) => b.id === branchId);
    if (found) return { venue, branch: found };
  }
  return null;
}

/** Whether the branch is currently serving, judged against an explicit instant. */
export function isOpenNow(branch: Branch, now: Date): boolean {
  const opens = new Date(branch.opensAtUtc).getTime();
  const closes = new Date(branch.closesAtUtc).getTime();
  const t = now.getTime();
  return t >= opens && t <= closes;
}

export function isVenueOpenNow(venue: Venue, now: Date): boolean {
  return venue.branches.some((b) => isOpenNow(b, now));
}

/** Frozen clock so the mock data reads consistently. Replaced by real time later. */
export const MOCK_NOW = new Date('2026-09-04T14:30:00Z'); // 18:30 in Yerevan
