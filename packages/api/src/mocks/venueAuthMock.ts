import type { VenueUserAuth } from '../auth/endpoints';
import { UnauthorizedError, ValidationError } from '../errors';
import { mockRegistry, mockTokenHash, type MockRegistry } from './mockRegistry';
import { ProblemCodes } from '../generated/problemCodes';

/**
 * `/api/auth/venue/*` without a server — only as much of it as a link in the
 * console mock needs.
 *
 * The console mock issues a sign-in link whose token it does not keep, as the
 * server keeps only a hash. Here its hash is kept in the shared registry, so the `/reset-password#token=` link the Staff screen shows can be
 * opened in the same browser and spent on a password (QA F15). Spent once,
 * expired after its day, unknown otherwise: the three 401s the reset page
 * already branches on.
 *
 * Signing in with that password is not here: in mock mode the dev role
 * switcher plays the signed-in user, and a mock that minted tokens for a form
 * would be a second way of pretending the same thing.
 */

const URL_TAG = 'mock://yalla/api/auth/venue';

/** `AuthOptions.MinimumPasswordLength` on the server: length is the only rule. */
const PASSWORD_MIN_LENGTH = 12;

export interface VenueAuthMockOptions {
  readonly registry?: MockRegistry | undefined;
  readonly now?: (() => Date) | undefined;
}

export function createMockVenueUserAuth(options: VenueAuthMockOptions = {}): VenueUserAuth {
  const registry = options.registry ?? mockRegistry;
  const now = options.now ?? (() => new Date());

  const noSession = () =>
    Promise.reject(new Error('The mock data source has no venue-user session.'));

  return {
    signIn: () => noSession(),
    refreshTokens: () => noSession(),
    signOut: () => noSession(),

    // The server answers 202 whether or not the address has an account.
    async requestPasswordReset(): Promise<void> {},

    async resetPassword(resetToken: string, newPassword: string): Promise<void> {
      const url = `${URL_TAG}/reset-password`;
      // Length first, as VenueUserAuthService.ResetPasswordAsync checks it
      // before it looks the token up. An ArgumentException on the server, so
      // its .NET message carries the parameter, and 400 invalid-request names
      // the field.
      if (newPassword.length < PASSWORD_MIN_LENGTH) {
        throw new ValidationError({
          url,
          status: 400,
          problem: {
            type: 'about:blank',
            title: 'Invalid request',
            status: 400,
            detail: `Password must be at least ${PASSWORD_MIN_LENGTH} characters. (Parameter 'newPassword')`,
            code: ProblemCodes.InvalidRequest,
            traceId: 'mock',
            context: { field: 'newPassword' },
          },
        });
      }
      const tokenHash = mockTokenHash(resetToken);
      const link = registry.signInLinks.get(tokenHash);
      if (!link || link.spentAtUtc !== null || Date.parse(link.expiresAtUtc) <= now().getTime()) {
        throw new UnauthorizedError({
          url,
          problem: {
            type: 'about:blank',
            title: 'Unauthorized',
            status: 401,
            detail: 'That reset link is not valid or has expired. Ask for a new one.',
            code: ProblemCodes.ResetTokenInvalid,
            traceId: 'mock',
          },
        });
      }
      registry.signInLinks.set(tokenHash, { ...link, spentAtUtc: now().toISOString() });
    },
  };
}
