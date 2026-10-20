import type { BranchDetail, BranchReview } from '@yalla/api';
import { useNow, usePublicReviews } from '@yalla/api/react';
import { formatRating, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useId, useRef, useState } from 'react';

/**
 * Reviews (Main artboard): the average and how many, the spread of stars, the
 * newest three with the venue's replies, and "see all" opening the rest in
 * place, twenty at a time (`GET /api/public/branches/{id}/reviews`).
 *
 * The spread is the server's own count per star (`ratingCounts`, the whole
 * branch's, one star first), so it is drawn for any number of reviews without
 * reading a single page of them — never from a sample dressed up as the whole.
 */

const DAY_MS = 86_400_000;
/** An average month, so 30 days is one month and 364 is eleven. */
const MONTH_DAYS = 30.44;

export interface ReviewAge {
  readonly unit: 'today' | 'days' | 'weeks' | 'months' | 'years';
  readonly count: number;
}

/** How long ago a review was written, in the largest unit that fits: "3 weeks ago". */
export function reviewAge(createdAtUtc: string, now: Date): ReviewAge {
  const days = Math.floor((now.getTime() - new Date(createdAtUtc).getTime()) / DAY_MS);
  // Not a number, or a clock behind the server's: never a review from the future.
  if (!(days >= 1)) return { unit: 'today', count: 0 };
  if (days < 7) return { unit: 'days', count: days };
  if (days < 30) return { unit: 'weeks', count: Math.floor(days / 7) };
  if (days < 365) return { unit: 'months', count: Math.max(1, Math.floor(days / MONTH_DAYS)) };
  return { unit: 'years', count: Math.floor(days / 365) };
}

