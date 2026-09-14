import {
  REVIEW_MODERATION_FILTERS,
  ReviewHiddenByPlatformError,
  type ReviewModerationFilter,
} from '@yalla/api';
import { useSetVenueReviewVisibility, useVenueBranchReviews } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { ReviewModerationRow, ReviewPager } from '../../reviews/ReviewModerationRow';
import { useVenueOutlet } from '../VenueLayout';

/**
 * Branch > Reviews: what diners wrote about this branch, and the owner's or
 * manager's takedown.
 *
 * Three slices — every review, the ones diners reported, the ones hidden —
 * because the question somebody opens this with is almost always "what got
 * reported". Report counts are on each row. Hiding asks for a reason, which is
 * recorded and audited; restoring does not.
 *
 * The platform has the last word. A review the Yalla team hid cannot be
 * restored from here: the list says so (`hiddenByPlatform`) and the row shows
 * why in place of the button. If the platform hides one after this list was
 * read, the server's refusal locks the row the same way for as long as the
 * screen is open.
 */
export function VenueReviewsScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { branchId, timeZoneId } = useVenueOutlet();
  const [filter, setFilter] = useState<ReviewModerationFilter>('all');
  const [page, setPage] = useState(1);
  const query = useVenueBranchReviews(branchId ?? undefined, { filter, page });
  const visibility = useSetVenueReviewVisibility(branchId ?? undefined);
  const [locked, setLocked] = useState<ReadonlySet<string>>(() => new Set());
  const [failure, setFailure] = useState<{ reviewId: string; text: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (!branchId) {
    return (
      <section className="page">
        <h2>{t('reviews.title')}</h2>
        <p className="muted">{t('menu.noBranch')}</p>
      </section>
    );
  }

  const copy = {
    hide: t('reviews.hide'),
    unhide: t('reviews.unhide'),
    reason: t('reviews.reason'),
    reasonLine: (reason: string) => t('reviews.hiddenReasonLine', { reason }),
    reasonRequired: t('reviews.reasonRequired'),
    hiddenBadge: t('reviews.hiddenBadge'),
  };

  async function change(reviewId: string, hidden: boolean, reason: string | null) {
    setFailure(null);
    setPendingId(reviewId);
    try {
      await visibility.mutateAsync({ reviewId, command: { hidden, reason } });
      return true;
    } catch (error) {
      if (error instanceof ReviewHiddenByPlatformError) {
        setLocked((current) => new Set(current).add(reviewId));
      } else {
        setFailure({ reviewId, text: t('reviews.failed') });
      }
      return false;
    } finally {
      setPendingId(null);
    }
  }

  const reviews = query.data?.items ?? [];

  return (
    <section className="page">
      <header className="page-head">
        <h2>{t('reviews.title')}</h2>
      </header>

      <div className="chip-row" role="group" aria-label={t('reviews.title')}>
        {REVIEW_MODERATION_FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            className={`chip${filter === option ? ' is-on' : ''}`}
            aria-pressed={filter === option}
            onClick={() => {
              setFilter(option);
              setPage(1);
              setFailure(null);
            }}
          >
            {t(`reviews.filter.${option}`)}
          </button>
        ))}
      </div>

      <div className="card">
        {query.isError && !query.data ? (
          <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />
        ) : query.isPending ? (
          <p className="muted">{t('loading')}</p>
        ) : reviews.length === 0 ? (
          <p className="muted">{t('reviews.empty')}</p>
        ) : (
          <ul className="rows">
            {reviews.map((review) => (
              <ReviewModerationRow
                key={review.reviewId}
                review={review}
                copy={copy}
                timeZoneId={timeZoneId}
                reportCount={review.reportCount}
                locked={review.hidden && (review.hiddenByPlatform || locked.has(review.reviewId))}
                lockedText={t('reviews.platformHidden')}
                busy={pendingId === review.reviewId}
                failure={failure?.reviewId === review.reviewId ? failure.text : null}
                onHide={(reason) => change(review.reviewId, true, reason)}
                onUnhide={() => void change(review.reviewId, false, null)}
              />
            ))}
          </ul>
        )}
        {query.data ? (
          <ReviewPager
            page={query.data.page}
            pageSize={query.data.pageSize}
            total={query.data.total}
            onPage={setPage}
          />
        ) : null}
      </div>
    </section>
  );
}
