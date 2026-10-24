/**
 * What the staff app on a phone (or a floor tablet) reads and sets about
 * itself beyond the floor: its Web Push subscription and switches, and a
 * manager's Today board.
 *
 * Every call here is made with the device's PIN session and acts on that
 * device only (`docs/notifications.md` §6a, "Staff push").
 */

import type { UserRole } from './console';

/** `GET /api/staff/push-config`: whether this server sends pushes, and the key to subscribe with. */
export interface StaffPushConfig {
  /** False when the server has no VAPID keys: pushes are logged, not sent — offer no switch. */
  readonly enabled: boolean;
  /**
   * The VAPID public key, base64url: `applicationServerKey`. When it differs
   * from the one the browser's subscription was made with, subscribe again (a
   * Development server makes a new pair every start). Null when disabled.
   */
  readonly publicKey: string | null;
}

/** `PushSubscription.toJSON()`, as `PUT /api/staff/device/push-subscription` takes it. */
export interface StaffPushSubscriptionInput {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
}

/** The five things a staff device can be pushed about: the switch names. */
export type StaffNotificationKind =
  'approvals' | 'guestMessages' | 'tableCalls' | 'takeaway' | 'kitchenReady';

/** In the order the switches are listed (the Install artboard). */
export const STAFF_NOTIFICATION_KINDS: readonly StaffNotificationKind[] = [
  'approvals',
  'guestMessages',
  'tableCalls',
  'takeaway',
  'kitchenReady',
];

/** The six switches, every one every time. */
export interface StaffNotificationSwitches {
  readonly approvals: boolean;
  readonly guestMessages: boolean;
  readonly tableCalls: boolean;
  readonly takeaway: boolean;
  readonly kitchenReady: boolean;
  /** A phone's pushes wait for its person's shift. Ignored on a tablet. */
  readonly onlyDuringShift: boolean;
}

/** `GET /api/staff/device/notification-preferences`. */
export interface StaffNotificationSettings extends StaffNotificationSwitches {
  /** The language pushes are written in; null means Armenian. */
  readonly locale: string | null;
  /** A push subscription is on file for this device. */
  readonly subscribed: boolean;
  /** Nobody chose yet: these are the defaults for the device and its person's role. */
  readonly isDefault: boolean;
}

/** `PUT /api/staff/device/notification-preferences`: the switches, and the app's language. */
export interface SaveStaffNotificationSettings extends StaffNotificationSwitches {
  /** `hy`, `ru` or `en`, so pushes are written in the language the app is in. */
  readonly locale?: string | undefined;
}

/**
 * What the service worker is handed with each push (`StaffPushText`): the
 * notification's words, where a tap goes and what it replaces.
 */
export interface StaffPushPayload {
  readonly title: string;
  readonly body: string;
  /** A deep link into `/staff/...`. */
  readonly url: string;
  /** The collapse key: a newer push about the same thing replaces the older. */
  readonly tag: string;
  readonly kind: StaffNotificationKind;
}

// --- Today ----------------------------------------------------------------------

/** `GET /api/staff/today`: one branch's day so far, for a manager's phone. */
export interface StaffToday {
  readonly branchId: string;
  readonly branchName: string;
  readonly venueName: string;
  readonly timeZoneId: string;
  readonly asOfUtc: string;
  /** The service day: today, or yesterday while last night's block runs. */
  readonly serviceDate: string;
  /** `HH:mm`, the branch's clock. */
  readonly localTime: string;
  /** The branches the caller may switch to, this one among them. One on a tablet. */
  readonly branches: readonly { readonly branchId: string; readonly name: string }[];
  readonly revenue: {
    readonly totalAmd: number;
    readonly hallAmd: number;
    readonly takeawayAmd: number;
    readonly takeawayOrders: number;
    readonly sinceUtc: string;
  };
  /** People seated since the day's takings started. */
  readonly guests: {
    readonly total: number;
    readonly withBooking: number;
    readonly walkIn: number;
  };
  readonly bookings: {
    readonly total: number;
    readonly came: number;
    readonly expected: number;
    readonly late: number;
    readonly noShow: number;
    readonly pendingApproval: number;
  };
  readonly room: {
    readonly occupiedTables: number;
    readonly tables: number;
    readonly people: number;
  };
  readonly needsYou: {
    readonly pendingApprovals: number;
    readonly oldestApprovalRequestedAtUtc: string | null;
    readonly soonestApprovalDeadlineUtc: string | null;
    readonly unansweredMessages: number;
    readonly oldestUnansweredMessageAtUtc: string | null;
  };
  readonly shifts: readonly StaffTodayShift[];
}

/** One person's shift today at the branch. */
export interface StaffTodayShift {
  readonly staffMemberId: string;
  readonly fullName: string;
  readonly role: UserRole;
  /** `HH:mm`, branch wall clock. */
  readonly startsAt: string;
  /** `HH:mm`, on the next date when `endsNextDay`. */
  readonly endsAt: string;
  readonly endsNextDay: boolean;
  readonly startsAtUtc: string;
  readonly endsAtUtc: string;
  readonly onShiftNow: boolean;
  /** A live PIN session on one of the branch's devices now: "signed in". */
  readonly signedIn: boolean;
}
