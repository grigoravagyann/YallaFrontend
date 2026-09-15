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
}

/** The venue's view adds how often, and how recently, diners reported it. */
export interface VenueModeratedReview extends ModeratedReview {
  readonly reportCount: number;
  readonly lastReportedAtUtc: string | null;
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
