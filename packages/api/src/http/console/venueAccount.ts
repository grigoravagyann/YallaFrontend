import type { ConsoleGateway } from '../../consoleGateway';
import { SignInUnknownError } from '../../contracts/errors';
import { ConcurrencyConflictError } from '../../errors';
import {
  otherSessionsEndedFromWire,
  venueProfileFromWire,
  venueSessionsFromWire,
  type WireOtherSessionsEnded,
  type WireVenuePasswordChanged,
  type WireVenueSessions,
  type WireVenueStaffProfile,
} from '../venueAccountMapping';
import { ProblemCodes } from '../../generated/problemCodes';
import { type ConsoleHttpContext, VENUE_ME, tokenPairFrom } from './context';

export function venueAccountMethods(
  ctx: ConsoleHttpContext,
): Pick<
  ConsoleGateway,
  | 'getVenueProfile'
  | 'updateVenueProfile'
  | 'changeVenuePassword'
  | 'listVenueSessions'
  | 'signOutOtherVenueSessions'
> {
  const { client, auth } = ctx;
  return {
    // --- My account (venue console) ----------------------------------------

    async getVenueProfile() {
      const { data } = await client.get<WireVenueStaffProfile>(`${VENUE_ME}`);
      return venueProfileFromWire(data);
    },

    async updateVenueProfile({ fullName }) {
      const { data } = await client.patch<WireVenueStaffProfile>(`${VENUE_ME}`, { fullName });
      return venueProfileFromWire(data);
    },

    async changeVenuePassword({ currentPassword, newPassword }) {
      // As the platform admin's: a wrong current password is a 422 naming
      // `currentPassword`, and the answer is a fresh pair for this browser,
      // adopted at once — the change ended every session, this one's too.
      // `RefreshResult` on the wire; read through `tokenPairFrom` like the
      // platform's, so an answer with no pair claims nothing.
      const { data } = await client.post<WireVenuePasswordChanged>(`${VENUE_ME}/password`, {
        currentPassword,
        newPassword,
      });
      const pair = tokenPairFrom(data);
      if (!pair) return { sessionRenewed: false };
      await auth.signIn(pair);
      return { sessionRenewed: true };
    },

    async listVenueSessions() {
      const { data } = await client.get<WireVenueSessions>(`${VENUE_ME}/sessions`);
      return venueSessionsFromWire(data);
    },

    async signOutOtherVenueSessions() {
      // No fresh pair, by design: an access token alone must not mint a new
      // refresh token. This browser's access token dies with the others', and
      // the client's `session-revoked` refresh renews it on the next request.
      try {
        const { data } = await client.post<WireOtherSessionsEnded>(
          `${VENUE_ME}/sessions/sign-out-others`,
        );
        return otherSessionsEndedFromWire(data);
      } catch (error) {
        // A token from before tokens named their sign-in: nothing was ended,
        // and only signing in again fixes it.
        if (
          error instanceof ConcurrencyConflictError &&
          error.code === ProblemCodes.SignInUnknown
        ) {
          throw new SignInUnknownError({
            url: error.url,
            requestId: error.requestId,
            problem: error.problem,
          });
        }
        throw error;
      }
    },
  };
}
