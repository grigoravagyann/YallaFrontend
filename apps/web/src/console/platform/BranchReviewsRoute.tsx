import {
  summariseReviews,
  type ReviewModerationFilter,
  type VenueModeratedReview,
} from '@yalla/api';
import {
  useDismissReviewReports,
  usePlatformBranchReviews,
  useRestoreReviewReports,
  useSetReviewVisibility,
} from '@yalla/api/react';
import { formatDate } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useRef, useState } from 'react';
import { HideForm, ReviewCard, ReviewRules, ReviewSummaryCard } from '../reviews/ReviewCard';
import { useToast } from '../ui/toast';
import { usePendingFocus } from './venue/venueFields';
import { BranchPage } from './PlatformBranchHeader';

const PAGE_SIZE = 20;
/** The summary's sample: the newest hundred, the most a page may carry. */
const SUMMARY_SIZE = 100;
const FILTERS: readonly ReviewModerationFilter[] = ['all', 'reported', 'hidden'];

/**
 * A branch's reviews for the platform team (Reviews artboard): every review,
 * hidden ones included, with the takedown that has the last word — what the
 * venue hid can be shown again here, and what is hidden here the venue cannot
 * restore. Every change is audited on the server.
 *
 * - **Filters** with counts: all, reported, hidden. Under "all", the reported
 *   ones that are still showing come first: they are why somebody came here.
 * - **Hiding asks why**, in a sentence the restaurant will read: a preset to
 *   start from, the words under the field when missing, and the cursor there.
 * - **Dismiss reports** sets the reports aside and leaves the review up.
 * - **Undo** from the toast takes back exactly what was done: a hide is
 *   shown again, a dismissal's reports count again (`restore-reports`), and
 *   showing again what the platform hid hides it again with the same reason.
 *   Showing again what the *venue* hid has no Undo: hiding it from here would
 *   make it a platform hide, which the venue could no longer lift.
 */
export function BranchReviewsRoute() {
  return (
    <BranchPage tab="reviews">
      {({ branch, timeZoneId }) => (
        <ReviewsModeration key={branch.id} branchId={branch.id} timeZoneId={timeZoneId} />
      )}
    </BranchPage>
  );
}

