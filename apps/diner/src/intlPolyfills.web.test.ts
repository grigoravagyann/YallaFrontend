import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The web build's `Intl`. A browser without Armenian locale data — the one the
 * QA pass ran in — answered every `hy-AM` request in its own default, en-US:
 * "Fri 16", "Oct 14, 2026" and "09:00 AM – 01:00 AM" under Armenian labels.
 * The web build now formats through the same @formatjs implementation and
 * locale data as the phone, so what a browser happens to ship stops mattering.
 */

const native = {
  DateTimeFormat: Intl.DateTimeFormat,
  NumberFormat: Intl.NumberFormat,
  PluralRules: Intl.PluralRules,
  ListFormat: Intl.ListFormat,
  RelativeTimeFormat: Intl.RelativeTimeFormat,
};

// The browser's own zone: Yerevan, as on the QA laptop. Node reads `TZ` afresh.
const savedTz = process.env['TZ'];

// The whole @formatjs set and its locale data: slow to load on a busy machine.
beforeAll(async () => {
  process.env['TZ'] = 'Asia/Yerevan';
  await import('./intlPolyfills.web');
}, 60_000);

afterAll(() => {
  Object.assign(Intl, native);
  if (savedTz === undefined) delete process.env['TZ'];
  else process.env['TZ'] = savedTz;
});

const MORNING = new Date(Date.UTC(2026, 9, 16, 5, 0)); // 09:00 in Yerevan, a Friday

describe('Intl on the web build', () => {
  it('is the bundled implementation, whatever the browser ships', () => {
    for (const ctor of [Intl.DateTimeFormat, Intl.NumberFormat, Intl.PluralRules]) {
      expect(typeof (ctor as unknown as { __addLocaleData?: unknown }).__addLocaleData).toBe(
        'function',
      );
    }
  });

  it('writes Armenian times on the 24-hour clock, in the branch zone', () => {
    const clock = new Intl.DateTimeFormat('hy-AM', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Yerevan',
    });

    expect(clock.format(MORNING)).toBe('09:00');
  });

  it('names Armenian and Russian days in their own language', () => {
    const day = (tag: string) =>
      new Intl.DateTimeFormat(tag, { weekday: 'short', timeZone: 'Asia/Yerevan' }).format(MORNING);

    expect(day('hy-AM')).not.toMatch(/Fri/u);
    expect(day('hy-AM')).toMatch(/\p{Script=Armenian}/u);
    expect(day('ru-AM')).toMatch(/\p{Script=Cyrillic}/u);
  });

  /*
   * The polyfill's own default zone is UTC: forced in, it made every
   * device-local time UTC — the notification feed read 13:37 at 17:37 in
   * Yerevan (QA 2026-10-18). The browser's zone is read before it is replaced.
   */
  it('keeps the browser’s own zone as the default, for times on the diner’s clock', () => {
    expect(new Intl.DateTimeFormat('en-GB').resolvedOptions().timeZone).toBe('Asia/Yerevan');
    const local = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
    expect(local.format(MORNING)).toBe('09:00');
  });
});
