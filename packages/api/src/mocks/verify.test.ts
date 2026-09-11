import { describe, expect, it } from 'vitest';
import { createMockGateway } from './mockGateway';

/**
 * The mock's code rules, matched to the server's.
 *
 * It allowed three wrong tries where the backend allows five, so a flow built
 * against it burned the code two tries early.
 */
describe('the mock one-time code', () => {
  it('allows five tries, like the server, counting down on each wrong one', async () => {
    const gateway = createMockGateway();
    const challenge = await gateway.requestPhoneCode('+37477123456');
    expect(challenge.maxAttempts).toBe(5);

    const remaining: unknown[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const error = await gateway
        .verifyPhoneCode({ challengeId: challenge.challengeId, code: '000000' })
        .catch((caught: unknown) => caught as { attemptsRemaining?: unknown });
      remaining.push((error as { attemptsRemaining?: unknown }).attemptsRemaining);
    }

    expect(remaining).toEqual([4, 3, 2, 1]);
    // The fifth try is still a try: the right code goes through.
    await expect(
      gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: '123456' }),
    ).resolves.toMatchObject({ phoneE164: '+37477123456' });
  });
});
