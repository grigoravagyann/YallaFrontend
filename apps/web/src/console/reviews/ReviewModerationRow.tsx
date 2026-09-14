import { MAX_MODERATION_TEXT, type ModeratedReview } from '@yalla/api';
import { formatDate } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useCallback, useId, useRef, useState } from 'react';

/** Already-translated words for one audience: the venue's screen or the platform's. */
export interface ReviewModerationCopy {
  readonly hide: string;
  readonly unhide: string;
  readonly reason: string;
  /** The recorded reason as a whole line, punctuated by the translator. */
  readonly reasonLine: (reason: string) => string;
  readonly reasonRequired: string;
  readonly hiddenBadge: string;
}

/**
 * One review, as somebody who can take it down sees it.
 *
 * Shared by the venue's Reviews screen and the platform's, which differ in
 * words and in who has the last say, not in shape. Hiding always asks for a
 * reason — it is recorded and audited, and "why is my review gone" is a
 * question somebody will ask — and restoring never does.
 *
 * `locked` is a review this person may not restore: one the Yalla team hid,
 * seen from the venue's side. It shows why instead of a button that would be
 * refused.
 */
export function ReviewModerationRow({
  review,
  copy,
  timeZoneId,
  reportCount,
  locked,
  lockedText,
  busy,
  failure,
  onHide,
  onUnhide,
}: {
  readonly review: ModeratedReview;
  readonly copy: ReviewModerationCopy;
  readonly timeZoneId: string;
  /** The venue's view only. */
  readonly reportCount?: number | undefined;
  readonly locked: boolean;
  readonly lockedText?: string | undefined;
  readonly busy: boolean;
  readonly failure: string | null;
  readonly onHide: (reason: string) => Promise<boolean>;
  readonly onUnhide: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const reasonId = useId();
  const [hiding, setHiding] = useState(false);
  const [reason, setReason] = useState('');
  const [missingReason, setMissingReason] = useState(false);

  /*
   * Keyboard focus. Every action here replaces the button that was pressed —
   * Hide becomes the reason form, the form becomes Show again, Show again
   * becomes Hide — and a focused element that unmounts drops focus to the page.
   * So the control that replaces it takes focus as it mounts: the reason box
   * always (it appears only when somebody pressed Hide), and an action button
   * only when it is the one this row's last action was heading for, not when it
   * merely re-renders.
   */
  const focusNext = useRef<'hide' | 'unhide' | null>(null);
  const focusOnMount = useCallback((element: HTMLElement | null) => element?.focus(), []);
  const focusHideButton = useCallback((element: HTMLButtonElement | null) => {
    if (element && focusNext.current === 'hide') {
      focusNext.current = null;
      element.focus();
    }
  }, []);
  const focusUnhideButton = useCallback((element: HTMLButtonElement | null) => {
    if (element && focusNext.current === 'unhide') {
      focusNext.current = null;
      element.focus();
    }
  }, []);

  async function confirmHide() {
    const typed = reason.trim();
    if (typed === '') {
      setMissingReason(true);
      return;
    }
    setMissingReason(false);
    focusNext.current = 'unhide';
    if (await onHide(typed)) {
      setHiding(false);
      setReason('');
    } else {
      focusNext.current = null;
    }
  }

  return (
    // A hidden review is tinted, not faded: its date, badges, reason and
    // Show again button must stay readable.
    <li className={review.hidden ? 'row review-row is-hidden' : 'row review-row'}>
      <div className="review-body">
        <div className="row-title">
          {review.authorName}{' '}
          <span aria-hidden="true">
            {'★'.repeat(review.rating)}
            {'☆'.repeat(Math.max(0, 5 - review.rating))}
          </span>
          <span className="visually-hidden">{`${review.rating}/5`}</span>
        </div>
        <div className="muted small">
          {formatDate(review.createdAtUtc, timeZoneId, locale)}
          {review.hidden ? (
            <>
              {' '}
              <span className="badge">{copy.hiddenBadge}</span>
            </>
          ) : null}
          {reportCount !== undefined && reportCount > 0 ? (
            <>
              {' '}
              <span className="badge badge-warn">
                {t('reviews.reports', { count: reportCount })}
              </span>
            </>
          ) : null}
        </div>
        {review.text ? <p>{review.text}</p> : null}
        {review.hidden && review.hiddenReason ? (
          <p className="muted small">{copy.reasonLine(review.hiddenReason)}</p>
        ) : null}
      </div>

      <div className="actions">
        {locked ? (
          <p className="muted small">{lockedText}</p>
        ) : review.hidden ? (
          <button
            ref={focusUnhideButton}
            type="button"
            className="button button-small"
            disabled={busy}
            onClick={() => {
              focusNext.current = 'hide';
              onUnhide();
            }}
          >
            {copy.unhide}
          </button>
        ) : hiding ? (
          <div className="review-hide">
            <label className="labelled" htmlFor={reasonId}>
              {copy.reason}
            </label>
            <textarea
              ref={focusOnMount}
              id={reasonId}
              className="field"
              rows={2}
              maxLength={MAX_MODERATION_TEXT}
              value={reason}
              disabled={busy}
              aria-invalid={missingReason ? true : undefined}
              onChange={(event) => setReason(event.target.value)}
            />
            {missingReason ? (
              <p className="error small" role="alert">
                {copy.reasonRequired}
              </p>
            ) : null}
            <div className="page-actions">
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => {
                  focusNext.current = 'hide';
                  setHiding(false);
                  setMissingReason(false);
                }}
              >
                {t('common:action.cancel')}
              </button>
              <button
                type="button"
                className="button button-danger"
                disabled={busy}
                onClick={() => void confirmHide()}
              >
                {busy ? t('saving') : copy.hide}
              </button>
            </div>
          </div>
        ) : (
          <button
            ref={focusHideButton}
            type="button"
            className="button button-small button-ghost"
            disabled={busy}
            onClick={() => setHiding(true)}
          >
            {copy.hide}
          </button>
        )}
        {failure ? (
          <p className="error small" role="alert">
            {failure}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** Previous / next under a paged list, with where the page sits in the total. */
export function ReviewPager({
  page,
  pageSize,
  total,
  onPage,
}: {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onPage: (page: number) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="actions">
      <span className="muted small">{t('venues.showing', { from, to, total })}</span>
      <button
        type="button"
        className="button button-small"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        {t('venues.previous')}
      </button>
      <button
        type="button"
        className="button button-small"
        disabled={to >= total}
        onClick={() => onPage(page + 1)}
      >
        {t('venues.next')}
      </button>
    </div>
  );
}
