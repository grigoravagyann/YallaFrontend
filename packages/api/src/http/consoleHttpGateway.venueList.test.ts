import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { BASE_URL, fakeBackend, type FakeRoute } from './fakeBackend.testkit';

/**
 * The platform venues list over HTTP, for the redesigned list (Venues
 * artboard), on the row `GET /api/platform/venues` serves: rating, review
 * count, open tabs, the readiness issue, the cover thumbnail, each branch's
 * tier, cuisine, district, the status and the creation date. The fixture is
 * a row copied from the live backend (2026-10-18).
 */

function summary(extra: Record<string, unknown> = {}) {
  return {
    venueId: 'v-1',
    name: 'Mountain View',
    type: 2,
    slug: 'mountain-view',
    isActive: true,
    isSuspended: false,
    isDeleted: false,
    suspendedAtUtc: null,
    deletedAtUtc: null,
    branchCount: 2,
    tableCount: 18,
    paidBranchCount: 1,
    subscriptionTier: 2,
    status: 1,
    tierMix: 2,
    branches: [
      { branchId: 'b-1', name: 'Kanaker', subscriptionTier: 2, isActive: true, issues: [] },
      {
        branchId: 'b-2',
        name: 'Nor Nork',
        subscriptionTier: 1,
        isActive: true,
        issues: [{ code: 'incomplete-dishes', count: 4 }],
      },
    ],
    averageRating: 4.6,
    reviewCount: 110,
    openTabCount: 3,
    readinessIssue: { code: 'incomplete-dishes', count: 4, branchName: 'Nor Nork' },
    notReadyBranchCount: 1,
    coverThumbnailUrl: '/api/photos/p-1/thumbnail',
    district: 'Kanaker',
    cuisine: 'Armenian',
    createdAtUtc: '2026-10-18T05:46:02.728039Z',
    ...extra,
  };
}

function page(items: unknown[]) {
  return { items, page: 1, pageSize: 200, totalCount: items.length };
}

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

describe('the venues list over HTTP', () => {
  it("reads how many branches are paid: the list's tier summary", async () => {
    const { gateway } = gatewayOver({ 'GET /api/platform/venues': { body: page([summary()]) } });
    const [venue] = (await gateway.listVenues({})).items;
    expect(venue?.paidBranchCount).toBe(1);
    expect(venue?.branchCount).toBe(2);
  });

  it("maps every column of the server's row", async () => {
    const { gateway } = gatewayOver({ 'GET /api/platform/venues': { body: page([summary()]) } });
    const [venue] = (await gateway.listVenues({})).items;
    expect(venue).toMatchObject({
      rating: 4.6,
      reviewCount: 110,
      openTabCount: 3,
      readinessIssue: { kind: 'incompleteDishes', count: 4, branchName: 'Nor Nork' },
      // Resolved against the API, as every photo link the console shows is.
      coverThumbnailUrl: `${BASE_URL}/api/photos/p-1/thumbnail`,
      branchTiers: [
        { id: 'b-1', name: 'Kanaker', subscriptionTier: 'paid' },
        { id: 'b-2', name: 'Nor Nork', subscriptionTier: 'free' },
      ],
      cuisine: 'Armenian',
      district: 'Kanaker',
      status: 'active',
      createdAtUtc: '2026-10-18T05:46:02.728039Z',
    });
  });

  it("reads a switched-off venue from the server's status", async () => {
    const { gateway } = gatewayOver({
      'GET /api/platform/venues': { body: page([summary({ status: 3, isActive: false })]) },
    });
    const [venue] = (await gateway.listVenues({})).items;
    expect(venue?.status).toBe('inactive');
  });

  it('keeps "none" apart from "not reported": no reviews, no cover, ready', async () => {
    const { gateway } = gatewayOver({
      'GET /api/platform/venues': {
        body: page([
          summary({
            // The server leaves out a rating nobody gave and an issue nobody has.
            averageRating: undefined,
            reviewCount: 0,
            readinessIssue: undefined,
            coverThumbnailUrl: null,
          }),
        ]),
      },
    });
    const [venue] = (await gateway.listVenues({})).items;
    expect(venue?.rating).toBeNull();
    expect(venue?.reviewCount).toBe(0);
    expect(venue?.readinessIssue).toBeNull();
    expect(venue?.coverThumbnailUrl).toBeNull();
  });

  it('reads each readiness code, and an unknown one as "not ready" rather than ready', async () => {
    const codes = {
      'no-tables': 'noTables',
      'no-menu': 'noMenu',
      'no-hours': 'noHours',
      'no-photo': 'noPhoto',
      'something-new': 'other',
    } as const;
    for (const [code, kind] of Object.entries(codes)) {
      const { gateway } = gatewayOver({
        'GET /api/platform/venues': {
          body: page([summary({ readinessIssue: { code, count: null, branchName: null } })]),
        },
      });
      const [venue] = (await gateway.listVenues({})).items;
      expect(venue?.readinessIssue, code).toEqual({ kind, count: null, branchName: null });
    }
  });

  it('asks for deleted venues only when told to', async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/platform/venues': { body: page([summary()]) },
    });
    await gateway.listVenues({ includeDeleted: true, pageSize: 200, page: 2 });
    const query = backend.requests[0]?.query;
    expect(query?.get('includeDeleted')).toBe('true');
    expect(query?.get('pageSize')).toBe('200');
    expect(query?.get('page')).toBe('2');
  });
});

describe('undoing a delete over HTTP', () => {
  it('posts the restore route and answers with the venue', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/platform/venues/v-1/restore': {
        body: {
          venue: summary(),
          branches: [],
        },
      },
    });
    const venue = await gateway.restoreVenue({ venueId: 'v-1', commandId: 'c-1' });
    expect(backend.requests[0]?.method).toBe('POST');
    expect(backend.requests[0]?.path).toBe('/api/platform/venues/v-1/restore');
    expect(venue.status).toBe('active');
  });
});
