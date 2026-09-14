import {
  isKnownNotificationKind,
  type DinerNotification,
  type KnownDinerNotificationKind,
} from '@yalla/api';

/**
 * How one row of the notifications feed reads and where tapping it goes.
 *
 * Pure, so it is tested without a phone. The server sends a `kind` and the
 * values to interpolate, never prose: the copy is the app's, in the diner's
 * language of the moment.
 */

/** Every feed query sits under this prefix; a push invalidates it whole. */
export const NOTIFICATIONS_KEY = ['notifications'] as const;

export const notificationKeys = {
  all: NOTIFICATIONS_KEY,
  feed: () => ['notifications', 'feed'] as const,
  unread: () => ['notifications', 'unread'] as const,
};

const COPY_KEY: Readonly<Record<KnownDinerNotificationKind, string>> = {
  'booking-reminder': 'bookingReminder',
  'booking-confirmed': 'bookingConfirmed',
  'booking-declined': 'bookingDeclined',
  'booking-cancelled-by-venue': 'bookingCancelledByVenue',
  'order-ready': 'orderReady',
  'review-hidden': 'reviewHidden',
};

export interface NotificationCopy {
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly params: { readonly place: string };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * The title and body keys for a row. A kind this build has no copy for — a
 * newer server — gets the generic pair rather than being dropped or guessed.
 */
export function notificationCopy(
  notification: Pick<DinerNotification, 'kind' | 'branchName' | 'params'>,
): NotificationCopy {
  const key = isKnownNotificationKind(notification.kind) ? COPY_KEY[notification.kind] : 'unknown';
  const place =
    text(notification.branchName) ??
    text(notification.params['branchName']) ??
    text(notification.params['venueName']) ??
    '';
  return {
    titleKey: `notifications.kind.${key}.title`,
    bodyKey: `notifications.kind.${key}.body`,
    params: { place },
  };
}

export type NotificationRoute =
  | { readonly pathname: '/booking/[bookingId]'; readonly params: { bookingId: string } }
  | { readonly pathname: '/order/[orderId]'; readonly params: { orderId: string } }
  | { readonly pathname: '/tab/[tabId]'; readonly params: { tabId: string } }
  | { readonly pathname: '/place/[placeId]'; readonly params: { placeId: string } };

function bookingRoute(id: string | null): NotificationRoute | null {
  return id ? { pathname: '/booking/[bookingId]', params: { bookingId: id } } : null;
}

function orderRoute(id: string | null): NotificationRoute | null {
  return id ? { pathname: '/order/[orderId]', params: { orderId: id } } : null;
}

function tabRoute(id: string | null): NotificationRoute | null {
  return id ? { pathname: '/tab/[tabId]', params: { tabId: id } } : null;
}

function placeRoute(id: string | null): NotificationRoute | null {
  return id ? { pathname: '/place/[placeId]', params: { placeId: id } } : null;
}

/**
 * The screen a row is about: the booking, the order (or its tab), or the place.
 * `null` when the row names nothing to open — tapping it then only marks it read.
 */
export function notificationRoute(
  notification: Pick<
    DinerNotification,
    'kind' | 'reservationId' | 'orderId' | 'tabId' | 'branchId'
  >,
): NotificationRoute | null {
  const { kind, reservationId, orderId, tabId, branchId } = notification;
  switch (kind) {
    case 'booking-reminder':
    case 'booking-confirmed':
    case 'booking-declined':
    case 'booking-cancelled-by-venue':
      return bookingRoute(reservationId) ?? placeRoute(branchId);
    case 'order-ready':
      return orderRoute(orderId) ?? tabRoute(tabId) ?? placeRoute(branchId);
    case 'review-hidden':
      return placeRoute(branchId);
    default:
      return (
        bookingRoute(reservationId) ??
        orderRoute(orderId) ??
        tabRoute(tabId) ??
        placeRoute(branchId)
      );
  }
}
