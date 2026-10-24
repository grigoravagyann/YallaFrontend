import {
  VENUE_ASK_BUTTONS_PUSH_CATEGORY,
  VENUE_ASK_PUSH_CATEGORY,
  VENUE_MESSAGE_PUSH_CATEGORY,
  VENUE_MESSAGE_READONLY_PUSH_CATEGORY,
  type RegisterPushDeviceCommand,
  type YallaGateway,
} from '@yalla/api';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { PUSH_ACTIONS } from './payload';

/**
 * Getting permission, and getting the token to the server.
 *
 * **The permission is never requested on launch.** A prompt somebody sees
 * before they understand what it is for is a prompt they decline, and on iOS
 * declining is close to final — the way back is Settings, which nobody visits.
 * So it is asked for at the one moment it has earned itself: immediately after a
 * booking is confirmed, with one line saying it is for the reminder. That is a
 * request whose answer the person can actually reason about.
 *
 * Everything here degrades. A denied permission is a normal outcome, not a
 * failure path: the booking still exists, the app says the reminder will not
 * arrive, and nothing retries or nags.
 */

export type PermissionOutcome = 'granted' | 'denied' | 'unavailable';

/**
 * Whether asking is still worth doing.
 *
 * `undetermined` is the only state where a prompt appears at all. Calling
 * `requestPermissionsAsync` when the answer is already "no" resolves
 * immediately with "no" and shows nothing, so the screen must decide from this
 * rather than from the request's result.
 */
export async function permissionState(): Promise<'undetermined' | PermissionOutcome> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  return current.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestPermission(): Promise<PermissionOutcome> {
  const result = await Notifications.requestPermissionsAsync();
  return result.granted ? 'granted' : 'denied';
}

/**
 * Two categories, so the common case never opens the app at all.
 *
 * That is the point of the whole feature. A reminder whose cancel takes four
 * taps and a scroll is just a notification; a reminder you can decline from the
 * lock screen is a table the venue gets back. The identifiers match
 * `PUSH_ACTIONS` and the `categoryId` values the backend sets on the message.
 *
 * `opensAppToForeground: false` is the load-bearing option. With it true the OS
 * launches the app and the action becomes a four-tap journey again.
 */
