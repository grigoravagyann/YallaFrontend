import type { RegisterPushDeviceCommand, YallaGateway } from '@yalla/api';
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
