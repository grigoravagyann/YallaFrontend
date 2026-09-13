import { describe, expect, it } from 'vitest';
import { SEEDED_ACCOUNT } from './accounts';
import { createMockGateway } from './mockGateway';

/**
 * As the server: an anonymous verification of a registered, unverified number
 * clears that account's password (a squatter cannot keep it); the account
 * verifying its own number while signed in keeps it.
 */

const FORM = {
  username: 'ani',
  email: 'ani@example.com',
  password: 'correct horse',
  phoneE164: '+37499000011',
  displayName: 'Ani',
};

describe('verifying a registered number', () => {
  it('keeps the password when the signed-in account verifies its own number', async () => {
    const gateway = createMockGateway();
    await gateway.registerDiner(FORM);
    const challenge = await gateway.requestPhoneCode(FORM.phoneE164);
    await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: '123456' });

    await expect(gateway.getDinerProfile()).resolves.toMatchObject({
      phoneVerified: true,
      hasPassword: true,
    });
  });

  it('clears the password when the number is verified anonymously', async () => {
    // A fresh mock has no session; the seeded account is unverified with a password.
    const gateway = createMockGateway();
    const challenge = await gateway.requestPhoneCode(SEEDED_ACCOUNT.phoneE164);
    await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: '123456' });

    await expect(gateway.getDinerProfile()).resolves.toMatchObject({
      username: SEEDED_ACCOUNT.username,
      phoneVerified: true,
      hasPassword: false,
    });
  });
});
