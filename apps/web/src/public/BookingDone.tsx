import {
  approvalCountdown,
  awaitsVenueAnswer,
  canEditPreOrder,
  declinedCopy,
  pendingReasonCopy,
  venueAnswerCopy,
  type Booking,
  type PreOrder,
  type PublicBranch,
  type VenueAnswerState,
} from '@yalla/api';
import { useManagedBooking, useNow, usePreOrderMenu } from '@yalla/api/react';
import { formatDuration, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useId, useRef, useState } from 'react';
import { appUrl } from './gateways';
import { bookingIcs, downloadIcs, icsDescription } from './calendarFile';
import { freeCancellationDated, freeCancellationWords, whenWords } from './dayNames';
import { Icon } from './icons';
import { useLangPath } from './language';
import { DiscardPreOrderQuestion, PreOrderEditor, PreOrderLines } from './PreOrder';
import { SheetHead } from './SheetParts';

/**
 * The booking is made. Now the part that is specific to the web.
 *
 * A booking made in the app gets a reminder an hour before, a "still coming?"
 * nudge if the party is late, and a cancel button in the notification. A
 * booking made here gets **none of those**, because there is no push channel to
 * a page somebody opened from a chat. That is the entire no-show story, and it
 * does not reach this visitor.
 *
 * So this screen does three things beyond confirming, and the order is the
 * argument:
 *
 * 1. **Add to calendar** — the sheet's main button. Works everywhere, needs
 *    nothing, and puts the reminder where they already look. It is first
 *    because it is the only one that is a complete substitute for what they
 *    are missing.
 * 2. **A link to manage this booking**, with a copy button, which is not
 *    optional. Without it the only way out of a booking made here is not
 *    turning up, and a page that makes no-showing easier than cancelling is
 *    worse for the venue than no page at all.
 * 3. **Get the app**, described as what it *adds* rather than as a download.
 *    Rendered only when there is an app to get — see `appUrl`.
 *
 * A booking more than two hours away, at a branch that takes pre-orders, is
 * offered one here (2026-10-21): the dishes, chosen in the sheet and saved
 * through the booking's manage link, as the link itself would.
 *
 * A booking for tonight is a request first: the venue's floor has fifteen
 * minutes to answer. With no push channel, this page is where the answer
 * arrives — it counts the minutes down and reads the booking again through its
 * manage link until the venue has said yes or no, then says which (Book
 * artboard: done, pending, declined). Waiting, the calendar waits too and the
 * booking page is offered; declined, there is nothing to remember or manage,
 * and another time is.
 */
export interface BookingDoneProps {
  readonly booking: Booking;
  readonly branch: PublicBranch;
  /** Close the sheet: back to the page. Absent where nothing holds the sheet. */
  readonly onClose?: (() => void) | undefined;
  /** Declined: close, and put the visitor on the booking card for another time. */
  readonly onChooseAnotherTime?: (() => void) | undefined;
}

