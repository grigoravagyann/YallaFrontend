import {
  REVIEW_MODERATION_FILTERS,
  ReviewHiddenByPlatformError,
  ReviewHiddenNoReplyError,
  summariseReviews,
  type ReviewModerationFilter,
  type VenueModeratedReview,
} from '@yalla/api';
import {
  useReviewReply,
  useSetVenueReviewVisibility,
  useVenueBranchReviews,
} from '@yalla/api/react';
import { formatDate } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useRef, useState } from 'react';
import { useCurrentUser } from '../../../auth/useCurrentUser';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { usePendingFocus } from '../../platform/venue/venueFields';
import {
  HideForm,
  ReplyForm,
  ReviewCard,
  ReviewRules,
  ReviewSummaryCard,
  useReplySignature,
} from '../../reviews/ReviewCard';
import { PageHeader } from '../../ui/PageHeader';
import { useToast } from '../../ui/toast';
import { useVenueOutlet } from '../VenueLayout';

const PAGE_SIZE = 20;

/**
 * The branch's reviews for its owner, general manager or branch manager
 * (venue console Reviews artboard): what diners wrote, the venue's public
 * reply under each, and the takedown.
 *
 * - **Filters** with the branch's counts: all, reported, hidden. Under "all"
 *   the reported ones still showing come first: they are why somebody came.
 * - **Reply** once per review, signed with the writer's name and role, and
 *   changed in place. Not on a hidden review: the server refuses it, so the
 *   button is not offered.
 * - **Hide only for a rule violation**, never for a bad rating: the reason is
 *   required, and the Yalla team sees every hidden review.
 * - **Yalla has the last word.** A review the Yalla team hid shows why in
 *   place of "Show again"; if they hide one after this list was read, the
 *   server's refusal locks the row the same way.
 * - **Undo** from the toast takes back what was done: a first reply is taken
 *   down, a hide is shown again and a "show again" hidden again with the same
 *   reason. An edit's undo puts the words before back — but as a new save, so
 *   the reply stays marked edited and is signed by whoever pressed Undo; the
 *   server keeps no earlier writer to return to.
 * - **A reply is first only if the server says so.** A list read before a
 *   colleague answered offers "Reply" on a review that already has one; the
 *   save then changes the colleague's reply, and the toast says "changed",
 *   with no undo — taking it down would delete their words.
 */
export function VenueReviewsScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { branchId, branchName, timeZoneId } = useVenueOutlet();
  return (
    <div className="yc-page">
      <PageHeader title={t('reviews.title')} sub={t('reviews.sub', { branch: branchName ?? '' })} />
      {branchId ? (
        // Another branch is another list: nothing open carries over.
        <VenueReviews key={branchId} branchId={branchId} timeZoneId={timeZoneId} />
      ) : (
        <p className="yc-card yc-empty-line">{t('menu.noBranch')}</p>
      )}
    </div>
  );
}

type Editing = { readonly reviewId: string; readonly kind: 'hide' | 'reply' } | null;

