import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { BOOKINGS_TAB_PUSH_KINDS, type PushData } from './payload';

/**
 * What a push that just arrived makes stale.
 *
 * A push is the server saying something changed, so the screens that show that
 * thing read it again instead of waiting out their stale time: an "order ready"
 * banner over an Orders tab still saying "Preparing" is the app contradicting
 * itself. The feed always moves — every push has a feed row behind it (K12).
 *
 * The keys are written out rather than imported: `['dinerOrders']` is
 * `dinerOrderKeys.all`, `['notifications']` is `notificationKeys.all` and
 * `['dinerTab', id]` is `orderKeys.dinerTab(id)`, and those modules reach the
 * gateway, which this one is tested without.
 */

function id(data: PushData | null | undefined, key: string): string | null {
  const value = data?.[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

export function queryKeysForPush(data: PushData | null | undefined): QueryKey[] {
  const keys: QueryKey[] = [['notifications']];
  const kind = id(data, 'kind');

  const aboutOrders =
    kind === 'order-ready' ||
    kind === 'participant-approved' ||
    id(data, 'tabId') !== null ||
    id(data, 'orderId') !== null;
  if (aboutOrders) keys.push(['dinerOrders']);

  // The tab itself, roster and bill: a host told somebody is waiting finds
  // them on the tab screen already, rather than one poll later.
  const tabId = id(data, 'tabId');
  if (tabId !== null) keys.push(['dinerTab', tabId]);

  // A takeaway order moved (2026-10-22): its status screen reads it again
  // (`queryKeys.takeawayOrder`) rather than waiting for its next poll.
  const orderId = id(data, 'orderId');
  if (orderId !== null && kind?.startsWith('takeaway-')) keys.push(['takeaway', 'order', orderId]);

  const reservationId = id(data, 'reservationId');
  // The pause on booking names no booking: the list says it, and is read again.
  const aboutThePause = kind !== null && BOOKINGS_TAB_PUSH_KINDS.includes(kind);
  if (reservationId !== null || kind?.startsWith('reservation-') || aboutThePause) {
    keys.push(['bookings']);
    if (reservationId !== null) {
      keys.push(['booking', reservationId], ['reservationState', reservationId]);
    }
  }
  return keys;
}

export function invalidateForPush(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
  data: PushData | null | undefined,
): void {
  for (const queryKey of queryKeysForPush(data)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
