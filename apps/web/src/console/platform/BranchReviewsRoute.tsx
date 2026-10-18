import type { ReviewModerationFilter, VenueModeratedReview } from '@yalla/api';
import {
  useDismissReviewReports,
  usePlatformBranchReviews,
  useSetReviewVisibility,
} from '@yalla/api/react';
import { formatDate } from '@yalla/format';
import { useLocale, useTranslation, type Locale } from '@yalla/i18n';
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { EyeOffIcon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { usePendingFocus } from './venue/venueFields';
import { BranchPage } from './PlatformBranchHeader';

/** A reason the restaurant reads: one or two sentences. */
const MAX_REASON = 300;
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
 * - **Every one undoes** from its toast. Dismissing has no route to take it
 *   back, so it is sent only once its Undo can no longer be pressed: the toast
 *   ran out, another replaced it, or the console closed.
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
  const [editing, setEditing] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** Reports set aside on screen, until the server has them set aside too. */
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const restore = (reviewId: string) =>
    setDismissed((current) => {
      const next = new Set(current);
      next.delete(reviewId);
      return next;
    });

  async function commitDismiss(reviewId: string) {
    try {
      // Resolves once the lists have the review without its reports.
      await dismiss.mutateAsync(reviewId);
    } catch {
      setFailure(t('branchReviews.failed'));
    } finally {
      restore(reviewId);
    }
  }

  function startDismiss(review: VenueModeratedReview) {
    setFailure(null);
    setDismissed((current) => new Set(current).add(review.reviewId));
    // The button goes with the reports; the focus goes to Hide beside it.
    focusLater(`rv-act-${review.reviewId}`);
    toast.say(t('branchReviews.toast.dismissed'), {
      undo: () => restore(review.reviewId),
      // No route takes a dismissal back: sent only once Undo is out of reach.
      onExpire: () => void commitDismiss(review.reviewId),
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
    if (!(await setHidden(review, true, reason))) return;
    setEditing(null);
    focusLater(`rv-act-${review.reviewId}`);
    toast.say(t('branchReviews.toast.hidden', { name: review.authorName }), {
      undo: () =>
        void setHidden(review, false, null).then((done) => {
          if (done) toast.say(t('branchReviews.toast.shown', { name: review.authorName }));
        }),
    });
  }

  async function showReview(review: VenueModeratedReview) {
    const reason = review.hiddenReason;
    if (!(await setHidden(review, false, null))) return;
    focusLater(`rv-act-${review.reviewId}`);
    toast.say(t('branchReviews.toast.shown', { name: review.authorName }), {
      undo: () => void setHidden(review, true, reason ?? t('branchReviews.reasons.other')),
    });
  }

  const isReported = (review: VenueModeratedReview) =>
    review.reportCount > 0 && !review.hidden && !dismissed.has(review.reviewId);
  const items = [...(list.data?.items ?? [])];
  // Under "all", the reported reviews still showing come first.
  if (filter === 'all') items.sort((a, b) => Number(isReported(b)) - Number(isReported(a)));

  const counts: Record<ReviewModerationFilter, number | undefined> = {
    all: sample.data?.total,
    reported: reported.data ? Math.max(0, reported.data.total - dismissed.size) : undefined,
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
            reported={isReported(review)}
            editing={editing === review.reviewId}
            busy={visibility.isPending}
            timeZoneId={timeZoneId}
            locale={locale}
            onStartHide={() => {
              setEditing(review.reviewId);
              focusLater(`rv-preset-${review.reviewId}`);
            }}
            onCancelHide={() => {
              setEditing(null);
              focusLater(`rv-act-${review.reviewId}`);
            }}
            onHide={(reason) => void hideReview(review, reason)}
            onShow={() => void showReview(review)}
            onDismiss={() => startDismiss(review)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="yc-rv-layout">
      <div className="yc-panel-body">
        <div className="yc-chips" role="group" aria-label={t('branchReviews.filter.label')}>
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
        <Summary reviews={sample.data?.items ?? []} locale={locale} />
        <Rules />
      </aside>
    </div>
  );
}

interface ReviewCardProps {
  readonly review: VenueModeratedReview;
  readonly reported: boolean;
  readonly editing: boolean;
  readonly busy: boolean;
  readonly timeZoneId: string;
  readonly locale: Locale;
  readonly onStartHide: () => void;
  readonly onCancelHide: () => void;
  readonly onHide: (reason: string) => void;
  readonly onShow: () => void;
  readonly onDismiss: () => void;
}

function ReviewCard({
  review,
  reported,
  editing,
  busy,
  timeZoneId,
  locale,
  onStartHide,
  onCancelHide,
  onHide,
  onShow,
  onDismiss,
}: ReviewCardProps) {
  const { t } = useTranslation(['admin', 'common']);
  const nameId = useId();
  const stars = Math.max(0, Math.min(5, Math.round(review.rating)));
  const className = [
    'yc-card',
    'yc-rv',
    reported ? 'is-reported' : '',
    review.hidden ? 'is-hidden' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <article className={className} aria-labelledby={nameId}>
      <div className="yc-rv-h">
        <div className="yc-rv-a">
          <span className="yc-av" aria-hidden="true">
            {Array.from(review.authorName)[0] ?? ''}
          </span>
          <div>
            <div className="yc-pn" id={nameId}>
              {review.authorName}
            </div>
            <div className="yc-pe">{formatDate(review.createdAtUtc, timeZoneId, locale)}</div>
          </div>
        </div>
        <span className="yc-stars" aria-label={t('branchReviews.stars', { count: stars })}>
          <span aria-hidden="true">{'★'.repeat(stars)}</span>
          <span className="is-off" aria-hidden="true">
            {'★'.repeat(5 - stars)}
          </span>
        </span>
        {reported ? (
          <span className="yc-pill yc-pill-amber">
            {t('branchReviews.reports', { count: review.reportCount })}
          </span>
        ) : null}
        {review.hidden ? (
          <span className="yc-pill yc-pill-grey">{t('branchReviews.hiddenBadge')}</span>
        ) : null}
      </div>
      {review.text ? <p className="yc-rv-txt">{review.text}</p> : null}
      {review.hidden ? (
        <div className="yc-why">
          <EyeOffIcon />
          <span>
            <b>{t('branchReviews.reasonLabel')}</b> {review.hiddenReason ?? '—'} ·{' '}
            {review.hiddenByPlatform
              ? t('branchReviews.hiddenByPlatform')
              : t('branchReviews.hiddenByVenue')}
            {review.hiddenAtUtc ? `, ${formatDate(review.hiddenAtUtc, timeZoneId, locale)}` : ''}
          </span>
        </div>
      ) : null}
      {editing ? (
        <HideForm reviewId={review.reviewId} busy={busy} onCancel={onCancelHide} onHide={onHide} />
      ) : (
        <div className="yc-rv-f">
          <span className="yc-grow" />
          {reported ? (
            <button type="button" className="yc-btn yc-btn-ghost yc-btn-sm" onClick={onDismiss}>
              {t('branchReviews.dismiss')}
            </button>
          ) : null}
          <button
            type="button"
            id={`rv-act-${review.reviewId}`}
            className="yc-btn yc-btn-sec yc-btn-sm"
            disabled={busy}
            onClick={review.hidden ? onShow : onStartHide}
          >
            {review.hidden ? t('branchReviews.show') : t('branchReviews.hide')}
          </button>
        </div>
      )}
    </article>
  );
}

/**
 * Why it is hidden, in a sentence the restaurant will read. A preset to start
 * from; "Other" empties the field and puts the cursor in it. Escape cancels.
 */
function HideForm({
  reviewId,
  busy,
  onCancel,
  onHide,
}: {
  readonly reviewId: string;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onHide: (reason: string) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const focusLater = usePendingFocus();
  const [reason, setReason] = useState('');
  const [preset, setPreset] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const fieldId = `rv-reason-${reviewId}`;
  const missing = reason.trim() === '';
  const presets = [
    { key: 'offensive', label: t('branchReviews.reasons.offensive') },
    { key: 'spam', label: t('branchReviews.reasons.spam') },
    { key: 'personal', label: t('branchReviews.reasons.personal') },
    { key: 'elsewhere', label: t('branchReviews.reasons.elsewhere') },
    { key: 'other', label: t('branchReviews.reasons.other') },
  ];

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTried(true);
    if (missing) {
      focusLater(fieldId);
      return;
    }
    onHide(reason.trim());
  }

  function onKey(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onCancel();
  }

  const showError = tried && missing;
  return (
    <form
      className="yc-hidebox"
      aria-label={t('branchReviews.hideForm')}
      noValidate
      onSubmit={submit}
      onKeyDown={onKey}
    >
      <fieldset className="yc-reasons">
        <legend>{t('branchReviews.why')}</legend>
        {presets.map((entry, index) => (
          <label key={entry.key} className={entry.key === preset ? 'yc-rchip is-on' : 'yc-rchip'}>
            <input
              type="radio"
              {...(index === 0 ? { id: `rv-preset-${reviewId}` } : {})}
              name={`reason-${reviewId}`}
              checked={entry.key === preset}
              onChange={() => {
                setPreset(entry.key);
                if (entry.key === 'other') {
                  setReason('');
                  focusLater(fieldId);
                } else {
                  setReason(entry.label);
                }
              }}
            />
            {entry.label}
          </label>
        ))}
      </fieldset>
      <div className="yc-fld">
        <label htmlFor={fieldId}>
          {t('branchReviews.reasonField')}
          <span className="yc-req" aria-hidden="true">
            *
          </span>
        </label>
        <textarea
          id={fieldId}
          className="yc-ctl"
          maxLength={MAX_REASON}
          aria-required="true"
          aria-invalid={showError}
          aria-describedby={`${fieldId}-help${showError ? ` ${fieldId}-err` : ''}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <div className="yc-cnt-row">
          <span className="yc-help" id={`${fieldId}-help`}>
            {t('branchReviews.reasonHelp')}
          </span>
          <span className="yc-count">
            {reason.length} / {MAX_REASON}
          </span>
        </div>
        {showError ? (
          <span className="yc-err" id={`${fieldId}-err`}>
            {t('branchReviews.reasonRequired')}
          </span>
        ) : null}
      </div>
      <div className="yc-acts">
        <button type="button" className="yc-btn yc-btn-sec yc-btn-sm" onClick={onCancel}>
          {t('branchReviews.cancel')}
        </button>
        <button type="submit" className="yc-btn yc-btn-pri yc-btn-sm" aria-busy={busy}>
          {t('branchReviews.hideForm')}
        </button>
      </div>
    </form>
  );
}

/** The average of the visible reviews and how they spread over the stars. */
function Summary({
  reviews,
  locale,
}: {
  readonly reviews: readonly VenueModeratedReview[];
  readonly locale: Locale;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const titleId = useId();
  const visible = reviews.filter((review) => !review.hidden);
  const average =
    visible.length > 0
      ? visible.reduce((sum, review) => sum + review.rating, 0) / visible.length
      : null;
  const spread = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: visible.filter((review) => Math.round(review.rating) === stars).length,
  }));
  const peak = Math.max(1, ...spread.map((entry) => entry.count));
  return (
    <section className="yc-card yc-sum" aria-labelledby={titleId}>
      <h2 className="yc-h2" id={titleId}>
        {t('branchReviews.summary.title')}
      </h2>
      <div className="yc-big">
        <b>
          {average === null
            ? '—'
            : new Intl.NumberFormat(locale, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }).format(average)}
        </b>
        <span className="yc-muted">
          {t('branchReviews.summary.from', { count: visible.length })}
        </span>
      </div>
      <ul className="yc-dist" aria-label={t('branchReviews.summary.spread')}>
        {spread.map((entry) => (
          <li key={entry.stars}>
            <span>{entry.stars} ★</span>
            <span className="yc-track" aria-hidden="true">
              <span className="yc-fill is-up" style={{ width: `${(entry.count / peak) * 100}%` }} />
            </span>
            <span>{entry.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Rules() {
  const { t } = useTranslation(['admin', 'common']);
  const titleId = useId();
  return (
    <section className="yc-card yc-rules-card" aria-labelledby={titleId}>
      <h2 className="yc-h2" id={titleId}>
        {t('branchReviews.rules.title')}
      </h2>
      <ul>
        <li>{t('branchReviews.rules.abuse')}</li>
        <li>{t('branchReviews.rules.advert')}</li>
        <li>{t('branchReviews.rules.personal')}</li>
        <li>{t('branchReviews.rules.elsewhere')}</li>
      </ul>
      <p className="yc-help">{t('branchReviews.rules.lowRating')}</p>
    </section>
  );
}