function VenueReviews({
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
  const { user } = useCurrentUser();
  const signature = useReplySignature();
  const [filter, setFilter] = useState<ReviewModerationFilter>('all');
  const [page, setPage] = useState(1);
  const list = useVenueBranchReviews(branchId, { filter, page, pageSize: PAGE_SIZE });
  const visibility = useSetVenueReviewVisibility(branchId);
  const reply = useReviewReply(branchId);
  const [editing, setEditing] = useState<Editing>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** Hidden by Yalla since this list was read: the server refused to show them again. */
  const [locked, setLocked] = useState<ReadonlySet<string>>(() => new Set());

  /**
   * The button the focus returns to once the list is fresh. A review that left
   * the filter on screen (shown again under Hidden, hidden under Reported) has
   * no button left: the filter keeps the focus instead.
   */
  const refocus = useRef<{ readonly id: string; readonly since: number } | null>(null);
  const fetchedAt = useRef(list.dataUpdatedAt);
  useEffect(() => {
    fetchedAt.current = list.dataUpdatedAt;
    const pending = refocus.current;
    if (!pending || list.isFetching || list.dataUpdatedAt <= pending.since) return;
    refocus.current = null;
    const target =
      document.getElementById(pending.id) ??
      document.querySelector<HTMLElement>('.yc-rv-chips [aria-pressed="true"]');
    target?.focus();
  });
  const focusAfter = (id: string, since: number) => {
    refocus.current = { id, since };
  };

  // A hide can empty the last page: step back to the one that is left.
  if (list.data && !list.isFetching && list.data.items.length === 0 && page > 1) {
    setPage(Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)));
  }

  const actionId = (review: VenueModeratedReview) => `rv-act-${review.reviewId}`;
  const replyId = (review: VenueModeratedReview) => `rv-reply-btn-${review.reviewId}`;

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
    } catch (error) {
      if (error instanceof ReviewHiddenByPlatformError) {
        // Locked, not failed: the row says why in place of its button.
        setLocked((current) => new Set(current).add(review.reviewId));
      } else {
        setFailure(t('reviews.failed'));
      }
      return false;
    }
  }

  async function hideReview(review: VenueModeratedReview, reason: string) {
    const since = fetchedAt.current;
    if (!(await setHidden(review, true, reason))) return;
    setEditing(null);
    focusAfter(actionId(review), since);
    toast.say(t('branchReviews.toast.hidden', { name: review.authorName }), {
      undo: () =>
        void setHidden(review, false, null).then((done) => {
          if (done) toast.say(t('branchReviews.toast.shown', { name: review.authorName }));
        }),
    });
  }

  async function showReview(review: VenueModeratedReview) {
    const reason = review.hiddenReason ?? t('branchReviews.reasons.other');
    const since = fetchedAt.current;
    if (!(await setHidden(review, false, null))) return;
    focusAfter(actionId(review), since);
    toast.say(t('branchReviews.toast.shown', { name: review.authorName }), {
      undo: () => void setHidden(review, true, reason),
    });
  }

  /**
   * Write or change the reply; null takes it down (an undo of a first reply).
   * The review as the server answers it, or null when it refused.
   */
  async function writeReply(
    review: VenueModeratedReview,
    text: string | null,
  ): Promise<VenueModeratedReview | null> {
    setFailure(null);
    try {
      return await reply.mutateAsync({ reviewId: review.reviewId, text });
    } catch (error) {
      if (error instanceof ReviewHiddenNoReplyError) {
        // Hidden since the list was read, by the venue or by Yalla: the form
        // closes, and the row's own action — "Show again", or the filter
        // when Yalla's lock leaves none — takes the focus once it is fresh.
        setEditing(null);
        focusAfter(actionId(review), fetchedAt.current);
        setFailure(t('reviews.reply.hidden'));
      } else {
        setFailure(t('reviews.failed'));
      }
      return null;
    }
  }

  async function sendReply(review: VenueModeratedReview, text: string) {
    const before = review.reply?.text ?? null;
    const since = fetchedAt.current;
    const saved = await writeReply(review, text);
    if (!saved) return;
    setEditing(null);
    focusAfter(replyId(review), since);
    const undoTo = (words: string | null) => () => {
      const undoneSince = fetchedAt.current;
      void writeReply(review, words).then((done) => {
        if (done) focusAfter(replyId(review), undoneSince);
      });
    };
    // A first reply tells the reviewer in the app; an edit tells nobody.
    const first = before === null && saved.reply !== null && !saved.reply.edited;
    if (first) {
      toast.say(t('reviews.reply.published'), { undo: undoTo(null) });
    } else if (before === null) {
      // Somebody else answered first: this changed their reply. Nothing here
      // knows their words, so there is nothing to put back.
      toast.say(t('reviews.reply.updated'));
    } else {
      toast.say(t('reviews.reply.updated'), { undo: undoTo(before) });
    }
  }

  const isReported = (review: VenueModeratedReview) => review.reportCount > 0 && !review.hidden;
  const items = [...(list.data?.items ?? [])];
  // Under "all", the reported reviews still showing come first.
  if (filter === 'all') items.sort((a, b) => Number(isReported(b)) - Number(isReported(a)));
  const summary = list.data?.summary ?? null;
  const counts: Record<ReviewModerationFilter, number | undefined> = {
    all: summary?.all,
    reported: summary?.reported,
    hidden: summary?.hidden,
  };
  const lastPage = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;
  const mySignature = user
    ? signature(
        user.displayName,
        user.role === 'owner' || user.role === 'generalManager' ? user.role : 'manager',
      )
    : '';

  function hiddenBy(review: VenueModeratedReview): string {
    const when = review.hiddenAtUtc ? formatDate(review.hiddenAtUtc, timeZoneId, locale) : '';
    if (review.hiddenByPlatform) return t('reviews.hiddenByYalla', { date: when });
    return review.hiddenByName
      ? t('reviews.hiddenByName', { name: review.hiddenByName, date: when })
      : t('reviews.hiddenByVenue', { date: when });
  }

  let body;
  if (list.isPending) {
    body = (
      <p className="yc-card yc-empty-line" role="status">
        {t('loading')}
      </p>
    );
  } else if (list.isError && !list.data) {
    body = (
      <div className="yc-card yc-ov-pad">
        <QueryFailureNotice error={list.error} onRetry={() => void list.refetch()} />
      </div>
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
        <p>{t('reviews.empty')}</p>
      </div>
    );
  } else {
    body = (
      <div className="yc-rv-list">
        {items.map((review) => {
          const lockedHere =
            review.hidden && (review.hiddenByPlatform || locked.has(review.reviewId));
          // A reply form closes once a fresh list shows the review hidden: the
          // server would refuse what is typed in it.
          const open =
            editing?.reviewId === review.reviewId && !(editing.kind === 'reply' && review.hidden)
              ? editing.kind
              : null;
          return (
            <ReviewCard
              key={review.reviewId}
              review={review}
              reportCount={review.reportCount}
              timeZoneId={timeZoneId}
              hiddenBy={hiddenBy(review)}
            >
              {open === 'reply' ? (
                <ReplyForm
                  reviewId={review.reviewId}
                  initial={review.reply?.text ?? ''}
                  signature={mySignature}
                  busy={reply.isPending}
                  onCancel={() => {
                    setEditing(null);
                    focusLater(replyId(review));
                  }}
                  onSend={(text) => void sendReply(review, text)}
                />
              ) : open === 'hide' ? (
                <HideForm
                  reviewId={review.reviewId}
                  busy={visibility.isPending}
                  fieldLabel={t('reviews.reason')}
                  help={t('reviews.reasonHelp')}
                  onCancel={() => {
                    setEditing(null);
                    focusLater(actionId(review));
                  }}
                  onHide={(reason) => void hideReview(review, reason)}
                />
              ) : (
                <div className="yc-rv-f">
                  {lockedHere ? (
                    <span className="yc-help">{t('reviews.platformHidden')}</span>
                  ) : null}
                  <span className="yc-grow" />
                  {review.hidden ? null : (
                    <button
                      type="button"
                      id={replyId(review)}
                      className="yc-btn yc-btn-pri yc-btn-sm"
                      onClick={() => {
                        setEditing({ reviewId: review.reviewId, kind: 'reply' });
                        focusLater(`rv-reply-${review.reviewId}`);
                      }}
                    >
                      {review.reply ? t('reviews.reply.edit') : t('reviews.reply.start')}
                    </button>
                  )}
                  {review.hidden ? (
                    lockedHere ? null : (
                      <button
                        type="button"
                        id={actionId(review)}
                        className="yc-btn yc-btn-sec yc-btn-sm"
                        disabled={visibility.isPending}
                        onClick={() => void showReview(review)}
                      >
                        {t('branchReviews.show')}
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      id={actionId(review)}
                      className="yc-btn yc-btn-sec yc-btn-sm"
                      disabled={visibility.isPending}
                      onClick={() => {
                        setEditing({ reviewId: review.reviewId, kind: 'hide' });
                        focusLater(`rv-preset-${review.reviewId}`);
                      }}
                    >
                      {t('branchReviews.hide')}
                    </button>
                  )}
                </div>
              )}
            </ReviewCard>
          );
        })}
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
          {REVIEW_MODERATION_FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              className={key === filter ? 'yc-chip is-on' : 'yc-chip'}
              aria-pressed={key === filter}
              onClick={() => {
                setFilter(key);
                setPage(1);
                setEditing(null);
                setFailure(null);
              }}
            >
              {t(`branchReviews.filter.${key}`)}
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
        <ReviewSummaryCard
          summary={summary ?? summariseReviews(list.data?.items ?? [])}
          showChange
        />
        <ReviewRules venue />
      </aside>
    </div>
  );
}
