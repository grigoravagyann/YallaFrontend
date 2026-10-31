import { ConcurrencyConflictError, isNoShowUndoWindowClosed, newCommandId } from '@yalla/api';
import { useUndoNoShow } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { useRef } from 'react';
import { ICONS, RailSection } from './FloorRail';
import { useBranchFormat } from './useBranchFormat';

/** A no-show just marked, which the floor offers to take back. */
export interface UndoableNoShow {
  readonly reservationId: string;
  /** `null` for a booking made by time only that nobody seated: said by {@link guestName}. */
  readonly tableLabel: string | null;
  /** The guest, for a booking with no table to name. */
  readonly guestName?: string | undefined;
}

/** "Undo the no-show at table 4" — or "Undo Narek's no-show" for one with no table. */
function undoLabel(t: TFunction, noShow: UndoableNoShow): string {
  return noShow.tableLabel === null
    ? t('notice.undoNoShow.actionLabelGuest', { name: noShow.guestName ?? '' })
    : t('notice.undoNoShow.actionLabel', { label: noShow.tableLabel });
}

/** A no-show this tablet marked, undoable until its window closes. */
export interface MarkedNoShow extends UndoableNoShow {
  /** 05:00 the morning after the booking's service day, as an instant. */
  readonly undoableUntilUtc: string;
}

/** What an undo came to, as the floor's notice says it. */
export interface UndoOutcome {
  readonly kind: 'info' | 'warning';
  readonly text: string;
  /** Nothing is left to undo — done, done by somebody else, or too late: off the rail. */
  readonly settled: boolean;
}

/**
 * Undo one no-show, worded. Online only and never queued: an undo that lands
 * hours later, after the guest was told and maybe blocked, is not the undo
 * that was asked for. One command id per tap; a second tap while one is on its
 * way sends nothing.
 */
function useUndoRun(branchId: string, timeZoneId: string, online: boolean) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const undo = useUndoNoShow(branchId);
  const sending = useRef(false);

  function run(noShow: UndoableNoShow, onSettled: (outcome: UndoOutcome) => void) {
    if (sending.current || !online) return;
    sending.current = true;
    const label = noShow.tableLabel;
    undo.mutate(
      { reservationId: noShow.reservationId, clientCommandId: newCommandId() },
      {
        onSuccess: () => {
          sending.current = false;
          onSettled({
            kind: 'info',
            text:
              label === null
                ? t('notice.undoNoShow.doneGuest', { name: noShow.guestName ?? '' })
                : t('notice.undoNoShow.done', { label }),
            settled: true,
          });
        },
        onError: (error) => {
          sending.current = false;
          const closed = isNoShowUndoWindowClosed(error);
          // Somebody else undid it, or the booking moved on since.
          const elsewhere = error instanceof ConcurrencyConflictError;
          onSettled({
            kind: 'warning',
            settled: closed || elsewhere,
            text: closed
              ? error.undoableUntilUtc
                ? t('notice.undoNoShow.tooLate', { time: format.time(error.undoableUntilUtc) })
                : t('notice.undoNoShow.tooLatePlain')
              : elsewhere
                ? t('notice.undoNoShow.notNoShow')
                : t('notice.undoNoShow.failed'),
          });
        },
      },
    );
  }

  return { run, pending: undo.isPending, pendingId: undo.variables?.reservationId ?? null };
}

/**
 * The floor's notice right after a no-show was marked, with "Marked by
 * mistake? Undo" (guest record review, 2026-10-20).
 *
 * A no-show goes on the guest's record, and three in three days block them
 * from booking for a week and cancel what they had booked — so a wrong tap
 * here is not a small thing, and the moment it is noticed is often the moment
 * the notice is on screen. The rail keeps it for the rest of its window
 * (`NoShowSection`). What became of it replaces the notice (`onSettled`).
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
  readonly onSettled: (outcome: UndoOutcome) => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const undo = useUndoRun(branchId, timeZoneId, online);

  return (
    <div className={`floor-notice notice-info has-action${wide ? ' is-wide' : ''}`}>
      <p role="status">{text}</p>
      <p className="floor-notice-undo">
        <span>{t('notice.undoNoShow.prompt')}</span>
        <button
          type="button"
          className="ft-btn ft-btn-secondary"
          aria-label={undoLabel(t, noShow)}
          disabled={!online || undo.pending}
          onClick={() => undo.run(noShow, onSettled)}
        >
          {undo.pending ? t('notice.undoNoShow.sending') : t('notice.undoNoShow.action')}
        </button>
      </p>
      {online ? null : <p className="floor-notice-note">{t('notice.undoNoShow.needsOnline')}</p>}
    </div>
  );
}

/**
 * "No-shows marked here": the no-shows this tablet marked, each undoable from
 * the rail until 05:00 the morning after its service day (review S5). The
 * notice lasts seconds, and a mistake is often noticed only when the guest
 * walks in. Shown only while one is still undoable.
 */
export function NoShowSection({
  branchId,
  marked,
  online,
  timeZoneId,
  onSettled,
}: {
  readonly branchId: string;
  readonly marked: readonly MarkedNoShow[];
  readonly online: boolean;
  readonly timeZoneId: string;
  readonly onSettled: (noShow: MarkedNoShow, outcome: UndoOutcome) => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const undo = useUndoRun(branchId, timeZoneId, online);
  if (marked.length === 0) return null;

  return (
    <RailSection title={t('noShows.title')} count={marked.length} tone="waiting" icon={ICONS.alert}>
      <ul className="ft-noshows">
        {marked.map((noShow) => (
          <li key={noShow.reservationId} className="ft-noshow">
            <span>
              {noShow.tableLabel === null
                ? t('noShows.rowGuest', {
                    name: noShow.guestName ?? '',
                    time: format.time(noShow.undoableUntilUtc),
                  })
                : t('noShows.row', {
                    label: noShow.tableLabel,
                    time: format.time(noShow.undoableUntilUtc),
                  })}
            </span>
            <button
              type="button"
              className="ft-btn ft-btn-secondary"
              aria-label={undoLabel(t, noShow)}
              disabled={!online || undo.pending}
              onClick={() => undo.run(noShow, (outcome) => onSettled(noShow, outcome))}
            >
              {undo.pending && undo.pendingId === noShow.reservationId
                ? t('notice.undoNoShow.sending')
                : t('notice.undoNoShow.action')}
            </button>
          </li>
        ))}
      </ul>
      {online ? null : <p className="ft-rail-empty">{t('notice.undoNoShow.needsOnline')}</p>}
    </RailSection>
  );
}
