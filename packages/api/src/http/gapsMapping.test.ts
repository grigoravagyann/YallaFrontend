import { describe, expect, it } from 'vitest';
import { VENUE_TYPES } from '../contracts/booking';
import type { components } from '../generated/schema';
import { venueType } from './consoleMapping';
import { branchListingFromWire, type WireBranchListing } from './placesMapping';
import { managedBookingFromWire, type WirePublicBooking } from './publicMapping';
import { billRequest, serviceRequest, staffTabFromView } from './staffMapping';
import { venueTypeCode, venueTypeFromCode } from './venueTypeMapping';

/**
 * The wire-to-contract half of the diner design gaps, mapper by mapper: the
 * one venue-type codec, the district, the room on the manage link, the bill
 * request on a service request and the tips and faces on the staff tab.
 */

type Schemas = components['schemas'];
const BASE = 'https://api.test.yalla.am';

describe('the venue type, one codec for every surface', () => {
  it('reads 1, 2 and 3 as cafe, restaurant and bar, and writes them back', () => {
    expect([1, 2, 3].map(venueTypeFromCode)).toEqual(['cafe', 'restaurant', 'bar']);
    expect(VENUE_TYPES.map(venueTypeCode)).toEqual([1, 2, 3]);
  });

  it('reads a number it does not know as a restaurant — everywhere, not on one screen', () => {
    expect(venueTypeFromCode(9)).toBe('restaurant');
    expect(venueTypeFromCode(undefined)).toBe('restaurant');
    // The console's decoder is the same one: it used to read 9 as a cafe.
    expect(venueType(9)).toBe('restaurant');
    expect(venueType(3)).toBe('bar');
  });
});

const LISTING = {
  branchId: 'b1',
  venueId: 'v1',
  venueSlug: 'copper-fox',
  branchSlug: 'saryan-street',
  venueName: 'Copper Fox',
  branchName: 'Saryan Street',
  venueType: 3,
  address: 'Saryan 12, Yerevan',
  timeZoneId: 'Asia/Yerevan',
  isOpenNow: true,
  freeTableCount: 2,
  reviewCount: 0,
  badges: [],
} as unknown as WireBranchListing;

describe('the district on a browse listing', () => {
  it('carries the area of town, trimmed, and the kind of place a bar is', () => {
    const listing = branchListingFromWire({ ...LISTING, district: ' Kentron ' }, BASE);
    expect(listing.district).toBe('Kentron');
    expect(listing.venueType).toBe('bar');
  });

  it('reads an absent or blank district as none', () => {
    expect(branchListingFromWire(LISTING, BASE).district).toBeNull();
    expect(branchListingFromWire({ ...LISTING, district: '   ' }, BASE).district).toBeNull();
  });
});

describe('the room on a manage link', () => {
  const BOOKING = {
    code: 'K7QX2M',
    status: 2,
    venueName: 'Lumen Coffee',
    branchName: 'Northern Avenue',
    branchAddress: 'Northern Avenue 5',
    tableLabel: '7',
    partySize: 2,
    localDate: '2026-09-20',
    localStartTime: '19:30:00',
    timeZoneId: 'Asia/Yerevan',
    cancellationDeadlineUtc: '2026-09-20T13:30:00Z',
    cancelledAfterDeadline: false,
    canCancel: true,
  } as unknown as WirePublicBooking;
  const slugs = { venueSlug: 'lumen-coffee', branchSlug: 'northern-avenue' };

  it('names the room from the booking’s own table', () => {
    expect(managedBookingFromWire({ ...BOOKING, roomName: 'Terrace' }, slugs).floorAreaName).toBe(
      'Terrace',
    );
  });

  it('says nothing about a room the server did not name', () => {
    expect(managedBookingFromWire(BOOKING, slugs).floorAreaName).toBeNull();
    expect(managedBookingFromWire({ ...BOOKING, roomName: ' ' }, slugs).floorAreaName).toBeNull();
  });
});

