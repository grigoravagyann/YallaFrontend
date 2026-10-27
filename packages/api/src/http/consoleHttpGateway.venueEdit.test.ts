import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { createApiClient } from '../client';
import { checkedFetch } from './wireSchema.testkit';
import { SlugTakenError } from '../contracts/errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';

const BASE = 'https://api.test.yalla.am';

function problem(status: number, code: string, detail: string) {
  return new Response(
    JSON.stringify({
      code,
      status,
      title: 'Problem',
      detail,
      type: `https://yalla.am/problems/${code}`,
      traceId: 'trace-1',
    }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

const WIRE_VENUE = {
  venue: {
    venueId: 'v-1',
    name: 'Lumen Coffee House',
    slug: 'lumen',
    type: 2,
    isActive: true,
    branchCount: 0,
    tableCount: 0,
    suspendedAtUtc: null,
    deletedAtUtc: null,
    isSuspended: false,
    isDeleted: false,
    status: 1,
    branches: [],
    createdAtUtc: '2026-06-01T09:00:00Z',
    notReadyBranchCount: 0,
    openTabCount: 0,
    reviewCount: 0,
  },
  branches: [],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

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
 * The venue's own fields and its later branches, over HTTP.
 *
 * Both routes were on the server from the start — `PATCH /platform/venues/{id}`
 * and `POST /platform/venues/{id}/branches` — and nothing in the console
 * called either.
 */
describe('editing a venue over HTTP', () => {
  it('patches name, web address and the wire integer for the type', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(WIRE_VENUE));

    await gatewayOver(fetchImpl).updateVenue({
      venueId: 'v-1',
      commandId: 'c-1',
      name: 'Lumen Coffee House',
      slug: 'lumen',
      type: 'restaurant',
    });

    const request = sent(fetchImpl);
    expect(request.url).toBe(`${BASE}/api/platform/venues/v-1`);
    expect(request.method).toBe('PATCH');
    expect(request.body).toEqual({ name: 'Lumen Coffee House', slug: 'lumen', type: 2 });
  });

  it('turns the 409 into SlugTakenError carrying the address that was refused', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(problem(409, 'conflicting-state', 'That slug is already in use.'));

    const caught = await gatewayOver(fetchImpl)
      .updateVenue({ venueId: 'v-1', commandId: 'c-1', name: 'x', slug: 'taken', type: 'cafe' })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(SlugTakenError);
    expect((caught as SlugTakenError).slug).toBe('taken');
  });
});

describe('adding a branch over HTTP', () => {
  it('posts every field the command requires, then re-reads the venue', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        json(
          {
            branchId: 'b-2',
            venueId: 'v-1',
            name: 'Komitas',
            slug: 'komitas',
            address: '5 Komitas Avenue, Yerevan',
            latitude: 40.2,
            longitude: 44.5,
            timeZoneId: 'Asia/Yerevan',
            isActive: true,
            features: [1, 2, 3, 4, 6, 7, 8, 9, 10],
            tableCount: 0,
            openTabCount: 0,
          },
          201,
        ),
      )
      .mockResolvedValueOnce(json(WIRE_VENUE));

    await gatewayOver(fetchImpl).addBranch({
      venueId: 'v-1',
      commandId: 'c-1',
      name: 'Komitas',
      slug: 'komitas',
      address: '5 Komitas Avenue, Yerevan',
      latitude: 40.2,
      longitude: 44.5,
      timeZoneId: 'Asia/Yerevan',
    });

    const request = sent(fetchImpl);
    expect(request.url).toBe(`${BASE}/api/platform/venues/v-1/branches`);
    expect(request.method).toBe('POST');
    expect(request.body).toEqual({
      name: 'Komitas',
      slug: 'komitas',
      address: '5 Komitas Avenue, Yerevan',
      latitude: 40.2,
      longitude: 44.5,
      timeZoneId: 'Asia/Yerevan',
    });
    expect(sent(fetchImpl, 1).url).toBe(`${BASE}/api/platform/venues/v-1`);
  });

  it('turns the 409 into SlugTakenError naming the branch address', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(problem(409, 'conflicting-state', 'That branch slug is taken.'));

    const caught = await gatewayOver(fetchImpl)
      .addBranch({
        venueId: 'v-1',
        commandId: 'c-1',
        name: 'Komitas',
        slug: 'komitas',
        address: 'a',
        latitude: 0,
        longitude: 0,
        timeZoneId: 'Asia/Yerevan',
      })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(SlugTakenError);
    expect((caught as SlugTakenError).slug).toBe('komitas');
  });
});
