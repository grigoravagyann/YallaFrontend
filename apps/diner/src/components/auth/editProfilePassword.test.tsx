import { createMockGateway, type MockGateway } from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EditProfileScreen from '../../../app/profile/edit';
import { useSession } from '../../stores/session';
import type * as I18nModule from '@yalla/i18n';

/**
 * Edit profile → Change password, right after the phone was proved.
 *
 * For ten minutes after a code or Telegram sign-in the server lets that
 * sign-in set a new password without the old one, so the screen leaves the
 * current-password field out. The proof time is the app's own record of the
 * sign-in it just did; the server stays the authority, and when it answers
 * 422 on `currentPassword` the field comes back with the reason under it.
 */

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-image-picker', () => ({}));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn(), canGoBack: () => true }),
  useNavigation: () => ({ addListener: () => () => undefined }),
  useLocalSearchParams: () => ({}),
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({ t: (key: string) => key }),
  useLocale: () => ({ locale: 'en' }),
}));

const ANI = { phoneE164: '+37491234567', username: 'ani', password: 'password123' } as const;

/** Ani signed in on the mock, by a code or by her password, and the screen open. */
async function openEditProfile(options: {
  readonly signIn: 'code' | 'password';
  readonly provedAgoMs: number | null;
}) {
  const gateway: MockGateway = createMockGateway({ latencyMs: 0 });
  if (options.signIn === 'code') {
    const challenge = await gateway.requestPhoneCode(ANI.phoneE164);
    await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: '123456' });
  } else {
    await gateway.loginDiner({ identifier: ANI.username, password: ANI.password });
  }
  const profile = await gateway.getDinerProfile();
  useSession.setState({
    signedIn: true,
    phoneE164: profile.phoneE164,
    guestName: profile.displayName,
    email: profile.email,
    profile,
    phoneProvedAtMs: options.provedAgoMs === null ? null : Date.now() - options.provedAgoMs,
  });

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <GatewayProvider gateway={gateway}>
        <EditProfileScreen />
      </GatewayProvider>
    </QueryClientProvider>,
  );
  await screen.findByText('editProfile.password.title');
  return gateway;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('changing the password just after proving the phone', () => {
  it('leaves the current password out, and sends none', async () => {
    const gateway = await openEditProfile({ signIn: 'code', provedAgoMs: 60_000 });
    const setPassword = vi.spyOn(gateway, 'setDinerPassword');

    expect(screen.queryByLabelText('editProfile.password.current')).toBeNull();
    expect(screen.getByText('editProfile.password.provedRecently')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('editProfile.password.new'), {
      target: { value: 'a fresh start' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'editProfile.password.change' }));

    expect(await screen.findByText('editProfile.password.changed')).toBeTruthy();
    expect(setPassword).toHaveBeenCalledWith({ newPassword: 'a fresh start' });
  });

  it('asks for the current one once the ten minutes are up', async () => {
    await openEditProfile({ signIn: 'code', provedAgoMs: 11 * 60_000 });
    expect(screen.getByLabelText('editProfile.password.current')).toBeTruthy();
    expect(screen.queryByText('editProfile.password.provedRecently')).toBeNull();
  });

  it("brings the field back with the server's reason when the server disagrees", async () => {
    // The app thinks the phone was just proved; the server's session was a
    // password sign-in, so it asks for the current password.
    await openEditProfile({ signIn: 'password', provedAgoMs: 60_000 });
    expect(screen.queryByLabelText('editProfile.password.current')).toBeNull();

    fireEvent.change(screen.getByLabelText('editProfile.password.new'), {
      target: { value: 'a fresh start' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'editProfile.password.change' }));

    const current = await screen.findByLabelText('editProfile.password.current');
    expect(screen.getByText('editProfile.password.currentNeeded')).toBeTruthy();
    expect(screen.queryByText('editProfile.password.provedRecently')).toBeNull();

    // With it typed, the change goes through.
    fireEvent.change(current, { target: { value: ANI.password } });
    fireEvent.click(screen.getByRole('button', { name: 'editProfile.password.change' }));
    await waitFor(() => expect(screen.getByText('editProfile.password.changed')).toBeTruthy());
  });
});
