import { validationFailed, type MockViolation } from '../problems';
import {
  PLATFORM_NAME_MAX_LENGTH,
  PLATFORM_PASSWORD_MIN_LENGTH,
} from '../../contracts/platformHome';
import type { VenueSession } from '../../contracts/venueAccount';
import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleMockContext, URL_TAG } from './context';

/** A venue account's own profile, password and sessions. */
export function venueAccountMethods(
  ctx: ConsoleMockContext,
): Pick<
  ConsoleGateway,
  | 'getVenueProfile'
  | 'updateVenueProfile'
  | 'changeVenuePassword'
  | 'listVenueSessions'
  | 'signOutOtherVenueSessions'
> {
  const { now, otherSessions, requireVenueAccount, staffFor, venueProfile, venueSelf, wait } = ctx;
  return {
    // --- My account (venue console) ------------------------------------------

    async getVenueProfile() {
      await wait();
      requireVenueAccount(`${URL_TAG}/venue/me`);
      return venueProfile();
    },

    async updateVenueProfile({ fullName }) {
      await wait();
      const url = `${URL_TAG}/venue/me`;
      requireVenueAccount(url);
      const name = fullName.trim();
      if (name.length === 0) {
        throw validationFailed(url, [
          { field: 'fullName', message: 'The name is required.', bound: 'required' },
        ]);
      }
      if (name.length > PLATFORM_NAME_MAX_LENGTH) {
        throw validationFailed(url, [
          {
            field: 'fullName',
            message: `The name is at most ${PLATFORM_NAME_MAX_LENGTH} characters.`,
            bound: 'max',
            max: PLATFORM_NAME_MAX_LENGTH,
          },
        ]);
      }
      // One person, one name: the staff list says what the account says.
      const before = venueProfile();
      venueSelf.names.set(before.staffMemberId, name);
      const list = staffFor(before.venueId);
      const index = list.findIndex((member) => member.id === before.staffMemberId);
      if (index >= 0) list[index] = { ...list[index]!, fullName: name };
      return venueProfile();
    },

    async changeVenuePassword({ currentPassword, newPassword }) {
      await wait();
      const url = `${URL_TAG}/venue/me/password`;
      requireVenueAccount(url);
      // One 422 naming every field, in the server's order, as the admin's.
      const violations: MockViolation[] = [];
      if (!currentPassword) {
        violations.push({
          field: 'currentPassword',
          message: 'The current password is required.',
          bound: 'required',
        });
      } else if (currentPassword !== venueSelf.password) {
        violations.push({
          field: 'currentPassword',
          message: 'The current password is wrong.',
          bound: 'conflict',
        });
      }
      if (!newPassword) {
        violations.push({
          field: 'newPassword',
          message: 'The new password is required.',
          bound: 'required',
        });
      } else if (newPassword.length < PLATFORM_PASSWORD_MIN_LENGTH) {
        violations.push({
          field: 'newPassword',
          message: `Password must be at least ${PLATFORM_PASSWORD_MIN_LENGTH} characters.`,
          bound: 'min',
          min: PLATFORM_PASSWORD_MIN_LENGTH,
        });
      }
      if (violations.length > 0) throw validationFailed(url, violations);
      venueSelf.password = newPassword;
      // Every session of the account ends; this browser carries on with a fresh pair.
      venueSelf.others = [];
      return { sessionRenewed: true };
    },

    async listVenueSessions() {
      await wait();
      requireVenueAccount(`${URL_TAG}/venue/me/sessions`);
      const current: VenueSession = {
        id: 'session-current',
        signedInAtUtc: new Date(now().getTime() - 2 * 3_600_000).toISOString(),
        lastActiveAtUtc: now().toISOString(),
        isCurrent: true,
      };
      const others = [...otherSessions()].sort((a, b) =>
        b.lastActiveAtUtc.localeCompare(a.lastActiveAtUtc),
      );
      return [current, ...others];
    },

    async signOutOtherVenueSessions() {
      await wait();
      requireVenueAccount(`${URL_TAG}/venue/me/sessions/sign-out-others`);
      const endedSessions = otherSessions().length;
      venueSelf.others = [];
      return { endedSessions };
    },
  };
}
