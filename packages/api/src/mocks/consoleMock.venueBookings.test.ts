import { describe, expect, it } from 'vitest';
import type { BookingStatusCounts } from '../contracts/console';
import { createConsoleMockGateway } from './consoleMock';

/**
 * The venue page's Bookings tab in the mock: aggregates that add up, a month
 * bigger than a week, one row per branch, and never a guest.
 */

const sum = (counts: BookingStatusCounts) =>
  counts.completed + counts.upcoming + counts.pending + counts.cancelled + counts.noShow;

describe("the console mock — a venue's bookings summary", () => {
  it('adds up: by status, by branch and by weekday all make the total', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const summary = await gateway.getVenueBookingsSummary({ venueId: 'v-yalla-demo', days: 30 });

    expect(summary.total).toBeGreaterThan(0);
    expect(sum(summary.byStatus)).toBe(summary.total);
    expect(summary.byWeekday).toHaveLength(7);
    expect(summary.byWeekday.reduce((a, b) => a + b, 0)).toBe(summary.total);
    expect(summary.byBranch.map((branch) => branch.name).sort()).toEqual(['Կենտրոն', 'Կոմիտաս']);
    expect(summary.byBranch.reduce((a, branch) => a + branch.total, 0)).toBe(summary.total);
    for (const branch of summary.byBranch) expect(sum(branch)).toBe(branch.total);
    expect(summary.averagePartySize).toBeGreaterThan(1);
  });

  it('counts a month as more than a week, and is the same answer when asked again', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const week = await gateway.getVenueBookingsSummary({ venueId: 'v-cascade', days: 7 });
    const month = await gateway.getVenueBookingsSummary({ venueId: 'v-cascade', days: 30 });
    expect(month.total).toBeGreaterThan(week.total);
    expect(week.days).toBe(7);
    expect(await gateway.getVenueBookingsSummary({ venueId: 'v-cascade', days: 7 })).toEqual(week);
  });

  it('carries no guest: no name, no phone, no booking code', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const text = JSON.stringify(
      await gateway.getVenueBookingsSummary({ venueId: 'v-lumen', days: 30 }),
    );
    expect(text).not.toMatch(/guest|phone|code/iu);
  });

  it('has nothing for a venue with no bookings: zeros and no average', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const summary = await gateway.getVenueBookingsSummary({ venueId: 'v-sunset', days: 7 });
    expect(summary.total).toBe(0);
    expect(summary.averagePartySize).toBeNull();
  });

  it('is the platform admin’s alone', async () => {
    const owner = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    await expect(
      owner.getVenueBookingsSummary({ venueId: 'v-lumen', days: 7 }),
    ).rejects.toBeTruthy();
  });

  it('gives every branch its web address and street address', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const venue = await gateway.getVenue('v-mountain');
    expect(venue?.branches.map((branch) => branch.slug)).toEqual(['kanaker', 'nor-nork']);
    for (const branch of venue?.branches ?? []) expect(branch.address).toBeTruthy();
  });
});
