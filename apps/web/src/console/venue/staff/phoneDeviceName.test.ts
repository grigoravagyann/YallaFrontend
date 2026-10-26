import type { StaffDevice } from '@yalla/api';
import { i18next } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import { initConsoleTestI18n } from '../reports/testHarness';
import { phoneDeviceName } from './phoneDeviceName';

/**
 * The Phones tab's device column: worded from what the phone said it runs on,
 * in the reader's language, and from the name it sent only when that is all
 * there is.
 */

let en: TFunction;
let ru: TFunction;
let hy: TFunction;
beforeAll(async () => {
  await initConsoleTestI18n();
  en = i18next.getFixedT('en', ['admin', 'common']);
  ru = i18next.getFixedT('ru', ['admin', 'common']);
  hy = i18next.getFixedT('hy', ['admin', 'common']);
});

function phone(overrides: Partial<StaffDevice> = {}): StaffDevice {
  return {
    id: 'd-1',
    name: 'iPhone · Safari',
    branchId: 'b-1',
    enrolledAtUtc: '2026-10-26T10:00:00Z',
    lastSeenAtUtc: null,
    isRevoked: false,
    kind: 'phone',
    platform: 'iphone',
    browser: 'safari',
    ...overrides,
  };
}

describe('a phone in the device column', () => {
  it('names the platform and the browser, the same in every language', () => {
    for (const t of [en, ru, hy]) expect(phoneDeviceName(t, phone())).toBe('iPhone · Safari');
    expect(phoneDeviceName(hy, phone({ platform: 'android', browser: 'samsungInternet' }))).toBe(
      'Android · Samsung Internet',
    );
  });

  it('says a platform it did not recognise in the reader’s language', () => {
    const other = phone({ name: 'Phone · Chrome', platform: 'other', browser: 'chrome' });
    expect(phoneDeviceName(en, other)).toBe('Phone · Chrome');
    expect(phoneDeviceName(ru, other)).toBe('Телефон · Chrome');
    expect(phoneDeviceName(hy, other)).toBe('Հեռախոս · Chrome');
    expect(phoneDeviceName(hy, phone({ name: 'Phone', platform: 'other', browser: null }))).toBe(
      'Հեռախոս',
    );
    expect(phoneDeviceName(ru, phone({ name: 'Linux', platform: 'linux', browser: null }))).toBe(
      'Linux',
    );
  });

  it('shows the name it sent when it paired before it said the parts', () => {
    expect(phoneDeviceName(hy, phone({ name: 'Phone', platform: null, browser: null }))).toBe(
      'Phone',
    );
  });
});
