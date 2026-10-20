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
  'review-replied': 'reviewReplied',
  'table-request': 'tableRequest',
  'table-request-decided': 'tableRequestAccepted',
  'booking-changed-by-link': 'bookingChangedByLink',
  'booking-cancelled-by-link': 'bookingCancelledByLink',
};

export interface NotificationCopy {
  readonly titleKey: string;
  readonly bodyKey: string;
  /**
   * The place always; on a declined change, also the time it asked for and
   * the time the booking now stands at, both `HH:mm` as the server wrote them.
   */
  readonly params: {
    readonly place: string;
    readonly time?: string;
    readonly requestedTime?: string;
    /** Booking times: the time the earlier guest is asked to leave by, or promised. */
    readonly freeBy?: string;
    /** A change or cancel by the web link: the booking's day as `dd.MM`, as the push says it. */
    readonly day?: string;
    /** …and its party, which also picks the plural form. */
    readonly count?: number;
  };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** A `"true"`/`"false"` flag the server writes on a row, or a boolean. */
function flag(notification: Pick<DinerNotification, 'params'>, name: string): boolean {
  const value = notification.params[name];
  return value === true || value === 'true';
}

/**
 * A decline the venue never made: nobody answered a short-notice request in
 * time. The server writes it as a `booking-declined` row flagged `expired`
 * (a string or a boolean, as params arrive), and it is an apology, not a no.
 */
function expired(notification: Pick<DinerNotification, 'kind' | 'params'>): boolean {
  return notification.kind === 'booking-declined' && flag(notification, 'expired');
}

/**
 * A declined *change* of a confirmed booking, and what came of it.
 *
 * Moving a confirmed booking into tonight asks the floor again. When the floor
 * says no or does not answer, the server puts the booking back on the slot it
 * had, if that slot is still free (`originalKept`) — the diner still has a
 * table, at the old time, and the row must say so rather than "declined". If
 * the old slot has gone too, the booking has ended. Either way it is said
 * with an apology when nobody answered. `null` for any other row, and for a
 * change row missing the times its sentence needs.
 */
function declinedChange(
  notification: Pick<DinerNotification, 'kind' | 'params'>,
): { key: string; time: string; requestedTime: string } | null {
  if (notification.kind !== 'booking-declined' || !flag(notification, 'wasChange')) return null;
  const time = text(notification.params['time']);
  const requestedTime = text(notification.params['requestedTime']);
  if (!time || !requestedTime) return null;
  const ended = flag(notification, 'originalKept') ? 'Kept' : 'Ended';
  return {
    key: `bookingChange${ended}${expired(notification) ? 'Expired' : ''}`,
    time,
    requestedTime,
  };
}

/**
 * The day, time and party a link's change or cancel row names: `24.10`,
 * `20:00`, 3. `null` when the row lacks the day, the time or the party — the
 * body then names the place only, never a blank, "undefined" or a guessed party.
 */
function linkSlot(
  notification: Pick<DinerNotification, 'params'>,
): { day: string; time: string; count: number } | null {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text(notification.params['date']) ?? '');
  const time = text(notification.params['time']);
  if (!date || !time) return null;
  // Never invented: a row without a real party names the place only.
  const raw = notification.params['partySize'];
  const party =
    typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '') ? Number(raw) : NaN;
  if (!Number.isInteger(party) || party < 1) return null;
  return { day: `${date[3]}.${date[2]}`, time, count: party };
}

/**
 * The title and body keys for a row. A kind this build has no copy for — a
 * newer server — gets the generic pair rather than being dropped or guessed.
 */
export function notificationCopy(
  notification: Pick<DinerNotification, 'kind' | 'branchName' | 'params'>,
): NotificationCopy {
  const place =
    text(notification.branchName) ??
    text(notification.params['branchName']) ??
    text(notification.params['venueName']) ??
    '';
  const change = declinedChange(notification);
  if (change) {
    return {
      titleKey: `notifications.kind.${change.key}.title`,
      bodyKey: `notifications.kind.${change.key}.body`,
      params: { place, time: change.time, requestedTime: change.requestedTime },
    };
  }
  // Booking times: the question to the earlier guest, and what their answer did.
  if (notification.kind === 'table-request' || notification.kind === 'table-request-decided') {
    const key =
      notification.kind === 'table-request'
        ? 'tableRequest'
        : flag(notification, 'accepted')
          ? 'tableRequestAccepted'
          : 'tableRequestDeclined';
    const time = text(notification.params['requestedTime']);
    const freeBy = text(notification.params['freeByTime']);
    return {
      titleKey: `notifications.kind.${key}.title`,
      bodyKey: `notifications.kind.${key}.body`,
      params: { place, ...(time ? { time } : {}), ...(freeBy ? { freeBy } : {}) },
    };
  }
  /*
   * Changed or cancelled with the booking's web manage link — which may be in
   * somebody else's hands, so the row says where the booking stands now: the
   * day, the time and the party, and on a change whether it waits for the
   * venue again. Without the slot it names the place only.
   */
  if (
    notification.kind === 'booking-changed-by-link' ||
    notification.kind === 'booking-cancelled-by-link'
  ) {
    const base =
      notification.kind === 'booking-changed-by-link'
        ? 'bookingChangedByLink'
        : 'bookingCancelledByLink';
    const slot = linkSlot(notification);
    const body = !slot
      ? `${base}Plain`
      : notification.kind === 'booking-changed-by-link' &&
          text(notification.params['status']) === '1'
        ? `${base}Waiting`
        : base;
    return {
      titleKey: `notifications.kind.${base}.title`,
      bodyKey: `notifications.kind.${body}.body`,
      params: { place, ...(slot ?? {}) },
    };
  }
  const declinedBecause = text(notification.params['declinedBecause']);
  const key = expired(notification)
    ? 'bookingExpired'
    : notification.kind === 'booking-declined' && declinedBecause === '3'
      ? 'bookingDeclinedEarlierGuest'
      : notification.kind === 'booking-declined' && declinedBecause === '4'
        ? 'bookingDeclinedEarlierGuestNoAnswer'
        : isKnownNotificationKind(notification.kind)
          ? COPY_KEY[notification.kind]
          : 'unknown';
  return {
    titleKey: `notifications.kind.${key}.title`,
    bodyKey: `notifications.kind.${key}.body`,
    params: { place },
  };
}

/**
 * What a tapped row makes stale: the booking it is about, and the list.
 *
 * A row can say something the cached booking does not know yet — a declined
 * change put it back at its old time, confirmed — and opening the booking
 * onto the copy cached while it waited would contradict the row just tapped.
 * The keys are written out, as `push/invalidation.ts` writes them.
 */
export function bookingKeysForRow(
  notification: Pick<DinerNotification, 'kind' | 'reservationId'>,
): readonly (readonly string[])[] {
  const id = notification.reservationId;
  if (
    !id ||
    !(notification.kind.startsWith('booking-') || notification.kind.startsWith('table-request'))
  )
    return [];
  return [['bookings'], ['booking', id], ['reservationState', id]];
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
    case 'review-replied':
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
