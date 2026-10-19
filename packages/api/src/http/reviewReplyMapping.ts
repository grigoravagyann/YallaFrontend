import type {
  PublicReviewReply,
  ReplyAuthorRole,
  ReviewReply,
  ReviewSummary,
} from '../contracts/reviews';
import type { components } from '../generated/schema';

type Schemas = components['schemas'];

/**
 * The venue's reply under a review and the branch's review summary, as the
 * wire carries them (VC4 wire §1). Every review read that has a reply — the
 * console's list, the public reviews, the diner's own review — maps it here, so
 * one shape cannot drift three ways. The API leaves a null property out.
 */
export type WireReviewReply = Schemas['Yalla.Application.Reviews.ReviewReplyView'];
/**
 * The public reads' reply (VC4 wire, review round 1): `authorName` short, and
 * left out where the rule drops a name that looks like contact details.
 */
export type WirePublicReviewReply = Schemas['Yalla.Application.Reviews.PublicReviewReplyView'];
export type WireReviewSummary = Schemas['Yalla.Application.Reviews.ModeratedReviewSummary'];

/** `StaffRole`: 1 owner, 6 general manager, 2 branch manager — the three who may reply. */
function replyRole(role: WireReviewReply['authorRole']): ReplyAuthorRole {
  return role === 1 ? 'owner' : role === 6 ? 'generalManager' : 'manager';
}

/** Null for no reply, or for one with no text — nothing to show under the review. */
export function reviewReplyFromWire(wire: WireReviewReply | null | undefined): ReviewReply | null {
  if (!wire?.text) return null;
  return {
    text: wire.text,
    authorName: wire.authorName,
    authorRole: replyRole(wire.authorRole),
    createdAtUtc: wire.createdAtUtc,
    updatedAtUtc: wire.updatedAtUtc,
    edited: wire.edited,
  };
}

/** The public reads' reply: the same, with a name that may be missing. */
export function publicReplyFromWire(
  wire: WirePublicReviewReply | null | undefined,
): PublicReviewReply | null {
  if (!wire?.text) return null;
  return {
    text: wire.text,
    authorName: wire.authorName?.trim() || null,
    authorRole: replyRole(wire.authorRole),
    createdAtUtc: wire.createdAtUtc,
    updatedAtUtc: wire.updatedAtUtc,
    edited: wire.edited,
  };
}

export function reviewSummaryFromWire(
  wire: WireReviewSummary | null | undefined,
): ReviewSummary | null {
  if (!wire) return null;
  // A server that predates the summary sends none; one that has it sends all five rows.
  const counts = new Map(wire.distribution.map((row) => [row.stars, row.count]));
  return {
    all: wire.all,
    reported: wire.reported,
    hidden: wire.hidden,
    visible: wire.visible,
    rating: wire.rating ?? null,
    ratingChange30Days: wire.ratingChange30Days ?? null,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: counts.get(stars) ?? 0 })),
  };
}
