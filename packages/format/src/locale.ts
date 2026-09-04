/** The three languages Yalla ships in from day one. */
export const LOCALES = ['hy', 'ru', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'hy';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * BCP-47 tags used for `Intl` lookups.
 *
 * Region matters: bare `hy` and `ru` resolve to number and date conventions that
 * are close but not identical to the ones used in Armenia.
 */
const INTL_TAG: Readonly<Record<Locale, string>> = {
  hy: 'hy-AM',
  ru: 'ru-AM',
  en: 'en-GB',
};

export function intlTag(locale: Locale): string {
  return INTL_TAG[locale];
}

/**
 * The branch timezone every date/time helper must be given explicitly.
 *
 * There is no device-locale fallback anywhere in this package on purpose: a
 * tourist's phone is on Europe/Moscow and their booking is not.
 */
export type TimeZone = string;

/** Convenience constant for the launch market. Callers still pass it explicitly. */
export const YEREVAN: TimeZone = 'Asia/Yerevan';
