// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { I18nextProvider, NAMESPACES, i18next, initI18n, setLocale } from '@yalla/i18n';
import { resources } from '@yalla/i18n/resources';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useDocumentLocale } from './useDocumentLocale';

/**
 * Regression: ISSUE-004 — <html lang> stayed "en" in every locale
 * Found by /qa on 2026-09-06
 * Report: .gstack/qa-reports/qa-report-localhost-5173-2026-09-06.md
 *
 * `index.html` hardcodes `lang="en"`. The console rendered Armenian and Russian
 * underneath it, so a screen reader announced both in an English voice. The
 * attribute is the whole point of the hook, so the assertions read it directly
 * rather than checking that the effect merely ran.
 */

function Probe() {
  useDocumentLocale();
  return null;
}

beforeAll(async () => {
  await initI18n({
    resources,
    deviceLocales: ['en'],
    namespaces: NAMESPACES,
    defaultNamespace: 'admin',
  });
});

afterEach(async () => {
  cleanup();
  await setLocale('en');
});

describe('useDocumentLocale', () => {
  it('adopts the active locale on mount, not index.html\'s hardcoded "en"', async () => {
    document.documentElement.lang = 'en';
    await setLocale('hy');

    render(
      <I18nextProvider i18n={i18next}>
        <Probe />
      </I18nextProvider>,
    );

    await waitFor(() => expect(document.documentElement.lang).toBe('hy'));
  });

  it.each(['hy', 'ru', 'en'] as const)('follows a switch to %s', async (locale) => {
    render(
      <I18nextProvider i18n={i18next}>
        <Probe />
      </I18nextProvider>,
    );

    await setLocale(locale);

    await waitFor(() => expect(document.documentElement.lang).toBe(locale));
  });

  it('tracks every step of a switch, so no locale is left announcing the previous one', async () => {
    render(
      <I18nextProvider i18n={i18next}>
        <Probe />
      </I18nextProvider>,
    );

    for (const locale of ['hy', 'ru', 'hy', 'en'] as const) {
      await setLocale(locale);
      await waitFor(() => expect(document.documentElement.lang).toBe(locale));
    }
  });

  it('leaves lang alone once unmounted rather than resetting it', async () => {
    await setLocale('ru');
    const { unmount } = render(
      <I18nextProvider i18n={i18next}>
        <Probe />
      </I18nextProvider>,
    );
    await waitFor(() => expect(document.documentElement.lang).toBe('ru'));

    unmount();

    expect(document.documentElement.lang).toBe('ru');
  });
});
