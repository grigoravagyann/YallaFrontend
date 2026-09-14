import type { DinerProfileView } from '@yalla/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeleteAccountSheet } from './DeleteAccountSheet';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';

/**
 * Deleting an account that has no password. No SMS goes out from any backend
 * yet, so the sheet must not claim one did. In a dev build it shows the code
 * Development hands back, as the code screen does, and in every build it says
 * how to set a password instead.
 */

const gateway = vi.hoisted(() => ({
  requestPhoneCode: vi.fn(),
  deleteDinerAccount: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({
    t: (key: string, options?: { code?: string }) =>
      options?.code ? `${key} ${options.code}` : key,
  }),
  useLocale: () => ({ locale: 'en' }),
}));
vi.mock('@yalla/api/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiReactModule>()),
  useGateway: () => gateway,
}));

const PROFILE = {
  dinerUserId: 'diner-a',
  username: null,
  email: null,
  phoneE164: '+37499000123',
  phoneVerified: true,
  displayName: 'Anahit',
  localeCode: 'en',
  hasPassword: false,
  photo: null,
} as DinerProfileView;

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DeleteAccountSheet visible profile={PROFILE} onClose={vi.fn()} onDeleted={vi.fn()} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  gateway.requestPhoneCode.mockReset();
});

describe('the delete-account sheet without a password', () => {
  it('shows the Development code in a dev build, and the way round it', async () => {
    gateway.requestPhoneCode.mockResolvedValue({
      challengeId: 'challenge-1',
      expiresAtUtc: '2026-09-15T12:00:00Z',
      devCode: '482913',
    });
    renderSheet();

    expect(screen.getByText('profile.deleteAccount.noCodeHint')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'profile.deleteAccount.sendCode' }));

    expect(await screen.findByText('verify.devBanner 482913')).toBeTruthy();
    expect(gateway.requestPhoneCode).toHaveBeenCalledWith(PROFILE.phoneE164, { localeCode: 'en' });
  });

  it('never prints a code outside a dev build', async () => {
    vi.stubGlobal('__DEV__', false);
    gateway.requestPhoneCode.mockResolvedValue({
      challengeId: 'challenge-1',
      expiresAtUtc: '2026-09-15T12:00:00Z',
      devCode: '482913',
    });
    renderSheet();

    fireEvent.click(screen.getByRole('button', { name: 'profile.deleteAccount.sendCode' }));

    expect(await screen.findByText('profile.deleteAccount.codeSent')).toBeTruthy();
    expect(screen.queryByText(/verify\.devBanner/u)).toBeNull();
  });
});