function ReviewsModeration({
  branchId,
  timeZoneId,
}: {
  readonly branchId: string;
  readonly timeZoneId: string;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const toast = useToast();
  const focusLater = usePendingFocus();
  const [filter, setFilter] = useState<ReviewModerationFilter>('all');
  const [page, setPage] = useState(1);
  const list = usePlatformBranchReviews(branchId, { filter, page, pageSize: PAGE_SIZE });
  const sample = usePlatformBranchReviews(branchId, { filter: 'all', pageSize: SUMMARY_SIZE });
  const reported = usePlatformBranchReviews(branchId, { filter: 'reported', pageSize: 1 });
  const hidden = usePlatformBranchReviews(branchId, { filter: 'hidden', pageSize: 1 });
  const visibility = useSetReviewVisibility();
  const dismiss = useDismissReviewReports();
  const restoreReports = useRestoreReviewReports();
  const [editing, setEditing] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  /**
   * The review whose action the focus returns to once the list is fresh. A
   * review that left the filter on screen (shown again under Hidden, hidden
   * under Reported) has no button left: the filter keeps the focus instead.
   */
  const refocus = useRef<{ readonly reviewId: string; readonly since: number } | null>(null);
  /** When the list on screen was fetched: a change waits for a newer answer than this. */
  const fetchedAt = useRef(list.dataUpdatedAt);
  useEffect(() => {
    fetchedAt.current = list.dataUpdatedAt;
    const pending = refocus.current;
    if (!pending || list.isFetching || list.dataUpdatedAt <= pending.since) return;
    refocus.current = null;
    const target =
      document.getElementById(`rv-act-${pending.reviewId}`) ??
      document.querySelector<HTMLElement>('.yc-rv-chips [aria-pressed="true"]');
    target?.focus();
  });
  const focusAfter = (reviewId: string, since: number) => {
    refocus.current = { reviewId, since };
  };

  // A hide or a dismissal can empty the last page: step back to the one that is left.
  if (list.data && !list.isFetching && list.data.items.length === 0 && page > 1) {
    setPage(Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)));
  }

  async function dismissReports(review: VenueModeratedReview) {
    if (dismiss.isPending) return;
    const since = fetchedAt.current;
    setFailure(null);
    try {
      // Resolves once the lists have the review without its reports.
      await dismiss.mutateAsync(review.reviewId);
    } catch {
      setFailure(t('branchReviews.failed'));
      return;
    }
    // The button goes with the reports; the focus goes to Hide beside it.
    focusAfter(review.reviewId, since);
    toast.say(t('branchReviews.toast.dismissed'), {
      undo: () =>
        void restoreReports.mutateAsync(review.reviewId).then(
          () => focusAfter(review.reviewId, -1),
          () => setFailure(t('branchReviews.failed')),
        ),
    });
  }

  async function setHidden(
    review: VenueModeratedReview,
    hide: boolean,
    reason: string | null,
  ): Promise<boolean> {
    setFailure(null);
    try {
      await visibility.mutateAsync({
        reviewId: review.reviewId,
        command: { hidden: hide, reason },
      });
      return true;
    } catch {
      setFailure(t('branchReviews.failed'));
      return false;
    }
  }

  async function hideReview(review: VenueModeratedReview, reason: string) {
    const since = fetchedAt.current;
    if (!(await setHidden(review, true, reason))) return;
    setEditing(null);
    focusAfter(review.reviewId, since);
    toast.say(t('branchReviews.toast.hidden', { name: review.authorName }), {
      undo: () =>
        void setHidden(review, false, null).then((done) => {
          if (done) toast.say(t('branchReviews.toast.shown', { name: review.authorName }));
        }),
    });
  }

  async function showReview(review: VenueModeratedReview) {
    const reason = review.hiddenReason;
    const byPlatform = review.hiddenByPlatform;
    const since = fetchedAt.current;
    if (!(await setHidden(review, false, null))) return;
    focusAfter(review.reviewId, since);
    const said = t('branchReviews.toast.shown', { name: review.authorName });
    // Only the platform's own hide can be put back exactly: from here, any
    // hide is the platform's, and the venue's would become one it cannot lift.
    if (!byPlatform) {
      toast.say(said);
      return;
    }
    toast.say(said, {
      undo: () => void setHidden(review, true, reason ?? t('branchReviews.reasons.other')),
    });
  }

  const isReported = (review: VenueModeratedReview) => review.reportCount > 0 && !review.hidden;
  const items = [...(list.data?.items ?? [])];
  // Under "all", the reported reviews still showing come first.
  if (filter === 'all') items.sort((a, b) => Number(isReported(b)) - Number(isReported(a)));

  const counts: Record<ReviewModerationFilter, number | undefined> = {
    all: sample.data?.total,
    reported: reported.data?.total,
    hidden: hidden.data?.total,
  };
  const filterLabel = (key: ReviewModerationFilter) =>
    key === 'all'
      ? t('branchReviews.filter.all')
      : key === 'reported'
        ? t('branchReviews.filter.reported')
        : t('branchReviews.filter.hidden');

  const lastPage = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;

  let body;
  if (list.isPending) {
    body = (
      <p className="yc-card yc-empty-line" role="status">
        {t('loading')}
      </p>
    );
  } else if (list.isError && !list.data) {
    body = (
      <p className="yc-alert" role="alert">
        {t('branchReviews.loadFailed')}
      </p>
    );
  } else if (items.length === 0) {
    body = (
      <div className="yc-card yc-empty">
        <h2 className="yc-h2">
          {filter === 'reported'
            ? t('branchReviews.empty.reportedTitle')
            : filter === 'hidden'
              ? t('branchReviews.empty.hiddenTitle')
              : t('branchReviews.empty.allTitle')}
        </h2>
        <p>
          {filter === 'reported'
            ? t('branchReviews.empty.reportedBody')
            : filter === 'hidden'
              ? t('branchReviews.empty.hiddenBody')
              : t('branchReviews.empty.allBody')}
        </p>
      </div>
    );
  } else {
    body = (
      <div className="yc-rv-list">
        {items.map((review) => (
          <ReviewCard
            key={review.reviewId}
            review={review}
            reportCount={review.reportCount}
            timeZoneId={timeZoneId}
            hiddenBy={`${
              review.hiddenByPlatform
                ? t('branchReviews.hiddenByPlatform')
                : t('branchReviews.hiddenByVenue')
            }${review.hiddenAtUtc ? `, ${formatDate(review.hiddenAtUtc, timeZoneId, locale)}` : ''}`}
          >
            {editing === review.reviewId ? (
              <HideForm
                reviewId={review.reviewId}
                busy={visibility.isPending}
                fieldLabel={t('branchReviews.reasonField')}
                help={t('branchReviews.reasonHelp')}
                onCancel={() => {
                  setEditing(null);
                  focusLater(`rv-act-${review.reviewId}`);
                }}
                onHide={(reason) => void hideReview(review, reason)}
              />
            ) : (
              <div className="yc-rv-f">
                <span className="yc-grow" />
                {isReported(review) ? (
                  <button
                    type="button"
                    className="yc-btn yc-btn-ghost yc-btn-sm"
                    disabled={dismiss.isPending}
                    aria-busy={dismiss.isPending}
                    onClick={() => void dismissReports(review)}
                  >
                    {t('branchReviews.dismiss')}
                  </button>
                ) : null}
                <button
                  type="button"
                  id={`rv-act-${review.reviewId}`}
                  className="yc-btn yc-btn-sec yc-btn-sm"
                  disabled={visibility.isPending}
                  onClick={
                    review.hidden
                      ? () => void showReview(review)
                      : () => {
                          setEditing(review.reviewId);
                          focusLater(`rv-preset-${review.reviewId}`);
                        }
                  }
                >
                  {review.hidden ? t('branchReviews.show') : t('branchReviews.hide')}
                </button>
              </div>
            )}
          </ReviewCard>
        ))}
      </div>
    );
  }

  return (
    <div className="yc-rv-layout">
      <div className="yc-panel-body">
        <div
          className="yc-chips yc-rv-chips"
          role="group"
          aria-label={t('branchReviews.filter.label')}
        >
          {FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              className={key === filter ? 'yc-chip is-on' : 'yc-chip'}
              aria-pressed={key === filter}
              onClick={() => {
                setFilter(key);
                setPage(1);
                setEditing(null);
              }}
            >
              {filterLabel(key)}
              {counts[key] !== undefined ? <span className="yc-chip-n">{counts[key]}</span> : null}
            </button>
          ))}
        </div>
        {failure ? (
          <p className="yc-alert" role="alert">
            {failure}
          </p>
        ) : null}
        {body}
        {list.data && lastPage > 1 ? (
          <div className="yc-pager">
            <button
              type="button"
              className="yc-btn yc-btn-sec yc-btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {t('venues.previous')}
            </button>
            <span className="yc-help">
              {t('venues.showing', {
                from: (page - 1) * PAGE_SIZE + 1,
                to: Math.min(page * PAGE_SIZE, list.data.total),
                total: list.data.total,
              })}
            </span>
            <button
              type="button"
              className="yc-btn yc-btn-sec yc-btn-sm"
              disabled={page >= lastPage}
              onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
            >
              {t('venues.next')}
            </button>
          </div>
        ) : null}
      </div>

      <aside className="yc-panel-body">
        <ReviewSummaryCard summary={summariseReviews(sample.data?.items ?? [])} />
        <ReviewRules />
      </aside>
    </div>
  );
}
