import type { AwaitingApproval } from '@yalla/api';
import type { TFunction } from 'i18next';
import { useCallback } from 'react';
import type { AdmissionOutcome } from '../AdmissionPanel';
import { branchToday, decidedNotice } from '../approvalRequests';
import type { PreOrderOutcome } from '../PreOrderPanel';
import type { BranchFormat } from '../useBranchFormat';
import type { SetNotice } from './notices';

/**
 * What the rail's answers say in the notice line once they land: a pre-order
 * sent or not coming, a table let in or turned away, a booking answered or
 * refused.
 */
export function useOutcomeNotices(
  t: TFunction,
  format: BranchFormat,
  timeZoneId: string,
  setNotice: SetNotice,
) {
  const preOrderDone = useCallback(
    (outcome: PreOrderOutcome) =>
      setNotice({
        kind: 'info',
        text:
          outcome.kind === 'notComing'
            ? t('preOrders.notComingNotice', { label: outcome.tableLabel })
            : outcome.wasReplay
              ? t('preOrders.alreadySentNotice', { label: outcome.tableLabel })
              : t('preOrders.sentNotice', { label: outcome.tableLabel }),
      }),
    [t, setNotice],
  );

  const admissionDecided = useCallback(
    (outcome: AdmissionOutcome) =>
      setNotice({
        kind: 'info',
        text:
          outcome.kind === 'admitted'
            ? t('admission.admittedNotice', { label: outcome.tableLabel })
            : outcome.heldAgain
              ? t('admission.rejectedHeldNotice', { label: outcome.tableLabel })
              : outcome.tableFreed
                ? t('admission.rejectedFreedNotice', { label: outcome.tableLabel })
                : t('admission.rejectedNotice', { label: outcome.tableLabel }),
      }),
    [t, setNotice],
  );

  /** A booking answered from the rail or the phone's Approve screen: said in the notice. */
  const approvalDecided = useCallback(
    ({ approved, request }: { readonly approved: boolean; readonly request: AwaitingApproval }) =>
      setNotice({
        kind: 'info',
        // Dated like the card when the booking is not for today.
        text: decidedNotice(
          request,
          approved,
          t,
          format.time,
          branchToday(timeZoneId, (iso) => format.dayAndTime(iso).date, new Date()),
        ),
      }),
    [format, t, timeZoneId, setNotice],
  );
  const approvalRefused = useCallback(
    ({ request, text }: { readonly request: AwaitingApproval; readonly text: string }) =>
      setNotice({
        kind: 'warning',
        text: `${t('table.title', { label: request.tableLabel })} · ${text}`,
      }),
    [t, setNotice],
  );

  return { preOrderDone, admissionDecided, approvalDecided, approvalRefused };
}
