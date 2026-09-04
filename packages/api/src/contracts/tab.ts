/**
 * Domain contracts for the shared tab — scanning in, the people on it, and who
 * is allowed to do what.
 *
 * The framing that shapes all of this: a tab must work for someone with no
 * account who walked in off the street. Nothing here carries a user id, a phone
 * number or an email. A participant is a seat at a table for as long as the tab
 * is open, and the backend identifies them by an opaque device-scoped token.
 *
 * Reserving is the separate flow that needs a verified phone. Scanning does not
 * touch it, and none of these shapes reference `VerifiedPhone`.
 */

/**
 * Who someone is on the tab.
 *
 * There is exactly one host — whoever scanned first. The role is not a rank: it
 * exists because approving joiners and hiding the total need a single decider,
 * and "whoever sat down first" is the only rule a cafe can apply without asking
 * anyone to log in.
 */
export type TabParticipantRole = 'host' | 'guest';

/**
 * `pending` is the interesting one: the person is at the table and can see the
 * menu, but is not on the tab until the host taps approve. They are not a
 * lesser participant — they are a different thing, and the UI must not blur it.
 */
export type TabParticipantStatus = 'active' | 'pending' | 'rejected' | 'removed' | 'left';

/**
 * What one participant may do.
 *
 * Two invariants the server enforces, so the client must never construct a
 * state that violates them — see {@link normalizeTabPermissions}:
 *
 * 1. `canPay` implies `canSeeTableTotal`. Paying a number you cannot see is not
 *    a feature, it is a trap.
 * 2. Everyone always sees their own items and always sees menu prices. That is
 *    not expressible as a flag because it is never off; hiding the total hides
 *    the *table* total and *other people's* items only.
 */
export interface TabPermissions {
  readonly canOrder: boolean;
  readonly canSeeTableTotal: boolean;
  readonly canPay: boolean;
}

export interface TabParticipant {
  readonly id: string;
  /**
   * `null` for someone who never gave a name. They still appear in the list —
   * an unnamed guest who is invisible is how a party of five turns into a
   * disputed bill.
   */
  readonly displayName: string | null;
  readonly role: TabParticipantRole;
  readonly status: TabParticipantStatus;
  /** True for the participant on this device. Set by the server, not guessed. */
  readonly isYou: boolean;
  readonly joinedAtUtc: string;
  readonly permissions: TabPermissions;
}

export type TabStatus = 'open' | 'closed';

/**
 * A tab, as any participant sees it.
 *
 * Deliberately no totals and no order lines: those arrive with ordering, and a
 * field that exists but is always zero is worse than one that does not exist.
 */
export interface TableTab {
  readonly id: string;
  readonly status: TabStatus;

  readonly venueId: string;
  readonly venueName: string;
  readonly branchId: string;
  readonly branchName: string;
  /** IANA zone of the branch. Every time on this tab renders in it. */
  readonly timeZoneId: string;

  readonly tableId: string;
  readonly tableLabel: string;
  readonly floorAreaName: string | null;

  readonly openedAtUtc: string;
  readonly closedAtUtc: string | null;

  /** Every participant, including pending ones. Visible to everybody. */
  readonly participants: readonly TabParticipant[];

  /** The viewer's own participant id, so the UI need not search by `isYou`. */
  readonly yourParticipantId: string;
  readonly yourRole: TabParticipantRole;
  readonly yourStatus: TabParticipantStatus;
  readonly yourPermissions: TabPermissions;

  /**
   * What a newly approved joiner gets. The host can change it, and it is the
   * table's setting rather than a per-person one so a party of eight is not
   * eight taps.
   */
  readonly defaultPermissions: TabPermissions;
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

/**
 * The result of scanning a table code.
 *
 * Modelled as a discriminated union rather than a `TableTab` plus a boolean,
 * because "you opened this" and "you are waiting to be let in" are different
 * destinations and the screen has to branch on exactly one thing.
 *
 * The failure outcomes are *errors*, not members of this union: they carry no
 * tab and the caller cannot proceed. See `contracts/errors`.
 */
export type ScanResult =
  | { readonly kind: 'tabOpened'; readonly tab: TableTab }
  | { readonly kind: 'joinPending'; readonly tab: TableTab }
  /** Already on this tab — a second scan of the same code, or a re-open. */
  | { readonly kind: 'alreadyOn'; readonly tab: TableTab };

export interface ScanTableCommand {
  /**
   * Whatever the camera decoded, or whatever was typed into the manual
   * fallback. Not parsed on the client beyond extracting the code from a URL:
   * the backend owns the token format and can change it without a release.
   */
  readonly tableCode: string;
  /**
   * Client-generated, stable across retries. This is what stops a double scan —
   * or a retry after a timeout — from opening two tabs on one table.
   */
  readonly commandId: string;
  /** Optional display name. Absent is normal and must stay normal. */
  readonly displayName?: string | undefined;
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

/**
 * One invite, two ways to hand it over.
 *
 * The QR and the share link carry the *same* token, so a guest who scans and a
 * guest who taps a WhatsApp message land in the same place. Two tokens would
 * mean two things to revoke.
 */
export interface TabInvite {
  readonly tabId: string;
  readonly token: string;
  /**
   * The https link to share. An https link is what makes the not-installed case
   * survivable: it opens a web page rather than failing silently the way a
   * custom scheme does.
   */
  readonly url: string;
  readonly expiresAtUtc: string;
}

// ---------------------------------------------------------------------------
// Calling a waiter
// ---------------------------------------------------------------------------

/**
 * Presets only, deliberately.
 *
 * Free text would become a chat, and a chat sets an expectation of a reply that
 * nobody can meet during the Friday rush — leaving the diner more annoyed than
 * if they had simply raised a hand.
 */
export type WaiterCallReason = 'napkins' | 'water' | 'bill' | 'other';

export const WAITER_CALL_REASONS: readonly WaiterCallReason[] = [
  'napkins',
  'water',
  'bill',
  'other',
] as const;

export interface WaiterCall {
  readonly id: string;
  readonly tabId: string;
  readonly reason: WaiterCallReason;
  readonly requestedAtUtc: string;
}
