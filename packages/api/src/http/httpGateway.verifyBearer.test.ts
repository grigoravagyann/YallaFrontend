import { describe, expect, it } from 'vitest';
import type { AuthSession } from '../auth/session';
import { fakeBackend } from './fakeBackend.testkit';
import { createHttpGateway } from './httpGateway';

/**
 * verify-code carries the diner's bearer token when there is a session: the
 * server keeps a registrant's password only when its own account verifies.
 */

const SIGNED_IN = {
  accessToken: 'a',
  refreshToken: 'r',
  expiresInSeconds: 900,
  dinerUserId: 'd',
  isNewAccount: false,
};

function sessionWith(token: string | null): AuthSession {
  return {
    getAccessToken: () => Promise.resolve(token),
    signIn: () => Promise.resolve(),
  } as unknown as AuthSession;
}

async function verifyWith(token: string | null) {
  const backend = fakeBackend({ 'POST /api/auth/diner/verify-code': { body: SIGNED_IN } });
  const gateway = createHttpGateway(backend.client(), {
    audience: 'diner',
    auth: sessionWith(token),
  });
  await gateway.verifyPhoneCode({ challengeId: '+37477123456', code: '123456' });
  return backend.requests[0]?.headers.get('authorization') ?? null;
}

describe('verifying a code', () => {
  it("sends the session's bearer token when signed in", async () => {
    expect(await verifyWith('at_signed_in')).toBe('Bearer at_signed_in');
  });

  it('sends none when nobody is signed in', async () => {
    expect(await verifyWith(null)).toBeNull();
  });
});
