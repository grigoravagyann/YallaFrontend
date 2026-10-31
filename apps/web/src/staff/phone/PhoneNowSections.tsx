import {
  approvalCountdown,
  waitsOnEarlierGuestInApp,
  type AwaitingApproval,
  type StaffTakeawayOrder,
} from '@yalla/api';
import { useNow } from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { branchToday, requestLine, requestTable } from '../approvalRequests';
import { ICONS, RailSection } from '../FloorRail';
import { answerCountdown } from '../takeaway/takeawayText';
import { ToCallSection, type ToCallSectionProps } from '../ToCallPanel';
import { useBranchFormat } from '../useBranchFormat';
import type { ArrivalState, UpcomingBooking } from './nextHour';
import { PhoneIcon } from './PhoneShell';

/*
 * The phone's Now screen (the Now artboard) is the tablet's rail in the
 * phone's order. Three of its sections are shorter here than on the rail —
 * a booking or a takeaway order is a row that opens its own screen, where
 * the tablet's own card does the deciding — and one is the phone's own:
 * "In the next hour".
 */

export interface PhoneApprovalListProps {
  readonly requests: readonly AwaitingApproval[];
  readonly timeZoneId: string;
  readonly loading: boolean;
  readonly failed: boolean;
  /** Requests that arrived since the last read, highlighted. */
  readonly fresh: ReadonlySet<string>;
  readonly onOpen: (request: AwaitingApproval) => void;
}

/**
 * "To approve": one row per booking waiting for an answer, with its clock,
 * opening the Approve screen — `ApprovalCard`, the rail's own card, whole.
 */
