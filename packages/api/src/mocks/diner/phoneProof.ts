import {
  SmsUnavailableError,
  RateLimitedError,
  TelegramUnavailableError,
  ExpiredCodeError,
  TooManyAttemptsError,
  WrongCodeError,
} from '../../contracts/errors';
import type {
  PhoneChallenge,
  TelegramChallenge,
  TelegramClaimResult,
  VerifiedPhone,
} from '../../contracts/booking';
import {
  type DinerMockContext,
  type Challenge,
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  MAX_CODES_PER_NUMBER,
  MOCK_CODE,
  MOCK_TELEGRAM_BOT,
  MOCK_TELEGRAM_PHONE,
  RESEND_AFTER_MS,
  TELEGRAM_AUTO_CONFIRM_AFTER_POLLS,
  TELEGRAM_POLL_MS,
  URL_TAG,
  type MockGateway,
} from './context';

/** Proving a phone: SMS codes and the Telegram bot. */
export function phoneProofMethods(
  ctx: DinerMockContext,
): Pick<
  MockGateway,
  | 'getPhoneProofChannels'
  | 'requestPhoneCode'
  | 'startTelegramVerification'
  | 'claimTelegramVerification'
  | 'confirmTelegramVerification'
  | 'verifyPhoneCode'
> {
  const {
    accounts,
    challenges,
    codesPerNumber,
    now,
    options_,
    proofChannels,
    signIn,
    telegramChallenges,
    wait,
  } = ctx;
  return {
    async getPhoneProofChannels() {
      await wait();
      return { ...proofChannels };
    },

    async requestPhoneCode(phoneE164, _options) {
      await wait();
      if (!proofChannels.sms) {
        throw new SmsUnavailableError({ url: `${URL_TAG}/api/auth/diner/request-code` });
      }
      const stamps = (codesPerNumber.get(phoneE164) ?? []).filter(
        (t) => now().getTime() - t < 60 * 60_000,
      );
      if (stamps.length >= MAX_CODES_PER_NUMBER) {
        throw new RateLimitedError({
          url: URL_TAG,
          retryAtUtc: new Date((stamps[0] ?? now().getTime()) + 60 * 60_000).toISOString(),
        });
      }
      stamps.push(now().getTime());
      codesPerNumber.set(phoneE164, stamps);

      const id = `ch_${ctx.sequence++}`;
      const challenge: Challenge = {
        id,
        phoneE164,
        code: MOCK_CODE,
        expiresAt: now().getTime() + CODE_TTL_MS,
        resendAt: now().getTime() + RESEND_AFTER_MS,
        attempts: 0,
        burned: false,
      };
      challenges.set(id, challenge);

      return {
        challengeId: id,
        phoneE164,
        expiresAtUtc: new Date(challenge.expiresAt).toISOString(),
        resendAvailableAtUtc: new Date(challenge.resendAt).toISOString(),
        maxAttempts: MAX_CODE_ATTEMPTS,
        // Mirrors the real backend outside production. The UI additionally
        // gates rendering on __DEV__.
        devCode: MOCK_CODE,
      } satisfies PhoneChallenge;
    },

    async startTelegramVerification(options) {
      await wait();
      if (!proofChannels.telegram) {
        throw new TelegramUnavailableError({ url: `${URL_TAG}/api/auth/diner/telegram/start` });
      }
      const id = `tg_${ctx.sequence++}`;
      const expiresAt = now().getTime() + CODE_TTL_MS;
      telegramChallenges.set(id, { expiresAt, polls: 0, phoneE164: null });
      void options;
      return {
        challengeId: id,
        deepLinkUrl: `https://t.me/${MOCK_TELEGRAM_BOT}?start=${id}`,
        expiresAtUtc: new Date(expiresAt).toISOString(),
        pollAfterMs: TELEGRAM_POLL_MS,
      } satisfies TelegramChallenge;
    },

    async claimTelegramVerification(challengeId, options) {
      await wait();
      const pending = telegramChallenges.get(challengeId);
      // Unknown and aged out are the same answer: the server has nothing to
      // claim, and the screen offers a fresh start either way.
      if (!pending || now().getTime() > pending.expiresAt) {
        telegramChallenges.delete(challengeId);
        throw new ExpiredCodeError({ url: URL_TAG });
      }
      pending.polls += 1;
      if (
        pending.phoneE164 === null &&
        options_.simulateTelegramConfirm &&
        pending.polls > TELEGRAM_AUTO_CONFIRM_AFTER_POLLS
      ) {
        pending.phoneE164 = MOCK_TELEGRAM_PHONE;
      }
      if (pending.phoneE164 === null) return { state: 'pending' } satisfies TelegramClaimResult;

      telegramChallenges.delete(challengeId);
      // As a passed code: the account behind the number is verified and
      // signed in, or made.
      const { accountId, isNewAccount } = accounts.verifyPhone(
        pending.phoneE164,
        options?.localeCode,
        ctx.signedInAccountId,
      );
      signIn(accountId, isNewAccount);
      ctx.sessionPhoneProvedAt = now().getTime();
      return {
        state: 'verified',
        verified: {
          verificationToken: `vt_${pending.phoneE164}_${ctx.sequence++}`,
          phoneE164: pending.phoneE164,
        },
      } satisfies TelegramClaimResult;
    },

    confirmTelegramVerification(challengeId, phoneE164) {
      const pending = telegramChallenges.get(challengeId);
      if (pending && now().getTime() <= pending.expiresAt) pending.phoneE164 = phoneE164;
    },

    async verifyPhoneCode({ challengeId, code, localeCode }) {
      await wait();
      const challenge = challenges.get(challengeId);
      if (!challenge) throw new ExpiredCodeError({ url: URL_TAG });
      if (challenge.burned) throw new TooManyAttemptsError({ url: URL_TAG });
      if (now().getTime() > challenge.expiresAt) throw new ExpiredCodeError({ url: URL_TAG });

      if (code !== challenge.code) {
        challenge.attempts += 1;
        // As the server does: the count goes down on each wrong try, the last
        // one reports zero, and after that the code answers "too many".
        const remaining = Math.max(0, MAX_CODE_ATTEMPTS - challenge.attempts);
        if (remaining === 0) challenge.burned = true;
        throw new WrongCodeError({ url: URL_TAG, attemptsRemaining: remaining });
      }

      challenges.delete(challengeId);
      // As the server does since accounts: a registered number is marked
      // verified and that account signed in; an unknown one gets an account.
      const { accountId, isNewAccount } = accounts.verifyPhone(
        challenge.phoneE164,
        localeCode,
        ctx.signedInAccountId,
      );
      signIn(accountId, isNewAccount);
      ctx.sessionPhoneProvedAt = now().getTime();
      return {
        verificationToken: `vt_${challenge.phoneE164}_${ctx.sequence++}`,
        phoneE164: challenge.phoneE164,
      } satisfies VerifiedPhone;
    },
  };
}
