import {
  ApiError,
  AskOnMyWayAskedRecentlyError,
  AskOnMyWayNotOpenError,
  AskOnMyWayTooEarlyError,
  GuestAlreadyAnsweredError,
  STAFF_ASK_INTERVAL_MINUTES,
  askOnMyWayBlock,
  isOffline,
  type AskOnMyWayBlock,
  type ReservationStatusCode,
} from '@yalla/api';
import { useAskOnMyWay, useNow } from '@yalla/api/react';
import { formatPhone } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { useId, useRef, useState } from 'react';
import { useBranchFormat } from './useBranchFormat';

/**
 * "Ask: are you coming?" on a booking (2026-10-22, the Ask artboard).
 *
 * Every confirmed booking is asked by itself 30 minutes before its start (45
 * with a pre-order waiting for the kitchen). This block says where that
 * question stands — not asked yet, asked and waiting, the guest's answer, or
 * nobody answering — and lets the floor ask now rather than wait for the
 * automatic one: the same push and feed entry, from two hours before the start
 * until the start, while the guest has not answered, once every fifteen
 * minutes. When it may not ask, the button stays in place and says why.
 *
 * Online only and never queued: a push that went out minutes after the tap
 * would ask a guest who has since sat down.
 *
 * The pre-order card wears it in place of its old "confirmed / call" line; the
 * table panel wears it on its own for a booking with no pre-order.
 */

/** The booking, as far as the question goes. */
export interface AskSubject {
  readonly reservationId: string;
  readonly status: ReservationStatusCode;
  readonly startUtc: string;
  readonly guestName: string | null;
  readonly guestPhone: string | null;
  readonly guestConfirmedOnWayAtUtc?: string | null | undefined;
  readonly guestRunningLateMinutes?: number | null | undefined;
  readonly guestRunningLateAtUtc?: string | null | undefined;
  readonly staffAskedOnMyWayAtUtc?: string | null | undefined;
  /** When the automatic question goes (or went) out. */
  readonly autoAskAtUtc: string;
  /** The booking's pre-order is waiting for the kitchen: "send it" is the next step. */
  readonly preOrderWaiting?: boolean | undefined;
  /** The pre-order went to the kitchen, at this time. */
  readonly preOrderSentAtUtc?: string | null | undefined;
}

/** Where the question stands, in the artboard's six states. */
export type AskState =
  | { readonly kind: 'idle'; readonly autoAtUtc: string }
  | { readonly kind: 'asked'; readonly atUtc: string; readonly auto: boolean }
  | { readonly kind: 'silent'; readonly minutes: number; readonly atUtc: string }
  | { readonly kind: 'coming'; readonly atUtc: string }
  | { readonly kind: 'late'; readonly minutes: number; readonly expectedUtc: string }
  | { readonly kind: 'sent'; readonly atUtc: string | null };

const MINUTE = 60_000;

/**
 * The state a booking's question is in. A pre-order in the kitchen first —
 * nothing is left to ask — then the guest's latest answer (on my way after
 * "late" is on time after all), then the last ask: the venue's, or the
 * automatic one once its time has passed.
 */
export function askState(subject: AskSubject, now: Date): AskState {
  if (subject.preOrderSentAtUtc !== undefined && subject.preOrderSentAtUtc !== null) {
    return { kind: 'sent', atUtc: subject.preOrderSentAtUtc };
  }
  const onWay = subject.guestConfirmedOnWayAtUtc ?? null;
  const late = subject.guestRunningLateMinutes ?? null;
  const lateAt = subject.guestRunningLateAtUtc ?? null;
  const onWayLater = onWay !== null && lateAt !== null && Date.parse(onWay) > Date.parse(lateAt);
  if (late !== null && !onWayLater) {
    return {
      kind: 'late',
      minutes: late,
      expectedUtc: new Date(Date.parse(subject.startUtc) + late * MINUTE).toISOString(),
    };
  }
  if (onWay !== null) return { kind: 'coming', atUtc: onWay };

  const t = now.getTime();
  const staff = subject.staffAskedOnMyWayAtUtc ? Date.parse(subject.staffAskedOnMyWayAtUtc) : null;
  const auto = Date.parse(subject.autoAskAtUtc) <= t ? Date.parse(subject.autoAskAtUtc) : null;
  const last = Math.max(staff ?? -Infinity, auto ?? -Infinity);
  if (!Number.isFinite(last)) return { kind: 'idle', autoAtUtc: subject.autoAskAtUtc };
  const atUtc = new Date(last).toISOString();
  const minutes = Math.floor((t - last) / MINUTE);
  if (minutes >= STAFF_ASK_INTERVAL_MINUTES) return { kind: 'silent', minutes, atUtc };
  return { kind: 'asked', atUtc, auto: staff === null || last !== staff };
}

