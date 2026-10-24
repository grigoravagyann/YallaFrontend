import type { StaffGateway, StaffPushSubscriptionInput } from '@yalla/api';
import { STAFF_SW_SCOPE } from '../../offline/registerServiceWorker';

/**
 * Web Push for the staff app (`docs/notifications.md` §6a): the browser half.
 *
 * The server keeps one subscription per device and sends `{ title, body, url,
 * tag, kind }`; `public/sw.js` shows it and opens the link. Everything here is
 * about getting a subscription made with the server's current key, and the
 * server told about it.
 *
 * Nothing in here caches anything: the floor stays live, and a push only ever
 * says "look".
 */

/** What this browser can do about notifications, in the order the screen explains it. */
export type PushSupport =
  /** Service workers, the Push API and notifications, in a secure context. */
  | 'supported'
  /** An iPhone or iPad in Safari: Web Push reaches only the app opened from the home screen. */
  | 'needsInstall'
  /** Plain http on a LAN address: no service worker, so no push. */
  | 'insecure'
  /** A browser without the Push API at all. */
  | 'unsupported';

export interface PushEnvironment {
  readonly secure: boolean;
  readonly hasServiceWorker: boolean;
  readonly hasPushManager: boolean;
  readonly hasNotification: boolean;
  readonly ios: boolean;
  readonly standalone: boolean;
}

export function pushEnvironment(): PushEnvironment {
  const hasWindow = typeof window !== 'undefined';
  return {
    secure: hasWindow && window.isSecureContext,
    hasServiceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    hasPushManager: hasWindow && 'PushManager' in window,
    hasNotification: hasWindow && 'Notification' in window,
    ios: isIos(),
    standalone: isStandalone(),
  };
}

export function pushSupport(environment: PushEnvironment = pushEnvironment()): PushSupport {
  if (!environment.secure) return 'insecure';
  if (environment.ios && !environment.standalone) return 'needsInstall';
  if (
    !environment.hasServiceWorker ||
    !environment.hasPushManager ||
    !environment.hasNotification
  ) {
    return environment.ios ? 'needsInstall' : 'unsupported';
  }
  return 'supported';
}

/** An iPhone, iPod or iPad — including an iPad that says it is a Mac. */
export function isIos(
  userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  touchPoints: number = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
): boolean {
  if (/iPhone|iPad|iPod/u.test(userAgent)) return true;
  return /Macintosh/u.test(userAgent) && touchPoints > 1;
}

/** Opened from the home screen rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayMode =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || displayMode;
}

/** `Notification.permission`, or `'default'` where there is none. */
export function notificationPermission(): NotificationPermission {
  return typeof Notification === 'undefined' ? 'default' : Notification.permission;
}

/** The staff app's worker, if one is registered: never waits for one that is not. */
export async function staffWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration(STAFF_SW_SCOPE)) ?? null;
  } catch {
    return null;
  }
}

/** base64url (no padding) to bytes: the VAPID key as `applicationServerKey` takes it. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

/** Whether a subscription was made with this VAPID public key. */
export function madeWithKey(subscription: PushSubscription, publicKey: string): boolean {
  const key = subscription.options?.applicationServerKey;
  if (!key) return false;
  const made = new Uint8Array(key);
  const wanted = base64UrlToBytes(publicKey);
  return made.length === wanted.length && made.every((byte, index) => byte === wanted[index]);
}

/** `PushSubscription.toJSON()` in the shape the server takes, or null if it is incomplete. */
export function subscriptionBody(
  subscription: PushSubscription,
): StaffPushSubscriptionInput | null {
  const json = subscription.toJSON();
  const p256dh = json.keys?.['p256dh'];
  const auth = json.keys?.['auth'];
  if (!json.endpoint || !p256dh || !auth) return null;
  return { endpoint: json.endpoint, keys: { p256dh, auth } };
}

export type EnableOutcome =
  /** Subscribed with the server's key and the server told. */
  | 'subscribed'
  /** The person said no, now or before: only the browser's settings change it. */
  | 'denied'
  /** No worker to subscribe through (development, an old browser, http). */
  | 'unavailable';

/**
 * Ask, subscribe, tell the server. **Call from a tap**: Safari grants
 * notification permission only inside a user gesture.
 */
export async function enablePush(
  gateway: Pick<StaffGateway, 'savePushSubscription'>,
  publicKey: string,
): Promise<EnableOutcome> {
  if (typeof Notification === 'undefined') return 'unavailable';
  const permission =
    Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const worker = await staffWorker();
  if (!worker) return 'unavailable';
  const subscription = await subscribeWith(worker, publicKey);
  const body = subscriptionBody(subscription);
  if (!body) return 'unavailable';
  await gateway.savePushSubscription(body);
  return 'subscribed';
}

/** Unsubscribe here and tell the server to forget it. Never throws. */
export async function disablePush(
  gateway: Pick<StaffGateway, 'deletePushSubscription'> | null,
): Promise<void> {
  try {
    const worker = await staffWorker();
    const subscription = await worker?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch {
    // The browser keeps it; the server forgets it below, and a push to a
    // device it no longer knows is never sent.
  }
  try {
    await gateway?.deletePushSubscription();
  } catch {
    // Offline, or the session is gone: the server deletes a dead one itself.
  }
}

/**
 * Keep the subscription the server's: after a launch, a key rotation (a
 * Development server makes a new pair every start) or a subscription the
 * server dropped (404/410 from the push service). Only when permission was
 * already granted — this never asks.
 *
 * Answers whether the device is subscribed now.
 */
export async function keepPushCurrent(
  gateway: Pick<StaffGateway, 'getPushConfig' | 'savePushSubscription'>,
  serverSubscribed: boolean,
): Promise<boolean> {
  if (pushSupport() !== 'supported' || notificationPermission() !== 'granted') return false;
  const worker = await staffWorker();
  if (!worker) return false;
  const existing = await worker.pushManager.getSubscription();
  if (!existing && !serverSubscribed) return false;
  const config = await gateway.getPushConfig();
  if (!config.enabled || !config.publicKey) return false;
  if (existing && madeWithKey(existing, config.publicKey) && serverSubscribed) return true;
  const subscription = await subscribeWith(worker, config.publicKey);
  const body = subscriptionBody(subscription);
  if (!body) return false;
  await gateway.savePushSubscription(body);
  return true;
}

/** A subscription made with `publicKey`, replacing one made with another key. */
async function subscribeWith(
  worker: ServiceWorkerRegistration,
  publicKey: string,
): Promise<PushSubscription> {
  const existing = await worker.pushManager.getSubscription();
  if (existing && madeWithKey(existing, publicKey)) return existing;
  // A subscription is bound to the key it was made with: a new key needs a
  // new one, and subscribing over the old one is refused by the browser.
  await existing?.unsubscribe();
  return worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(publicKey),
  });
}
