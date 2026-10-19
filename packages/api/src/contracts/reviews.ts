/**
 * Review integrity and moderation: the K8 rules and the 2026-09-14 addendum.
 *
 * Three audiences. A diner reports somebody else's review. A venue's owner or
 * manager lists their branch's reviews with report counts and hides or restores
 * one with a reason. The platform lists any branch's reviews and has the final
 * word: a review it hid cannot be restored by the venue.
 */

/** How far back a visit counts toward writing a first review (K8). */
export const REVIEW_VISIT_WINDOW_DAYS = 180;

/** The most a hide reason or a report note may be. */
export const MAX_MODERATION_TEXT = 500;

/** What a diner may say a review is, in the order the report sheet lists them. */
export const REVIEW_REPORT_REASONS = [
  'spam',
  'offensive',
  'not-a-visit',
  'personal-info',
  'other',
] as const;

export type ReviewReportReason = (typeof REVIEW_REPORT_REASONS)[number];

/** `POST /api/diner/reviews/{reviewId}/report`. */
export interface ReportReviewCommand {
  readonly reviewId: string;
  readonly reason: ReviewReportReason;
  /** Optional, at most {@link MAX_MODERATION_TEXT} characters. Blank is sent as null. */
  readonly note?: string | null | undefined;
}

/** Which slice of a branch's reviews the venue screen shows. */
export type ReviewModerationFilter = 'all' | 'reported' | 'hidden';

export const REVIEW_MODERATION_FILTERS: readonly ReviewModerationFilter[] = [
  'all',
  'reported',
  'hidden',
];

/** The longest a venue's reply may be, trimmed (VC4 wire §1). */
export const MAX_REVIEW_REPLY = 500;

/** Who may sign a reply: the venue's owner, general manager or branch manager. */
export type ReplyAuthorRole = 'owner' | 'generalManager' | 'manager';

/**
 * The venue's one public reply under a review (HANDOFF §5.3). Signed with the
 * name the writer had when they last saved it, and their role: "Aram Hakobyan,
 * Owner". The last writer signs — a general manager who edits the owner's reply
 * makes it theirs.
 */
export interface ReviewReply {
  readonly text: string;
  readonly authorName: string;
  readonly authorRole: ReplyAuthorRole;
  /** First published; a reply removed and written again starts over. */
  readonly createdAtUtc: string;
  /** The text's last change; the same as `createdAtUtc` until edited. */
  readonly updatedAtUtc: string;
  readonly edited: boolean;
}

/**
 * The reply as diners read it — the public reviews, the place's details and
 * the author's own review (VC4 wire, review round 1): signed short, "Aram H.",
 * by the rule diners' own names follow. No name at all when the stored one
 * looks like contact details: the role signs alone then.
 */
export interface PublicReviewReply extends Omit<ReviewReply, 'authorName'> {
  readonly authorName: string | null;
}

/** The short public signature for a writer's full name, or null where the rule drops it. */
export function publicReplyAuthorName(fullName: string): string | null {
  const short = publicAuthorName(fullName);
  return short === ANONYMOUS_AUTHOR ? null : short;
}

/** One review as a moderator sees it: the public card plus who wrote it and its takedown state. */
export interface ModeratedReview {
  readonly reviewId: string;
  readonly branchId: string;
  /** 1–5. */
  readonly rating: number;
  readonly text: string | null;
  /** The public name, by the K8 rule — never the account's full name. */
  readonly authorName: string;
  readonly dinerUserId: string | null;
  readonly createdAtUtc: string;
  readonly updatedAtUtc: string;
  readonly hidden: boolean;
  readonly hiddenReason: string | null;
  readonly hiddenAtUtc: string | null;
  /** Hidden by the platform rather than the venue: a venue cannot show it again. False while visible. */
  readonly hiddenByPlatform: boolean;
  /**
   * Who at the venue hid it, by their name now. Null while visible, when the
   * Yalla team hid it, or from a server that does not say.
   */
  readonly hiddenByName: string | null;
  /** The venue's reply. Kept on a hidden review too: the venue sees what it wrote. */
  readonly reply: ReviewReply | null;
}

/** The venue's view adds how often, and how recently, diners reported it. */
export interface VenueModeratedReview extends ModeratedReview {
  readonly reportCount: number;
  readonly lastReportedAtUtc: string | null;
}

/**
 * The whole branch's reviews in numbers, whatever the filter and page (VC4
 * wire §1): the filter chips' counts, the nav badge, and the rating card.
 */
