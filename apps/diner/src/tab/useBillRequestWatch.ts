import { useGateway } from '@yalla/api/react';
import { useEffect } from 'react';
import {
  billRequestEnded,
  tabAccessGone,
  useBillRequests,
  useRequestedBill,
  watchAcknowledgement,
  type RequestedBill,
  type TabStatus,
} from './billRequest';

/**
 * Keep "the bill is on its way" true for exactly as long as it is.
 *
 * Mounted by the tab screen: while a bill request is open it reads the tab's
 * events for that request's acknowledgement, and the polled tab read's status
 * ends it when the tab moves on to closing or closed. A tab this phone can no
 * longer read — the tab read or the events answering 401, 403 or 404 — ends
 * it for good: the request is forgotten and nothing polls for it again.
 * Returns the open request for the screen to draw.
 */
export function useBillRequestWatch(
  tabId: string | undefined,
  status: TabStatus | undefined,
  /** The tab read said this phone's access is over, or the tab is gone. */
  accessGone = false,
): RequestedBill | null {
  const gateway = useGateway();
  const request = useRequestedBill(tabId);
  const settled = useBillRequests((state) => state.settled);

  const ended =
    request !== null && (accessGone || (status !== undefined && billRequestEnded(request, status)));
  useEffect(() => {
    if (ended && request) settled(request.tabId, request.requestId);
  }, [ended, request, settled]);

  const watchTab = ended ? undefined : request?.tabId;
  const watchId = request?.requestId;
  const watchFrom = request?.afterSequence;
  useEffect(() => {
    if (!watchTab || !watchId || watchFrom === undefined) return;
    return watchAcknowledgement({
      tabId: watchTab,
      requestId: watchId,
      afterSequence: watchFrom,
      getTabEvents: (input) => gateway.getTabEvents(input),
      onAcknowledged: () => settled(watchTab, watchId),
      // Stops for good on an unwired stream (leaving "on its way" to the tab's
      // status) and on a tab this phone can no longer read — which ends the
      // request too, so nothing starts polling for it again.
      onGaveUp: (error) => {
        if (tabAccessGone(error)) settled(watchTab, watchId);
      },
    });
  }, [gateway, settled, watchTab, watchId, watchFrom]);

  return ended ? null : request;
}