/** What the disabled button says. */
function blockText(t: TFunction, block: AskOnMyWayBlock, time: (iso: string) => string): string {
  switch (block.kind) {
    case 'notConfirmed':
      return t('onMyWay.blocked.notConfirmed');
    case 'started':
      return t('onMyWay.blocked.started');
    case 'tooEarly':
      return t('onMyWay.blocked.tooEarly', { time: time(block.opensAtUtc) });
    case 'askedRecently':
      return t('onMyWay.blocked.askedRecently', { time: time(block.nextAllowedAtUtc) });
    case 'answered':
      return t('onMyWay.blocked.answered');
  }
}

/** A refused ask, in the floor's words. */
export function askFailureText(
  t: TFunction,
  error: unknown,
  time: (iso: string) => string,
): string {
  if (error instanceof AskOnMyWayTooEarlyError) {
    return error.opensAtUtc
      ? t('onMyWay.error.tooEarly', { time: time(error.opensAtUtc) })
      : t('onMyWay.error.tooEarlyPlain');
  }
  if (error instanceof AskOnMyWayNotOpenError) return t('onMyWay.error.notOpen');
  if (error instanceof GuestAlreadyAnsweredError) return t('onMyWay.error.answered');
  if (error instanceof AskOnMyWayAskedRecentlyError) {
    return error.nextAllowedAtUtc
      ? t('onMyWay.error.askedRecently', { time: time(error.nextAllowedAtUtc) })
      : t('onMyWay.error.askedRecentlyPlain');
  }
  if (error instanceof ApiError && isOffline(error)) return t('onMyWay.error.offline');
  return t('onMyWay.error.generic');
}

export interface OnMyWayAskProps {
  readonly branchId: string;
  readonly subject: AskSubject;
  readonly timeZoneId: string;
  readonly online: boolean;
  /** The rail's narrow card, or the table panel's. */
  readonly variant: 'rail' | 'panel';
}

const CLASSES = {
  rail: {
    ask: 'ft-btn ft-btn-secondary',
    call: 'approval-call',
    note: 'table-note',
    warn: 'table-warn',
  },
  panel: { ask: 'tp-btn tp-sec', call: 'tp-btn tp-sec ask-call', note: 'tp-hint', warn: 'tp-warn' },
} as const;

