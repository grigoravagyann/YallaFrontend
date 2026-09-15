import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { PushData } from './payload';

/**
 * What a push that just arrived makes stale.
 *
 * A push is the server saying something changed, so the screens that show that
 * thing read it again instead of waiting out their stale time: an "order ready"
 * banner over an Orders tab still saying "Preparing" is the app contradicting
 * itself. The feed always moves — every push has a feed row behind it (K12).
 *
 * The keys are written out rather than imported: `['dinerOrders']` is
 * `dinerOrderKeys.all` and `['notifications']` is `notificationKeys.all`, and
 * both of those modules reach the gateway, which this one is tested without.
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

  const reservationId = id(data, 'reservationId');
  if (reservationId !== null || kind?.startsWith('reservation-')) {
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
