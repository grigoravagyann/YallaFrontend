import { useGateway } from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { newCommandId } from '../lib/commandId';
import { actionFor, parsePushTarget, PUSH_ACTIONS, routeFor, type PushData } from './payload';
import { onTokenRotation, platformCode, registerCategories, registerDevice } from './registration';

/**
 * Notifications, across the three states an app can be in when one arrives.
 *
 * Mounted once, at the root. Three listeners and one imperative read, because
 * the three states are genuinely different problems:
 *
 * 1. **Foreground.** The OS hands the notification to the app and, by default,
 *    shows nothing. `setNotificationHandler` below opts back in to showing it:
 *    a diner staring at the menu still wants to know their food is ready, and
 *    suppressing it means the only signal is a total that moved.
 * 2. **Background.** The app is alive; tapping produces a response event and
 *    the router is already mounted. This is the easy one.
 * 3. **Cold start.** The process was killed. There is no listener at the moment
 *    of the tap — the event fired before this hook existed — so the response
 *    has to be *fetched* with `getLastNotificationResponseAsync`, once, on
 *    mount. Miss this and every notification tapped from a killed app lands on
 *    the home tab, which is the failure this section of the spec is about.
 *
 * The rule that runs through all three: **a notification never performs the
 * action.** It routes. Whether "Cancel" is still a thing that makes sense is
 * decided by the booking screen from the booking's current state, because a
 * reminder read the next morning is a reminder about a table somebody already
 * sat at.
 *
 * The two lock-screen buttons are the exception, and they are the point of the
 * feature: those run without opening the app. They are handled here rather than
 * on a screen for exactly that reason — there is no screen.
 */

/**
 * Show notifications while the app is open.
 *
 * Module scope, deliberately: Expo wants this set before the first notification
 * can arrive, and a handler installed inside an effect races the notification
 * that woke the app.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    // No sound in the foreground. The person is holding the phone and looking
    // at it; a chime is startling rather than informative.
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export interface PushOptions {
  /** The EAS project id, for the token. Push is inert without it. */
  readonly projectId: string | undefined;
  /** True once the diner has a session — an anonymous device has nobody to notify. */
  readonly signedIn: boolean;
}

export function usePushNotifications({ projectId, signedIn }: PushOptions): void {
  const router = useRouter();
  const gateway = useGateway();
  const { locale } = useLocale();
  const { t } = useTranslation('diner');

  /**
   * One command id per reservation per action, held for the life of the process.
   *
   * Reused on retry, which is what makes a lock-screen button tapped twice on a
   * bad connection safe: the server answers the repeat with the original result
   * and `wasReplay`, rather than treating it as a second attempt — and a second
   * attempt at extending a hold is refused.
   */
  const commandIds = useRef(new Map<string, string>());
  const commandIdFor = (key: string): string => {
    const existing = commandIds.current.get(key);
    if (existing) return existing;
    const fresh = newCommandId();
    commandIds.current.set(key, fresh);
    return fresh;
  };

  // --- The action buttons ---------------------------------------------------

  useEffect(() => {
    void registerCategories({
      cancel: t('push.action.cancel'),
      extendHold: t('push.action.extendHold'),
    });
  }, [t]);

  // --- Registration ---------------------------------------------------------
  //
  // Not a permission request. This only sends a token the app already has, so
  // that a diner who granted permission on a previous launch stays reachable and
  // so a rotated token is replaced. The prompt itself happens on the booking
  // confirmation screen, where it can be explained.

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;

    void (async () => {
      const { granted } = await Notifications.getPermissionsAsync();
      if (!granted || cancelled) return;
      try {
        await registerDevice(gateway, { projectId, locale });
      } catch {
        // A failed registration is not worth a word to the diner: the booking
        // worked, and the only consequence is a reminder that will not arrive.
        // It is retried on the next launch.
      }
    })();

    // A rotated token is a silently unreachable phone: the outbox reports a
    // successful send to a token nobody holds any more.
    const subscription = onTokenRotation((pushToken) => {
      void gateway
        .registerPushDevice({ pushToken, platform: platformCode(), locale })
        .catch(() => undefined);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [gateway, projectId, locale, signedIn]);

  // --- Responses ------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    /** One path for all three states, so cold start cannot drift from the others. */
    async function handle(response: Notifications.NotificationResponse): Promise<void> {
      const data = response.notification.request.content.data as PushData | undefined;
      const target = parsePushTarget(data);
      const action = actionFor(response.actionIdentifier);

      if (action && target.kind === 'booking') {
        // A lock-screen button. The whole point is that this does not open the
        // app, so it runs here and navigates nowhere.
        try {
          if (action === PUSH_ACTIONS.cancel) {
            await gateway.cancelReservation({ reservationId: target.reservationId });
          } else {
            await gateway.extendReservationHold({
              reservationId: target.reservationId,
              clientCommandId: commandIdFor(`extend:${target.reservationId}`),
            });
          }
        } catch {
          // It failed with the app closed and nobody watching. Opening the
          // booking is the only useful thing left: the screen reads the current
          // state and says what actually happened, including "you have already
          // let them know" for a spent extension.
          const route = routeFor(target);
          if (route && !cancelled) router.push(route);
        }
        return;
      }

      const route = routeFor(target);
      // An unroutable payload — a kind this build does not know, or one missing
      // its id — leaves the app where it was rather than guessing at the home tab.
      if (route && !cancelled) router.push(route);
    }

    // Cold start. The response fired before this listener existed, so it is
    // read rather than awaited. **This is the case that breaks without it.**
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response && !cancelled) void handle(response);
    });

    // Foreground and background taps.
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void handle(response);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
    // `router` is stable across renders in expo-router; `gateway` changes only
    // when the data source does.
  }, [gateway, router]);
}