export function OnMyWayAsk({ branchId, subject, timeZoneId, online, variant }: OnMyWayAskProps) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const now = useNow(15_000);
  const ask = useAskOnMyWay(branchId);
  const titleId = useId();
  const hintId = useId();
  const classes = CLASSES[variant];
  /** A tap already on its way: two in one frame are one ask. */
  const sending = useRef(false);
  const [answer, setAnswer] = useState<
    | { readonly kind: 'asked'; readonly notified: boolean }
    | { readonly kind: 'failed'; readonly text: string }
    | null
  >(null);

  // A booking that is not confirmed is not asked; a seated party is here.
  if (subject.status !== 'confirmed') return null;

  const state = askState(subject, now);
  const block = askOnMyWayBlock(subject, now);
  const time = (iso: string) => format.time(iso);
  const shownPhone = subject.guestPhone ? formatPhone(subject.guestPhone) : null;

  const { title, body, tone } = stateText(t, state, subject, time, Boolean(block));
  const offerAsk = state.kind === 'idle' || state.kind === 'asked' || state.kind === 'silent';
  /**
   * The number: a button when nobody answers (or nobody can be pushed), and
   * to hand, plainly, before anybody has been asked (live QA 2026-10-21).
   */
  const call: 'button' | 'plain' | null =
    shownPhone === null
      ? null
      : state.kind === 'silent' || (answer?.kind === 'asked' && !answer.notified)
        ? 'button'
        : state.kind === 'idle'
          ? 'plain'
          : null;

  function onAsk() {
    if (sending.current || !online || block) return;
    sending.current = true;
    setAnswer(null);
    ask.mutate(subject.reservationId, {
      onSuccess: (result) => {
        sending.current = false;
        setAnswer({ kind: 'asked', notified: result.notified });
      },
      onError: (error) => {
        sending.current = false;
        setAnswer({ kind: 'failed', text: askFailureText(t, error, time) });
      },
    });
  }

  return (
    <div className={`ask ask-${variant}`}>
      <div className="ask-status" data-tone={tone} role="status" aria-labelledby={titleId}>
        <b id={titleId}>{title}</b>
        {body ? <span>{body}</span> : null}
      </div>

      {offerAsk ? (
        <>
          <button
            type="button"
            className={`${classes.ask} ask-button`}
            disabled={Boolean(block) || !online || ask.isPending}
            aria-describedby={hintId}
            onClick={onAsk}
          >
            {ask.isPending ? t('onMyWay.asking') : t('onMyWay.ask')}
          </button>
          <p className={classes.note} id={hintId}>
            {block
              ? blockText(t, block, time)
              : !online
                ? t('onMyWay.needsOnline')
                : t('onMyWay.askHint', { minutes: STAFF_ASK_INTERVAL_MINUTES })}
          </p>
        </>
      ) : null}

      {answer?.kind === 'asked' ? (
        <p className={classes.note} role="status">
          {answer.notified ? t('onMyWay.done') : t('onMyWay.notNotified')}
        </p>
      ) : null}

      {call && subject.guestPhone ? (
        <a
          className={call === 'button' ? classes.call : 'approval-call ask-phone'}
          href={`tel:${subject.guestPhone.replace(/\s+/gu, '')}`}
          aria-label={t('onMyWay.callLabel', {
            name: subject.guestName ?? '',
            phone: shownPhone,
          })}
        >
          {call === 'button' ? t('onMyWay.call', { phone: shownPhone }) : shownPhone}
        </a>
      ) : null}

      {answer?.kind === 'failed' ? (
        <p
          className={classes.warn}
          data-tone={variant === 'panel' ? 'red' : undefined}
          role="alert"
        >
          {answer.text}
        </p>
      ) : null}
    </div>
  );
}

/** The status box's two lines and its tone. */
function stateText(
  t: TFunction,
  state: AskState,
  subject: AskSubject,
  time: (iso: string) => string,
  blocked: boolean,
): {
  readonly title: string;
  readonly body: string | null;
  readonly tone: 'neutral' | 'wait' | 'good' | 'warn';
} {
  switch (state.kind) {
    case 'idle':
      return {
        title: t('onMyWay.status.idleTitle'),
        body: blocked
          ? t('onMyWay.status.idleLaterBody', { time: time(state.autoAtUtc) })
          : t('onMyWay.status.idleBody', { time: time(state.autoAtUtc) }),
        tone: 'neutral',
      };
    case 'asked':
      return {
        title: state.auto
          ? t('onMyWay.status.askedAutoTitle', { time: time(state.atUtc) })
          : t('onMyWay.status.askedTitle', { time: time(state.atUtc) }),
        body: t('onMyWay.status.askedBody'),
        tone: 'wait',
      };
    case 'silent':
      return {
        title: t('onMyWay.status.silentTitle', { count: state.minutes }),
        body: t('onMyWay.status.silentBody'),
        tone: 'warn',
      };
    case 'coming':
      return {
        title: t('onMyWay.status.comingTitle', { time: time(state.atUtc) }),
        body: subject.preOrderWaiting
          ? t('onMyWay.status.comingBody')
          : t('onMyWay.status.comingBodyPlain'),
        tone: 'good',
      };
    case 'late': {
      const expected = time(state.expectedUtc);
      return {
        title: t('onMyWay.status.lateTitle', { count: state.minutes, time: expected }),
        body: subject.preOrderWaiting
          ? t('onMyWay.status.lateBodyPreOrder', {
              time: expected,
              send: time(new Date(Date.parse(state.expectedUtc) - 30 * MINUTE).toISOString()),
            })
          : t('onMyWay.status.lateBody', { time: expected }),
        tone: 'warn',
      };
    }
    case 'sent':
      return {
        title: state.atUtc
          ? t('onMyWay.status.sentTitle', { time: time(state.atUtc) })
          : t('onMyWay.status.sentPlain'),
        body: t('onMyWay.status.sentBody'),
        tone: 'good',
      };
  }
}
