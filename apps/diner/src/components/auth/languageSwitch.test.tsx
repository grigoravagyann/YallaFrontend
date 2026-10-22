import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as I18nModule from '@yalla/i18n';

/**
 * The welcome's language switch: every language is offered in its own script,
 * the current one is marked, and a tap changes the app's language at once.
 */

const locale = vi.hoisted(() => ({
  current: 'hy',
  setLocale: vi.fn(() => Promise.resolve()),
}));

vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({ t: (key: string) => key }),
  useLocale: () => ({ locale: locale.current, setLocale: locale.setLocale }),
}));

const { LanguageSwitch } = await import('./LanguageSwitch');

describe('the language switch', () => {
  afterEach(() => {
    cleanup();
    locale.setLocale.mockClear();
  });

  it('offers each language in its own script and marks the current one', () => {
    render(<LanguageSwitch />);
    const options = screen.getAllByRole('radio');
    expect(options.map((o) => o.textContent)).toEqual(['Հայ', 'Рус', 'Eng']);
    expect(options.map((o) => o.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(screen.getByLabelText('language.ru')).toBeTruthy();
  });

  it('switches the language on a tap, and leaves the current one alone', async () => {
    render(<LanguageSwitch />);
    await act(async () => {
      fireEvent.click(screen.getByText('Eng'));
    });
    expect(locale.setLocale).toHaveBeenCalledWith('en');

    locale.setLocale.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByText('Հայ'));
    });
    expect(locale.setLocale).not.toHaveBeenCalled();
  });
});
