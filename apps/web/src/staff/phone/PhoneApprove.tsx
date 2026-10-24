import type { AwaitingApproval } from '@yalla/api';
import { useNow } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { ApprovalCard, type ApprovalPanelProps } from '../ApprovalPanel';

export interface PhoneApproveProps {
  readonly branchId: string;
  /**
   * The booking, as last read. Kept by the screen after the list drops it —
   * answered here, elsewhere, or timed out — so the card can still say what
   * became of it rather than vanish under the waiter's thumb.
   */
  readonly request: AwaitingApproval | null;
  /** Still on the awaiting list: false once the list has dropped it. */
  readonly waiting: boolean;
  readonly timeZoneId: string;
  readonly online: boolean;
  readonly onDecided: ApprovalPanelProps['onDecided'];
  readonly onRefused: ApprovalPanelProps['onRefused'];
  /** Back to Now. */
  readonly onDone: () => void;
}

/**
 * The phone's Approve screen (the Approve artboard): one booking waiting for
 * an answer, with its clock, the table around it and the guest's record, and
 * Approve / Decline — `ApprovalCard`, the rail's own card, so the decision is
 * the same code on a phone and on the counter.
 */
export function PhoneApprove(props: PhoneApproveProps) {
  const { t } = useTranslation(['staff', 'common']);
  const now = useNow(1000);

  return (
    <div className="ph-screen ph-approve">
      {props.request ? (
        <>
          <ul className="ft-items">
            <ApprovalCard
              request={props.request}
              now={now}
              fresh={false}
              branchId={props.branchId}
              timeZoneId={props.timeZoneId}
              online={props.online}
              onDecided={props.onDecided}
              onRefused={props.onRefused}
            />
          </ul>
          {props.waiting ? null : (
            <p className="table-note" role="status">
              {t('phone.approve.gone')}
            </p>
          )}
        </>
      ) : (
        <p className="ft-rail-empty">{t('phone.approve.gone')}</p>
      )}
      <button type="button" className="ph-wide-btn" onClick={props.onDone}>
        {t('phone.approve.backToNow')}
      </button>
    </div>
  );
}