export async function registerCategories(labels: {
  readonly cancel: string;
  readonly extendHold: string;
  readonly tableRequestYes: string;
  readonly tableRequestNo: string;
  readonly onMyWay: string;
  readonly cantCome: string;
  /** Guest messages (2026-10-23): "I'm coming", "Late 15 min", "Reply" and its field. */
  readonly venueComing: string;
  readonly venueLate15: string;
  readonly venueReply: string;
  readonly venueReplyPlaceholder: string;
  readonly venueReplySend: string;
}): Promise<void> {
  await Notifications.setNotificationCategoryAsync('reservation-reminder', [
    {
      identifier: PUSH_ACTIONS.cancel,
      buttonTitle: labels.cancel,
      options: {
        opensAppToForeground: false,
        // Cancelling a table is not reversible from here, so it is marked
        // destructive: iOS renders it in red and Android groups it apart.
        isDestructive: true,
      },
    },
  ]);

  await Notifications.setNotificationCategoryAsync('late-nudge', [
    {
      identifier: PUSH_ACTIONS.extendHold,
      buttonTitle: labels.extendHold,
      options: { opensAppToForeground: false },
    },
  ]);

  /*
   * Booking times: somebody would like the diner's table after them. Unlike
   * the two above, both answers open the app, unlocked first, and the booking's
   * card sends the answer and shows whether it went through. Answered in the
   * background instead, a killed app has no listener to do it, and a locked
   * iPhone cannot read the session from the keychain (stored
   * WHEN_UNLOCKED) — the 401 would be lost and the guest would believe they
   * had answered. A background notification task would need a new native
   * module and still hit the locked keychain; this cannot fail unseen.
   */
  const answer = { opensAppToForeground: true, isAuthenticationRequired: true } as const;
  await Notifications.setNotificationCategoryAsync('table-request', [
    {
      identifier: PUSH_ACTIONS.tableRequestYes,
      buttonTitle: labels.tableRequestYes,
      options: answer,
    },
    {
      identifier: PUSH_ACTIONS.tableRequestNo,
      buttonTitle: labels.tableRequestNo,
      options: answer,
    },
  ]);

  /*
   * Pre-orders: "Are you on your way?" Both open the app, unlocked, for the
   * same reasons: the booking's card sends the Yes and says the waiter knows,
   * and "I can't come" is a cancellation, which the booking asks about first.
   */
  await Notifications.setNotificationCategoryAsync('on-your-way', [
    { identifier: PUSH_ACTIONS.onMyWay, buttonTitle: labels.onMyWay, options: answer },
    {
      identifier: PUSH_ACTIONS.cantCome,
      buttonTitle: labels.cantCome,
      options: { ...answer, isDestructive: true },
    },
  ]);

  /*
   * Guest messages (2026-10-23, the Push board): the venue wrote in the
   * thread. Its "are you coming?" (`venue-ask`) is answered from the banner —
   * "I'm coming", "Late 15 min" — and either kind takes a typed "Reply". At a
   * venue that takes no guest texts the server sends the same two without the
   * Reply: `venue-ask-buttons` (the two answers) and `venue-message-readonly`
   * (no actions — a tap opens the thread). All four are registered, so
   * whichever the server picks has its buttons. These
   * run without opening the app, as the board shows ("Sent: I'm coming"); the
   * phone must be unlocked first, so the session can be read from the
   * keychain. A refusal or a failure opens the thread, the reply's words in
   * its field (`usePushNotifications`) — nothing is lost unseen.
   */
  const inPlace = { opensAppToForeground: false, isAuthenticationRequired: true } as const;
  const reply = {
    identifier: PUSH_ACTIONS.venueReply,
    buttonTitle: labels.venueReply,
    textInput: {
      submitButtonTitle: labels.venueReplySend,
      placeholder: labels.venueReplyPlaceholder,
    },
    options: inPlace,
  };
  const answers = [
    { identifier: PUSH_ACTIONS.venueComing, buttonTitle: labels.venueComing, options: inPlace },
    { identifier: PUSH_ACTIONS.venueLate15, buttonTitle: labels.venueLate15, options: inPlace },
  ];
  await Notifications.setNotificationCategoryAsync(VENUE_ASK_PUSH_CATEGORY, [...answers, reply]);
  await Notifications.setNotificationCategoryAsync(VENUE_ASK_BUTTONS_PUSH_CATEGORY, answers);
  await Notifications.setNotificationCategoryAsync(VENUE_MESSAGE_PUSH_CATEGORY, [reply]);
  await Notifications.setNotificationCategoryAsync(VENUE_MESSAGE_READONLY_PUSH_CATEGORY, []);
}

/**
 * The Expo token for this device.
 *
 * `null` rather than throwing when there is no project id or the device is a
 * simulator: neither is a failure worth surfacing to a diner, and both are the
 * normal state on a development machine.
 */
export async function currentPushToken(projectId: string | undefined): Promise<string | null> {
  try {
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data || null;
  } catch {
    // A simulator, or a build with no EAS project. Push simply does not exist
    // here; the app must carry on as though permission had been declined.
    return null;
  }
}

/** The one place `Platform.OS` becomes the server's enum. */
export function platformCode(): RegisterPushDeviceCommand['platform'] {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/**
 * Send the token to the server, with the diner's own language.
 *
 * The locale matters more than it looks. The backend picks the language for
 * every message from the **most recently seen device row**, not from the venue,
 * so a Russian-speaking regular at an Armenian restaurant is written to in
 * Russian because of this argument and nothing else.
 *
 * Returns the device id, or `null` when there was no token to send.
 */
export async function registerDevice(
  gateway: YallaGateway,
  options: { readonly projectId: string | undefined; readonly locale: string },
): Promise<string | null> {
  const pushToken = await currentPushToken(options.projectId);
  if (!pushToken) return null;

  const { deviceId } = await gateway.registerPushDevice({
    pushToken,
    platform: platformCode(),
    locale: options.locale,
  });
  return deviceId;
}

/**
 * Re-register when the token rotates.
 *
 * Expo rotates a token on reinstall, on some OS upgrades, and occasionally for
 * no reason a client can see. A device whose token has rotated and not
 * re-registered is silently unreachable — the outbox reports a successful send
 * to a token nobody holds — so this subscribes for the life of the app rather
 * than registering once at sign-in.
 *
 * Returns the unsubscribe.
 */
export function onTokenRotation(handler: (pushToken: string) => void): { remove: () => void } {
  return Notifications.addPushTokenListener((token) => handler(token.data));
}
