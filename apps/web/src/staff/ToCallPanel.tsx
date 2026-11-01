import {
  ApiError,
  OnMyWayNotOpenError,
  isOffline,
  newCommandId,
  type BookingToCall,
} from '@yalla/api';
import { useMarkGuestComing } from '@yalla/api/react';
import { formatPhone } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useId, useRef, useState } from 'react';
import { ICONS, RailSection } from './FloorRail';
import { useBranchFormat } from './useBranchFormat';

/**
 * "Call the guest" (2026-10-31): the staff-taken bookings in their call
 * window — thirty minutes before the start until the branch's grace after it
 * — whose guest nobody has recorded as coming. Mine first, badged.
 *
 * A booking taken over the counter has no app behind it, so nothing can be
 * pushed to the guest: the taker calls the number on the card and records
 * the answer. "Coming" is the guest's own "on my way", written by staff;
 * "Not coming" lets the booking go the ordinary way — the guest told us, so
 * it never counts against them.
 */
export interface ToCallSectionProps {
  readonly branchId: string;
  /** The rows, as the server orders them (mine first, then soonest). */
  readonly rows: readonly BookingToCall[];
  readonly timeZoneId: string;
  readonly online: boolean;
  readonly loading: boolean;
  readonly failed: boolean;
  /** The tablet's rail, or the phone's Now screen. */
  readonly variant: 'rail' | 'phone';
  /** "Not coming", confirmed: release the booking as the guest having told us. */
  readonly onNotComing: (booking: BookingToCall) => void;
}

export function ToCallSection(props: ToCallSectionProps) {
  const { t } = useTranslation(['staff', 'common']);
  const { rows } = props;
  if (rows.length === 0 && !props.failed && !props.loading) return null;

  return (
    <RailSection title={t('toCall.title')} count={rows.length} tone="waiting" icon={ICONS.phone}>
      {props.failed && rows.length === 0 ? (
        <p className="ft-rail-empty is-failed">{t('toCall.unreachable')}</p>
      ) : props.loading && rows.length === 0 ? (
        <p className="ft-rail-empty">{t('floor.loading')}</p>
      ) : (
        <ul className="ft-items">
          {rows.map((row) => (
            <ToCallCard
              key={row.reservationId}
              row={row}
              branchId={props.branchId}
              timeZoneId={props.timeZoneId}
              online={props.online}
              onNotComing={() => props.onNotComing(row)}
            />
          ))}
        </ul>
      )}
    </RailSection>
  );
}

