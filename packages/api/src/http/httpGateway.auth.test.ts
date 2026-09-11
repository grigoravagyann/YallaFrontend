import { describe, expect, it } from 'vitest';
import { createMockGateway } from '../mocks/mockGateway';
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
    fallback: createMockGateway(),
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
