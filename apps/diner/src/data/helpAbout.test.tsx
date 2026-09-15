import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Linking } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AboutScreen from '../../app/about';
import HelpScreen from '../../app/help';
import type * as I18nModule from '@yalla/i18n';

/**
 * About names the build; Help answers from the app's real behaviour. Neither
 * ever shows a contact or a link that was not configured.
 */

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: () => true }),
}));
vi.mock('expo-constants', () => ({
  default: {
    expoConfig: { name: 'Yalla', version: '1.2.3' },
    nativeBuildVersion: '45',
    executionEnvironment: 'standalone',
  },
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${Object.values(params).join(' ')}` : key,
  }),
  useLocale: () => ({ locale: 'en' }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('About', () => {
  it('shows the app version and build', () => {
    render(<AboutScreen />);

    expect(screen.getByText('Yalla')).toBeTruthy();
    expect(screen.getByText('about.version 1.2.3 45')).toBeTruthy();
    expect(screen.getByText('about.licences')).toBeTruthy();
  });

  it('lists Terms and Privacy only for the URLs that are configured', () => {
    render(<AboutScreen />);
    expect(screen.queryByText('about.terms')).toBeNull();
    expect(screen.queryByText('about.privacy')).toBeNull();
    cleanup();

    vi.stubEnv('EXPO_PUBLIC_TERMS_URL', 'https://example.test/terms');
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<AboutScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'about.terms' }));
    expect(open).toHaveBeenCalledWith('https://example.test/terms');
    expect(screen.queryByText('about.privacy')).toBeNull();
  });
});

describe('Help & Support', () => {
  it('answers the common questions, one at a time', () => {
    render(<HelpScreen />);

    for (const topic of ['booking', 'code', 'table', 'reviews', 'deleteAccount', 'favorites']) {
      expect(screen.getByText(`help.faq.${topic}.question`)).toBeTruthy();
    }
    expect(screen.queryByText('help.faq.favorites.answer')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'help.faq.favorites.question' }));
    expect(screen.getByText('help.faq.favorites.answer')).toBeTruthy();
  });

  it('draws no contact section when no support contact is configured', () => {
    render(<HelpScreen />);

    expect(screen.queryByText('help.contactTitle')).toBeNull();
    expect(screen.queryByText(/mailto|tel:|@/u)).toBeNull();
  });

  it('offers the configured email and phone, and opens them with mailto: and tel:', () => {
    vi.stubEnv('EXPO_PUBLIC_SUPPORT_EMAIL', 'help@example.test');
    vi.stubEnv('EXPO_PUBLIC_SUPPORT_PHONE', '+374 91 000 123');
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);

    render(<HelpScreen />);

    expect(screen.getByText('help.contactTitle')).toBeTruthy();
    fireEvent.click(screen.getByText('help.email help@example.test'));
    fireEvent.click(screen.getByText('help.phone +374 91 000 123'));
    expect(open.mock.calls.map(([url]) => url)).toEqual([
      'mailto:help@example.test',
      'tel:+37491000123',
    ]);
  });
});
