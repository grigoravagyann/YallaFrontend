import {
  ForbiddenError,
  MenuItemUnavailableError,
  NetworkError,
  ServerError,
  TabAccessEndedError,
  TabNotAcceptingOrdersError,
  TimeoutError,
  type DinerTabView,
} from '@yalla/api';

/**
 * Whether this person can order right now, and if not, why.
 */

export type OrderingBlock = 'pending' | 'notAllowed' | 'closing' | 'closed' | 'removed';

/**
 * `null` when the server says this participant may order now.
 *
 * `me.canOrderNow` is the server's own answer, computed by the rule the
 * ordering endpoint enforces. The screens used to offer Order, Add and Send to
 * everybody, and a pending joiner, a guest the host set to "cannot order", or
 * anyone after the bill was asked for built a tray and got an unexplained
 * failure. The reason is read from the other fields only to say *why*.
 */
export function orderingBlock(view: Pick<DinerTabView, 'status' | 'me'>): OrderingBlock | null {
  if (view.me.canOrderNow) return null;
  if (view.status === 'closed' || view.status === 'abandoned') return 'closed';
  if (view.status === 'closing') return 'closing';
  if (view.me.status === 'removed') return 'removed';
  if (view.me.status === 'pendingApproval') return 'pending';
  return 'notAllowed';
}

export function orderingBlockKey(block: OrderingBlock): string {
  return `order.blocked.${block}`;
}

/**
 * What a failed send was.
 *
 * `uncertain` is the one to be careful with. A timeout, a server error, or a
 * dropped connection on a phone that was online may all have come **after** the
 * kitchen got the order. Saying "this order has not been placed" there was
 * sometimes false; the honest answer is "we could not tell", and the next step
 * — sending the same tray again with the same command id — cannot place it
 * twice. Only a phone that knew it was offline is told plainly nothing went.
 */
export type OrderFailure =
  'soldOut' | 'closing' | 'forbidden' | 'ended' | 'offline' | 'uncertain' | 'error';

export function orderFailureKind(error: unknown, online: boolean): OrderFailure {
  if (error instanceof MenuItemUnavailableError) return 'soldOut';
  if (error instanceof TabNotAcceptingOrdersError) return 'closing';
  if (error instanceof TabAccessEndedError) return 'ended';
  if (error instanceof ForbiddenError) return 'forbidden';
  if (error instanceof NetworkError && !online) return 'offline';
  if (
    error instanceof TimeoutError ||
    error instanceof NetworkError ||
    error instanceof ServerError
  ) {
    return 'uncertain';
  }
  return 'error';
}
