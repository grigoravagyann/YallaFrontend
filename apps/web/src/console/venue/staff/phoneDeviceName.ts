import type { StaffDevice, StaffDeviceBrowser, StaffDevicePlatform } from '@yalla/api';
import type { TFunction } from 'i18next';

/**
 * Product names, the same in every language: "iPhone", "Samsung Internet".
 * Only the platform the phone did not recognise is a word, and that one is
 * translated.
 */
const PLATFORM_NAMES: Readonly<Record<Exclude<StaffDevicePlatform, 'other'>, string>> = {
  iphone: 'iPhone',
  ipad: 'iPad',
  android: 'Android',
  windows: 'Windows',
  mac: 'Mac',
  linux: 'Linux',
};

const BROWSER_NAMES: Readonly<Record<StaffDeviceBrowser, string>> = {
  safari: 'Safari',
  chrome: 'Chrome',
  edge: 'Edge',
  firefox: 'Firefox',
  opera: 'Opera',
  samsungInternet: 'Samsung Internet',
};

/**
 * A paired phone in the Phones tab's device column, in the reader's language:
 * "iPhone · Safari", "Հեռախոս · Chrome". Built from the parts the phone said
 * when it paired; a phone paired before it said them shows the name it sent,
 * which is all the server has.
 */
export function phoneDeviceName(t: TFunction, device: StaffDevice): string {
  if (!device.platform) return device.name;
  const platform =
    device.platform === 'other' ? t('phones.device.other') : PLATFORM_NAMES[device.platform];
  return device.browser
    ? t('phones.device.named', { platform, browser: BROWSER_NAMES[device.browser] })
    : platform;
}