const REQUEST = {
  serviceRequestId: 'sr-1',
  tabId: 't1',
  tableLabel: '7',
  preset: 3,
  createdAtUtc: '2026-09-20T17:00:00Z',
  waitingMinutes: 2,
  tabEventSequence: 0,
} as Schemas['Yalla.Application.Ordering.ServiceRequestView'];

describe('a bill request on the branch list', () => {
  it('carries whose bill, the amount and the tip the server worked out', () => {
    const request = serviceRequest({
      ...REQUEST,
      billScope: 1,
      billAmountAmd: 15400,
      tipPercent: 5,
      tipAmd: 700,
    });

    expect(request.reason).toBe('bill');
    expect(request.bill).toEqual({
      scope: 'whole',
      amountDram: 15400,
      tipPercent: 5,
      tipDram: 700,
    });
  });

  it('is no bill request without a scope and an amount, or with a scope it does not know', () => {
    expect(serviceRequest(REQUEST).bill).toBeNull();
    expect(billRequest({ ...REQUEST, billScope: 2 })).toBeNull();
    expect(
      billRequest({ ...REQUEST, billScope: 7 as unknown as 1, billAmountAmd: 100 }),
    ).toBeNull();
    // A bill with no tip chosen is a tip of zero, said as such.
    expect(billRequest({ ...REQUEST, billScope: 2, billAmountAmd: 900 })).toEqual({
      scope: 'mine',
      amountDram: 900,
      tipPercent: 0,
      tipDram: 0,
    });
  });
});

describe('the staff tab, with tips and faces', () => {
  const VIEW: Parameters<typeof staffTabFromView>[0] = {
    tabId: 't1',
    branchId: 'b1',
    diningTableId: 'tbl-7',
    tableLabel: '7',
    status: 1,
    settlementMode: 2,
    settlementModeLocked: true,
    tipsAmd: 0,
    openedAtUtc: '2026-09-20T15:00:00Z',
    hostParticipantId: 'p1',
    maxSequence: 4,
    serviceChargePercent: 10,
    timeZoneId: 'Asia/Yerevan',
    admission: { status: 2, admittedBecause: 2 },
    lines: [],
    adjustments: [],
    totals: {
      subtotalAmd: 4000,
      serviceChargeAmd: 400,
      totalAmd: 4400,
      paidAmd: 4000,
      remainingAmd: 400,
    },
    participants: [
      {
        participantId: 'p1',
        displayName: 'Anahit',
        role: 1,
        status: 2,
        canOrder: true,
        canOrderNow: true,
        canPay: true,
        canSeeTableTotal: true,
        joinedAtUtc: '2026-09-20T15:00:00Z',
        photo: {
          photoId: 'ph1',
          thumbnailUrl: '/api/photos/ph1/thumbnail',
          cardUrl: '/api/photos/ph1/card',
          fullUrl: '/api/photos/ph1/full',
        },
      },
      {
        participantId: 'p2',
        displayName: 'Karen',
        role: 2,
        status: 2,
        canOrder: true,
        canOrderNow: true,
        canPay: false,
        canSeeTableTotal: false,
        joinedAtUtc: '2026-09-20T15:05:00Z',
      },
    ],
  };

  it('keeps the tips beside the totals, never inside them', () => {
    const tab = staffTabFromView({ ...VIEW, tipsAmd: 600 }, BASE);
    expect(tab.tipsDram).toBe(600);
    expect(tab.totals.paidDram).toBe(4000);
  });

  it('reads a tab with no tips taken as zero, not unknown', () => {
    expect(staffTabFromView(VIEW, BASE).tipsDram).toBe(0);
  });

  it('puts the account photo on who has one, with an absolute link', () => {
    const tab = staffTabFromView(VIEW, BASE);
    expect(tab.participants.map((person) => person.photo?.thumbnailUrl ?? null)).toEqual([
      `${BASE}/api/photos/ph1/thumbnail`,
      null,
    ]);
  });
});
