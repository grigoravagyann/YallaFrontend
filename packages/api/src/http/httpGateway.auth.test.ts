import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createHttpGateway } from './httpGateway';

/**
 * Phone verification over HTTP: the counts, the waits and the language.
 *
 * Every wrong code used to read "0 attempts left", because the server sent no
 * count and the gateway defaulted the missing one to zero; every 429 named a
 * time one minute out, whatever the server's window was; and neither call said
 * which language the diner reads, so the SMS came in the server's default.
 */

function gatewayOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  const gateway = createHttpGateway(backend.client(), {
    audience: 'diner',
  });
  return { gateway, backend };
}

async function caught(promise: Promise<unknown>): Promise<Error & Record<string, unknown>> {
  try {
    await promise;
  } catch (error) {
    return error as Error & Record<string, unknown>;
  }
  throw new Error('expected a rejection');
}

const ISSUED = { expiresInSeconds: 300, maxAttempts: 5, developmentCode: '123456' };

describe('asking for a code', () => {
  it("sends the diner's language, so the SMS arrives in it", async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/auth/diner/request-code': { body: ISSUED },
    });

    await gateway.requestPhoneCode('+37477123456', { localeCode: 'ru' });

    expect(backend.requests[0]?.body).toEqual({ phoneE164: '+37477123456', localeCode: 'ru' });
  });

  it("carries the server's attempt limit on the challenge", async () => {
    const { gateway } = gatewayOver({ 'POST /api/auth/diner/request-code': { body: ISSUED } });
    await expect(gateway.requestPhoneCode('+37477123456')).resolves.toMatchObject({
      maxAttempts: 5,
    });
  });

  it('waits as long as Retry-After says, not a minute', async () => {
    const { gateway } = gatewayOver({
      'POST /api/auth/diner/request-code': {
        ...problemReply(429, 'rate-limited'),
        headers: { 'retry-after': '120' },
      },
    });

    const error = await caught(gateway.requestPhoneCode('+37477123456'));

    expect(error.name).toBe('RateLimitedError');
    const waitMs = Date.parse(String(error['retryAtUtc'])) - Date.now();
    expect(waitMs).toBeGreaterThan(110_000);
    expect(waitMs).toBeLessThan(125_000);
  });

  it('names no time at all when the server gave none', async () => {
    const { gateway } = gatewayOver({
      'POST /api/auth/diner/request-code': problemReply(429, 'too-many-attempts'),
    });

    const error = await caught(gateway.requestPhoneCode('+37477123456'));

    expect(error.name).toBe('RateLimitedError');
    expect(error['retryAtUtc']).toBeNull();
  });
});

describe('entering the code', () => {
  it('reports the attempts the server says are left', async () => {
    const { gateway } = gatewayOver({
      'POST /api/auth/diner/verify-code': problemReply(401, 'verification-code-invalid', {
        attemptsRemaining: 4,
      }),
    });

    const error = await caught(
      gateway.verifyPhoneCode({ challengeId: '+37477123456', code: '000000' }),
    );

    expect(error.name).toBe('WrongCodeError');
    expect(error['attemptsRemaining']).toBe(4);
  });

  it('never invents a count the server did not send', async () => {
    const { gateway } = gatewayOver({
      'POST /api/auth/diner/verify-code': problemReply(401, 'verification-code-invalid'),
    });

    const error = await caught(
      gateway.verifyPhoneCode({ challengeId: '+37477123456', code: '000000' }),
    );

    expect(error['attemptsRemaining']).toBeNull();
  });

  it("sends the diner's language with the code, so the account keeps it", async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/auth/diner/verify-code': {
        body: {
          accessToken: 'a',
          refreshToken: 'r',
          expiresInSeconds: 900,
          dinerUserId: 'd',
          isNewAccount: false,
        },
      },
    });

    await gateway.verifyPhoneCode({
      challengeId: '+37477123456',
      code: '123456',
      localeCode: 'en',
    });

    expect(backend.requests[0]?.body).toEqual({
      phoneE164: '+37477123456',
      code: '123456',
      localeCode: 'en',
    });
  });
});

/**
 * Verifying through the Telegram bot over HTTP.
 *
 * Start answers a deep link and a cadence; claim is polled until the bot has
 * confirmed, at which point the answer is the same sign-in the code exchange
 * returns and lands in the same session.
 */
function gatewayWithSession(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  const auth = createAuthSession({
    storage: createMemoryTokenStorage(),
    refreshTokens: vi.fn(),
  });
  const gateway = createHttpGateway(backend.client({ auth }), { audience: 'diner', auth });
  return { gateway, backend, auth };
}

const TELEGRAM_STARTED = {
  challengeId: '6f1c1b8e-0d4b-4a0c-9d2a-1f8f2d1d9a11',
  deepLinkUrl: 'https://t.me/yalla_bot?start=n0nce',
  expiresInSeconds: 300,
  pollAfterMs: 2000,
};

