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

/**
 * Verifying through the Telegram bot, against the mock.
 *
 * The client never learns the number until the bot has: a challenge is
 * pending until the bot (here, the test helper) confirms it, and a confirmed
 * one signs the diner in exactly as a passed code does.
 */
describe('the mock Telegram verification', () => {
  it('stays pending until the bot confirms, then signs in with the confirmed number', async () => {
    const gateway = createMockGateway();
    const challenge = await gateway.startTelegramVerification({ localeCode: 'hy' });
    expect(challenge.deepLinkUrl).toBe(
      `https://t.me/yalla_mock_bot?start=${challenge.challengeId}`,
    );
    expect(challenge.pollAfterMs).toBeGreaterThan(0);

    await expect(gateway.claimTelegramVerification(challenge.challengeId)).resolves.toEqual({
      state: 'pending',
    });

    gateway.confirmTelegramVerification(challenge.challengeId, '+37477123456');

    const claimed = await gateway.claimTelegramVerification(challenge.challengeId, {
      localeCode: 'hy',
    });
    expect(claimed).toMatchObject({ state: 'verified', verified: { phoneE164: '+37477123456' } });
    // The account behind the number is verified, as the profile says.
    await expect(gateway.getDinerProfile()).resolves.toMatchObject({
      phoneE164: '+37477123456',
      phoneVerified: true,
      localeCode: 'hy',
    });
  });

  it('is expired once the code TTL has passed, and for a challenge it never issued', async () => {
    let clock = Date.parse('2026-10-15T10:00:00Z');
    const gateway = createMockGateway({ now: () => new Date(clock) });
    const challenge = await gateway.startTelegramVerification();
    expect(Date.parse(challenge.expiresAtUtc)).toBeGreaterThan(clock);

    clock = Date.parse(challenge.expiresAtUtc) + 1;
    const expired = await gateway
      .claimTelegramVerification(challenge.challengeId)
      .catch((error: unknown) => error as Error);
    expect((expired as Error).name).toBe('ExpiredCodeError');

    const unknown = await gateway
      .claimTelegramVerification('tg_never')
      .catch((error: unknown) => error as Error);
    expect((unknown as Error).name).toBe('ExpiredCodeError');
  });

  it('auto-confirms after two polls only when the dev UI asks it to', async () => {
    const gateway = createMockGateway({ simulateTelegramConfirm: true });
    const challenge = await gateway.startTelegramVerification();
    await expect(gateway.claimTelegramVerification(challenge.challengeId)).resolves.toEqual({
      state: 'pending',
    });
    await expect(gateway.claimTelegramVerification(challenge.challengeId)).resolves.toEqual({
      state: 'pending',
    });
    await expect(gateway.claimTelegramVerification(challenge.challengeId)).resolves.toMatchObject({
      state: 'verified',
    });

    const quiet = createMockGateway();
    const other = await quiet.startTelegramVerification();
    for (let poll = 0; poll < 5; poll += 1) {
      await expect(quiet.claimTelegramVerification(other.challengeId)).resolves.toEqual({
        state: 'pending',
      });
    }
  });
});
