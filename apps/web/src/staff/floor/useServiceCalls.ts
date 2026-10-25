import { newCommandId, type ServiceRequest, type StaffSessionIdentity } from '@yalla/api';
import { queryKeys, useClaimServiceRequest } from '@yalla/api/react';
import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { firstName } from '../../messages/messageText';
import type { CommandQueue } from '../commands/useCommandQueue';
import type { SetNotice } from './notices';

export interface UseServiceCallsOptions {
  readonly identity: StaffSessionIdentity;
  readonly queue: CommandQueue;
  readonly queryClient: QueryClient;
  readonly t: TFunction;
  readonly setNotice: SetNotice;
  readonly setAcknowledgedBills: Dispatch<SetStateAction<ReadonlyMap<string, ServiceRequest>>>;
}

/**
 * A call from a table: "I'm on it" and "On my way".
 */
export function useServiceCalls({
  identity,
  queue,
  queryClient,
  t,
  setNotice,
  setAcknowledgedBills,
}: UseServiceCallsOptions) {
  const branchId = identity.branchId;

  // --- "I'm on it" (2026-10-24) ---------------------------------------------
  //
  // A claim is online only: the first one wins on the server, so a claim
  // queued offline would be a guess. "On my way" on a call nobody has taken
  // claims it too, quietly — the response time is measured to the claim.
  //
  // `mutateAsync`, not `mutate` with per-call callbacks: one mutation hook
  // serves every call, and TanStack only runs a `mutate` call's own callbacks
  // for the latest call — two claims in flight (or a quiet one under "On my
  // way") would leave the first stuck in `claiming`, its button disabled for
  // good, and its race notice unsaid.
  const { mutateAsync: claimAsync } = useClaimServiceRequest();
  const [claiming, setClaiming] = useState<ReadonlySet<string>>(new Set());
  const claim = useCallback(
    (request: ServiceRequest, quiet = false) => {
      if (!queue.online || request.claimedByName) return;
      setClaiming((current) => new Set(current).add(request.id));
      claimAsync({ branchId, requestId: request.id })
        .then((claimed) => {
          if (quiet) return;
          // The server answers a lost race with the winner's claim.
          const mine = claimed.claimedByStaffMemberId
            ? claimed.claimedByStaffMemberId === identity.staffMemberId
            : !claimed.claimedByName || claimed.claimedByName === identity.fullName;
          setNotice({
            kind: mine ? 'info' : 'race',
            text: mine
              ? t('rail.calls.claimNotice', { label: request.tableLabel })
              : t('rail.calls.claimTaken', {
                  label: request.tableLabel,
                  name: firstName(claimed.claimedByName ?? ''),
                }),
          });
        })
        .catch(() => {
          if (!quiet) {
            setNotice({
              kind: 'warning',
              text: t('rail.calls.claimFailed', { label: request.tableLabel }),
            });
          }
        })
        .finally(() =>
          setClaiming((current) => {
            const next = new Set(current);
            next.delete(request.id);
            return next;
          }),
        );
    },
    [branchId, claimAsync, identity.fullName, identity.staffMemberId, queue.online, t, setNotice],
  );

  /**
   * The staff acknowledgement, through the queue like every other command —
   * the same call "On my way" makes.
   */
  const sendAcknowledge = useCallback(
    (request: ServiceRequest) => {
      const clientCommandId = newCommandId();
      queue.enqueue({
        id: clientCommandId,
        scope: request.tabId,
        precondition: null,
        subject: { tableId: null, tableLabel: request.tableLabel, tabId: request.tabId },
        body: {
          kind: 'acknowledgeServiceRequest',
          command: { requestId: request.id, clientCommandId },
        },
      });
      queue.sync();
      void queryClient.invalidateQueries({ queryKey: queryKeys.serviceRequests(branchId) });
    },
    [branchId, queryClient, queue],
  );

  const acknowledge = useCallback(
    (request: ServiceRequest) => {
      if (request.reason === 'bill' && request.bill) {
        setAcknowledgedBills((current) => new Map(current).set(request.id, request));
      }
      claim(request, true);
      sendAcknowledge(request);
      setNotice({
        kind: 'info',
        // Offline it waits in the queue: the guest has seen nothing yet.
        text: t(queue.online ? 'rail.calls.ackNotice' : 'rail.calls.ackQueued', {
          label: request.tableLabel,
        }),
      });
    },
    [claim, queue.online, sendAcknowledge, t, setAcknowledgedBills, setNotice],
  );

  return { claiming, claim, sendAcknowledge, acknowledge };
}
