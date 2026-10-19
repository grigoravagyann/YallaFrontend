import { describe, expect, it } from 'vitest';
import {
  InvalidCredentialsError,
  SmsUnavailableError,
  TelegramUnavailableError,
} from '../contracts/errors';
import { SessionRevokedError, ValidationError } from '../errors';
import { SEEDED_ACCOUNT_ANI } from './accounts';
import { createMockGateway } from './mockGateway';

/**
 * Telegram as the only way to prove a number (decided 2026-10-20), in the mock.
 *
 * The server says which channels are on at `GET /api/auth/diner/phone-proof`;
 * with no SMS provider `request-code` answers 503 `sms-unavailable` rather than
 * accepting a request it cannot deliver, and an account with no password
 * deletes itself on the strength of a Telegram sign-in from the last ten
 * minutes — the token's `phone_proved_at` — with nothing in the body.
 */

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

function clocked(channels?: { sms?: boolean; telegram?: boolean }) {
  let at = Date.parse('2026-10-20T12:00:00Z');
  const gateway = createMockGateway({
    now: () => new Date(at),
    ...(channels ? { phoneProofChannels: channels } : {}),
  });
  return {
    gateway,
    advance: (ms: number) => {
      at += ms;
    },
  };
}

/** Prove `phone` through the bot, as the diner app does: start, the bot confirms, claim. */
async function proveByTelegram(gateway: ReturnType<typeof createMockGateway>, phone: string) {
  const challenge = await gateway.startTelegramVerification({ localeCode: 'en' });
  gateway.confirmTelegramVerification(challenge.challengeId, phone);
  await expect(gateway.claimTelegramVerification(challenge.challengeId)).resolves.toMatchObject({
    state: 'verified',
  });
}

describe('which ways of proving a phone are on', () => {
  it('says both by default, so mock mode walks either door', async () => {
    const { gateway } = clocked();
    await expect(gateway.getPhoneProofChannels()).resolves.toEqual({ sms: true, telegram: true });
  });

  it('says what the options switched off, and the switched-off door refuses', async () => {
    const { gateway } = clocked({ sms: false });
    await expect(gateway.getPhoneProofChannels()).resolves.toEqual({ sms: false, telegram: true });
    expect(await caught(gateway.requestPhoneCode('+37499000201'))).toBeInstanceOf(
      SmsUnavailableError,
    );

    const neither = clocked({ sms: false, telegram: false }).gateway;
    expect(await caught(neither.startTelegramVerification())).toBeInstanceOf(
      TelegramUnavailableError,
    );
  });
});

describe('deleting an account with no password on a fresh phone proof', () => {
  it('needs nothing in the body within ten minutes of a Telegram sign-in', async () => {
    const { gateway, advance } = clocked({ sms: false });
    await proveByTelegram(gateway, '+37499000202');

    advance(10 * 60_000);
    await gateway.deleteDinerAccount({});

    expect(await caught(gateway.getDinerProfile())).toBeInstanceOf(SessionRevokedError);
  });

  it('asks for the code by name once the ten minutes are up', async () => {
    const { gateway, advance } = clocked({ sms: false });
    await proveByTelegram(gateway, '+37499000203');

    advance(10 * 60_000 + 1_000);
    const refusal = await caught(gateway.deleteDinerAccount({}));

    expect(refusal).toBeInstanceOf(ValidationError);
    expect((refusal as ValidationError).field).toBe('code');
    await expect(gateway.getDinerProfile()).resolves.toMatchObject({ phoneE164: '+37499000203' });
  });

  it('never stands in for a password: an account that has one still sends it', async () => {
    const { gateway } = clocked({ sms: false });
    await proveByTelegram(gateway, SEEDED_ACCOUNT_ANI.phoneE164);

    const refusal = await caught(gateway.deleteDinerAccount({}));
    expect(refusal).toBeInstanceOf(ValidationError);
    expect((refusal as ValidationError).field).toBe('password');
    expect(await caught(gateway.deleteDinerAccount({ password: 'not it' }))).toBeInstanceOf(
      InvalidCredentialsError,
    );
  });
});
