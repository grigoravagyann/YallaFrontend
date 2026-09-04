import { intlTag, type Locale } from './locale';

const cache = new Map<Locale, Intl.ListFormat>();

function conjunctionFormatter(locale: Locale): Intl.ListFormat {
  const cached = cache.get(locale);
  if (cached) return cached;

  // `conjunction` and `long`: this reads as a sentence about people, not as a
  // technical enumeration. Armenian, Russian and English all join differently
  // and none of them is ", " with an "and" bolted on the end.
  const created = new Intl.ListFormat(intlTag(locale), { style: 'long', type: 'conjunction' });
  cache.set(locale, created);
  return created;
}

/**
 * Join the people on a tab into one readable line — "Aram, Nare and 1 guest".
 *
 * Callers pass already-translated parts, including whatever the app calls an
 * unnamed guest, because pluralising "guest" belongs to i18next and joining
 * belongs to CLDR. Splitting it this way is what keeps a Russian tab from
 * reading like an English one with Russian words in it.
 *
 * An empty list formats as an empty string rather than throwing: a tab with
 * nobody on it is a transient state, not a programming error.
 */
export function formatNameList(parts: readonly string[], locale: Locale): string {
  const usable = parts.filter((part) => part.trim() !== '');
  if (usable.length === 0) return '';
  return conjunctionFormatter(locale).format(usable);
}