function ToCallCard({
  row,
  branchId,
  timeZoneId,
  online,
  onNotComing,
}: {
  readonly row: BookingToCall;
  readonly branchId: string;
  readonly timeZoneId: string;
  readonly online: boolean;
  readonly onNotComing: () => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const party = t('floor.card.party', { count: row.partySize });
  const where = row.tableLabel ? t('table.title', { label: row.tableLabel }) : t('toCall.noTable');
  return (
    <li
      className={`ft-item tc-card${row.isMine ? ' is-mine' : ''}`}
      data-reservation-id={row.reservationId}
    >
      <div className="ft-item-top">
        <b className="wt-time">{format.time(row.startUtc)}</b>
        <span>
          {party} · {row.guestName}
        </span>
        {row.isMine ? <span className="badge badge-ok">{t('toCall.mine')}</span> : null}
      </div>
      <p className="tc-meta">
        {where}
        {row.takenByName ? ` · ${t('toCall.takenBy', { name: row.takenByName })}` : ''}
      </p>
      {row.note ? <p className="wt-wish">{t('toCall.note', { text: row.note })}</p> : null}
      {row.guestPhone ? (
        <a
          className="approval-call tc-phone"
          href={`tel:${row.guestPhone.replace(/\s+/gu, '')}`}
          aria-label={t('toCall.callLabel', {
            name: row.guestName,
            phone: formatPhone(row.guestPhone),
          })}
        >
          {formatPhone(row.guestPhone)}
        </a>
      ) : null}
      <GuestComingActions
        branchId={branchId}
        booking={row}
        online={online}
        variant="rail"
        onNotComing={onNotComing}
      />
    </li>
  );
}

/** What the two buttons need of a booking. */
export interface GuestComingSubject {
  readonly reservationId: string;
  readonly guestName: string;
}

export interface GuestComingActionsProps {
  readonly branchId: string;
  readonly booking: GuestComingSubject;
  readonly online: boolean;
  /** The rail's narrow card, or the table panel. */
  readonly variant: 'rail' | 'panel';
  /** "Not coming", confirmed by the waiter: the caller releases the booking. */
  readonly onNotComing: () => void;
}

const CLASSES = {
  rail: {
    coming: 'ft-btn ft-btn-primary',
    notComing: 'ft-btn ft-btn-danger',
    confirm: 'ft-btn ft-btn-danger-solid',
    cancel: 'ft-btn ft-btn-secondary',
    note: 'tc-note',
    warn: 'ft-error',
  },
  panel: {
    coming: 'tp-btn tp-ok',
    notComing: 'tp-btn tp-danger',
    confirm: 'tp-btn tp-danger-fill',
    cancel: 'tp-btn tp-sec',
    note: 'tp-hint',
    warn: 'tp-warn',
  },
} as const;

/**
 * "Coming" and "Not coming" for a staff-taken booking: what the floor offers
 * in place of "Ask: are you coming?", which cannot reach a guest with no app.
 * Online only, never queued.
 */
export function GuestComingActions({
  branchId,
  booking,
  online,
  variant,
  onNotComing,
}: GuestComingActionsProps) {
  const { t } = useTranslation(['staff', 'common']);
  const mark = useMarkGuestComing(branchId);
  const titleId = useId();
  const classes = CLASSES[variant];
  const sending = useRef(false);
  const [state, setState] = useState<
    | { readonly kind: 'idle' }
    | { readonly kind: 'confirm' }
    | { readonly kind: 'done' }
    | { readonly kind: 'failed'; readonly text: string }
  >({ kind: 'idle' });

  function coming() {
    if (sending.current || !online) return;
    sending.current = true;
    mark.mutate(
      { reservationId: booking.reservationId, clientCommandId: newCommandId() },
      {
        onSuccess: () => {
          sending.current = false;
          setState({ kind: 'done' });
        },
        onError: (error) => {
          sending.current = false;
          setState({
            kind: 'failed',
            text:
              error instanceof OnMyWayNotOpenError
                ? t('toCall.notOpen')
                : error instanceof ApiError && isOffline(error)
                  ? t('newBooking.failed.offline')
                  : t('toCall.failed'),
          });
        },
      },
    );
  }

  if (state.kind === 'done') {
    return (
      <p className={classes.note} role="status">
        {t('toCall.comingDone')}
      </p>
    );
  }

  if (state.kind === 'confirm') {
    return (
      <div
        className={variant === 'panel' ? 'tp-confirm' : 'tc-confirm'}
        role="group"
        aria-labelledby={titleId}
      >
        <b id={titleId}>{t('toCall.confirmTitle')}</b>
        <p className={classes.note}>{t('toCall.confirmBody')}</p>
        <div className={variant === 'panel' ? 'tp-row' : 'ft-item-actions'}>
          <button
            type="button"
            className={classes.cancel}
            onClick={() => setState({ kind: 'idle' })}
          >
            {t('common:action.cancel')}
          </button>
          <button
            type="button"
            className={classes.confirm}
            disabled={!online}
            onClick={() => {
              setState({ kind: 'idle' });
              onNotComing();
            }}
          >
            {t('toCall.confirm')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={variant === 'panel' ? 'tp-acts' : 'ft-item-actions'}>
        <button
          type="button"
          className={classes.coming}
          disabled={!online || mark.isPending}
          aria-label={t('toCall.comingLabel', { name: booking.guestName })}
          onClick={coming}
        >
          {mark.isPending ? t('toCall.marking') : t('toCall.coming')}
        </button>
        <button
          type="button"
          className={classes.notComing}
          disabled={!online || mark.isPending}
          aria-label={t('toCall.notComingLabel', { name: booking.guestName })}
          onClick={() => setState({ kind: 'confirm' })}
        >
          {t('toCall.notComing')}
        </button>
      </div>
      {!online ? <p className={classes.note}>{t('toCall.needsOnline')}</p> : null}
      {state.kind === 'failed' ? (
        <p
          className={classes.warn}
          data-tone={variant === 'panel' ? 'red' : undefined}
          role="alert"
        >
          {state.text}
        </p>
      ) : null}
    </>
  );
}
