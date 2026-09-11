import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { createApiClient } from '../client';
import { StaffPermissionError } from '../contracts/errors';
import { ConcurrencyConflictError, ForbiddenError, ValidationError } from '../errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';

const BASE = 'https://api.test.yalla.am';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

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

function gatewayOver(fetchImpl: typeof globalThis.fetch) {
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('refresh-0'),
    refreshTokens: vi.fn(),
  });
  return createConsoleHttpGateway(
    createApiClient({ baseUrl: BASE, fetch: fetchImpl, getToken: () => 'held-token' }),
    { auth, identity: createMemoryIdentityStore() },
  );
}

function sent(fetchImpl: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
  return { url, method: init.method, body: JSON.parse(init.body as string) as unknown };
}

/**
 * Issuing a sign-in over HTTP.
 *
 * The 403 is the rank rule and is re-wrapped like every other staff refusal;
 * the 409 and 422 arrive as the client's own errors carrying the server's
 * sentence, which is what the screen shows. Nothing here touches the link
 * beyond mapping it.
 */
describe('issuing a sign-in over HTTP', () => {
  it('posts the address in the body to the member route and maps the link', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(200, {
        staffMemberId: 's-1',
        email: 'nare@lumen.am',
        resetLink: 'https://console.example/reset-password#token=abc',
        expiresAtUtc: '2026-09-11T09:00:00Z',
        replacedExistingSignIn: false,
      }),
    );

    const link = await gatewayOver(fetchImpl).issueStaffSignIn({
      venueId: 'v-1',
      staffMemberId: 's-1',
      email: 'nare@lumen.am',
    });

    const request = sent(fetchImpl);
    expect(request.url).toBe(`${BASE}/api/venues/v-1/staff/s-1/sign-in`);
    expect(request.method).toBe('POST');
    expect(request.body).toEqual({ email: 'nare@lumen.am' });
    expect(link.resetLink).toBe('https://console.example/reset-password#token=abc');
    expect(link.replacedExistingSignIn).toBe(false);
  });

  it('turns the rank refusal into the staff error the screens already catch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      problem(403, 'forbidden', 'Issuing a sign-in for a Owner requires the PlatformAdmin role.', {
        operation: 'Issuing a sign-in for a Owner',
      }),
    );

    const caught = await gatewayOver(fetchImpl)
      .issueStaffSignIn({ venueId: 'v-1', staffMemberId: 's-1', email: 'x@lumen.am' })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(StaffPermissionError);
    expect((caught as StaffPermissionError).message).toContain('for a Owner');
  });

  it('lets the 409 and the 422 through with the server sentence and the field', async () => {
    const conflict = await gatewayOver(
      vi
        .fn()
        .mockResolvedValue(
          problem(409, 'conflicting-state', 'That email address already has an account.'),
        ),
    )
      .issueStaffSignIn({ venueId: 'v-1', staffMemberId: 's-1', email: 'x@lumen.am' })
      .then(() => null)
      .catch((error: unknown) => error);
    expect(conflict).toBeInstanceOf(ConcurrencyConflictError);
    expect((conflict as Error).message).toBe('That email address already has an account.');

    const invalid = await gatewayOver(
      vi.fn().mockResolvedValue(
        problem(422, 'validation-failed', 'The email field is not a valid e-mail address.', {
          field: 'email',
        }),
      ),
    )
      .issueStaffSignIn({ venueId: 'v-1', staffMemberId: 's-1', email: 'not-an-address' })
      .then(() => null)
      .catch((error: unknown) => error);
    expect(invalid).toBeInstanceOf(ValidationError);
    expect((invalid as ValidationError).field).toBe('email');
  });
});

/**
 * The venue read a venue user is allowed to make.
 *
 * `GET /api/venues/{venueId}/manage`, not the platform route: that one is
 * PlatformAdminOnly and answered 403 to every owner, which is how the console
 * came to show "no branch" on every tab. The server decides coverage from the
 * caller's staff row; this only maps what it says.
 */
describe('reading the managed venue over HTTP', () => {
  const managed = {
    venueId: 'v-1',
    name: 'Probe Cafe',
    type: 2,
    slug: 'probe-cafe',
    isSuspended: false,
    isDeleted: false,
    branches: [
      {
        branchId: 'b-1',
        venueId: 'v-1',
        name: 'Northern Avenue',
        slug: 'northern-avenue',
        timeZoneId: 'Asia/Yerevan',
        isActive: true,
        subscriptionTier: 2,
        tableCount: 12,
      },
      {
        branchId: 'b-2',
        venueId: 'v-1',
        name: 'Cascade',
        slug: 'cascade',
        timeZoneId: 'Europe/Moscow',
        isActive: false,
        subscriptionTier: 1,
        tableCount: 0,
      },
    ],
  };

  it('gets the manage route and maps the venue and its branches', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, managed));

    const venue = await gatewayOver(fetchImpl).getManagedVenue('v-1');

    // Not `sent()`: it parses a body, and a GET has none.
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/venues/v-1/manage`);
    expect(init.method ?? 'GET').toBe('GET');

    expect(venue).toEqual({
      id: 'v-1',
      name: 'Probe Cafe',
      slug: 'probe-cafe',
      type: 'restaurant',
      status: 'active',
      branches: [
        {
          id: 'b-1',
          venueId: 'v-1',
          name: 'Northern Avenue',
          slug: 'northern-avenue',
          timeZoneId: 'Asia/Yerevan',
          isActive: true,
          subscriptionTier: 'paid',
          tableCount: 12,
          openTabCount: null,
        },
        {
          id: 'b-2',
          venueId: 'v-1',
          name: 'Cascade',
          slug: 'cascade',
          timeZoneId: 'Europe/Moscow',
          isActive: false,
          subscriptionTier: 'free',
          tableCount: 0,
          openTabCount: null,
        },
      ],
    });
  });

  it('maps a suspended venue to its status rather than dropping the flag', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { ...managed, isSuspended: true }));
    const venue = await gatewayOver(fetchImpl).getManagedVenue('v-1');
    expect(venue.status).toBe('suspended');
  });

  it('rejects a 403 as the forbidden error the notice classifies', async () => {
    // Another venue's staff, or a waiter: the policy's refusal has an empty
    // body and no problem code, which is what the live probe recorded.
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 403, headers: { 'content-length': '0' } }));

    const caught = await gatewayOver(fetchImpl)
      .getManagedVenue('v-1')
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ForbiddenError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