export function ReviewsSection({
  branchId,
  detail,
  failed,
  onRetry,
  locale,
}: {
  readonly branchId: string;
  readonly detail: BranchDetail | null | undefined;
  readonly failed: boolean;
  readonly onRetry: () => void;
  readonly locale: Locale;
}) {
  const { t } = useTranslation('public');
  const headingId = useId();
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const now = useNow(60_000);

  const recent = detail?.recentReviews ?? [];
  const count = detail?.listing.reviewCount ?? 0;
  const rating = detail?.listing.rating ?? null;
  const hasMore = count > recent.length;
  // Read on "see all" only: the spread no longer needs a page in hand, so no
  // view spends the branch's shared request budget on one it may never open.
  const pages = usePublicReviews(branchId, Boolean(detail) && hasMore && expanded);
  const loaded = uniqueReviews((pages.data?.pages ?? []).flatMap((page) => page?.reviews ?? []));
  const ratingCounts = detail?.ratingCounts ?? [];

  const shown = expanded && loaded.length > 0 ? loaded : recent;

  if (detail === null && !failed) return null;

  return (
    <section className="pub-section pub-reviews" aria-labelledby={headingId}>
      <h2 id={headingId} ref={headingRef}>
        {t('section.reviews')}
      </h2>

      {failed ? (
        <div className="pub-section-failed">
          <p className="pub-muted">{t('reviews.failed')}</p>
          <button type="button" className="pub-button" onClick={onRetry}>
            {t('page.retry')}
          </button>
        </div>
      ) : detail === undefined ? (
        <div className="pub-skeleton-lines" aria-hidden="true">
          <span className="pub-skeleton pub-skeleton-title" />
          <span className="pub-skeleton pub-skeleton-card pub-review-skeleton" />
        </div>
      ) : count === 0 ? (
        <p className="pub-muted">{t('reviews.none')}</p>
      ) : (
        <>
          <div className="pub-review-summary">
            <div>
              {rating !== null ? (
                // For the eye: the stars beside it say the same to a screen reader.
                <p className="pub-review-average display" aria-hidden="true">
                  {formatRating(rating, locale)}
                </p>
              ) : null}
              <p className="pub-review-of">
                {rating !== null ? (
                  <Stars
                    rating={rating}
                    label={t('reviews.outOf', { rating: formatRating(rating, locale) })}
                  />
                ) : null}{' '}
                <span>{t('reviews.count', { count })}</span>
              </p>
            </div>
            {/* Only when the counts are the reviews counted: an older server
                sends none, and five empty bars beside "24 reviews" would be a
                spread made up (review N6). */}
            {ratingCounts.reduce((sum, value) => sum + value, 0) === count ? (
              <Spread counts={ratingCounts} total={count} />
            ) : null}
          </div>

          <ul className="pub-review-list" id={listId}>
            {shown.map((review) => (
              <li key={review.reviewId}>
                <ReviewCard review={review} now={now} />
              </li>
            ))}
          </ul>

          {/* Mounted before it speaks: a live region added with its text is
              not announced by every screen reader. */}
          <p className="pub-muted pub-review-loading" role="status">
            {expanded && pages.isFetching ? t('reviews.loading') : ''}
          </p>
          {expanded && pages.isError ? (
            <div className="pub-section-failed">
              <p className="pub-muted">{t('reviews.failed')}</p>
              <button
                type="button"
                className="pub-button"
                onClick={() => void (loaded.length > 0 ? pages.fetchNextPage() : pages.refetch())}
              >
                {t('page.retry')}
              </button>
            </div>
          ) : null}

          {hasMore ? (
            <div className="pub-review-more">
              <button
                type="button"
                className="pub-button"
                aria-expanded={expanded}
                aria-controls={listId}
                onClick={() => {
                  if (expanded) {
                    // Twenty cards fold away above this button; without this the
                    // visitor lands deep in the hours (Safari keeps no anchor).
                    headingRef.current?.scrollIntoView?.({ block: 'start' });
                  }
                  setExpanded(!expanded);
                }}
              >
                {expanded ? t('reviews.showFewer') : t('reviews.seeAll', { count })}
              </button>
              {expanded && pages.hasNextPage ? (
                <button
                  type="button"
                  className="pub-button pub-button-quiet"
                  disabled={pages.isFetchingNextPage}
                  onClick={() => void pages.fetchNextPage()}
                >
                  {t('reviews.more')}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {failed ? null : <p className="pub-muted pub-review-note">{t('reviews.who')}</p>}
    </section>
  );
}

/**
 * Each review once, in the order given. Pages are read by offset, newest
 * first: a review published between two reads pushes the last of one page
 * onto the next, and a refetch on reconnect reads them all again.
 */
function uniqueReviews(reviews: readonly BranchReview[]): BranchReview[] {
  const seen = new Set<string>();
  return reviews.filter((review) => {
    if (seen.has(review.reviewId)) return false;
    seen.add(review.reviewId);
    return true;
  });
}

/**
 * Five stars to the nearest half — 4.5 is four and a half, not five — read as
 * one sentence.
 */
function Stars({ rating, label }: { readonly rating: number; readonly label: string }) {
  const halves = Math.round(rating * 2);
  return (
    <span className="pub-stars" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((step) => (
        <span
          key={step}
          className={
            step * 2 <= halves
              ? 'pub-star'
              : step * 2 - 1 === halves
                ? 'pub-star-half'
                : 'pub-star-off'
          }
        >
          ★
        </span>
      ))}
    </span>
  );
}

/**
 * How many reviews gave five stars, four, and so on: bars, read as one
 * sentence. From the server's counts (one star first), each bar the share of
 * every shown review.
 */
function Spread({ counts, total }: { readonly counts: readonly number[]; readonly total: number }) {
  const { t } = useTranslation('public');
  const rows = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: counts[stars - 1] ?? 0 }));
  const label = rows
    .map((row) =>
      t('reviews.bar', { stars: t('reviews.stars', { count: row.stars }), count: row.count }),
    )
    .join(', ');

  return (
    <div
      className="pub-review-bars"
      role="img"
      aria-label={`${t('reviews.distribution')}: ${label}`}
    >
      {rows.map((row) => (
        <div key={row.stars}>
          <span>{row.stars}★</span>
          <i>
            <b style={{ width: `${total > 0 ? Math.round((row.count / total) * 100) : 0}%` }} />
          </i>
          <span>{row.count}</span>
        </div>
      ))}
    </div>
  );
}

/** One review: who, the stars, how long ago, what they wrote, and the venue's reply under it. */
function ReviewCard({ review, now }: { readonly review: BranchReview; readonly now: Date }) {
  const { t } = useTranslation('public');
  const { t: td } = useTranslation('diner');
  const titleId = useId();
  const age = reviewAge(review.createdAtUtc, now);
  const ageText = (of: ReviewAge) =>
    of.unit === 'today' ? t('reviews.age.today') : t(`reviews.age.${of.unit}`, { count: of.count });
  const reply = review.reply;
  const role = reply ? td(`place.review.reply.role.${reply.authorRole}`) : '';

  return (
    <article className="pub-review" aria-labelledby={titleId}>
      <div className="pub-review-who">
        <span className="pub-review-avatar" aria-hidden="true">
          {/* A whole character: an emoji or a rare script is two UTF-16 units. */}
          {Array.from(review.authorName)[0]}
        </span>
        <div>
          <h3 id={titleId}>{review.authorName}</h3>
          <p className="pub-review-meta">
            <Stars rating={review.rating} label={t('reviews.stars', { count: review.rating })} />
            {' · '}
            {ageText(age)}
            {review.edited ? ` · ${t('reviews.edited')}` : ''}
          </p>
        </div>
      </div>
      {review.text ? <p className="pub-review-text">{review.text}</p> : null}
      {reply ? (
        <div className="pub-review-reply">
          <p className="pub-review-reply-by">
            {td('place.review.reply.from', {
              by: reply.authorName
                ? td('place.review.reply.signature', { name: reply.authorName, role })
                : td('place.review.reply.roleOnly', { role }),
            })}
          </p>
          <p className="pub-review-reply-text">{reply.text}</p>
          <p className="pub-review-reply-meta">
            {ageText(reviewAge(reply.createdAtUtc, now))}
            {reply.edited ? ` · ${t('reviews.edited')}` : ''}
          </p>
          {/* The one honesty cue the API gives: the answer may sit under words
              it never answered. As the diner app says it. */}
          {Date.parse(review.updatedAtUtc) > Date.parse(reply.updatedAtUtc) ? (
            <p className="pub-review-reply-meta">{td('place.review.reply.reviewEditedAfter')}</p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
