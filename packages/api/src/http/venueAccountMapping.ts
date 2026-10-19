import { staffRoleToUserRole } from '../auth/endpoints';
import type {
  OtherSessionsEnded,
  VenueSession,
  VenueStaffProfile,
} from '../contracts/venueAccount';
import type { components } from '../generated/schema';

type Schemas = components['schemas'];

/** `GET`/`PATCH /api/venue/me`. `role` is `StaffRole`'s integer: 1 owner, 6 general manager, 2 manager. */
export type WireVenueStaffProfile = Schemas['Yalla.Application.Auth.VenueUserProfile'];

/** `GET /api/venue/me/sessions`. */
export type WireVenueSessions = Schemas['Yalla.Application.Auth.VenueUserSessions'];

/** `POST /api/venue/me/sessions/sign-out-others`. */
export type WireOtherSessionsEnded = Schemas['Yalla.Application.Auth.SignedOutElsewhere'];

/** `POST /api/venue/me/password`: the refresh endpoint's shape, a fresh pair for this browser. */
export type WireVenuePasswordChanged = Schemas['Yalla.Application.Auth.RefreshResult'];

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
