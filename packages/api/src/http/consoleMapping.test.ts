import { describe, expect, it } from 'vitest';
import type { components } from '../generated/schema';
import {
  branchFromWire,
  venueDetailFromWire,
  venueFromWire,
  venuePageFromWire,
  venueStatus,
  venueType,
} from './consoleMapping';

type Schemas = components['schemas'];

const wireVenue = (
  over: Partial<Schemas['Yalla.Application.Platform.VenueSummary']> = {},
): Schemas['Yalla.Application.Platform.VenueSummary'] => ({
  venueId: '01a07293-598c-7529-9862-bfa66dd66837',
  name: 'Yalla Demo Cafe',
  type: 1,
  slug: 'yalla-demo',
  isActive: true,
  isSuspended: false,
  isDeleted: false,
  branchCount: 1,
  tableCount: 8,
  status: 1,
  branches: [
    {
      branchId: 'b1',
      name: 'Yerevan Centre',
      features: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      isActive: true,
      issues: [],
    },
  ],
  createdAtUtc: '2026-06-01T09:00:00Z',
  notReadyBranchCount: 0,
  openTabCount: 0,
  reviewCount: 0,
  ...over,
});

const wireBranch = (
  over: Partial<Schemas['Yalla.Application.Platform.BranchSummary']> = {},
): Schemas['Yalla.Application.Platform.BranchSummary'] => ({
  branchId: 'b1',
  venueId: 'v1',
  name: 'Yerevan Centre',
  slug: 'yerevan-centre',
  address: '12 Abovyan Street',
  latitude: 40.183,
  longitude: 44.515,
  timeZoneId: 'Asia/Yerevan',
  isActive: true,
  features: [1, 2, 3, 4, 6, 7, 8, 9, 10],
  tableCount: 8,
  openTabCount: 0,
  ...over,
});

describe('enums', () => {
  it('maps venue type', () => {
    expect(venueType(1)).toBe('cafe');
    expect(venueType(2)).toBe('restaurant');
  });

  it('maps the features by number, in order, dropping one this client does not know', () => {
    const branch = branchFromWire(wireBranch({ features: [10, 5, 1, 11 as never] }));
    expect(branch.features).toEqual(['appBookings', 'tableService', 'reports']);
  });
});

describe('venue status', () => {
  it('collapses three booleans to one badge, deleted first', () => {
    expect(venueStatus({ isDeleted: false, isSuspended: false })).toBe('active');
    expect(venueStatus({ isDeleted: false, isSuspended: true })).toBe('suspended');
    // A soft-deleted venue is usually suspended too; deleted has to win or it
    // reads as merely paused.
    expect(venueStatus({ isDeleted: true, isSuspended: true })).toBe('deleted');
  });
});

describe('venue rows', () => {
  it('renames the wire keys onto the console contract', () => {
    const venue = venueFromWire(wireVenue());
    expect(venue.id).toBe('01a07293-598c-7529-9862-bfa66dd66837');
    expect(venue.type).toBe('cafe');
    expect(venue.branchFeatures?.[0]?.features).toHaveLength(10);
    expect(venue.status).toBe('active');
    expect(venue.branchCount).toBe(1);
    expect(venue.tableCount).toBe(8);
  });

  it('carries the creation date the server keeps', () => {
    expect(venueFromWire(wireVenue()).createdAtUtc).toBe('2026-06-01T09:00:00Z');
  });

  it('names the branch on the readiness line only when the venue has several', () => {
    const issue = { code: 'incomplete-dishes', count: 1, branchName: 'Yerevan Centre' };
    expect(
      venueFromWire(wireVenue({ branchCount: 1, readinessIssue: issue })).readinessIssue,
    ).toEqual({ kind: 'incompleteDishes', count: 1, branchName: null });
    expect(
      venueFromWire(wireVenue({ branchCount: 2, readinessIssue: issue })).readinessIssue
        ?.branchName,
    ).toBe('Yerevan Centre');
  });

  it("reads the server's status, switched off included", () => {
    expect(venueFromWire(wireVenue({ status: 3, isActive: false })).status).toBe('inactive');
    expect(venueFromWire(wireVenue({ status: 4, isDeleted: true })).status).toBe('deleted');
  });

  it('carries a suspension timestamp when the backend sends one', () => {
    const venue = venueFromWire(
      wireVenue({ status: 2, isSuspended: true, suspendedAtUtc: '2026-09-01T10:00:00Z' }),
    );
    expect(venue.status).toBe('suspended');
    expect(venue.suspendedAtUtc).toBe('2026-09-01T10:00:00Z');
  });
});

describe('branches and detail', () => {
  it('maps a branch with the open tabs and the district the platform read carries', () => {
    const branch = branchFromWire(wireBranch({ openTabCount: 3, district: 'Kentron' }));
    expect(branch.id).toBe('b1');
    expect(branch.timeZoneId).toBe('Asia/Yerevan');
    expect(branch.features).not.toContain('tableService');
    expect(branch.openTabCount).toBe(3);
    expect(branch.district).toBe('Kentron');
  });

  it('flattens {venue, branches} and marks staff as not loaded', () => {
    const detail = venueDetailFromWire({ venue: wireVenue(), branches: [wireBranch()] });
    expect(detail.id).toBe('01a07293-598c-7529-9862-bfa66dd66837');
    expect(detail.branches).toHaveLength(1);
    expect(detail.branches[0]?.name).toBe('Yerevan Centre');
    // Staff come from a venue-scoped endpoint this view does not call; `[]`
    // would render as "nobody has been added yet".
    expect(detail.staff).toBeNull();
  });
});

describe('paging', () => {
  it('renames totalCount to total and maps the rows', () => {
    const page = venuePageFromWire({
      items: [wireVenue(), wireVenue({ venueId: 'v2', name: 'Second', type: 2 })],
      page: 2,
      pageSize: 10,
      totalCount: 14,
    });
    expect(page.total).toBe(14);
    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(10);
    expect(page.items.map((v) => v.type)).toEqual(['cafe', 'restaurant']);
  });

  it('survives a page with no items array', () => {
    // The generated type marks `items` required, so this shape is unreachable
    // through the type system — and reachable over the wire the day the
    // backend omits an empty collection. The cast is the point of the test.
    const page = venuePageFromWire({ page: 1, pageSize: 10, totalCount: 0 } as Parameters<
      typeof venuePageFromWire
    >[0]);
    expect(page.items).toEqual([]);
  });
});

describe('a feature set the server does not send', () => {
  it('is every feature, not none: an older server blocks nothing', () => {
    const branch = branchFromWire({ ...wireBranch(), features: undefined as never });
    expect(branch.features).toHaveLength(10);
    expect(branchFromWire(wireBranch({ features: [] })).features).toEqual([]);
  });
});
