import {
  ApiError,
  isOffline,
  isPaymentExceedsRemaining,
  LineAlreadyPaidError,
  newCommandId,
  type AdjustmentKind,
  type ServiceRequest,
  type StaffTab,
  type TabLine,
  type VoidReason,
} from '@yalla/api';
import {
  queryKeys,
  useAbandonTab,
  useBeginClosing,
  useCompLine,
  useRecordCashPayment,
  useVoidLine,
} from '@yalla/api/react';
import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import type { ComponentProps, Dispatch, SetStateAction } from 'react';
import type { CashOutcome } from '../CashKeypad';
import type { UnresolvedTab } from '../FloorRail';
import type { TabPanel } from '../TabPanel';
import type { BranchFormat } from '../useBranchFormat';
import type { SetNotice } from './notices';

/** The last cash refusal, with the balance the server reported. */
export interface CashRefusal {
  tabId: string;
  remainingDram: number;
  requestedDram: number;
}

type TabPanelProps = ComponentProps<typeof TabPanel>;

export interface UseTabActionsOptions {
  readonly branchId: string;
  readonly activeTabId: string | null;
  readonly tab: StaffTab | null | undefined;
  readonly acknowledgedBills: ReadonlyMap<string, ServiceRequest>;
  readonly sendAcknowledge: (request: ServiceRequest) => void;
  readonly format: BranchFormat;
  readonly queryClient: QueryClient;
  readonly t: TFunction;
  readonly setNotice: SetNotice;
  readonly setCashRefusal: Dispatch<SetStateAction<CashRefusal | null>>;
  readonly setSettledBillIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
  readonly setAcknowledgedBills: Dispatch<SetStateAction<ReadonlyMap<string, ServiceRequest>>>;
  readonly setUnresolved: Dispatch<SetStateAction<readonly UnresolvedTab[]>>;
}

/**
 * What the tab overlay does to the tab it shows: a line voided, a comp or a
 * discount, the bill asked for, cash taken, the tab written off.
 *
 * Fresh handlers on every render, as the overlay has always been handed.
 */
export function useTabActions({
  branchId,
  activeTabId,
  tab,
  acknowledgedBills,
  sendAcknowledge,
  format,
  queryClient,
  t,
  setNotice,
  setCashRefusal,
  setSettledBillIds,
  setAcknowledgedBills,
  setUnresolved,
}: UseTabActionsOptions): Pick<
  TabPanelProps,
  'onVoid' | 'onAdjust' | 'onAskForBill' | 'onCash' | 'onAbandon'
