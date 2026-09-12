import type { Photo } from './menuAdmin';

/**
 * What a branch publishes to anybody with its link: the contact number, whether
 * the public page offers booking, and the venue card's picture.
 *
 * Their own form rather than fields on the reservation policy, because they
 * answer a different question. The policy is "how do we run our floor"; this is
 * "what do we say to strangers on the internet".
 */
export interface BranchPublicProfile {
  /** E.164, or null when nothing is published. */
  readonly phoneE164: string | null;
  /**
   * False until somebody switches it on. A venue has not agreed to take
   * bookings from strangers by never having been asked.
   */
  readonly acceptsWebBookings: boolean;
  /**
   * The venue card's picture — the first thing a stranger sees on the public
   * page and in the diner app's list — or null when there is none yet.
   */
  readonly coverPhoto: Photo | null;
}

/** The same settings, as written. All are replaced at once. */
export interface BranchPublicProfileInput {
  /** Spaces, dashes and brackets are stripped server-side. Null or blank clears it. */
  readonly phoneE164: string | null;
  readonly acceptsWebBookings: boolean;
  /**
   * A photo uploaded for **this** branch, or null to clear the picture. One
   * uploaded for another branch is not found here, and the whole form is
   * refused before anything is written.
   */
  readonly coverPhotoId: string | null;
}
