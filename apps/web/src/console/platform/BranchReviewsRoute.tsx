import { usePlatformBranchReviews, useSetReviewVisibility } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { QueryFailureNotice } from '../../components/QueryFailureNotice';
import { ReviewModerationRow, ReviewPager } from '../reviews/ReviewModerationRow';
import { PlatformBranchHeader, usePlatformBranchRoute } from './PlatformBranchHeader';

/**
 * A branch's reviews for the platform team, hidden ones included, with the
 * takedown that has the last word: whatever the venue hid can be restored
 * here, and what is hidden here the venue cannot restore. Every change is
 * audited on the server, and hiding asks for the reason that goes with it.
 */
export function BranchReviewsRoute() {
  const { t } = useTranslation(['admin', 'common']);
  const route = usePlatformBranchRoute();
  const [page, setPage] = useState(1);
  const query = usePlatformBranchReviews(route.branchId, page);
  const visibility = useSetReviewVisibility();
  const [failure, setFailure] = useState<{ reviewId: string; text: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const copy = {
    hide: t('platform.reviews.hide'),
    unhide: t('platform.reviews.unhide'),
    reason: t('platform.reviews.reason'),
    reasonRequired: t('platform.reviews.reasonRequired'),
    hiddenBadge: t('platform.reviews.hiddenBadge'),
  };

  async function change(reviewId: string, hidden: boolean, reason: string | null) {
    setFailure(null);
    setPendingId(reviewId);
    try {
      await visibility.mutateAsync({ reviewId, command: { hidden, reason } });
      return true;
    } catch {
      setFailure({ reviewId, text: t('platform.reviews.failed') });
      return false;
    } finally {
      setPendingId(null);
    }
  }

  const reviews = query.data?.items ?? [];

  return (
    <section className="page">
      <PlatformBranchHeader route={route} />
      <header className="page-head">
        <h1>{t('platform.reviews.title')}</h1>
      </header>

      <div className="card">
        {query.isError && !query.data ? (
          <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />
        ) : query.isPending ? (
          <p className="muted">{t('loading')}</p>
        ) : reviews.length === 0 ? (
          <p className="muted">{t('platform.reviews.empty')}</p>
        ) : (
          <ul className="rows">
            {reviews.map((review) => (
              <ReviewModerationRow
                key={review.reviewId}
                review={review}
                copy={copy}
                timeZoneId={route.timeZoneId}
                locked={false}
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
