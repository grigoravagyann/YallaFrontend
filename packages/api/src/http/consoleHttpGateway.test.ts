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

/**
 * Deciding a booking that is waiting for approval.
 *
 * Two routes addressed by reservation id, not by branch: `ManagerOrAbove` at
 * the route and the branch half in the service. A 403 and a 409 both arrive
 * with the server's sentence as the message, and that sentence is what the
 * panel shows — nothing here rewrites it.
 */
describe('deciding a pending booking over HTTP', () => {
  const view = {
    id: 'r-1',
    code: 'LM7Q',
    branchId: 'b-1',
    branchName: 'Northern Avenue',
    tableId: 't-1',
    tableLabel: 'T4',
    partySize: 10,
    status: 2,
    startUtc: '2026-09-12T15:00:00Z',
    endUtc: '2026-09-12T16:45:00Z',
    localDate: '2026-09-12',
    localStartTime: '19:00:00',
    localEndTime: '20:45:00',
    timeZoneId: 'Asia/Yerevan',
    guestName: 'Ani',
    guestPhone: '+37491000000',
    clientCommandId: 'c-1',
    cancelledAfterDeadline: false,
    wasReplay: false,
    awaitingApprovalBecause: null,
  };

  it('approves by posting to the approve route with an empty decision', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, view));

    const booking = await gatewayOver(fetchImpl).approveReservation({ reservationId: 'r-1' });

    const request = sent(fetchImpl);
    expect(request.url).toBe(`${BASE}/api/reservations/r-1/approve`);
    expect(request.method).toBe('POST');
    expect(request.body).toEqual({});
    expect(booking.status).toBe('confirmed');
    expect(booking.code).toBe('LM7Q');
  });

  it('rejects by posting the reason to the reject route', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { ...view, status: 7 }));

    const booking = await gatewayOver(fetchImpl).rejectReservation({
      reservationId: 'r-1',
      reason: 'No room for ten that night',
    });

    const request = sent(fetchImpl);
    expect(request.url).toBe(`${BASE}/api/reservations/r-1/reject`);
    expect(request.method).toBe('POST');
    expect(request.body).toEqual({ reason: 'No room for ten that night' });
    expect(booking.status).toBe('cancelledByVenue');
  });

  it('sends a null reason when none was typed, which the schema allows', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { ...view, status: 7 }));
    await gatewayOver(fetchImpl).rejectReservation({ reservationId: 'r-1' });
    expect(sent(fetchImpl).body).toEqual({ reason: null });
  });

  it('lets the branch refusal through as a 403 carrying the server sentence', async () => {
    const detail = 'Approve a booking requires the Manager role; the caller is a Manager.';
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(problem(403, 'forbidden', detail, { operation: 'Approve a booking' }));

    const caught = await gatewayOver(fetchImpl)
      .approveReservation({ reservationId: 'r-1' })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ForbiddenError);
    expect((caught as Error).message).toBe(detail);
  });

  it('lets the not-pending refusal through as a conflict carrying the server sentence', async () => {
    const detail = 'Only a pending reservation can be confirmed; LM7Q is Confirmed.';
    const fetchImpl = vi.fn().mockResolvedValue(problem(409, 'conflicting-state', detail));

    const caught = await gatewayOver(fetchImpl)
      .approveReservation({ reservationId: 'r-1' })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ConcurrencyConflictError);
    expect((caught as Error).message).toBe(detail);
  });

  it('lists the pending bookings of a branch from its reservations route', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(200, [
        {
          id: 'r-1',
          code: 'K7M2',
          branchId: 'b-1',
          guestName: 'Ani Petrosyan',
          guestPhone: '+37491000001',
          partySize: 10,
          tableLabel: 'T4',
          localDate: '2026-09-18',
          localStartTime: '19:30:00',
          status: 1,
          awaitingApprovalBecause: 2,
        },
      ]),
    );

    const bookings = await gatewayOver(fetchImpl).listPendingReservations('b-1');

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method ?? 'GET').toBe('GET');
    expect(url).toBe(`${BASE}/api/branches/b-1/reservations?status=1`);
    expect(bookings).toEqual([
      {
        id: 'r-1',
        code: 'K7M2',
        branchId: 'b-1',
        guestName: 'Ani Petrosyan',
        guestPhone: '+37491000001',
        partySize: 10,
        tableLabel: 'T4',
        localDate: '2026-09-18',
        localStartTime: '19:30:00',
        status: 'pendingApproval',
        awaitingApprovalBecause: 'largeParty',
      },
    ]);
  });
});
