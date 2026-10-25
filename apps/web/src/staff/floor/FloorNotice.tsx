import { useTranslation } from '@yalla/i18n';
import { UndoNoShowNotice, type UndoOutcome } from '../UndoNoShowNotice';
import type { Notice } from './notices';

export interface FloorNoticeProps {
  readonly notice: Notice | null;
  readonly paused: boolean;
  readonly branchId: string;
  readonly online: boolean;
  /** Over the kitchen, the takeaway counter or the inbox: the full width. */
  readonly wide: boolean;
  readonly timeZoneId: string;
  readonly time: (iso: string) => string;
  readonly onUndoSettled: (reservationId: string, outcome: UndoOutcome) => void;
}

/** The floor's notice line, or the no-show just marked with its undo. */
export function FloorNotice({
  notice,
  paused,
  branchId,
  online,
  wide,
  timeZoneId,
  time,
  onUndoSettled,
}: FloorNoticeProps) {
  const { t } = useTranslation(['staff', 'admin', 'common']);
  return (
    <>
      {/* Never over the PIN gate: a notice that lands as the tablet locks is
          somebody else's news, and the next person should not read it. */}
      {notice?.undo && !paused && branchId ? (
        <UndoNoShowNotice
          // A fresh one per no-show: a tap on the last one never carries over.
          key={notice.undo.reservationId}
          branchId={branchId}
          noShow={notice.undo}
          text={notice.text}
          online={online}
          wide={wide}
          timeZoneId={timeZoneId}
          onSettled={(outcome) => onUndoSettled(notice.undo!.reservationId, outcome)}
        />
      ) : notice && !paused ? (
        <p className={`floor-notice notice-${notice.kind}${wide ? ' is-wide' : ''}`} role="status">
          {notice.blockCancelled?.length === 1
            ? t('notice.bookingCancelledByBlock', {
                label: notice.blockCancelled[0]!.tableLabel,
                time: time(notice.blockCancelled[0]!.startUtc),
              })
            : notice.blockCancelled
              ? t('notice.bookingsCancelledByBlock', {
                  count: notice.blockCancelled.length,
                  labels: notice.blockCancelled.map((entry) => entry.tableLabel).join(', '),
                })
              : notice.text}
        </p>
      ) : null}
    </>
  );
}
