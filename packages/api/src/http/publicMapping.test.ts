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
    freeTableCount: 8,
    tableCount: 8,
    floorPlan: { floorWidth: 800, floorHeight: 600, areas: [], tables: [] },
    acceptsWebBookings: true,
    acceptsAppBookings: true,
    bookingWindowDays: 14,
    policy: { turnTimeMinutes: 120, minLeadMinutes: 30, cancellationDeadlineMinutes: 120 },
    asOfUtc: '2026-10-15T21:21:00Z',
    coverPhoto: null,
  };

  // 01:21 on Friday 16 October in Yerevan (UTC+4).
  const now = () => new Date('2026-10-15T21:21:00Z');

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

  it("keeps the server's verdict when the hours disagree with this clock", () => {
    // The hours say open at Friday 12:00; the server says shut (a holiday).
    const branch = publicBranchFromWire(PAGE, BASE, () => new Date('2026-10-16T08:00:00Z'));
    expect(branch.openState.isOpen).toBe(false);
    expect(branch.openState.opensAtUtc).toBeNull();
    expect(branch.openState.closesAtUtc).toBeNull();
  });
});
