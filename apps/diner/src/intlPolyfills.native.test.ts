import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The phone's `Intl` on Hermes: there the probing polyfill does install —
 * Hermes lacks `formatToParts` — and its default zone is UTC, so a time on the
 * diner's own clock (the notification feed's "13:37") read UTC, as on the web
 * (QA 2026-10-18). The default is set from the phone's own calendar zone.
 *
 * Node's `Intl` is complete and would make the probe step aside, so the
 * @formatjs `DateTimeFormat` is put in first, as Hermes ends up with it.
 */

vi.mock('expo-localization', () => ({
  getCalendars: () => [{ calendar: 'gregory', timeZone: 'Asia/Tokyo', uses24hourClock: true }],
}));

const native = {
  DateTimeFormat: Intl.DateTimeFormat,
  NumberFormat: Intl.NumberFormat,
  PluralRules: Intl.PluralRules,
  ListFormat: Intl.ListFormat,
  RelativeTimeFormat: Intl.RelativeTimeFormat,
  Locale: Intl.Locale,
};

beforeAll(async () => {
  await import('@formatjs/intl-datetimeformat/polyfill-force.js');
  await import('./intlPolyfills');
}, 60_000);

afterAll(() => {
  Object.assign(Intl, native);
});

const MORNING = new Date(Date.UTC(2026, 9, 16, 5, 0)); // 14:00 in Tokyo

describe('Intl on the phone', () => {
  it('formats a device-local time in the phone’s own zone, not UTC', () => {
    expect(new Intl.DateTimeFormat('en-GB').resolvedOptions().timeZone).toBe('Asia/Tokyo');
    const local = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
    expect(local.format(MORNING)).toBe('14:00');
  });

  it('still formats a branch time in the branch’s zone', () => {
    const branch = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Yerevan',
    });
    expect(branch.format(MORNING)).toBe('09:00');
  });
});
