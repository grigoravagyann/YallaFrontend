/**
 * Mock venue data for the diner browse flow.
 *
 * Typed against the shapes the real API will return, so swapping mock for real
 * is a change of data source only — not a change to any component.
 *
 * The floor plan types come from `@yalla/floorplan/types` — the JSX-free data
 * contract, deliberately not the package barrel, which would pull a React
 * renderer into this package's compile. The import is also type-only and so is
 * fully erased at build time (`verbatimModuleSyntax`): no runtime dependency,
 * just a guarantee the mock cannot drift from what the renderer accepts.
 */
import type { DerivedTableState, FloorPlanData, FloorTable } from '@yalla/floorplan/types';

export type VenueType = 'cafe' | 'restaurant';

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
 * Build a plausible room: tables on a loose grid, with the first `freeCount`
 * free and the rest spread across the other derived states.
 */
function buildFloor(
  branchId: string,
  tableCount: number,
  freeCount: number,
  areas: readonly string[],
): FloorPlanData {
  const columns = Math.ceil(Math.sqrt(tableCount));
  const tables: FloorTable[] = Array.from({ length: tableCount }, (_, i) => {
    const col = i % columns;
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
    const round = i % 3 === 0;

    return {
      id: `${branchId}-t${i + 1}`,
      label: String(i + 1),
      seats,
      x: 70 + col * 130,
      y: 70 + row * 120,
      width: seats >= 6 ? 150 : seats === 4 ? 110 : 80,
      height: seats >= 6 ? 90 : 80,
      rotationDegrees: 0,
      shape: round ? 'round' : 'rectangle',
      floorAreaName: areas[row % areas.length] ?? null,
      isBookable: state !== 'outOfService',
      state,
      nextReservationStartUtc: state === 'reservedSoon' ? '2026-09-04T16:00:00Z' : null,
      ...(state === 'occupied' ? { occupiedSinceUtc: '2026-09-04T13:40:00Z' } : {}),
    };
  });

  const rows = Math.ceil(tableCount / columns);
  return {
    branchId,
    canvasWidth: 70 * 2 + columns * 130,
    canvasHeight: 70 * 2 + rows * 120,
    timeZoneId: YEREVAN,
    tables,
    features: [
      {
        id: `${branchId}-entrance`,
        kind: 'entrance',
        x: 70,
        y: 70 * 2 + rows * 120 - 30,
        width: 100,
        height: 26,
      },
    ],
  };
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
    floor: buildFloor(id, totalTables, freeTables, areas),
  };
}

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
