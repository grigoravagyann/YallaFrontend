import { describe, expect, it } from 'vitest';
import type { components } from '../generated/schema';
import { publicBranchFromWire, publicVenueFromCards } from './publicMapping';

type Page = components['schemas']['Yalla.Application.Public.PublicBranchPage'];
const BASE = 'https://api.test.yalla.am';
type Card = components['schemas']['Yalla.Application.Public.PublicVenueCard'];

const CARD: Card = {
  venueSlug: 'lumen-coffee',
  name: 'Lumen Coffee',
  type: 1,
  branches: [
    {
      branchId: '0b5f3c1e-0000-4000-8000-000000000001',
      branchSlug: 'northern-avenue',
      name: 'Northern Avenue',
      address: 'Northern Avenue 5, Yerevan',
      freeTableCount: 4,
      isOpenNow: true,
      timeZoneId: 'Asia/Yerevan',
    },
  ],
};

describe('the web venue chooser', () => {
  it("carries each branch's zone from the card instead of leaving it blank", () => {
    const venue = publicVenueFromCards([CARD], 'lumen-coffee');
    expect(venue?.branches[0]?.timeZoneId).toBe('Asia/Yerevan');
  });
});

/**
 * The header used to say "Closed today" at 01:21 on a Friday that opens at
 * 09:00, because the mapper dropped both instants and the badge had nothing to
 * name. Open-or-shut stays the server's word; *when it opens next* is read off
 * the same weekly hours the page prints further down.
 */
describe('the open state on the public branch page', () => {
  const PAGE: Page = {
    venueSlug: 'yalla-demo',
    branchSlug: 'yerevan-centre',
    branchId: '0b5f3c1e-0000-4000-8000-000000000002',
    venueName: 'Yalla Demo',
    branchName: 'Yerevan Centre',
    venueType: 1,
    address: 'Abovyan 1',
    latitude: 40.18,
    longitude: 44.51,
    timeZoneId: 'Asia/Yerevan',
    openingHours: [
      { day: 4, opensAt: '09:00:00', closesAt: '23:59:00', closesNextDay: false },
      { day: 5, opensAt: '09:00:00', closesAt: '01:00:00', closesNextDay: true },
    ],
    isOpenNow: false,
    specialDays: [],
    freeTableCount: 8,
    tableCount: 8,
    floorPlan: { areas: [], tables: [] },
    acceptsWebBookings: true,
    acceptsAppBookings: true,
    bookingWindowDays: 14,
    policy: {
      turnTimeMinutes: 120,
      minLeadMinutes: 30,
      cancellationDeadlineMinutes: 120,
      unverifiedMaxPartySize: 6,
      unverifiedBookingsNeedApproval: true,
      acceptsUnverifiedBookings: true,
    },
    asOfUtc: '2026-10-15T21:21:00Z',
    coverPhoto: null,
    venueBranchCount: 1,
  };

  // 01:21 on Friday 16 October in Yerevan (UTC+4).
  const now = () => new Date('2026-10-15T21:21:00Z');

  it('says whether the branch takes bookings without a verified number (df6de66)', () => {
    const off = {
      ...PAGE,
      policy: { ...PAGE.policy, unverifiedMaxPartySize: 0, acceptsUnverifiedBookings: false },
    };
    expect(publicBranchFromWire(off, BASE, now).policy.acceptsUnverifiedBookings).toBe(false);
    expect(publicBranchFromWire(PAGE, BASE, now).policy.acceptsUnverifiedBookings).toBe(true);
    // A server before the flag: the cap says it.
    const { acceptsUnverifiedBookings: _absent, ...older } = off.policy;
    expect(
      publicBranchFromWire({ ...PAGE, policy: older } as never, BASE, now).policy
        .acceptsUnverifiedBookings,
    ).toBe(false);
  });

  it("names this morning's opening when the server says shut", () => {
    const branch = publicBranchFromWire(PAGE, BASE, now);
    expect(branch.openState.isOpen).toBe(false);
    expect(branch.openState.opensAtUtc).toBe('2026-10-16T05:00:00.000Z');
    expect(branch.openState.closesAtUtc).toBeNull();
  });

  it('names the closing time when the server says open and the hours agree', () => {
    const branch = publicBranchFromWire(
      { ...PAGE, isOpenNow: true },
      BASE,
      () => new Date('2026-10-16T18:00:00Z'), // Friday 22:00
    );
    expect(branch.openState.isOpen).toBe(true);
    expect(branch.openState.closesAtUtc).toBe('2026-10-16T21:00:00.000Z');
  });

  it("reads the special days, and names a special day's opening (VC3 wire §1)", () => {
    // Friday 16 October is a special day opening at 18:00; at 12:00 the server says shut.
    const branch = publicBranchFromWire(
      {
        ...PAGE,
        specialDays: [
          {
            date: '2026-10-16',
            note: 'Private party',
            closed: false,
            blocks: [{ opensAt: '18:00:00', closesAt: '23:00:00', closesNextDay: false }],
          },
        ],
      },
      BASE,
      () => new Date('2026-10-16T08:00:00Z'),
    );
    expect(branch.specialDays).toEqual([
      {
        date: '2026-10-16',
        note: 'Private party',
        blocks: [{ opensAt: '18:00', closesAt: '23:00' }],
      },
    ]);
    expect(branch.openState.isOpen).toBe(false);
    expect(branch.openState.opensAtUtc).toBe('2026-10-16T14:00:00.000Z');
    // A server that does not send them yet: none.
    expect(publicBranchFromWire(PAGE, BASE, now).specialDays).toEqual([]);
  });

  it("keeps the server's verdict when the hours disagree with this clock", () => {
    // The hours say open at Friday 12:00; the server says shut (a holiday).
    const branch = publicBranchFromWire(PAGE, BASE, () => new Date('2026-10-16T08:00:00Z'));
    expect(branch.openState.isOpen).toBe(false);
    expect(branch.openState.opensAtUtc).toBeNull();
    expect(branch.openState.closesAtUtc).toBeNull();
  });
});

