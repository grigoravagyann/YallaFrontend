import {
  MAX_REVIEW_REPLY,
  type ModeratedReview,
  type ReviewReply,
  type ReviewSummary,
} from '@yalla/api';
import { formatDate, intlTag } from '@yalla/format';
import { useLocale, useTranslation, type Locale } from '@yalla/i18n';
import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { usePendingFocus } from '../platform/venue/venueFields';
import { EyeOffIcon } from '../ui/icons';

/**
 * One review, the hide and reply forms, and the summary and rules beside the
 * list — shared by the venue console's Reviews page and the platform's branch
 * reviews (Reviews artboards in both designs). They differ in who has the last
 * word and who may answer, not in shape: each screen puts its own actions in
 * the card's foot.
 */

/** A reason the restaurant reads: one or two sentences. */
export const MAX_HIDE_REASON = 300;

export interface ReviewCardProps {
  readonly review: ModeratedReview;
  /** Reported and still showing: the amber edge and the count. */
  readonly reportCount: number;
  readonly timeZoneId: string;
  /** Who hid it, as this audience says it: after "Reason." on a hidden review. */
  readonly hiddenBy: string;
  /** The forms or the buttons at the foot. */
  readonly children: ReactNode;
}

export function ReviewCard({
  review,
  reportCount,
  timeZoneId,
  hiddenBy,
  children,
}: ReviewCardProps) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const nameId = useId();
  const reported = reportCount > 0 && !review.hidden;
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
        {/* An image to a screen reader: a plain span's label is not read out. */}
        <span
          className="yc-stars"
          role="img"
          aria-label={t('branchReviews.stars', { count: stars })}
        >
          <span aria-hidden="true">{'★'.repeat(stars)}</span>
          <span className="is-off" aria-hidden="true">
            {'★'.repeat(5 - stars)}
          </span>
        </span>
        {reported ? (
          <span className="yc-pill yc-pill-amber">
            {t('branchReviews.reports', { count: reportCount })}
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
            <b>{t('branchReviews.reasonLabel')}</b> {review.hiddenReason ?? '—'} · {hiddenBy}
          </span>
        </div>
      ) : null}
      {review.reply ? (
        <ReplyBlock
          reply={review.reply}
          reviewUpdatedAtUtc={review.updatedAtUtc}
          timeZoneId={timeZoneId}
          locale={locale}
        />
      ) : null}
      {children}
    </article>
  );
}

/** "Aram Hakobyan, Owner": how a reply is signed, in the console and in the app. */
export function useReplySignature(): (name: string, role: ReviewReply['authorRole']) => string {
  const { t } = useTranslation(['admin', 'common']);
  return (name, role) => t('reviews.reply.signature', { name, role: t(`role.${role}`) });
}

/** The guest changed their review after the venue answered it: the answer may no longer fit. */
export function reviewEditedAfterReply(reviewUpdatedAtUtc: string, reply: ReviewReply): boolean {
  return Date.parse(reviewUpdatedAtUtc) > Date.parse(reply.updatedAtUtc);
}

