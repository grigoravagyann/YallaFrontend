/**
 * What a notification means, and where it lands.
 *
 * A pure function over the `data` dictionary the backend attaches, kept apart
 * from every Expo API so it can be tested without a phone. That separation is
 * not tidiness: **cold start is the case that breaks**, and cold start is the
 * one you cannot exercise in a simulator loop. What can be exercised is the
 * decision — given this payload, which screen and which parameters — and that
 * is all of this file.
 *
 * The five types come from `NotificationHandlers.cs`. Each writes a `kind` and
 * the one or two ids its screen needs:
 *
 * | `kind`                    | carries                                    |
 * | ------------------------- | ------------------------------------------ |
 * | `reservation-reminder`    | `reservationId`, `code`, `branch`, `action`|
 * | `reservation-late-nudge`  | `reservationId`, `action`, `extensionMinutes` |
 * | `reservation-decided`     | `reservationId`, `approved`                |
 * | `participant-approved`    | `tabId`                                    |
 * | `order-ready`             | `tabId`                                    |
 *
 * Everything arrives as **strings**, including `approved` and
 * `extensionMinutes`: Expo's data dictionary is `Dictionary<string, string>` on
 * the sending side and the numbers are `ToString`ed there. Parsing them here
 * rather than at the call site is what stops `"false"` being read as truthy,
 * which would tell somebody their booking was approved when it was rejected.
 */

/** Where a tapped notification should land, once its payload is understood. */
export type PushTarget =
  | {
      readonly kind: 'booking';
      readonly reservationId: string;
      /**
       * The action the notification offered, if any.
       *
       * Carried through to the screen so it can pre-select the right control —
       * **never so it can perform it**. Whether the action is still valid is
       * decided from the booking's current state, read on landing.
       */
      readonly action: 'cancel' | 'extendHold' | null;
      /** Minutes the nudge offered. `null` when the payload did not say. */
      readonly extensionMinutes: number | null;
    }
  | { readonly kind: 'tab'; readonly tabId: string }
  /**
   * A payload this build does not understand, or one missing the id its screen
   * needs.
   *
   * Not an error and not the home tab either: an unroutable notification opens
   * the app where it was, which is the least-wrong thing to do with a message
   * from a server that is one version ahead.
   */
  | { readonly kind: 'unknown' };

/** The raw dictionary, as loosely as it actually arrives. */
export type PushData = Readonly<Record<string, unknown>>;

function str(data: PushData, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parsePushTarget(data: PushData | null | undefined): PushTarget {
  if (!data) return { kind: 'unknown' };

  const kind = str(data, 'kind');

  switch (kind) {
    case 'reservation-reminder':
    case 'reservation-late-nudge':
    case 'reservation-decided': {
      const reservationId = str(data, 'reservationId');
      // A booking notification with no booking id is not routable. Landing on
      // the bookings list would be a guess, and a wrong guess here is somebody
      // hunting for the reservation the notification was about.
      if (!reservationId) return { kind: 'unknown' };

      const action = str(data, 'action');
      const minutes = Number.parseInt(str(data, 'extensionMinutes') ?? '', 10);

      return {
        kind: 'booking',
        reservationId,
        action: action === 'cancel' ? 'cancel' : action === 'extend-hold' ? 'extendHold' : null,
        extensionMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
      };
    }

    case 'participant-approved':
    case 'order-ready': {
      const tabId = str(data, 'tabId');
      return tabId ? { kind: 'tab', tabId } : { kind: 'unknown' };
    }

    default:
      // A type added after this build shipped. Same rule as the tab event
      // stream: ignore what you do not recognise rather than break on it.
      return { kind: 'unknown' };
  }
}

/**
 * The route a target opens, as an expo-router href.
 *
 * Split from {@link parsePushTarget} so the routing table is one readable thing
 * and so a test can assert the href without a navigator.
 */
export type PushRoute =
  | { readonly pathname: '/booking/[bookingId]'; readonly params: { bookingId: string } }
  | { readonly pathname: '/tab/[tabId]'; readonly params: { tabId: string } };

export function routeFor(target: PushTarget): PushRoute | null {
  switch (target.kind) {
    case 'booking':
      return {
        pathname: '/booking/[bookingId]',
        params: { bookingId: target.reservationId },
      };
    case 'tab':
      return { pathname: '/tab/[tabId]', params: { tabId: target.tabId } };
    default:
      return null;
  }
}

/**
 * The identifiers the two action buttons use.
 *
 * These are the `identifier` values registered with the notification category
 * and the values the OS hands back when somebody taps a button from the lock
 * screen. They must match the categories `registerCategories` registers.
 */
export const PUSH_ACTIONS = {
  cancel: 'cancel-reservation',
  extendHold: 'extend-hold',
} as const;

export type PushActionId = (typeof PUSH_ACTIONS)[keyof typeof PUSH_ACTIONS];

/**
 * What the app should do about a response, given which button was tapped.
 *
 * `null` for the action id means the body of the notification was tapped rather
 * than a button, which always means "open the screen".
 */
export function actionFor(actionId: string | null | undefined): PushActionId | null {
  return actionId === PUSH_ACTIONS.cancel || actionId === PUSH_ACTIONS.extendHold ? actionId : null;
}
