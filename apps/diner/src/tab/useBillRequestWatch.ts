import { isEndpointNotWired } from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { useEffect } from 'react';
import {
  billRequestEnded,
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
 * ends it when the tab moves on to closing or closed. Returns the open request
 * for the screen to draw.
 */
export function useBillRequestWatch(
  tabId: string | undefined,
  status: TabStatus | undefined,
): RequestedBill | null {
  const gateway = useGateway();
  const request = useRequestedBill(tabId);
  const settled = useBillRequests((state) => state.settled);

  const ended = request !== null && status !== undefined && billRequestEnded(request, status);
  useEffect(() => {
    if (ended && request) settled(request.tabId, request.requestId);
  }, [ended, request, settled]);

  const watchTab = request?.tabId;
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
      isUnavailable: isEndpointNotWired,
    });
  }, [gateway, settled, watchTab, watchId, watchFrom]);

  return ended ? null : request;
}
