import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { createApiClient } from '../client';
import { checkedFetch } from './wireSchema.testkit';
import { BranchNotReadyError } from '../contracts/errors';
import { ConcurrencyConflictError, ValidationError } from '../errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';

const BASE = 'https://api.test.yalla.am';
const VENUE = '3f0e0c1c-0000-4000-8000-000000000001';
const BRANCH = '3f0e0c1c-0000-4000-8000-000000000002';
const BASIC_WIRE = [1, 2, 3, 4, 6, 7, 8, 9, 10];

function problem(status: number, code: string, detail: string, context?: unknown) {
  return new Response(
    JSON.stringify({
      code,
      status,
      title: 'Problem',
      detail,
      type: `https://yalla.am/problems/${code}`,
      traceId: 'trace-1',
      ...(context ? { context } : {}),
    }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const branchSummary = {
  branchId: BRANCH,
  venueId: VENUE,
  name: 'Northern Avenue',
  slug: 'northern-avenue',
  address: '1 Northern Avenue',
  latitude: 40.18,
  longitude: 44.51,
  timeZoneId: 'Asia/Yerevan',
  isActive: true,
  tableCount: 12,
  openTabCount: 0,
  features: BASIC_WIRE,
};

const venueDetail = {
  venue: {
    venueId: VENUE,
    name: 'Lumen Coffee',
    slug: 'lumen',
    type: 1,
    status: 1,
    isActive: true,
    isSuspended: false,
    isDeleted: false,
    branchCount: 1,
    tableCount: 12,
    createdAtUtc: '2026-06-01T09:00:00Z',
    reviewCount: 0,
    openTabCount: 0,
    notReadyBranchCount: 0,
    branches: [
      {
        branchId: BRANCH,
        name: 'Northern Avenue',
        isActive: true,
        issues: [],
        features: BASIC_WIRE,
      },
    ],
  },
  branches: [branchSummary],
};

function gatewayOver(fetchImpl: typeof globalThis.fetch) {
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('refresh-0'),
    refreshTokens: vi.fn(),
  });
  return createConsoleHttpGateway(
    createApiClient({
      baseUrl: BASE,
      fetch: checkedFetch(fetchImpl),
      getToken: () => 'held-token',
    }),
    { auth, identity: createMemoryIdentityStore() },
  );
}

function sent(fetchImpl: ReturnType<typeof vi.fn>, call = 0) {
  const [url, init] = fetchImpl.mock.calls[call] as [string, RequestInit];
  return {
    url,
    method: init.method,
    body: init.body ? (JSON.parse(init.body as string) as unknown) : undefined,
  };
}

/**
 * The platform admin's feature switches over HTTP (2026-10-27, in place of
 * the Free/Paid tier): the whole allowed set by number, one branch or every
 * branch of a venue, and the server's three refusals as the screen reads them.
 */
describe('branch features over HTTP', () => {
  it('puts the whole set by number on the branch route, then re-reads the venue', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(branchSummary))
      .mockResolvedValueOnce(json(venueDetail));

    const venue = await gatewayOver(fetchImpl).setBranchFeatures({
      branchId: BRANCH,
      // Out of order and without table service: sent in numeric order.
      features: [
        'reports',
        'appBookings',
        'webBookings',
        'preOrders',
        'takeaway',
        'guestMessages',
        'reviews',
        'staffPhone',
        'kitchenDisplay',
      ],
      commandId: 'c-1',
    });

    const request = sent(fetchImpl);
    expect(request.url).toBe(`${BASE}/api/platform/branches/${BRANCH}/features`);
    expect(request.method).toBe('PUT');
    expect(request.body).toEqual({ features: BASIC_WIRE });
    expect(sent(fetchImpl, 1).url).toBe(`${BASE}/api/platform/venues/${VENUE}`);
    expect(venue.branches[0]?.features).not.toContain('tableService');
    expect(venue.branches[0]?.features).toHaveLength(9);
    expect(venue.branchFeatures?.[0]?.features).toEqual(venue.branches[0]?.features);
  });

  it('puts one set on every branch of a venue and answers with the venue', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(venueDetail));

    const venue = await gatewayOver(fetchImpl).applyVenueFeatures({
      venueId: VENUE,
      features: ['guestMessages', 'appBookings', 'webBookings', 'preOrders', 'takeaway'],
      commandId: 'c-2',
    });

    const request = sent(fetchImpl);
    expect(request.url).toBe(`${BASE}/api/platform/venues/${VENUE}/features`);
    expect(request.method).toBe('PUT');
    expect(request.body).toEqual({ features: [1, 2, 3, 4, 6] });
    expect(venue.id).toBe(VENUE);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('names the branch and the dishes when table service meets an unfinished menu', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      problem(409, 'branch-not-ready', 'Finish the menu, then turn table service on.', {
        branchId: BRANCH,
        incompleteMenuItemCount: 3,
      }),
    );

    const caught = await gatewayOver(fetchImpl)
      .applyVenueFeatures({ venueId: VENUE, features: ['tableService'], commandId: 'c-3' })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(BranchNotReadyError);
    expect((caught as BranchNotReadyError).branchId).toBe(BRANCH);
    expect((caught as BranchNotReadyError).incompleteMenuItemCount).toBe(3);
  });

  it('lets pre-orders without a booking channel through as the 422 on features', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'validation-failed',
          status: 422,
          title: 'Validation failed',
          detail: 'Pre-orders need app bookings or web bookings.',
          type: 'https://yalla.am/problems/validation-failed',
          traceId: 'trace-2',
          context: {
            field: 'features',
            fields: [
              {
                field: 'features',
                message: 'Pre-orders need app bookings or web bookings.',
                bound: 'conflict',
              },
            ],
          },
        }),
        { status: 422, headers: { 'content-type': 'application/problem+json' } },
      ),
    );

    const caught = await gatewayOver(fetchImpl)
      .setBranchFeatures({ branchId: BRANCH, features: ['preOrders'], commandId: 'c-4' })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).problem?.context?.['field']).toBe('features');
  });

  it('lets table service off with tabs open through as a plain 409', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        problem(
          409,
          'conflicting-state',
          'Northern Avenue has 2 open tab(s) on table(s) 4, 7. Wait until they are settled.',
        ),
      );

    const caught = await gatewayOver(fetchImpl)
      .setBranchFeatures({ branchId: BRANCH, features: [], commandId: 'c-5' })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ConcurrencyConflictError);
    expect(caught).not.toBeInstanceOf(BranchNotReadyError);
  });
});