export function PhoneApprovalList(props: PhoneApprovalListProps) {
  const { t } = useTranslation(['staff', 'common']);
  const { locale } = useLocale();
  const format = useBranchFormat(props.timeZoneId);
  // The countdowns are seconds, as on the rail.
  const now = useNow(1000);
  const days = branchToday(props.timeZoneId, (iso) => format.dayAndTime(iso).date, now);

  return (
    <RailSection
      title={t('approvals.title')}
      count={props.requests.length}
      tone="waiting"
      icon={ICONS.calendar}
    >
      {props.failed && props.requests.length === 0 ? (
        <p className="ft-rail-empty is-failed">{t('approvals.unreachable')}</p>
      ) : props.loading ? (
        <p className="ft-rail-empty">{t('floor.loading')}</p>
      ) : props.requests.length === 0 ? (
        <p className="ft-rail-empty">{t('approvals.empty')}</p>
      ) : (
        <ul className="ph-links">
          {props.requests.map((request) => {
            const guestAnswers = waitsOnEarlierGuestInApp(
              request.because,
              request.awaitsEarlierGuestAnswer,
            );
            const countdown = guestAnswers
              ? null
              : approvalCountdown(request.approvalExpiresAtUtc, now, locale);
            const line = requestLine(request, t, format.time, days);
            const because = t(`approvals.because.${request.because ?? 'unknown'}`);
            return (
              <li key={request.id}>
                <button
                  type="button"
                  className={[
                    'ph-link is-strong',
                    props.fresh.has(request.id) ? 'is-fresh' : '',
                    countdown?.urgent ? 'is-urgent' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  // The deadline, not the seconds left: a name that changes every
                  // second is re-read or ignored, and either way not heard.
                  aria-label={[
                    requestTable(request, t),
                    line,
                    countdown && request.approvalExpiresAtUtc
                      ? countdown.expired
                        ? t('approvals.timeUpShort')
                        : t('approvals.answerBy', {
                            time: format.time(request.approvalExpiresAtUtc),
                          })
                      : null,
                    because,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  onClick={() => props.onOpen(request)}
                >
                  <span className="ph-link-text" aria-hidden="true">
                    <span className="ph-link-top">
                      <b>{requestTable(request, t)}</b>
                      {countdown ? (
                        <span className="ph-link-clock">
                          {countdown.expired ? t('approvals.timeUp') : countdown.label}
                        </span>
                      ) : null}
                    </span>
                    <span>{line}</span>
                    <span className="ph-link-sub">{because}</span>
                  </span>
                  <PhoneIcon name="chevron" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </RailSection>
  );
}

export interface PhoneTakeawayListProps {
  /** Orders the guest sent and nobody has answered. */
  readonly orders: readonly StaffTakeawayOrder[];
  readonly failed: boolean;
  readonly onOpen: () => void;
}

/**
 * "Takeaway": the orders waiting for an answer, each with its five-minute
 * clock, opening the Takeaway screen — `TakeawayCounter`, where the ready
 * time is chosen. Not there at all while nothing waits, as on the rail.
 */
export function PhoneTakeawayList(props: PhoneTakeawayListProps) {
  const { t } = useTranslation(['staff', 'common']);
  const now = useNow(1000);
  if (props.orders.length === 0 && !props.failed) return null;
  return (
    <RailSection
      title={t('takeaway.railTitle')}
      count={props.orders.length}
      tone="waiting"
      icon={ICONS.bag}
    >
      {props.failed && props.orders.length === 0 ? (
        <p className="ft-rail-empty is-failed">{t('takeaway.unreachable')}</p>
      ) : (
        <ul className="ph-links">
          {props.orders.map((order) => {
            const countdown = answerCountdown(order.acceptDeadlineUtc, now);
            const title = t('phone.takeaway.newOrder', { code: order.code });
            const clock = countdown
              ? countdown.expired
                ? t('takeaway.timeUp')
                : t('phone.takeaway.answerIn', { time: countdown.label })
              : null;
            return (
              <li key={order.id}>
                <button
                  type="button"
                  className={`ph-link is-strong${countdown?.urgent ? ' is-urgent' : ''}`}
                  aria-label={[title, clock].filter(Boolean).join(', ')}
                  onClick={props.onOpen}
                >
                  <span className="ph-badge is-takeaway" aria-hidden="true">
                    T
                  </span>
                  <span className="ph-link-text" aria-hidden="true">
                    <b>{title}</b>
                    {clock ? <span className="ph-link-clock">{clock}</span> : null}
                  </span>
                  <PhoneIcon name="chevron" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </RailSection>
  );
}

/**
 * "Call the guest" on the phone's Now (2026-10-31): the tablet's section in
 * the phone's frame — the number is a `tel:` link, one tap to dial, and the
 * two answers sit under it.
 */
export function PhoneToCallList(props: Omit<ToCallSectionProps, 'variant'>) {
  return <ToCallSection {...props} variant="phone" />;
}

export interface PhoneNextHourProps {
  readonly rows: readonly UpcomingBooking[];
  readonly timeZoneId: string;
  /** Opens the table's sheet on the Floor screen. */
  readonly onOpenTable: (tableId: string) => void;
}

/**
 * "In the next hour": each table's next booking within the hour, and whether
 * the guest said they are coming — the door the waiter is watching.
 */
export function PhoneNextHour(props: PhoneNextHourProps) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(props.timeZoneId);
  return (
    <RailSection
      title={t('phone.nextHour.title')}
      count={props.rows.length}
      tone="waiting"
      icon={ICONS.calendar}
    >
      {props.rows.length === 0 ? (
        <p className="ft-rail-empty">{t('phone.nextHour.empty')}</p>
      ) : (
        <ul className="ph-rows">
          {props.rows.map((row) => {
            const what = [
              t('table.title', { label: row.tableLabel }),
              row.partySize ? t('floor.card.party', { count: row.partySize }) : null,
            ]
              .filter(Boolean)
              .join(' · ');
            const state = arrivalText(t, row.arrival);
            return (
              <li key={row.reservationId}>
                <button
                  type="button"
                  className="ph-row"
                  aria-label={[format.time(row.startUtc), what, state?.text]
                    .filter(Boolean)
                    .join(', ')}
                  onClick={() => props.onOpenTable(row.tableId)}
                >
                  <span aria-hidden="true">
                    <b>{format.time(row.startUtc)}</b> · {what}
                  </span>
                  {state ? (
                    <span className="ph-row-state" data-tone={state.tone} aria-hidden="true">
                      {state.text}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </RailSection>
  );
}

function arrivalText(
  t: TFunction,
  arrival: ArrivalState,
): { readonly text: string; readonly tone: 'ok' | 'waiting' | 'quiet' } | null {
  switch (arrival.kind) {
    case 'late':
      return {
        text: t('floor.card.runningLate', { count: arrival.minutes }),
        tone: 'waiting',
      };
    case 'coming':
      return { text: t('floor.card.onTheWay'), tone: 'ok' };
    case 'asked':
      return { text: t('phone.nextHour.asked'), tone: 'quiet' };
    case 'overdue':
      return { text: t('phone.nextHour.overdue'), tone: 'waiting' };
    case 'none':
      return null;
  }
}