function ReplyBlock({
  reply,
  reviewUpdatedAtUtc,
  timeZoneId,
  locale,
}: {
  readonly reply: ReviewReply;
  readonly reviewUpdatedAtUtc: string;
  readonly timeZoneId: string;
  readonly locale: Locale;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const signature = useReplySignature();
  return (
    <div className="yc-reply">
      <div>
        <b>{t('reviews.reply.by', { by: signature(reply.authorName, reply.authorRole) })}</b>{' '}
        <small>
          · {formatDate(reply.updatedAtUtc, timeZoneId, locale)}
          {reply.edited ? ` · ${t('reviews.reply.edited')}` : ''}
        </small>
        <p>{reply.text}</p>
        {reviewEditedAfterReply(reviewUpdatedAtUtc, reply) ? (
          <small className="yc-reply-note">{t('reviews.reply.reviewEditedAfter')}</small>
        ) : null}
      </div>
    </div>
  );
}

/** Escape cancels a form in a card, as the artboard's `mainKey` does. */
function cancelOnEscape(onCancel: () => void) {
  return (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onCancel();
  };
}

/**
 * Why it is hidden, in a sentence the restaurant (or Yalla) will read. A
 * preset to start from; "Other" empties the field and puts the cursor in it.
 * Required: the words go under the field when missing, and the cursor there.
 */
export function HideForm({
  reviewId,
  busy,
  fieldLabel,
  help,
  onCancel,
  onHide,
}: {
  readonly reviewId: string;
  readonly busy: boolean;
  readonly fieldLabel: string;
  readonly help: string;
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

  const showError = tried && missing;
  return (
    <form
      className="yc-hidebox"
      aria-label={t('branchReviews.hideForm')}
      noValidate
      onSubmit={submit}
      onKeyDown={cancelOnEscape(onCancel)}
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
          {fieldLabel}
          <span className="yc-req" aria-hidden="true">
            *
          </span>
        </label>
        <textarea
          id={fieldId}
          className="yc-ctl"
          maxLength={MAX_HIDE_REASON}
          aria-required="true"
          aria-invalid={showError}
          aria-describedby={`${fieldId}-help${showError ? ` ${fieldId}-err` : ''}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <div className="yc-cnt-row">
          <span className="yc-help" id={`${fieldId}-help`}>
            {help}
          </span>
          <span className="yc-count">
            {reason.length} / {MAX_HIDE_REASON}
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

/**
 * The venue's public answer: written or changed here, signed with the
 * writer's name and role, which the help line says before it is published.
 */
export function ReplyForm({
  reviewId,
  initial,
  signature,
  busy,
  onCancel,
  onSend,
}: {
  readonly reviewId: string;
  /** The reply's text when changing it; empty for a first reply. */
  readonly initial: string;
  /** "Aram Hakobyan, Owner": who it will be signed as. */
  readonly signature: string;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onSend: (text: string) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const focusLater = usePendingFocus();
  const [text, setText] = useState(initial);
  const [tried, setTried] = useState(false);
  const fieldId = `rv-reply-${reviewId}`;
  const missing = text.trim() === '';
  const showError = tried && missing;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTried(true);
    if (missing) {
      focusLater(fieldId);
      return;
    }
    onSend(text.trim());
  }

  return (
    <form
      className="yc-replybox"
      aria-label={t('reviews.reply.form')}
      noValidate
      onSubmit={submit}
      onKeyDown={cancelOnEscape(onCancel)}
    >
      <div className="yc-fld">
        <label htmlFor={fieldId}>
          {t('reviews.reply.field')}
          <span className="yc-req" aria-hidden="true">
            *
          </span>
        </label>
        <textarea
          id={fieldId}
          className="yc-ctl"
          maxLength={MAX_REVIEW_REPLY}
          aria-required="true"
          aria-invalid={showError}
          aria-describedby={`${fieldId}-help${showError ? ` ${fieldId}-err` : ''}`}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="yc-cnt-row">
          <span className="yc-help" id={`${fieldId}-help`}>
            {t('reviews.reply.help', { signature })}
          </span>
          <span className="yc-count">
            {text.length} / {MAX_REVIEW_REPLY}
          </span>
        </div>
        {showError ? (
          <span className="yc-err" id={`${fieldId}-err`}>
            {t('reviews.reply.required')}
          </span>
        ) : null}
      </div>
      <div className="yc-acts">
        <button type="button" className="yc-btn yc-btn-sec yc-btn-sm" onClick={onCancel}>
          {t('branchReviews.cancel')}
        </button>
        <button type="submit" className="yc-btn yc-btn-pri yc-btn-sm" aria-busy={busy}>
          {t('reviews.reply.publish')}
        </button>
      </div>
    </form>
  );
}

/**
 * The visible reviews' average, the change over thirty days when it is
 * known, and how they spread over the stars.
 */
export function ReviewSummaryCard({
  summary,
  showChange = false,
}: {
  readonly summary: ReviewSummary;
  /** "↑ 0.1 in the last 30 days" (the venue's Reviews artboard). */
  readonly showChange?: boolean;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const titleId = useId();
  const decimal = new Intl.NumberFormat(intlTag(locale), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const change = summary.ratingChange30Days;
  const peak = Math.max(1, ...summary.distribution.map((entry) => entry.count));
  return (
    <section className="yc-card yc-sum" aria-labelledby={titleId}>
      <h2 className="yc-h2" id={titleId}>
        {t('branchReviews.summary.title')}
      </h2>
      <div className="yc-big">
        <b>{summary.rating === null ? '—' : decimal.format(summary.rating)}</b>
        <span className="yc-muted">
          {t('branchReviews.summary.from', { count: summary.visible })}
        </span>
      </div>
      {showChange && change !== null && change !== 0 ? (
        <span className={change > 0 ? 'yc-up' : 'yc-down'}>
          {change > 0
            ? t('reviews.summary.up', { change: decimal.format(change) })
            : t('reviews.summary.down', { change: decimal.format(-change) })}
        </span>
      ) : null}
      <ul className="yc-dist" aria-label={t('branchReviews.summary.spread')}>
        {summary.distribution.map((entry) => (
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

/** When to hide, and that a bad rating alone is not a reason. */
export function ReviewRules({ venue = false }: { readonly venue?: boolean }) {
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
      <p className="yc-help">
        {venue ? t('reviews.rules.lowRating') : t('branchReviews.rules.lowRating')}
      </p>
    </section>
  );
}