export function BookingDone({ booking, branch, onClose, onChooseAnotherTime }: BookingDoneProps) {
  const { t } = useTranslation('public');
  const { t: td } = useTranslation('diner');
  const { locale } = useLocale();
  const langPath = useLangPath();
  const [copied, setCopied] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const linkId = useId();
  /** "Copied" turning back into "Copy": cleared if the sheet goes first (review N13). */
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The pre-order editor, open in the sheet. */
  const [preOrdering, setPreOrdering] = useState(false);
  /** The pre-order as last saved here: `undefined` until then, `null` once removed. */
  const [savedPreOrder, setSavedPreOrder] = useState<PreOrder | null | undefined>(undefined);
  /** The editor holds dishes not saved: closing the sheet asks first (live QA 1). */
  const [preOrderDirty, setPreOrderDirty] = useState(false);
  const [askingClose, setAskingClose] = useState(false);
  /** The foot, where the editor puts its total and Save: always in view. */
  const [footBar, setFootBar] = useState<HTMLDivElement | null>(null);
  const preOrderMenu = usePreOrderMenu(preOrdering ? branch.id : undefined);
  const savedNotice = useRef<HTMLParagraphElement>(null);
  // Saved or removed: said, and the sheet scrolls to it.
  useEffect(() => {
    if (savedPreOrder !== undefined) savedNotice.current?.focus();
  }, [savedPreOrder]);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  /* Resolved here rather than at import: see `gateways.ts`. */
  const installUrl = appUrl();

  // The sheet's new step: the keyboard and the screen reader start at its title.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  /*
   * The booking as it now stands, while the venue decides: read through the
   * manage link, which polls itself until the answer is in. Only for a request
   * with a clock — every other booking already says all there is.
   */
  const waitsWithClock = awaitsVenueAnswer(booking);
  const live = useManagedBooking(waitsWithClock ? (booking.manageToken ?? undefined) : undefined, {
    venueSlug: branch.venue.slug,
    branchSlug: branch.slug,
  }).data;
  const answerState: VenueAnswerState = live
    ? {
        status: live.status,
        approvalExpiresAtUtc: live.approvalExpiresAtUtc,
        declinedBecause: live.declinedBecause,
        awaitingApprovalBecause: live.awaitingApprovalBecause ?? booking.awaitingApprovalBecause,
        awaitsEarlierGuestAnswer: live.awaitsEarlierGuestAnswer ?? booking.awaitsEarlierGuestAnswer,
      }
    : booking;
  const now = useNow(awaitsVenueAnswer(answerState) ? 1000 : 30_000);
  const preOrder = savedPreOrder === undefined ? (booking.preOrder ?? null) : savedPreOrder;
  /*
   * While the editor is open, the pre-order as the link now reads it: a save
   * that lost a race to another tab (409 `concurrent-update`) reads the link
   * again, and the editor takes the latest from here rather than from this
   * sheet's own copy, which nothing else would ever change.
   */
  const linked = useManagedBooking(preOrdering ? (booking.manageToken ?? undefined) : undefined, {
    venueSlug: branch.venue.slug,
    branchSlug: branch.slug,
  }).data;
  const editorPreOrder = linked ? (linked.preOrder ?? null) : preOrder;
  // The booking's own window, which the server sends only while the branch
  // takes pre-orders; and a link to save it through.
  const canPreOrder =
    Boolean(booking.manageToken) && canEditPreOrder({ ...booking, preOrder }, now);
  const answer = venueAnswerCopy(answerState, now, locale);
  const countdown = approvalCountdown(answerState.approvalExpiresAtUtc, now, locale);
  const declinedTitle = declinedCopy(answerState.declinedBecause, 'title');
  const declinedBody = declinedCopy(answerState.declinedBecause, 'body');
  const why = pendingReasonCopy(answerState);

  const kind = declinedTitle
    ? 'declined'
    : answerState.status === 'pendingApproval'
      ? 'pending'
      : 'done';
  // The booking view names the branch, not the venue; this page knows the venue.
  const venueName = booking.venueName ?? branch.venue.name;
  const when = whenWords(booking.slotUtc, booking.timeZoneId, locale, t);
  const guests = td('booking.guests', { count: booking.partySize });

  /*
   * Absolute, because this link's whole job is to survive being pasted
   * somewhere else — a note, a second phone, a message to whoever is coming.
   * The token is minted by the server and scoped to this one booking; see
   * `Booking.manageToken` and `ManagedBooking`.
   */
  const manageUrl = booking.manageToken
    ? new URL(
        // With the reader's `?lang=` when they chose one: the link they keep
        // opens in the language they booked in, not whatever the next
        // browser prefers. Without one, the browser was deciding, and still will.
        // The short form the reminders carry: the page finds the branch from the answer.
        langPath(`/booking/${booking.manageToken}`),
        window.location.origin,
      ).toString()
    : null;

  // Our own words for the date: `Intl` writes hy dates in English where the
  // browser has no Armenian data (public-page phase 4).
  const cancellation = freeCancellationWords(
    booking.freeCancellationUntilUtc,
    booking.timeZoneId,
    locale,
    t,
  );

  const addToCalendar = () => {
    const summary = td('table.title', { label: booking.tableLabel });
    downloadIcs(
      bookingIcs({
        booking,
        venueName,
        addressLine: branch.addressLine,
        manageUrl: manageUrl ?? '',
        locale,
        summary: `${summary} · ${venueName}`,
        descriptionLines: icsDescription({
          booking,
          locale,
          codeLabel: td('success.codeLabel'),
          // Dated, never "tomorrow": the file is read on other days (review S1).
          cancellationLine: freeCancellationDated(
            booking.freeCancellationUntilUtc,
            booking.timeZoneId,
            locale,
            t,
          ),
          manageLabel: t('done.manage'),
          manageUrl: manageUrl ?? '',
        }),
      }),
      venueName,
      locale,
    );
  };

  const copyLink = async () => {
    if (!manageUrl) return;
    try {
      await navigator.clipboard.writeText(manageUrl);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked, or an insecure origin. The link is on screen and
      // selectable, which is what the `<a>` beside it is for — no error needed.
    }
  };

  const summary = (
    <dl className="pub-sum">
      <div>
        <dt>{td('confirm.venue')}</dt>
        <dd>{`${venueName} · ${booking.branchName}`}</dd>
      </div>
      <div>
        <dt>{td('confirm.when')}</dt>
        <dd>{when}</dd>
      </div>
      <div>
        <dt>{td('confirm.tableRow')}</dt>
        <dd>{t('sheet.done.table', { label: booking.tableLabel, guests })}</dd>
      </div>
    </dl>
  );

  // Closing over a pre-order not saved yet asks first: the sheet's Close and
  // its footer both. The editor's own Back asks for itself.
  const editing = kind === 'done' && preOrdering;
  const close = onClose
    ? () => (editing && preOrderDirty ? setAskingClose(true) : onClose())
    : undefined;
  const backToPage =
    onClose && editing && askingClose ? (
      <DiscardPreOrderQuestion onDiscard={onClose} onKeep={() => setAskingClose(false)} />
    ) : close ? (
      <button type="button" className="pub-button pub-button-ghost" onClick={close}>
        {t('sheet.done.back')}
      </button>
    ) : null;

  return (
    <div className="pub-sheet-step">
      <SheetHead title={t(`sheet.title.${kind}`)} headingRef={heading} onClose={close} />
      <div className="pub-sheet-body pub-done">
        <div className={`pub-done-mark is-${kind}`} aria-hidden="true">
          <Icon name={kind === 'done' ? 'check' : kind === 'pending' ? 'clock' : 'close'} />
        </div>
        {/* The answer arriving is announced: it replaces the waiting title. */}
        <h3 className="pub-done-title" aria-live="polite">
          {kind === 'declined' && declinedTitle
            ? td(declinedTitle.key, declinedTitle.params)
            : kind === 'pending'
              ? td('success.pendingTitle')
              : td('success.confirmedTitle')}
        </h3>

        {kind === 'declined' ? (
          declinedBody ? (
            <p className="pub-done-body">{td(declinedBody.key, declinedBody.params)}</p>
          ) : null
        ) : kind === 'pending' ? (
          <>
            {/* Why it waits: short notice, the guest before (`pendingReasonCopy`). */}
            <p className="pub-done-body">{td(why.key, why.params)}</p>
            {/* While the venue decides: the minutes it has left to answer. A
                timer, so a screen reader reads it when asked rather than every
                second. */}
            {answer ? (
              <p
                className={`pub-answer${countdown?.urgent ? ' is-urgent' : ''}`}
                role="timer"
                aria-label={td(answer.key, answer.params)}
              >
                {td(answer.key, answer.params)}
              </p>
            ) : null}
            <p className="pub-done-body">{t('sheet.done.auto')}</p>
          </>
        ) : (
          <p className="pub-done-body">{cancellation}</p>
        )}

        {/*
          Large and legible: staff ask for this at the door and it gets read
          aloud over the phone, so it is the one thing here that has to survive
          a noisy room. Pending must never look confirmed: dashed blue.
        */}
        {kind === 'declined' ? null : (
          <div className={kind === 'pending' ? 'pub-sheet-code is-pending' : 'pub-sheet-code'}>
            <p className="pub-sheet-code-label">{td('success.codeLabel')}</p>
            <p className="pub-sheet-code-value num" aria-label={booking.code.split('').join(' ')}>
              {booking.code}
            </p>
            <p className="pub-sheet-code-label">{td('success.codeHint')}</p>
          </div>
        )}

        {summary}

        {kind === 'done' && booking.manageToken && preOrdering ? (
          <PreOrderEditor
            token={booking.manageToken}
            preOrder={editorPreOrder}
            timeZoneId={booking.timeZoneId}
            menu={preOrderMenu}
            onSaved={(saved) => {
              setSavedPreOrder(saved);
              setPreOrdering(false);
              setAskingClose(false);
            }}
            onCancel={() => {
              setPreOrdering(false);
              setAskingClose(false);
            }}
            onDirtyChange={setPreOrderDirty}
            barHost={footBar}
          />
        ) : kind === 'done' && (canPreOrder || preOrder) ? (
          <section className="pub-card pub-po" aria-labelledby={`${linkId}-po`}>
            <h4 className="pub-field-label" id={`${linkId}-po`}>
              {td('preOrder.title')}
            </h4>
            {savedPreOrder !== undefined ? (
              <p className="pub-notice pub-notice-ok" role="status" tabIndex={-1} ref={savedNotice}>
                {td(savedPreOrder ? 'preOrder.saved' : 'preOrder.removed')}
              </p>
            ) : null}
            {preOrder ? (
              <PreOrderLines preOrder={preOrder} />
            ) : (
              <p className="pub-card-text">{td('preOrder.offerBody')}</p>
            )}
            {canPreOrder ? (
              <button
                type="button"
                className="pub-button pub-button-wide"
                onClick={() => setPreOrdering(true)}
              >
                {td(preOrder ? 'preOrder.edit' : 'preOrder.add')}
              </button>
            ) : null}
          </section>
        ) : null}

        {kind === 'done' && !preOrdering ? (
          <>
            {booking.promisedFreeByUtc ? (
              <p className="pub-muted">
                {td('booking.freeBy.promised', {
                  time: formatTime(booking.promisedFreeByUtc, booking.timeZoneId, locale),
                })}
              </p>
            ) : null}

            {/*
              The way out. Not optional — see the module comment.

              When the server issued no token there is genuinely nothing to
              link to, and a link that goes nowhere is worse than none. Then
              the venue's own number is offered instead, because *some* way to
              cancel has to exist.
            */}
            {manageUrl ? (
              <section className="pub-sheet-field" aria-labelledby={linkId}>
                <h4 className="pub-field-label" id={linkId}>
                  {t('sheet.done.link')}
                </h4>
                <div className="pub-link-row">
                  <a href={manageUrl}>{manageUrl}</a>
                  <button
                    type="button"
                    className="pub-button pub-button-small"
                    onClick={() => void copyLink()}
                  >
                    {copied ? t('sheet.done.copied') : t('sheet.done.copy')}
                  </button>
                </div>
                <p className="pub-muted">{t('sheet.done.linkHint')}</p>
              </section>
            ) : branch.phoneE164 ? (
              <a className="pub-button" href={`tel:${branch.phoneE164}`}>
                {t('findUs.call')}
              </a>
            ) : null}

            {/*
              What happens after the free-cancellation time, which the deadline
              alone does not say: cancelling late is allowed and merely
              recorded as late. The number is the branch's own published rule.
            */}
            <p className="pub-muted">
              {t('done.lateCancellation', {
                window: formatDuration(branch.policy.cancellationDeadlineMinutes, locale),
              })}
            </p>

            {/*
              Last, and only when there is something to link to: omitted
              entirely when `VITE_APP_URL` is unset, because an app-store badge
              for an app that is not published is a dead end with a logo on it.
            */}
            {installUrl ? (
              <section className="pub-offer pub-offer-quiet">
                <h4>{t('done.getApp')}</h4>
                <p className="pub-muted">{t('done.getAppBody')}</p>
                <a
                  className="pub-button pub-button-quiet"
                  href={installUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {t('done.getApp')}
                </a>
              </section>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="pub-sheet-foot">
        {editing ? <div className="pub-po-foot-bar" ref={setFootBar} /> : null}
        {kind === 'done' && !preOrdering ? (
          // The reminder they would otherwise never get.
          <button type="button" className="pub-button pub-button-primary" onClick={addToCalendar}>
            <Icon name="calendar" />
            {t('done.addCalendar')}
          </button>
        ) : null}
        {kind === 'pending' && manageUrl ? (
          <a className="pub-button" href={manageUrl}>
            {t('sheet.done.openManage')}
          </a>
        ) : null}
        {kind === 'declined' && onChooseAnotherTime ? (
          <button
            type="button"
            className="pub-button pub-button-primary"
            onClick={onChooseAnotherTime}
          >
            {t('sheet.done.again')}
          </button>
        ) : null}
        {backToPage}
      </div>
    </div>
  );
}
