import type {
  PhoneChallenge,
  PhoneProofChannels,
  TelegramChallenge,
  TelegramClaimResult,
  VerifiedPhone,
} from '../../contracts/booking';
import {
  ExpiredCodeError,
  RateLimitedError,
  SmsUnavailableError,
  TelegramUnavailableError,
  TooManyAttemptsError,
  WrongCodeError,
} from '../../contracts/errors';
import {
  ApiError,
  NotFoundError,
  SessionRevokedError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../errors';
import type { YallaGateway } from '../../gateway';
import { ProblemCodes } from '../../generated/problemCodes';
import type { DinerHttpContext } from './context';

/** Resend is allowed once the backend's code-request window has passed. */
const RESEND_AFTER_MS = 60_000;

export function phoneProofMethods(
  ctx: DinerHttpContext,
): Pick<
  YallaGateway,
  | 'getPhoneProofChannels'
  | 'requestPhoneCode'
  | 'verifyPhoneCode'
  | 'startTelegramVerification'
  | 'claimTelegramVerification'
> {
  const { auth, dinerAuth, readProfile, signedIn } = ctx;
  /**
   * A 429 on any of the sign-in doors, as the screens' refusal.
   *
   * Only a time the server gave. The per-number window is an hour and sends no
   * Retry-After; the per-address one sends it.
   */
  function rateLimited(error: TooManyRequestsError): RateLimitedError {
    return new RateLimitedError({
      url: error.url,
      retryAtUtc:
        error.retryAfterSeconds !== null
          ? new Date(Date.now() + error.retryAfterSeconds * 1000).toISOString()
          : null,
    });
  }

  return {
    // --- Phone verification: the diner sign-in ---------------------------------

    async getPhoneProofChannels(): Promise<PhoneProofChannels> {
      const channels = await dinerAuth.phoneProofChannels();
      return { sms: channels.sms, telegram: channels.telegram };
    },

    async requestPhoneCode(phoneE164, options): Promise<PhoneChallenge> {
      try {
        // The diner's language, so the SMS arrives in it rather than in the
        // server's default.
        const result = await dinerAuth.requestCode({
          phoneE164,
          ...(options?.localeCode ? { localeCode: options.localeCode } : {}),
        });
        const now = Date.now();
        return {
          // The backend keys the challenge on the number itself.
          challengeId: phoneE164,
          phoneE164,
          expiresAtUtc: new Date(now + result.expiresInSeconds * 1000).toISOString(),
          resendAvailableAtUtc: new Date(now + RESEND_AFTER_MS).toISOString(),
          maxAttempts: result.maxAttempts,
          devCode: result.developmentCode ?? undefined,
        };
      } catch (error) {
        if (error instanceof TooManyRequestsError) throw rateLimited(error);
        // No SMS provider on this backend. Only this code: any other 503 is an
        // outage, and telling the diner to use Telegram for it would be a guess.
        if (
          error instanceof ApiError &&
          error.status === 503 &&
          error.code === ProblemCodes.SmsUnavailable
        ) {
          throw new SmsUnavailableError({ url: error.url, requestId: error.requestId });
        }
        throw error;
      }
    },

    async verifyPhoneCode({ challengeId, code, localeCode }): Promise<VerifiedPhone> {
      try {
        // The session's token when there is one, so an account verifying its
        // own number keeps its password; an unreadable session is anonymous.
        const bearer = (await auth?.getAccessToken().catch(() => null)) ?? null;
        const result = await signedIn(
          await dinerAuth.verifyCode(
            {
              phoneE164: challengeId,
              code,
              ...(localeCode ? { localeCode } : {}),
            },
            bearer,
          ),
        );
        return {
          // The bearer token is the proof now; screens keep treating this as an
          // opaque token and the gateway supplies it from the session.
          verificationToken: result.accessToken,
          phoneE164: challengeId,
        };
      } catch (error) {
        // A revoked session is not a wrong code: the caller's own token was
        // refused, and the screen signs out rather than asking for digits again.
        if (error instanceof SessionRevokedError) throw error;
        // 401 covers both "wrong" and "expired"; the code slug tells them apart.
        if (error instanceof UnauthorizedError) {
          if (error.code?.includes('expired')) throw new ExpiredCodeError({ url: error.url });
          // What the server said is left, and nothing when it said nothing:
          // defaulting to 0 read "0 attempts left" after the first slip.
          const remaining = error.problem?.context?.['attemptsRemaining'];
          throw new WrongCodeError({
            url: error.url,
            attemptsRemaining: typeof remaining === 'number' ? remaining : null,
          });
        }
        if (error instanceof TooManyRequestsError)
          throw new TooManyAttemptsError({ url: error.url });
        throw error;
      }
    },

    // --- Telegram verification: the other diner sign-in ---------------------------

    async startTelegramVerification(options): Promise<TelegramChallenge> {
      try {
        const bearer = (await auth?.getAccessToken().catch(() => null)) ?? null;
        const result = await dinerAuth.telegramStart(
          options?.localeCode ? { localeCode: options.localeCode } : {},
          bearer,
        );
        return {
          challengeId: result.challengeId,
          deepLinkUrl: result.deepLinkUrl,
          expiresAtUtc: new Date(Date.now() + result.expiresInSeconds * 1000).toISOString(),
          pollAfterMs: result.pollAfterMs,
        };
      } catch (error) {
        // A backend with Telegram switched off serves no such route at all.
        if (error instanceof NotFoundError) throw new TelegramUnavailableError({ url: error.url });
        if (error instanceof TooManyRequestsError) throw rateLimited(error);
        throw error;
      }
    },

    async claimTelegramVerification(challengeId, options): Promise<TelegramClaimResult> {
      try {
        const bearer = (await auth?.getAccessToken().catch(() => null)) ?? null;
        const answer = await dinerAuth.telegramClaim(
          challengeId,
          options?.localeCode ? { localeCode: options.localeCode } : {},
          bearer,
        );
        // `state` is a string on the wire and `signIn` is set only on
        // `verified`: anything short of both is still pending.
        if (answer.state !== 'verified' || !answer.signIn) return { state: 'pending' };
        // The same session start as a passed code.
        const result = await signedIn(answer.signIn);
        // The number the bot confirmed: from the answer when it says, else from
        // the profile the new session can now read.
        const phoneE164 = answer.phoneE164 || (await readProfile()).phoneE164;
        return {
          state: 'verified',
          verified: { verificationToken: result.accessToken, phoneE164 },
        };
      } catch (error) {
        if (error instanceof SessionRevokedError) throw error;
        if (error instanceof TooManyRequestsError) throw rateLimited(error);
        // 410 `telegram-verification-expired`: the challenge aged out, or was
        // never this backend's. The same refusal as an expired code.
        if (error instanceof ApiError && error.status === 410)
          throw new ExpiredCodeError({ url: error.url });
        throw error;
      }
    },
  };
}