> {
  const voidLine = useVoidLine();
  const compLine = useCompLine();
  const abandonTab = useAbandonTab();
  const recordCash = useRecordCashPayment();
  const beginClosing = useBeginClosing();

  return {
    onVoid: (line: TabLine, reason: VoidReason, detail?: string) => {
      if (!activeTabId) return;
      voidLine.mutate(
        {
          tabId: activeTabId,
          lineId: line.id,
          reason,
          clientCommandId: newCommandId(),
          ...(detail ? { detail } : {}),
        },
        {
          onSuccess: () =>
            setNotice({ kind: 'info', text: t('tab.notice.voided', { name: line.name }) }),
          onError: (error) =>
            setNotice({
              kind: 'warning',
              text:
                error instanceof LineAlreadyPaidError
                  ? t('tab.notice.lineAlreadyPaid')
                  : t('tab.notice.failed'),
            }),
        },
      );
    },
    onAdjust: (input: {
      lineId: string | null;
      kind: AdjustmentKind;
      percent: number | null;
      amountDram: number | null;
      reason: string;
    }) => {
      if (!activeTabId) return;
      const tabId = activeTabId;
      const lineName = input.lineId
        ? tab?.lines.find((line) => line.id === input.lineId)?.name
        : undefined;
      compLine.mutate(
        { tabId, ...input, clientCommandId: newCommandId() },
        {
          // The tab's own read lists it once the refetch lands.
          onSuccess: (adjustment) => {
            setNotice({
              kind: 'info',
              text: lineName
                ? t('tab.notice.comped', { name: lineName })
                : t('tab.notice.discounted', {
                    amount: format.dram(adjustment.reductionDram),
                  }),
            });
          },
          onError: () => setNotice({ kind: 'warning', text: t('tab.notice.failed') }),
        },
      );
    },
    onAskForBill: () => {
      if (!activeTabId) return;
      beginClosing.mutate({ tabId: activeTabId, clientCommandId: newCommandId() });
    },
    onCash: async ({
      amountDram,
      tipDram,
      clientCommandId,
      billRequest: request,
    }): Promise<CashOutcome> => {
      if (!activeTabId) return { kind: 'failed' };
      const tabId = activeTabId;
      // A "my share" request is one person's money, so the cash is theirs
      // and the server credits their share. The whole bill names nobody:
      // whoever hands it over is paying for the table.
      const payer = request?.bill?.scope === 'mine' ? request.requestedByParticipantId : null;
      // Whether this device already answered it with "On my way".
      const acknowledgedHere = request ? acknowledgedBills.has(request.id) : false;
      setCashRefusal(null);
      try {
        const result = await recordCash.mutateAsync({
          tabId,
          amountDram,
          tipDram,
          // The keypad's: the same on a retry, so a lost answer replays.
          clientCommandId,
          ...(payer ? { participantId: payer } : {}),
        });
        if (request) {
          // Only the request this cash answered is done with, whether
          // or not anyone tapped "On my way" for it. The others at the
          // table are still waiting.
          setSettledBillIds((current) => new Set(current).add(request.id));
          // With it go this device's copies of the same person's
          // earlier requests on the tab: they were already replaced,
          // and must not resurface as the newest once this one is gone.
          const answered = (candidate: ServiceRequest) =>
            candidate.id === request.id ||
            (request.requestedByParticipantId !== null &&
              candidate.tabId === request.tabId &&
              candidate.requestedByParticipantId === request.requestedByParticipantId &&
              candidate.requestedAtUtc <= request.requestedAtUtc);
          setAcknowledgedBills((current) => {
            const next = new Map([...current].filter(([, candidate]) => !answered(candidate)));
            return next.size === current.size ? current : next;
          });
          // And answered on the server when nobody has yet, so a
          // reload or the other tablet does not show it again.
          const stillOpen = (
            queryClient.getQueryData<readonly ServiceRequest[]>(
              queryKeys.serviceRequests(branchId),
            ) ?? []
          ).some(
            (candidate) => candidate.id === request.id && candidate.acknowledgedAtUtc === null,
          );
          if (stillOpen && !acknowledgedHere) sendAcknowledge(request);
        }
        setUnresolved((current) =>
          result.tabClosed ? current.filter((entry) => entry.tabId !== tabId) : current,
        );
        // The keypad's own card says what was taken and the change.
        return { kind: 'recorded', tabClosed: result.tabClosed };
      } catch (error) {
        // The refusal carries the real balance. Shown against the bill,
        // and never retried: the hook has `retry: false` and nothing
        // here sends it again.
        if (isPaymentExceedsRemaining(error)) {
          setCashRefusal({
            tabId,
            remainingDram: error.remainingDram,
            requestedDram: error.requestedDram,
          });
          return { kind: 'refused' };
        }
        // Only an answer from the server means nothing was taken. No
        // answer — offline, a timeout, a server fault — may have landed:
        // read the tab again so the waiter checks it before retrying.
        if (isServerRefusal(error)) return { kind: 'failed' };
        void queryClient.invalidateQueries({ queryKey: queryKeys.staffTab(tabId) });
        return { kind: 'unknown' };
      }
    },
    onAbandon: (reason) => {
      if (!activeTabId) return;
      const tabId = activeTabId;
      abandonTab.mutate(
        { tabId, reason, clientCommandId: newCommandId() },
        {
          onSuccess: (result) =>
            setNotice({
              kind: 'info',
              text: t('tab.notice.markedUnpaid', {
                amount: format.dram(result.writtenOffDram),
              }),
            }),
          onError: () => setNotice({ kind: 'warning', text: t('tab.notice.failed') }),
        },
      );
      setUnresolved((current) => current.filter((entry) => entry.tabId !== tabId));
    },
  };
}

/**
 * The server answered, and said no. Not a dropped connection, a timeout or a
 * 5xx, after any of which the write may still have happened.
 */
function isServerRefusal(error: unknown): boolean {
  return error instanceof ApiError && !isOffline(error) && error.status < 500;
}
