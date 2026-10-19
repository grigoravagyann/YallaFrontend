/**
 * My account, for the venue console's people (venue-console Account artboard):
 * an owner, a general manager or a branch manager signed in with a password.
 *
 * `/api/venue/me*` (policy `VenueStaffAccount`). The platform admin keeps
 * `/api/platform/me` (`platformHome.ts`), and nobody on a tablet session has
 * an account here: a waiter or a kitchen account never holds a password.
 * Both consoles share the rules a name and a password follow:
 * `PLATFORM_NAME_MAX_LENGTH` and `PLATFORM_PASSWORD_MIN_LENGTH`.
 */
import type { UserRole } from './console';

/** `GET /api/venue/me`. */
export interface VenueStaffProfile {
  readonly staffMemberId: string;
  readonly fullName: string;
  /**
   * Read-only here: the Yalla team changes an owner's, and whoever outranks a
   * manager changes theirs with a new sign-in link.
   */
  readonly email: string;
  readonly role: UserRole;
  readonly venueId: string;
  /**
   * The home branch of a branch manager; `null` for an owner or a general
   * manager, whose answer leaves it out (an owner's row may name a branch, and
   * they still run every one). Nothing in the console reads it: the branches
   * a person covers are `getManagedVenue`'s answer.
   */
  readonly branchId: string | null;
}

/**
 * One admin-panel sign-in that can still renew (an unrevoked refresh chain),
 * from `GET /api/venue/me/sessions`.
 *
 * No device, browser or city: nothing in the system records them, so none is
 * claimed. The current one is this browser, which the screen may describe
 * itself.
 */
export interface VenueSession {
  readonly id: string;
  readonly signedInAtUtc: string;
  /** When it last renewed its token: at most about 15 minutes behind for a console in use. */
  readonly lastActiveAtUtc: string;
  readonly isCurrent: boolean;
}

/** `POST /api/venue/me/sessions/sign-out-others`. */
export interface OtherSessionsEnded {
  /** How many other sign-ins were ended. 0 is a real answer. */
  readonly endedSessions: number;
}
