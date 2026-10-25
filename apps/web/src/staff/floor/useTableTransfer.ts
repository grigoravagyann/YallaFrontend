import { ForbiddenError, newCommandId, transferRefusalOf } from '@yalla/api';
import { useTransferTab, useTransferTargets } from '@yalla/api/react';
import type { TFunction } from 'i18next';
import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { TransferTarget } from '../TableActionPanel';
import type { SetNotice } from './notices';
import type { Selection } from './useFloorCommands';

export interface UseTableTransferOptions {
  readonly branchId: string;
  readonly selectedTabId: string | null;
  readonly t: TFunction;
  readonly setNotice: SetNotice;
  readonly setSelection: Dispatch<SetStateAction<Selection | null>>;
}

/**
 * Transfer a table (2026-10-24, list from the server 2026-10-25).
 *
 * Who could take it, read from the server when the chooser opens: exactly the
 * people the transfer accepts (active, serving here, not the table's waiter
 * now), on shift first, each with the tables they hold. One list for the
 * tablet and the phone alike, whose own roster is only its person.
 */
export function useTableTransfer({
  branchId,
  selectedTabId,
  t,
  setNotice,
  setSelection,
}: UseTableTransferOptions) {
  const transferTab = useTransferTab(branchId);
  /** The tab whose chooser is open: nothing is read before somebody asks. */
  const [transferWantedFor, setTransferWantedFor] = useState<string | null>(null);
  const transferTargetsQuery = useTransferTargets(
    selectedTabId,
    selectedTabId !== null && transferWantedFor === selectedTabId,
  );
  const transferTargets = useMemo((): readonly TransferTarget[] | null => {
    if (!transferTargetsQuery.data) return null;
    return transferTargetsQuery.data.map((target) => ({
      staffMemberId: target.staffMemberId,
      name: target.name,
      roleLabel: t(`pin.role.${target.role}`),
      onShift: target.onShiftNow,
      load: target.openTables,
    }));
  }, [t, transferTargetsQuery.data]);
  const transferTargetsFailed = transferTargetsQuery.isError;
  /** A 403 is an answer: only the table's waiter or a manager hands it over. */
  const transferNotYours = transferTargetsQuery.error instanceof ForbiddenError;
  const transfer = useCallback(
    (
      tabId: string,
      tableLabel: string,
      target: TransferTarget,
      onDone?: (result: { readonly name: string; readonly atUtc: string }) => void,
    ) => {
      transferTab.mutate(
        { tabId, toStaffMemberId: target.staffMemberId, clientCommandId: newCommandId() },
        {
          onSuccess: (result) => {
            const name = result.server.name || target.name;
            // The phone's sheet says it itself, and stays up until "Done".
            if (onDone) {
              // The server's own time: the one the history line carries.
              onDone({ name, atUtc: result.transferredAtUtc });
              return;
            }
            setNotice({
              kind: 'info',
              text: t('table.transfer.done', { label: tableLabel, name }),
            });
            setSelection(null);
          },
          onError: (error) => {
            // The server says why (`transfer-target-ineligible` and its
            // reason, or `tab-not-transferable`); anything else is a retry.
            const refusal = transferRefusalOf(error);
            const name = target.name.split(/\s+/u)[0] ?? target.name;
            setNotice({
              kind: 'warning',
              text:
                // Not this person's table (somebody else's waiter, not a manager).
                error instanceof ForbiddenError
                  ? t('table.transfer.notYours', { label: tableLabel })
                  : refusal?.kind === 'notTransferable'
                    ? t('table.transfer.closed', { label: tableLabel })
                    : refusal?.reason === 'does-not-serve'
                      ? t('table.transfer.notServing', { name })
                      : refusal?.reason === 'other-branch'
                        ? t('table.transfer.otherBranch', { name })
                        : refusal?.reason === 'inactive' || refusal?.reason === 'not-found'
                          ? t('table.transfer.gone', { name })
                          : t('table.transfer.refused', { label: tableLabel }),
            });
          },
        },
      );
    },
    [t, transferTab, setNotice, setSelection],
  );

  return {
    transferTab,
    setTransferWantedFor,
    transferTargets,
    transferTargetsFailed,
    transferNotYours,
    transfer,
  };
}
