import type { ReplyAuthorRole, ReviewReply, ReviewSummary } from '../contracts/reviews';

/**
 * The venue's reply under a review and the branch's review summary, as the
 * wire carries them (VC4 wire §1).
 *
 * Written by hand until the generated schema carries them; every review read
 * that has a reply — the console's list, the public reviews, the diner's own
 * review — maps it here, so one shape cannot drift three ways. The API leaves
 * a null property out, so every field the server may omit is optional.
 */
export interface WireReviewReply {
  readonly text?: string | null;
  readonly authorName?: string | null;
  /** `StaffRole`: 1 owner, 2 branch manager, 6 general manager. */
  readonly authorRole?: number | string | null;
  readonly createdAtUtc?: string | null;
  readonly updatedAtUtc?: string | null;
  readonly edited?: boolean | null;
}

export interface WireReviewSummary {
  readonly all?: number | null;
  readonly reported?: number | null;
  readonly hidden?: number | null;
  readonly visible?: number | null;
  readonly rating?: number | null;
  readonly ratingChange30Days?: number | null;
  readonly distribution?: readonly { readonly stars: number; readonly count: number }[] | null;
}

function replyRole(role: WireReviewReply['authorRole']): ReplyAuthorRole {
  switch (typeof role === 'string' ? role.toLowerCase() : role) {
    case 1:
    case 'owner':
      return 'owner';
    case 6:
    case 'generalmanager':
      return 'generalManager';
    default:
      return 'manager';
  }
}

/** Null for no reply, or for one with no text — nothing to show under the review. */
export function reviewReplyFromWire(wire: WireReviewReply | null | undefined): ReviewReply | null {
  if (!wire?.text) return null;
  const created = wire.createdAtUtc ?? wire.updatedAtUtc ?? '';
  const updated = wire.updatedAtUtc ?? created;
  return {
    text: wire.text,
    authorName: wire.authorName ?? '',
    authorRole: replyRole(wire.authorRole),
    createdAtUtc: created,
    updatedAtUtc: updated,
    edited: wire.edited ?? updated !== created,
  };
}

export function reviewSummaryFromWire(
  wire: WireReviewSummary | null | undefined,
): ReviewSummary | null {
  if (!wire) return null;
  const counts = new Map((wire.distribution ?? []).map((row) => [row.stars, row.count]));
  return {
    all: wire.all ?? 0,
    reported: wire.reported ?? 0,
    hidden: wire.hidden ?? 0,
    visible: wire.visible ?? 0,
    rating: wire.rating ?? null,
    ratingChange30Days: wire.ratingChange30Days ?? null,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: counts.get(stars) ?? 0 })),
  };
}
