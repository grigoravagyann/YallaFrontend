import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, type FakeRoute } from './fakeBackend.testkit';

/**
 * The venue page's Bookings tab over HTTP (VenueDetail artboard), and the
 * branch fields the page's branch table reads.
 *
 * `GET /api/platform/venues/{id}/bookings-summary?days=7|30` is being built
 * alongside the console redesign. Aggregates only: the platform admin never
 * sees a guest.
 */

function gatewayOver(routes: Record<string, FakeRoute>) {
  const backend = fakeBackend(routes);
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('refresh-0'),
    refreshTokens: vi.fn(),
  });
  const gateway = createConsoleHttpGateway(backend.client({ getToken: () => 'held-token' }), {
    auth,
    identity: createMemoryIdentityStore(),
  });
  return { gateway, backend };
}

const SUMMARY = {
  venueId: 'v-1',
  days: 30,
  total: 486,
  byStatus: { completed: 402, upcoming: 21, pendingApproval: 3, cancelled: 41, noShow: 19 },
  // System.DayOfWeek: 0 is Sunday.
  byWeekday: [
    { dayOfWeek: 0, count: 61 },
    { dayOfWeek: 1, count: 48 },
    { dayOfWeek: 2, count: 52 },
    { dayOfWeek: 3, count: 55 },
    { dayOfWeek: 4, count: 68 },
    { dayOfWeek: 5, count: 98 },
    { dayOfWeek: 6, count: 104 },
  ],
  averagePartySize: 3.2,
  byBranch: [
    {
      branchId: 'b-1',
      name: 'Kaskad',
      total: 312,
      completed: 259,
      upcoming: 13,
      pendingApproval: 2,
      cancelled: 26,
      noShow: 12,
    },
  ],
};

describe("a venue's bookings summary over HTTP", () => {
  it('asks the platform route for the window it was given', async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/platform/venues/v-1/bookings-summary': { body: SUMMARY },
    });
    await gateway.getVenueBookingsSummary({ venueId: 'v-1', days: 30 });
    expect(backend.requests[0]?.method).toBe('GET');
    expect(backend.requests[0]?.query.get('days')).toBe('30');
  });

  it('maps the counts, the branches, and the week Monday first', async () => {
    const { gateway } = gatewayOver({
      'GET /api/platform/venues/v-1/bookings-summary': { body: SUMMARY },
    });
    const summary = await gateway.getVenueBookingsSummary({ venueId: 'v-1', days: 30 });
    expect(summary).toEqual({
      venueId: 'v-1',
      days: 30,
      total: 486,
      byStatus: { completed: 402, upcoming: 21, pending: 3, cancelled: 41, noShow: 19 },
      byWeekday: [48, 52, 55, 68, 98, 104, 61],
      averagePartySize: 3.2,
      byBranch: [
        {
          branchId: 'b-1',
          name: 'Kaskad',
          total: 312,
          completed: 259,
          upcoming: 13,
          pending: 2,
          cancelled: 26,
          noShow: 12,
        },
      ],
    });
  });

  it('reads a week sent as seven plain counts, Monday first, as the same week', async () => {
    const { gateway } = gatewayOver({
      'GET /api/platform/venues/v-1/bookings-summary': {
        body: { ...SUMMARY, byWeekday: [1, 2, 3, 4, 5, 6, 7], averagePartySize: null },
      },
    });
    const summary = await gateway.getVenueBookingsSummary({ venueId: 'v-1', days: 7 });
    expect(summary.byWeekday).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(summary.averagePartySize).toBeNull();
  });
});

describe("the platform venue's branches over HTTP", () => {
  it('carry their web address and street address', async () => {
    const { gateway } = gatewayOver({
      'GET /api/platform/venues/v-1': {
        body: {
          venue: {
            venueId: 'v-1',
            name: 'Cascade Cafe',
            type: 1,
            slug: 'cascade-cafe',
            isActive: true,
            isSuspended: false,
            isDeleted: false,
            branchCount: 1,
            tableCount: 22,
            paidBranchCount: 1,
            subscriptionTier: 2,
          },
          branches: [
            {
              branchId: 'b-1',
              venueId: 'v-1',
              name: 'Kaskad',
              slug: 'kaskad',
              address: '10 Tamanyan Street',
              latitude: 40.18,
              longitude: 44.51,
              timeZoneId: 'Asia/Yerevan',
              isActive: true,
              subscriptionTier: 2,
              tableCount: 22,
            },
          ],
        },
      },
    });
    const venue = await gateway.getVenue('v-1');
    expect(venue?.branches[0]).toMatchObject({ slug: 'kaskad', address: '10 Tamanyan Street' });
  });
});