describe('the rooms on the public branch page', () => {
  const photo = (id: string) => ({
    photoId: id,
    thumbnailUrl: `/api/photos/${id}/thumbnail`,
    cardUrl: `/api/photos/${id}/card`,
    fullUrl: `/api/photos/${id}/full`,
    width: 1600,
    height: 1200,
  });
  const PAGE: Page = {
    venueSlug: 'yalla-demo',
    branchSlug: 'yerevan-centre',
    branchId: 'b-2',
    venueName: 'Yalla Demo',
    branchName: 'Yerevan Centre',
    venueType: 1,
    address: 'Abovyan 1',
    latitude: 40.18,
    longitude: 44.51,
    timeZoneId: 'Asia/Yerevan',
    openingHours: [],
    isOpenNow: true,
    specialDays: [],
    freeTableCount: 2,
    tableCount: 3,
    floorPlan: {
      areas: [
        { id: 'terrace', name: 'Terrace', displayOrder: 2, photos: [photo('p3')] },
        { id: 'empty', name: 'Cellar', displayOrder: 0, photos: [] },
        { id: 'hall', name: 'Hall', displayOrder: 1, photos: [photo('p1'), photo('p2')] },
      ],
      tables: [],
    },
    acceptsWebBookings: true,
    acceptsAppBookings: true,
    bookingWindowDays: 14,
    policy: {
      turnTimeMinutes: 120,
      minLeadMinutes: 30,
      cancellationDeadlineMinutes: 120,
      unverifiedMaxPartySize: 6,
      unverifiedBookingsNeedApproval: true,
      acceptsUnverifiedBookings: true,
    },
    asOfUtc: '2026-10-15T21:21:00Z',
    coverPhoto: null,
    venueBranchCount: 1,
  };

  it('lists the rooms that have a photo, in display order, with absolute photo links', () => {
    const branch = publicBranchFromWire(PAGE, BASE);
    expect(branch.rooms.map((room) => [room.roomId, room.name])).toEqual([
      ['hall', 'Hall'],
      ['terrace', 'Terrace'],
    ]);
    expect(branch.rooms[0]?.photos.map((p) => p.photoId)).toEqual(['p1', 'p2']);
    expect(branch.rooms[0]?.photos[0]?.fullUrl).toBe(`${BASE}/api/photos/p1/full`);
  });
});
