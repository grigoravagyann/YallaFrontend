import type {
  ManagedBooking,
  PublicBranch,
  PublicPageMeta,
  PublicVenue,
} from './contracts/publicBranch';

/**
 * The unauthenticated reads the public branch page needs, and only those.
 *
 * A fourth gateway rather than more methods on `YallaGateway`, for the same
 * reason the staff gateway is separate: the split is a permission boundary. No
 * call on this interface takes or sends a token, so nothing reachable from the
 * public page's bundle can read a diner's bookings, a venue's staff list or a
 * tab's total — not because a screen declines to, but because there is no
 * method for it.
 *
 * The page still uses `YallaGateway` for the live half — the floor, per-table
 * availability, the menu, phone verification and creating the booking — because
 * those are the *same* endpoints the phone app calls, in its anonymous
 * audience, and a second implementation of the availability mapping is a second
 * chance to disagree with the app about which tables are free.
 *
 * @see {@link createPublicMockGateway} and {@link createPublicHttpGateway}.
 */
export interface PublicGateway {
  /**
   * `/{venueSlug}` — the branch chooser.
   *
   * Null when no venue has that slug. Never a 403 and never a redirect: telling
   * a stranger the difference between "no such venue" and "that venue is
   * suspended" tells them which slugs are real.
   */
  resolveVenue(venueSlug: string): Promise<PublicVenue | null>;

  /**
   * `/{venueSlug}/{branchSlug}` — the page itself.
   *
   * Null when either slug is unknown **or when the pair does not belong
   * together**. A branch is only reachable under its own venue; the mismatch is
   * a 404, not a redirect to the right venue, because a redirect is an oracle
   * for enumerating a chain.
   *
   * A suspended branch is *not* null — it resolves with `status: 'suspended'`
   * so the page can say plainly that it is not available rather than pretending
   * it never existed.
   */
  resolveBranch(input: {
    readonly venueSlug: string;
    readonly branchSlug: string;
  }): Promise<PublicBranch | null>;

  /**
   * The link-preview card for one branch.
   *
   * Its own call because its only real consumer is a server rendering `<meta>`
   * before any JavaScript runs. In the browser it is used to correct the tags
   * for anything that *does* run JavaScript — an in-app browser, a share sheet
   * — which is a smaller set than people expect. See `public/meta.ts`.
   */
  getBranchMeta(input: {
    readonly venueSlug: string;
    readonly branchSlug: string;
    readonly canonicalUrl: string;
    readonly locale: string;
  }): Promise<PublicPageMeta | null>;

  /**
   * Read one booking from its signed link. No session, no phone number.
   *
   * Null for an unknown, malformed or revoked token — one answer for all three,
   * because distinguishing them turns the endpoint into a token oracle.
   */
  getManagedBooking(token: string): Promise<ManagedBooking | null>;

  /**
   * Cancel from that same link.
   *
   * Idempotent on `commandId`, and idempotent in the domain sense too: an
   * already-cancelled booking is reported as success rather than as a conflict.
   * Someone tapping cancel twice on a bad connection has expressed their
   * intention twice, not made a mistake.
   *
   * Never refuses for lateness. See {@link ManagedBooking.canCancel}.
   */
  cancelManagedBooking(input: {
    readonly token: string;
    readonly commandId: string;
  }): Promise<ManagedBooking>;
}
