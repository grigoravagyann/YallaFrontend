import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import { SEEDED_ACCOUNT_ANI } from './accounts';
import { createMockGateway } from './mockGateway';

/**
 * A new password without the old one, after proving the phone — the server's
 * `DinerProfileService.SetPasswordAsync`: a code or Telegram sign-in stamps
 * its access token with `phone_proved_at`, and for ten minutes after that
 * instant `currentPassword` may be left out. Past that, or from a password
 * sign-in, leaving it out is 422 `validation-failed` on `currentPassword`. A
 * wrong one sent is still 401 `invalid-credentials`.
 *
 * The mock has no token, so the proof is the signed-in session's and the
 * window runs on the mock clock. Ani is the seeded account with a password
 * and a verified number, so proving it anonymously keeps that password.
 */

const NEEDED = 'Enter your current password, or sign in again with a code to set a new one.';

async function caught(promise: Promise<unknown>): Promise<Error & Record<string, unknown>> {
  try {
    await promise;
  } catch (error) {
    return error as Error & Record<string, unknown>;
  }
  throw new Error('expected a rejection');
}

function clocked() {
  let at = Date.parse('2026-10-16T12:00:00Z');
  const gateway = createMockGateway({ now: () => new Date(at) });
  return {
    gateway,
    advance: (ms: number) => {
      at += ms;
    },
  };
}

async function proveByCode(gateway: ReturnType<typeof createMockGateway>, phone: string) {
  const challenge = await gateway.requestPhoneCode(phone);
  await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: '123456' });
}

function expectNeeded(error: Error & Record<string, unknown>) {
  expect(error).toBeInstanceOf(ValidationError);
  const refusal = error as unknown as ValidationError;
  expect(refusal.status).toBe(422);
  expect(refusal.code).toBe('validation-failed');
  expect(refusal.field).toBe('currentPassword');
  expect(refusal.message).toBe(NEEDED);
}

describe('a new password after a code sign-in', () => {
  it('needs no current password for ten minutes, and the new one signs in', async () => {
    const { gateway, advance } = clocked();
    await proveByCode(gateway, SEEDED_ACCOUNT_ANI.phoneE164);

    advance(10 * 60_000);
    await gateway.setDinerPassword({ newPassword: 'a fresh start' });

    await expect(
      gateway.loginDiner({ identifier: SEEDED_ACCOUNT_ANI.username, password: 'a fresh start' }),
    ).resolves.toBeTruthy();
  });

  it('needs it again once the ten minutes are up, with the field and the sentence', async () => {
    const { gateway, advance } = clocked();
    await proveByCode(gateway, SEEDED_ACCOUNT_ANI.phoneE164);

    advance(10 * 60_000 + 1_000);
    expectNeeded(await caught(gateway.setDinerPassword({ newPassword: 'a fresh start' })));
    // An empty one is no current password either.
    expectNeeded(
      await caught(gateway.setDinerPassword({ currentPassword: '', newPassword: 'a fresh start' })),
    );
  });

  it('still refuses a wrong current password sent inside the window', async () => {
    const { gateway } = clocked();
    await proveByCode(gateway, SEEDED_ACCOUNT_ANI.phoneE164);

    const wrong = await caught(
      gateway.setDinerPassword({ currentPassword: 'not it at all', newPassword: 'a fresh start' }),
    );
    expect(wrong.name).toBe('InvalidCredentialsError');
  });
});

describe('a new password after a Telegram sign-in', () => {
  it('needs no current password either', async () => {
    const { gateway } = clocked();
    const challenge = await gateway.startTelegramVerification({ localeCode: 'en' });
    gateway.confirmTelegramVerification(challenge.challengeId, SEEDED_ACCOUNT_ANI.phoneE164);
    await expect(gateway.claimTelegramVerification(challenge.challengeId)).resolves.toMatchObject({
      state: 'verified',
    });

    await gateway.setDinerPassword({ newPassword: 'a fresh start' });
  });
});

describe('a new password after a password sign-in', () => {
  it('needs the current one: a password proves nothing about the phone', async () => {
    const { gateway } = clocked();
    await proveByCode(gateway, SEEDED_ACCOUNT_ANI.phoneE164);
    // A new session, by password: the earlier proof was the earlier session's.
    await gateway.loginDiner({
      identifier: SEEDED_ACCOUNT_ANI.username,
      password: SEEDED_ACCOUNT_ANI.password,
    });

    expectNeeded(await caught(gateway.setDinerPassword({ newPassword: 'a fresh start' })));
    await gateway.setDinerPassword({
      currentPassword: SEEDED_ACCOUNT_ANI.password,
      newPassword: 'a fresh start',
    });
  });
});
