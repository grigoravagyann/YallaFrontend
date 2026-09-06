import { useLocale } from '@yalla/i18n';
import { useEffect } from 'react';

/**
 * Keeps `<html lang>` on the locale the person is actually reading.
 *
 * `index.html` ships `lang="en"` and nothing in the console or the counter
 * screen moved it, so Armenian and Russian were announced in an English voice
 * by screen readers, and the browser offered to translate pages already in the
 * reader's language. `applyPageMeta` has guarded the public branch page against
 * exactly this from the start; the console never got the same treatment.
 *
 * It also decides hyphenation and which font a `:lang()` rule picks.
 *
 * Lives apart from `App` so a test can mount it on its own — importing `App`
 * pulls in the whole route tree, Recharts included, to assert one attribute.
 */
export function useDocumentLocale(): void {
  const { locale } = useLocale();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
}
