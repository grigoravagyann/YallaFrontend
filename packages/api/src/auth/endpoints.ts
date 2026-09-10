import type { ApiClient } from '../client';
import type { UserRole } from '../contracts/console';
import type { components } from '../generated/schema';
import type { TokenPair } from './session';

type Schemas = components['schemas'];

/**
 * The auth endpoints, typed from the generated schema.
 *
 * Kept apart from the gateways because they are the one set of calls that
 * must *not* carry a bearer token or trigger a refresh on 401 — a refresh that
 * refreshes itself is a loop. Every call here passes `skipAuth`.
 */

const DINER = '/api/auth/diner';
const VENUE = '/api/auth/venue';

export function createDinerAuth(client: ApiClient) {
  return {
    async requestCode(
      body: Schemas['Yalla.Api.Endpoints.RequestDinerCodeRequest'],
    ): Promise<Schemas['Yalla.Application.Auth.VerificationCodeRequestResult']> {
      const { data } = await client.post<
        Schemas['Yalla.Application.Auth.VerificationCodeRequestResult']
      >(`${DINER}/request-code`, body, { skipAuth: true });
      return data;
    },

    async verifyCode(
      body: Schemas['Yalla.Api.Endpoints.VerifyDinerCodeRequest'],
    ): Promise<Schemas['Yalla.Application.Auth.DinerSignInResult']> {
      const { data } = await client.post<Schemas['Yalla.Application.Auth.DinerSignInResult']>(
        `${DINER}/verify-code`,
        body,
        { skipAuth: true },
      );
      return data;
    },

    async refreshTokens(refreshToken: string): Promise<TokenPair> {
      const { data } = await client.post<Schemas['Yalla.Application.Auth.RefreshResult']>(
        `${DINER}/refresh`,
        { refreshToken } satisfies Schemas['Yalla.Api.Endpoints.RefreshTokenRequest'],
        { skipAuth: true },
      );
      return data;
    },

    async signOut(refreshToken: string): Promise<void> {
      await client.post(`${DINER}/sign-out`, { refreshToken }, { skipAuth: true });
    },
  };
}

export type DinerAuth = ReturnType<typeof createDinerAuth>;

/** Who signed in to the admin surface, as the sign-in response describes them. */
export interface VenueUserIdentity {
  readonly staffMemberId: string;
  /** `null` for a platform admin, who belongs to no venue. */
  readonly venueId: string | null;
  readonly role: UserRole;
  readonly fullName: string;
}

/**
 * `Yalla.Domain.Enums.StaffRole` is an integer on the wire (0 PlatformAdmin,
 * 1 Owner, 2 Manager, 3 Waiter, 4 Kitchen) and a name in the JWT; both land on
 * the console's role vocabulary here and nowhere else.
 *
 * The fallback is `waiter` on purpose: it is the least-privileged role in the
 * console's own routing, so an unrecognised value shows the smallest app
 * rather than the largest. The server decides what is actually permitted
 * regardless of what this returns.
 */
export function staffRoleToUserRole(role: number | string): UserRole {
  switch (typeof role === 'string' ? role.toLowerCase() : role) {
    case 0:
    case 'platformadmin':
      return 'platformAdmin';
    case 1:
    case 'owner':
      return 'owner';
    case 2:
    case 'manager':
      return 'manager';
    case 4:
    case 'kitchen':
      return 'kitchen';
    case 3:
    case 'waiter':
    default:
      return 'waiter';
  }
}

export function createVenueUserAuth(client: ApiClient) {
  return {
    async signIn(
      email: string,
      password: string,
    ): Promise<{ tokens: TokenPair; identity: VenueUserIdentity }> {
      const { data } = await client.post<Schemas['Yalla.Application.Auth.VenueUserSignInResult']>(
        `${VENUE}/sign-in`,
        { email, password } satisfies Schemas['Yalla.Api.Endpoints.VenueUserSignInRequest'],
        { skipAuth: true },
      );
      return {
        tokens: {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresInSeconds: data.expiresInSeconds,
        },
        identity: {
          staffMemberId: data.staffMemberId,
          venueId: data.venueId ?? null,
          role: staffRoleToUserRole(data.role),
          fullName: data.fullName,
        },
      };
    },

    async refreshTokens(refreshToken: string): Promise<TokenPair> {
      const { data } = await client.post<Schemas['Yalla.Application.Auth.RefreshResult']>(
        `${VENUE}/refresh`,
        { refreshToken } satisfies Schemas['Yalla.Api.Endpoints.RefreshTokenRequest'],
        { skipAuth: true },
      );
      return data;
    },

    async signOut(refreshToken: string): Promise<void> {
      await client.post(`${VENUE}/sign-out`, { refreshToken }, { skipAuth: true });
    },

    /**
     * Ask for a reset link by email. The backend answers 202 whether or not the
     * address has an account, so nothing about the answer says which addresses
     * are real. `localeCode` picks the language of the message.
     */
    async requestPasswordReset(email: string, localeCode?: string): Promise<void> {
      await client.post(
        `${VENUE}/request-password-reset`,
        {
          email,
          localeCode: localeCode ?? null,
        } satisfies Schemas['Yalla.Api.Endpoints.RequestPasswordResetRequest'],
        { skipAuth: true },
      );
    },

    /**
     * Spend a reset link on a new password.
     *
     * The link is the whole credential, so this goes out with no bearer and no
     * refresh on 401 — a 401 here means the link is unknown, spent or expired,
     * not that anybody's session ended. A 400 is the password under the
     * server's minimum, with the minimum in `detail`.
     */
    async resetPassword(resetToken: string, newPassword: string): Promise<void> {
      await client.post(
        `${VENUE}/reset-password`,
        { resetToken, newPassword } satisfies Schemas['Yalla.Api.Endpoints.ResetPasswordRequest'],
        { skipAuth: true },
      );
    },
  };
}

export type VenueUserAuth = ReturnType<typeof createVenueUserAuth>;
