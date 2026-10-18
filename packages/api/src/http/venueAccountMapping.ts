import { staffRoleToUserRole } from '../auth/endpoints';
import type {
  OtherSessionsEnded,
  VenueSession,
  VenueStaffProfile,
} from '../contracts/venueAccount';

/*
 * My account's wire shapes (VC1 wire, `feat/venue-console-1`), written here by
 * hand until `generated/schema.ts` is regenerated against the backend that
 * serves `/api/venue/me*`. Then these become `Schemas[...]` aliases, and the
 * `gateway-schema: awaiting-route` markers in the gateway come off.
 */

/** `GET`/`PATCH /api/venue/me`. `role` is `StaffRole`'s integer: 1 owner, 6 general manager, 2 manager. */
export interface WireVenueStaffProfile {
  readonly staffMemberId: string;
  readonly fullName: string;
  readonly email: string;
  readonly role: number;
  readonly venueId: string;
  readonly branchId?: string | null;
}

/** One row of `GET /api/venue/me/sessions`. */
export interface WireVenueSession {
  readonly id: string;
  readonly signedInAtUtc: string;
  readonly lastActiveAtUtc: string;
  readonly isCurrent: boolean;
}

export interface WireVenueSessions {
  readonly sessions: readonly WireVenueSession[];
}

export interface WireOtherSessionsEnded {
  readonly endedSessions: number;
}

export function venueProfileFromWire(wire: WireVenueStaffProfile): VenueStaffProfile {
  return {
    staffMemberId: wire.staffMemberId,
    fullName: wire.fullName,
    email: wire.email,
    role: staffRoleToUserRole(wire.role),
    venueId: wire.venueId,
    branchId: wire.branchId ?? null,
  };
}

export function venueSessionsFromWire(wire: WireVenueSessions): readonly VenueSession[] {
  // The server's order (this sign-in first, then the most recently active) is kept.
  return wire.sessions.map((session) => ({
    id: session.id,
    signedInAtUtc: session.signedInAtUtc,
    lastActiveAtUtc: session.lastActiveAtUtc,
    isCurrent: session.isCurrent,
  }));
}

export function otherSessionsEndedFromWire(wire: WireOtherSessionsEnded): OtherSessionsEnded {
  return { endedSessions: wire.endedSessions };
}
