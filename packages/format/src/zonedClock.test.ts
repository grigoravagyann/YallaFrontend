import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The phone's `Intl` is the @formatjs polyfill (Hermes has no `longOffset`),
 * and the web app installs it too. The polyfill writes a zone's offset short —
 * "GMT+4", "GMT+5:30" — where a browser writes "GMT+04:00". Read as no offset
 * at all, every Yerevan opening time became a UTC one: a 09:00 opening was
 * offered as 13:00 (QA 20261016T2 B4).
 */
const NATIVE = Intl.DateTimeFormat;

/** Native `Intl`, but with the offset written the way the polyfill writes it. */
function polyfillStyleOffsets() {
  class ShortOffsetFormat extends NATIVE {
    override formatToParts(date?: Date | number): Intl.DateTimeFormatPart[] {
      return super.formatToParts(date).map((part) =>
        part.type === 'timeZoneName'
          ? {
              ...part,
              value: part.value.replace(/([+-])0(\d)/u, '$1$2').replace(/:00$/u, ''),
            }
          : part,
      );
    }
  }
  vi.stubGlobal('Intl', { ...Intl, DateTimeFormat: ShortOffsetFormat });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("instantFromZonedClock with the polyfill's short offsets", () => {
  it('reads "GMT+4" as four hours east: 09:00 in Yerevan is 05:00 UTC', async () => {
    polyfillStyleOffsets();
    vi.resetModules();
    const { instantFromZonedClock } = await import('./datetime');

    const opens = instantFromZonedClock(
      { year: 2026, month: 10, day: 17, hour: 9, minute: 0 },
      'Asia/Yerevan',
    );
    expect(opens.toISOString()).toBe('2026-10-17T05:00:00.000Z');
  });

  it('reads "GMT+5:30" with its minutes', async () => {
    polyfillStyleOffsets();
    vi.resetModules();
    const { instantFromZonedClock } = await import('./datetime');

    const opens = instantFromZonedClock(
      { year: 2026, month: 10, day: 17, hour: 9, minute: 0 },
      'Asia/Kolkata',
    );
    expect(opens.toISOString()).toBe('2026-10-17T03:30:00.000Z');
  });
});