export interface ReviewSummary {
  /** Every review, hidden ones included. */
  readonly all: number;
  /** Visible, with reports nobody has set aside. */
  readonly reported: number;
  readonly hidden: number;
  readonly visible: number;
  /** The visible reviews' average, one decimal; null with none. */
  readonly rating: number | null;
  /**
   * The rating now minus the rating of the visible reviews written more than
   * thirty days ago, one decimal; null when either side has none.
   */
  readonly ratingChange30Days: number | null;
  /** Visible reviews by stars, 5 down to 1, always five rows. */
  readonly distribution: readonly { readonly stars: number; readonly count: number }[];
}

/** A page of a branch's reviews for a moderator, with the branch's summary. */
export interface ModeratedReviewPage {
  readonly items: readonly VenueModeratedReview[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** Null from a server that does not send it yet. */
  readonly summary: ReviewSummary | null;
}

export interface VenueReviewQuery {
  /** 1-based. Default 1. */
  readonly page?: number | undefined;
  /** Default 20. */
  readonly pageSize?: number | undefined;
  /** Default `all`. */
  readonly filter?: ReviewModerationFilter | undefined;
}

/**
 * Hide or restore. `reason` is required when hiding — at most
 * {@link MAX_MODERATION_TEXT} characters — and ignored when restoring.
 */
export interface SetReviewVisibilityCommand {
  readonly hidden: boolean;
  readonly reason: string | null;
}

/**
 * The average of a set of reviews' stars and how they spread, worked out on
 * the client: what a moderator's summary card shows when the server has not
 * sent its own (`ModeratedReviewPage.summary`).
 */
export function summariseReviews(
  reviews: readonly ModeratedReview[],
  reportCount: (review: ModeratedReview) => number = () => 0,
  now: Date = new Date(),
): ReviewSummary {
  const visible = reviews.filter((review) => !review.hidden);
  const average = (list: readonly ModeratedReview[]) =>
    list.length === 0
      ? null
      : Math.round((list.reduce((sum, review) => sum + review.rating, 0) / list.length) * 10) / 10;
  const rating = average(visible);
  const monthAgo = now.getTime() - 30 * 24 * 60 * 60_000;
  const before = average(visible.filter((review) => Date.parse(review.createdAtUtc) < monthAgo));
  return {
    all: reviews.length,
    reported: visible.filter((review) => reportCount(review) > 0).length,
    hidden: reviews.length - visible.length,
    visible: visible.length,
    rating,
    ratingChange30Days:
      rating !== null && before !== null ? Math.round((rating - before) * 10) / 10 : null,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: visible.filter((review) => Math.round(review.rating) === stars).length,
    })),
  };
}

/** The public name for a display name. Anything that looks like contact details is dropped. */
const LOOKS_LIKE_CONTACT = /[@\d/]|www\./iu;

/** Letters of any script, their combining marks, and hyphens. */
const NAME_CHARACTERS = /[^\p{L}\p{M}-]/gu;

const MAX_FIRST_NAME = 24;

export const ANONYMOUS_AUTHOR = 'Yalla diner';

/**
 * The `authorName` rule (K8), written once so the mocks answer what the server
 * answers.
 *
 * 1. Take the first word of the display name.
 * 2. If it contains `@`, a digit, `/` or `www.`, the name is `"Yalla diner"`.
 * 3. Otherwise keep only letters (any script) and hyphens, at most 24 characters.
 * 4. Add `" X."` only if the second word starts with a letter.
 *
 * `"ani@example.test"` and `"+374 91 000 999"` are `"Yalla diner"`;
 * `"Anahit Sargsyan"` is `"Anahit S."`; `"Անահիտ Սարգսյան"` is `"Անահիտ Ս."`.
 */
export function publicAuthorName(displayName: string | null | undefined): string {
  const [first = '', second = ''] = (displayName ?? '').trim().split(/\s+/u);
  if (first === '' || LOOKS_LIKE_CONTACT.test(first)) return ANONYMOUS_AUTHOR;

  const kept = Array.from(first.replace(NAME_CHARACTERS, '')).slice(0, MAX_FIRST_NAME).join('');
  if (kept === '') return ANONYMOUS_AUTHOR;

  const initial = Array.from(second)[0];
  return initial !== undefined && /^\p{L}$/u.test(initial) ? `${kept} ${initial}.` : kept;
}
