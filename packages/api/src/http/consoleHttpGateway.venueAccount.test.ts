import { describe, expect, it, vi } from 'vitest';
import { createVenueUserAuth } from '../auth/endpoints';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { TooManyRequestsError, ValidationError } from '../errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';

/**
 * My account over HTTP (venue-console Account artboard), on the wire the
 * backend's agent decided for `feat/venue-console-1`: `GET`/`PATCH
 * /api/venue/me`, `POST /api/venue/me/password`, `GET /api/venue/me/sessions`
 * and `POST /api/venue/me/sessions/sign-out-others`. Owners, general managers
 * and branch managers signed in with a password; the PIN is the existing
 * staff route.
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
  return { gateway, backend, auth };
}

const ME = {
  staffMemberId: 's-owner',
  fullName: 'Aram Hakobyan',
  email: 'aram@cascade.am',
  role: 1,
  venueId: 'v-1',
  branchId: null,
};

describe('my account over HTTP', () => {
  it('reads who is signed in, with the role in the console vocabulary', async () => {
    const { gateway, backend } = gatewayOver({ 'GET /api/venue/me': { body: ME } });
    expect(await gateway.getVenueProfile()).toEqual({
      staffMemberId: 's-owner',
      fullName: 'Aram Hakobyan',
      email: 'aram@cascade.am',
      role: 'owner',
      venueId: 'v-1',
      branchId: null,
    });
    expect(backend.requests[0]?.method).toBe('GET');
  });

  it("reads a branch manager's home branch, and a general manager as one", async () => {
    const { gateway } = gatewayOver({
      'GET /api/venue/me': { body: { ...ME, role: 2, branchId: 'b-2' } },
    });
    expect(await gateway.getVenueProfile()).toMatchObject({ role: 'manager', branchId: 'b-2' });
    const gm = gatewayOver({ 'GET /api/venue/me': { body: { ...ME, role: 6 } } });
    expect((await gm.gateway.getVenueProfile()).role).toBe('generalManager');
  });

  it('renames with the name alone', async () => {
    const { gateway, backend } = gatewayOver({
      'PATCH /api/venue/me': { body: { ...ME, fullName: 'Aram H.' } },
    });
    expect((await gateway.updateVenueProfile({ fullName: 'Aram H.' })).fullName).toBe('Aram H.');
    expect(backend.requests[0]?.body).toEqual({ fullName: 'Aram H.' });
  });

  it('adopts the fresh pair a password change answers with, so this tab stays signed in', async () => {
    const { gateway, backend, auth } = gatewayOver({
      'POST /api/venue/me/password': {
        body: { accessToken: 'access-after', refreshToken: 'refresh-after', expiresInSeconds: 900 },
      },
    });
    const answer = await gateway.changeVenuePassword({
      currentPassword: 'old-password-0000',
      newPassword: 'new-password-0000',
    });
    expect(answer).toEqual({ sessionRenewed: true });
    expect(auth.peekAccessToken()).toBe('access-after');
    expect(backend.requests[0]?.body).toEqual({
      currentPassword: 'old-password-0000',
      newPassword: 'new-password-0000',
    });
  });

  it('answers a wrong current password as a form error naming the field', async () => {
    const { gateway } = gatewayOver({
      'POST /api/venue/me/password': {
        status: 422,
        body: {
          type: 'about:blank',
          title: 'Validation failed',
          status: 422,
          detail: 'The current password is wrong.',
          code: 'validation-failed',
          traceId: 't-1',
          context: {
            fields: [
              { field: 'currentPassword', message: 'Wrong.', bound: 'conflict' },
              { field: 'newPassword', message: 'Too short.', bound: 'min', min: 12 },
            ],
          },
        },
      },
    });
    const error = await gateway
      .changeVenuePassword({ currentPassword: 'nope', newPassword: 'short' })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).violations.map((v) => [v.field, v.bound])).toEqual([
      ['currentPassword', 'conflict'],
      ['newPassword', 'min'],
    ]);
  });

  it('says how long to wait after too many wrong current passwords', async () => {
    const { gateway } = gatewayOver({
      'POST /api/venue/me/password': {
        status: 429,
        headers: { 'retry-after': '540' },
        body: {
          type: 'about:blank',
          title: 'Too many attempts',
          status: 429,
          detail: 'Too many attempts.',
          code: 'too-many-attempts',
          traceId: 't-2',
          context: { retryAfterSeconds: 540 },
        },
      },
    });
    const error = await gateway
      .changeVenuePassword({ currentPassword: 'x', newPassword: 'a-long-enough-one' })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TooManyRequestsError);
    expect((error as TooManyRequestsError).retryAfterSeconds).toBe(540);
  });

  it('lists the sign-ins that can still renew, this one marked', async () => {
    const { gateway } = gatewayOver({
      'GET /api/venue/me/sessions': {
        body: {
          sessions: [
            {
              id: 'r-1',
              signedInAtUtc: '2026-10-19T08:00:00Z',
              lastActiveAtUtc: '2026-10-19T10:40:00Z',
              isCurrent: true,
            },
            {
              id: 'r-2',
              signedInAtUtc: '2026-10-14T17:02:00Z',
              lastActiveAtUtc: '2026-10-18T18:14:00Z',
              isCurrent: false,
            },
          ],
        },
      },
    });
    expect(await gateway.listVenueSessions()).toEqual([
      {
        id: 'r-1',
        signedInAtUtc: '2026-10-19T08:00:00Z',
        lastActiveAtUtc: '2026-10-19T10:40:00Z',
        isCurrent: true,
      },
      {
        id: 'r-2',
        signedInAtUtc: '2026-10-14T17:02:00Z',
        lastActiveAtUtc: '2026-10-18T18:14:00Z',
        isCurrent: false,
      },
    ]);
  });

  it('ends the other sign-ins, with no body, and says how many it ended', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/venue/me/sessions/sign-out-others': { body: { endedSessions: 2 } },
    });
    expect(await gateway.signOutOtherVenueSessions()).toEqual({ endedSessions: 2 });
    expect(backend.requests[0]?.method).toBe('POST');
    expect(backend.requests[0]?.body ?? null).toBeNull();
  });
});

describe('after signing out everywhere else', () => {
  /*
   * The server ends this browser's access token with the others' and keeps
   * its refresh token, answering no fresh pair on purpose. The next request is
   * refused `401 session-revoked`; the client refreshes once through
   * `/api/auth/venue/refresh` with the token it holds and retries, and the
   * person stays signed in.
   */
  it('renews this sign-in on the next request and carries on', async () => {
    let sessionsAsked = 0;
    const backend = fakeBackend({
      'POST /api/venue/me/sessions/sign-out-others': { body: { endedSessions: 2 } },
      'GET /api/venue/me/sessions': (request) => {
        sessionsAsked += 1;
        return request.headers.get('authorization') === 'Bearer access-1'
          ? problemReply(401, 'session-revoked')
          : {
              body: {
                sessions: [
                  {
                    id: 'r-1',
                    signedInAtUtc: '2026-10-19T08:00:00Z',
                    lastActiveAtUtc: '2026-10-19T10:40:00Z',
                    isCurrent: true,
                  },
                ],
              },
            };
      },
      'POST /api/auth/venue/refresh': (request) =>
        (request.body as { refreshToken?: string }).refreshToken === 'refresh-1'
          ? { body: { accessToken: 'access-2', refreshToken: 'refresh-2', expiresInSeconds: 900 } }
          : problemReply(401, 'refresh-token-revoked'),
    });
    const venueAuth = createVenueUserAuth(backend.client());
    const auth = createAuthSession({
      storage: createMemoryTokenStorage('refresh-1'),
      refreshTokens: venueAuth.refreshTokens,
    });
    await auth.signIn({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresInSeconds: 900,
    });
    const gateway = createConsoleHttpGateway(backend.client({ auth }), {
      auth,
      identity: createMemoryIdentityStore(),
    });

    expect(await gateway.signOutOtherVenueSessions()).toEqual({ endedSessions: 2 });
    const sessions = await gateway.listVenueSessions();

    expect(sessions.map((session) => session.isCurrent)).toEqual([true]);
    expect(sessionsAsked).toBe(2);
    expect(backend.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      'POST /api/venue/me/sessions/sign-out-others',
      'GET /api/venue/me/sessions',
      'POST /api/auth/venue/refresh',
      'GET /api/venue/me/sessions',
    ]);
    expect(auth.getState()).toBe('signedIn');
    expect(auth.peekAccessToken()).toBe('access-2');
  });
});
