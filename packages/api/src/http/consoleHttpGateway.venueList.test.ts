import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { BASE_URL, fakeBackend, type FakeRoute } from './fakeBackend.testkit';

/**
 * The platform venues list over HTTP, for the redesigned list (Venues
 * artboard).
 *
 * `GET /api/platform/venues` is being extended in parallel with rating, review
 * count, open tabs, a readiness issue, a cover thumbnail and each branch's
 * tier. The console reads each of those **only when the wire carries it**:
 * today's backend does not, and a column the source does not report must stay
 * unreported (`undefined`) rather than turn into a zero, a "no reviews" or a
 * "no photo" nobody said.
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

  it('leaves every newer column unreported when the wire does not carry it', async () => {
    const { gateway } = gatewayOver({ 'GET /api/platform/venues': { body: page([summary()]) } });
    const [venue] = (await gateway.listVenues({})).items;
    for (const field of [
      'rating',
      'reviewCount',
      'openTabCount',
      'readinessIssue',
      'coverThumbnailUrl',
      'branchTiers',
      'cuisine',
      'district',
    ] as const) {
      expect(venue && field in venue, field).toBe(false);
    }
  });

  it('maps the newer columns when the wire carries them', async () => {
    const { gateway } = gatewayOver({
      'GET /api/platform/venues': {
        body: page([
          summary({
            averageRating: 4.6,
            reviewCount: 110,
            openTabCount: 3,
            readinessIssue: { code: 'incomplete-dishes', count: 4, branchName: 'Nor Nork' },
            coverThumbnailUrl: '/api/photos/p-1/thumbnail',
            branches: [
              { branchId: 'b-1', name: 'Kanaker', subscriptionTier: 2 },
              { branchId: 'b-2', name: 'Nor Nork', subscriptionTier: 1 },
            ],
            cuisine: 'Armenian',
            district: 'Kanaker',
          }),
        ]),
      },
    });
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
    });
  });

  it('keeps "none" apart from "not reported": no reviews, no cover, ready', async () => {
    const { gateway } = gatewayOver({
      'GET /api/platform/venues': {
        body: page([
          summary({
            averageRating: null,
            reviewCount: 0,
            readinessIssue: null,
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
        body: { venue: summary({ isDeleted: false }), branches: [] },
      },
    });
    const venue = await gateway.restoreVenue({ venueId: 'v-1', commandId: 'c-1' });
    expect(backend.requests[0]?.method).toBe('POST');
    expect(backend.requests[0]?.path).toBe('/api/platform/venues/v-1/restore');
    expect(venue.status).toBe('active');
  });
});
