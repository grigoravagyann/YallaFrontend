import { newCommandId, type PublicBranch } from '@yalla/api';

/**
 * Booking without proving the number (2026-10-20): what the Book sheet needs
 * beyond the booking itself — this browser's id, the manage link the first
 * answer carries, and whether the door is open for this party at all.
 *
 * ## Nothing in storage
 *
 * The wire asks for a `deviceId` generated once per browser and kept, so the
 * server can hold one browser to one unverified booking and answer a retry
 * from the same browser with the booking it made. The public page keeps
 * nothing in browser storage (HANDOFF §3) — the language rides in `?lang=`,
 * the phone token lives in memory — and this is no exception: the id lives in
 * this module, for the life of the page. Every sheet opened on the page, and
 * every retry in it, sends the same id, which is all a replay needs.
 *
 * What it gives up: a reload is a new "browser" to the server, so the
 * one-booking-per-browser limit holds within a page's life rather than for
 * good. The limits that matter still hold whatever the id — one active
 * booking per phone number at any venue, ten unverified bookings an hour per
 * network, twenty waiting per venue — and a venue confirms these bookings
 * first by default. Keeping the limit across reloads would need
 * `sessionStorage` at the least, which the page's rule does not allow; that
 * is the lead's call, not this module's.
 */

let deviceId: string | null = null;

/** This page's id for the server's per-browser limit and replays. Never stored. */
export function browserDeviceId(): string {
  deviceId ??= newCommandId();
  return deviceId;
}

/**
 * Manage links by the command that made their booking.
 *
 * The first answer is the only one with the token: a retry under the same
 * command answers the booking without it (only its hash is kept). So the
 * token is kept here before anything else happens with the answer, and a
 * later replay — "Check again" after an answer that came back slowly —
 * finds it. In memory, for the life of the page, like the id above.
 */
const manageTokens = new Map<string, string>();

export function keepManageToken(commandId: string, token: string | null): void {
  if (token) manageTokens.set(commandId, token);
}

export function keptManageToken(commandId: string): string | null {
  return manageTokens.get(commandId) ?? null;
}

/**
 * The door without proof, for this party at this branch.
 *
 * - `open`: the party is within the branch's cap, so the sheet offers it.
 * - `needsApproval`: the venue confirms such a booking itself first, which
 *   the sheet says before the visitor commits.
 * - `max`: the cap, said either way.
 */
export interface WithoutProofDoor {
  readonly open: boolean;
  readonly needsApproval: boolean;
  readonly max: number;
}

export function withoutProofDoor(
  policy: PublicBranch['policy'],
  partySize: number,
): WithoutProofDoor {
  const max = policy.unverifiedMaxPartySize;
  return {
    open: partySize <= max,
    needsApproval: policy.unverifiedBookingsNeedApproval,
    max,
  };
}
