import { describe, expect, it } from 'vitest';
import { staffLinkOf } from './deepLinks';
import { deviceNameFrom, devicePartsFrom } from './deviceName';
import { base64UrlToBytes, isIos, madeWithKey, pushSupport, type PushEnvironment } from './webPush';

/**
 * The staff phone's small rules: what it calls itself, where a push opens,
 * and when this browser can be pushed at all.
 */

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const ANDROID_SAMSUNG =
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

describe('what a phone calls itself on the console', () => {
  it('names the platform and the browser, nothing more', () => {
    expect(deviceNameFrom(IPHONE_SAFARI)).toBe('iPhone · Safari');
    expect(deviceNameFrom(IPHONE_CHROME)).toBe('iPhone · Chrome');
    expect(deviceNameFrom(ANDROID_CHROME)).toBe('Android · Chrome');
    expect(deviceNameFrom(ANDROID_SAMSUNG)).toBe('Android · Samsung Internet');
    // An iPad says it is a Mac; its touch screen gives it away.
    expect(deviceNameFrom(IPAD_AS_MAC, 5)).toBe('iPad · Safari');
    expect(deviceNameFrom(IPAD_AS_MAC, 0)).toBe('Mac · Safari');
    expect(deviceNameFrom('')).toBe('Phone');
  });

  it('says the same as parts, which the console words in its reader’s language', () => {
    expect(devicePartsFrom(IPHONE_SAFARI)).toEqual({ platform: 'iphone', browser: 'safari' });
    expect(devicePartsFrom(IPHONE_CHROME)).toEqual({ platform: 'iphone', browser: 'chrome' });
    expect(devicePartsFrom(ANDROID_SAMSUNG)).toEqual({
      platform: 'android',
      browser: 'samsungInternet',
    });
    expect(devicePartsFrom(IPAD_AS_MAC, 5)).toEqual({ platform: 'ipad', browser: 'safari' });
    expect(devicePartsFrom('')).toEqual({ platform: 'other', browser: null });
  });

  it('knows an iPhone and an iPad, whatever the iPad claims', () => {
    expect(isIos(IPHONE_SAFARI, 5)).toBe(true);
    expect(isIos(IPAD_AS_MAC, 5)).toBe(true);
    expect(isIos(IPAD_AS_MAC, 0)).toBe(false);
    expect(isIos(ANDROID_CHROME, 5)).toBe(false);
  });
});

describe('where a push opens', () => {
  it('reads every deep link the server sends', () => {
    expect(staffLinkOf('/staff/approve/r1', '')).toEqual({ kind: 'approve', reservationId: 'r1' });
    expect(staffLinkOf('/staff/messages/c1', '')).toEqual({
      kind: 'message',
      conversationId: 'c1',
    });
    expect(staffLinkOf('/staff/now', '?call=s1')).toEqual({ kind: 'call', requestId: 's1' });
    expect(staffLinkOf('/staff/takeaway/o1', '')).toEqual({ kind: 'takeaway', orderId: 'o1' });
    expect(staffLinkOf('/staff/floor', '?table=t1')).toEqual({ kind: 'table', tableId: 't1' });
  });

  it('leaves the screens’ own addresses alone', () => {
    expect(staffLinkOf('/staff', '')).toBeNull();
    expect(staffLinkOf('/staff/messages', '')).toBeNull();
    expect(staffLinkOf('/staff/pair', '')).toBeNull();
  });
});

describe('whether this browser can be pushed', () => {
  const browser: PushEnvironment = {
    secure: true,
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    ios: false,
    standalone: false,
  };

  it('says why not, in the order the screen explains it', () => {
    expect(pushSupport(browser)).toBe('supported');
    expect(pushSupport({ ...browser, secure: false })).toBe('insecure');
    // Safari on an iPhone: only the home-screen app is pushed.
    expect(pushSupport({ ...browser, ios: true, hasPushManager: false })).toBe('needsInstall');
    expect(pushSupport({ ...browser, ios: true, standalone: true })).toBe('supported');
    expect(pushSupport({ ...browser, hasPushManager: false })).toBe('unsupported');
  });

  it('tells a subscription made with this key from one made with another', () => {
    const key =
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
    const bytes = base64UrlToBytes(key);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
    const subscription = (applicationServerKey: ArrayBuffer | null) =>
      ({ options: { applicationServerKey } }) as unknown as PushSubscription;
    expect(madeWithKey(subscription(bytes.buffer), key)).toBe(true);
    const other = new Uint8Array(bytes);
    other[1] = (other[1]! + 1) % 256;
    expect(madeWithKey(subscription(other.buffer), key)).toBe(false);
    expect(madeWithKey(subscription(null), key)).toBe(false);
  });
});
