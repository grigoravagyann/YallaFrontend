import { ConcurrencyConflictError, isNoShowUndoWindowClosed, newCommandId } from '@yalla/api';
import { useUndoNoShow } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useRef } from 'react';
import { useBranchFormat } from './useBranchFormat';

/** A no-show just marked, which the notice offers to take back. */
export interface UndoableNoShow {
  readonly reservationId: string;
  readonly tableLabel: string;
}

/**
 * The floor's notice right after a no-show was marked, with "Marked by
 * mistake? Undo" (guest record review, 2026-10-20).
 *
 * A no-show goes on the guest's record, and three in three days block them
 * from booking for a week and cancel what they had booked — so a wrong tap
 * here is not a small thing, and the moment it is noticed is the moment the
 * notice is on screen. The server takes the undo until 05:00 the next morning.
 *
 * Online only and never queued: an undo that lands hours later, after the
 * guest was told and maybe blocked, is not the undo that was asked for. One
 * command id per tap; a second tap while one is on its way sends nothing.
 * What became of it replaces the notice (`onSettled`).
 */
export function UndoNoShowNotice({
  branchId,
  noShow,
  text,
  online,
  wide,
  timeZoneId,
  onSettled,
}: {
  readonly branchId: string;
  readonly noShow: UndoableNoShow;
  /** What the release did, as the notice says it. */
  readonly text: string;
  readonly online: boolean;
  /** No rail beside it (the kitchen view): centred on the whole width. */
  readonly wide: boolean;
  readonly timeZoneId: string;
  readonly onSettled: (outcome: {
    readonly kind: 'info' | 'warning';
    readonly text: string;
  }) => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const undo = useUndoNoShow(branchId);
  const sending = useRef(false);
  const label = noShow.tableLabel;

  function run() {
    if (sending.current || !online) return;
    sending.current = true;
    undo.mutate(
      { reservationId: noShow.reservationId, clientCommandId: newCommandId() },
      {
        onSuccess: () => onSettled({ kind: 'info', text: t('notice.undoNoShow.done', { label }) }),
        onError: (error) => {
          sending.current = false;
          onSettled({
            kind: 'warning',
            text: isNoShowUndoWindowClosed(error)
              ? error.undoableUntilUtc
                ? t('notice.undoNoShow.tooLate', { time: format.time(error.undoableUntilUtc) })
                : t('notice.undoNoShow.tooLatePlain')
              : // Somebody else undid it, or the booking moved on since.
                error instanceof ConcurrencyConflictError
                ? t('notice.undoNoShow.notNoShow')
                : t('notice.undoNoShow.failed'),
          });
        },
      },
    );
  }

  return (
    <div className={`floor-notice notice-info has-action${wide ? ' is-wide' : ''}`}>
      <p role="status">{text}</p>
      <p className="floor-notice-undo">
        <span>{t('notice.undoNoShow.prompt')}</span>
        <button
          type="button"
          className="ft-btn ft-btn-secondary"
          aria-label={t('notice.undoNoShow.actionLabel', { label })}
          disabled={!online || undo.isPending}
          onClick={run}
        >
          {undo.isPending ? t('notice.undoNoShow.sending') : t('notice.undoNoShow.action')}
        </button>
      </p>
      {online ? null : <p className="floor-notice-note">{t('notice.undoNoShow.needsOnline')}</p>}
    </div>
  );
}