describe('starting Telegram verification', () => {
  it("sends the diner's language and reads the link, the expiry and the cadence", async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/auth/diner/telegram/start': { body: TELEGRAM_STARTED },
    });
    const before = Date.now();

    const challenge = await gateway.startTelegramVerification({ localeCode: 'ru' });

    expect(backend.requests[0]?.body).toEqual({ localeCode: 'ru' });
    expect(challenge).toMatchObject({
      challengeId: TELEGRAM_STARTED.challengeId,
      deepLinkUrl: TELEGRAM_STARTED.deepLinkUrl,
      pollAfterMs: 2000,
    });
    expect(Date.parse(challenge.expiresAtUtc) - before).toBeGreaterThanOrEqual(300_000);
  });

  it('says Telegram is unavailable when the backend has no such route', async () => {
    const { gateway } = gatewayOver({});
    const error = await caught(gateway.startTelegramVerification());
    expect(error.name).toBe('TelegramUnavailableError');
  });

  it('maps a 429 to the same rate-limit refusal as a code request', async () => {
    const { gateway } = gatewayOver({
      'POST /api/auth/diner/telegram/start': {
        ...problemReply(429, 'rate-limited'),
        headers: { 'retry-after': '60' },
      },
    });
    const error = await caught(gateway.startTelegramVerification());
    expect(error.name).toBe('RateLimitedError');
    expect(error['retryAtUtc']).not.toBeNull();
  });
});

describe('claiming Telegram verification', () => {
  const CLAIM = `POST /api/auth/diner/telegram/${TELEGRAM_STARTED.challengeId}/claim`;

  it('is pending while the bot has not confirmed', async () => {
    const { gateway, backend } = gatewayOver({ [CLAIM]: { body: { state: 'pending' } } });

    await expect(
      gateway.claimTelegramVerification(TELEGRAM_STARTED.challengeId, { localeCode: 'hy' }),
    ).resolves.toEqual({ state: 'pending' });
    expect(backend.requests[0]?.body).toEqual({ localeCode: 'hy' });
  });

  it('signs the session in from a verified answer and reads the number from it', async () => {
    const { gateway, backend, auth } = gatewayWithSession({
      [CLAIM]: {
        body: {
          state: 'verified',
          phoneE164: '+37477123456',
          signIn: {
            accessToken: 'access-tg',
            refreshToken: 'refresh-tg',
            expiresInSeconds: 900,
            dinerUserId: 'diner-tg',
            isNewAccount: true,
          },
        },
      },
    });

    const claimed = await gateway.claimTelegramVerification(TELEGRAM_STARTED.challengeId);

    expect(claimed).toEqual({
      state: 'verified',
      verified: { verificationToken: 'access-tg', phoneE164: '+37477123456' },
    });
    expect(auth.getState()).toBe('signedIn');
    // Only the claim went out: no profile read was needed for the number.
    expect(backend.requests.map((request) => request.path)).toEqual([
      `/api/auth/diner/telegram/${TELEGRAM_STARTED.challengeId}/claim`,
    ]);
  });

  it('reads the number from the profile when the answer carries none', async () => {
    const { gateway } = gatewayWithSession({
      [CLAIM]: {
        body: {
          state: 'verified',
          signIn: {
            accessToken: 'access-tg',
            refreshToken: 'refresh-tg',
            expiresInSeconds: 900,
            dinerUserId: 'diner-tg',
            isNewAccount: false,
          },
        },
      },
      'GET /api/diner/me': {
        body: {
          dinerUserId: 'diner-tg',
          username: null,
          email: null,
          phoneE164: '+37499000111',
          phoneVerified: true,
          displayName: null,
          localeCode: 'en',
          hasPassword: false,
          photo: null,
        },
      },
    });

    await expect(
      gateway.claimTelegramVerification(TELEGRAM_STARTED.challengeId),
    ).resolves.toMatchObject({ state: 'verified', verified: { phoneE164: '+37499000111' } });
  });

  it('reads a 410 as the challenge having expired', async () => {
    const { gateway } = gatewayOver({
      [CLAIM]: problemReply(410, 'telegram-verification-expired'),
    });
    const error = await caught(gateway.claimTelegramVerification(TELEGRAM_STARTED.challengeId));
    expect(error.name).toBe('ExpiredCodeError');
  });

  it('maps a 429 on claim to the rate-limit refusal', async () => {
    const { gateway } = gatewayOver({ [CLAIM]: problemReply(429, 'rate-limited') });
    const error = await caught(gateway.claimTelegramVerification(TELEGRAM_STARTED.challengeId));
    expect(error.name).toBe('RateLimitedError');
  });
});
