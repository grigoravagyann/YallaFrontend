/**
 * The diner's notifications feed (K12).
 *
 * One row is written wherever a push is enqueued, whether or not the phone has a
 * push token, so the feed is the complete record and a push is only a way of
 * hearing about a row sooner. The server sends no prose: `kind` and `params` are
 * what the app localises, so a diner who switches language reads the old rows
 * in the new one.
 */

export const DINER_NOTIFICATION_KINDS = [
  'booking-reminder',
  'booking-confirmed',
  'booking-declined',
  'booking-cancelled-by-venue',
  'order-ready',
  'review-hidden',
] as const;

export type KnownDinerNotificationKind = (typeof DINER_NOTIFICATION_KINDS)[number];

/**
 * Open at the edges, like a table refusal reason: a newer server can add a kind
 * this build has no copy for, and the honest thing is to carry it and render a
 * generic row, not to drop it or guess one of the known ones.
 */
export type DinerNotificationKind = KnownDinerNotificationKind | (string & {});

export function isKnownNotificationKind(kind: string): kind is KnownDinerNotificationKind {
  return (DINER_NOTIFICATION_KINDS as readonly string[]).includes(kind);
}

/** The values the app's copy interpolates. */
export type NotificationParams = Readonly<Record<string, string | number | boolean | null>>;

export interface DinerNotification {
  readonly notificationId: string;
  readonly kind: DinerNotificationKind;
  readonly params: NotificationParams;
  readonly branchId: string | null;
  readonly branchName: string | null;
  /** Where tapping it goes: a booking, a tab or an order, when it is about one. */
  readonly reservationId: string | null;
  readonly tabId: string | null;
  readonly orderId: string | null;
  readonly createdAtUtc: string;
  readonly read: boolean;
}

/** One page, newest first. */
export interface DinerNotificationPage {
  readonly items: readonly DinerNotification[];
  /** Pass as `before` for the next, older page. `null` on the last page. */
  readonly nextCursor: string | null;
  /** Across the whole feed, not this page. */
  readonly unreadCount: number;
}

export const NOTIFICATION_PAGE_SIZE = 20;

export interface NotificationPageQuery {
  /** A `nextCursor` from the previous page. Absent for the newest page. */
  readonly before?: string | null | undefined;
  /** Default {@link NOTIFICATION_PAGE_SIZE}. */
  readonly limit?: number | undefined;
}

/**
 * Mark as read: everything up to and including one notification (the "mark all
 * read" button passes the newest id it has shown), or exactly these ids (a tap).
 */
export type MarkNotificationsReadCommand =
  | { readonly upTo: string; readonly ids?: undefined }
  | { readonly ids: readonly string[]; readonly upTo?: undefined };
