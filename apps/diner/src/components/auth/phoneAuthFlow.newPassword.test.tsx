import { createMockGateway, type MockGateway } from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Linking } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../../stores/session';
import { PhoneAuthFlow } from './PhoneAuthFlow';
import type * as I18nModule from '@yalla/i18n';

/**
 * "Forgot your password?" ends in a new password.
 *
 * The link opens code sign-in; once the code (or the Telegram bot) has proved
 * the phone, the server lets that sign-in set a new password without the old
 * one for ten minutes. So the flow goes straight to a "Set a new password"
 * step, sends no `currentPassword`, and only then finishes.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  dismiss: vi.fn(),
  canGoBack: vi.fn(() => true),
}));
const navigation = vi.hoisted(() => ({
  addListener: vi.fn(() => () => undefined),
  getState: vi.fn(() => ({ routes: [{}, {}] })),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => router,
  useNavigation: () => navigation,
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

/** The mock's seeded Ani: a password and a verified number, so a code keeps her password. */
const ANI = { phoneE164: '+37491234567', username: 'ani', email: 'ani@example.com' } as const;
const LOCAL_NUMBER = ANI.phoneE164.slice('+374'.length);

function renderFlow(gateway: MockGateway, reason?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GatewayProvider gateway={gateway}>
        <PhoneAuthFlow mode="login" params={reason ? { reason } : {}} />
      </GatewayProvider>
    </QueryClientProvider>,
  );
}

async function passTheCode() {
  // Once the backend has said which doors are open.
  fireEvent.change(await screen.findByLabelText('verify.phoneLabel'), {
    target: { value: LOCAL_NUMBER },
  });
  fireEvent.click(screen.getByRole('button', { name: 'verify.sendCode' }));
  const code = await screen.findByLabelText('verify.codeTitle');
  fireEvent.change(code, { target: { value: '123456' } });
}

function typeNewPassword(first: string, again: string) {
  fireEvent.change(screen.getByLabelText('editProfile.password.new'), {
    target: { value: first },
  });
  fireEvent.change(screen.getByLabelText('auth.newPassword.confirmLabel'), {
    target: { value: again },
  });
}

beforeEach(() => {
  router.replace.mockClear();
  router.back.mockClear();
  useSession.setState({ signedIn: false, phoneE164: null, guestName: 'Ani', email: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('a forgotten password, after the code', () => {
  it('asks for a new one, sends no current password, and then finishes', async () => {
    const gateway = createMockGateway({ latencyMs: 0 });
    const setPassword = vi.spyOn(gateway, 'setDinerPassword');
    renderFlow(gateway, 'forgotPassword');

    await passTheCode();
    expect(await screen.findByText('auth.newPassword.title')).toBeTruthy();
    // Not finished yet: the reason for coming here is still ahead.
    expect(router.back).not.toHaveBeenCalled();

    typeNewPassword('a fresh start', 'a fresh start');
    fireEvent.click(screen.getByRole('button', { name: 'auth.newPassword.save' }));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(setPassword).toHaveBeenCalledWith({ newPassword: 'a fresh start' });
    expect(setPassword.mock.calls[0]?.[0]).not.toHaveProperty('currentPassword');
    await expect(
      gateway.loginDiner({ identifier: ANI.username, password: 'a fresh start' }),
    ).resolves.toBeTruthy();
  });

  it('holds the new one to the house rule and to its confirmation before sending', async () => {
    const gateway = createMockGateway({ latencyMs: 0 });
    const setPassword = vi.spyOn(gateway, 'setDinerPassword');
    renderFlow(gateway, 'forgotPassword');
    await passTheCode();
    await screen.findByText('auth.newPassword.title');

    typeNewPassword('short', 'short');
    expect(screen.getByText('auth.error.passwordInvalid')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'auth.newPassword.save' })).toHaveProperty(
      'disabled',
      true,
    );

    typeNewPassword('a fresh start', 'a fresh stat');
    fireEvent.click(screen.getByRole('button', { name: 'auth.newPassword.save' }));
    expect(await screen.findByText('auth.newPassword.mismatch')).toBeTruthy();
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("puts the server's refusal under the field it names", async () => {
    const gateway = createMockGateway({ latencyMs: 0 });
    renderFlow(gateway, 'forgotPassword');
    await passTheCode();
    await screen.findByText('auth.newPassword.title');

    // The server refuses a password equal to the username.
    typeNewPassword(ANI.email, ANI.email);
    fireEvent.click(screen.getByRole('button', { name: 'auth.newPassword.save' }));

    expect(await screen.findByText('auth.error.passwordInvalid')).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('goes the same way after the Telegram bot', async () => {
    const gateway = createMockGateway({ latencyMs: 0 });
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    renderFlow(gateway, 'forgotPassword');

    fireEvent.click(await screen.findByRole('button', { name: 'verify.telegramButton' }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const challengeId = /start=(tg_\d+)/u.exec(String(open.mock.calls[0]?.[0]))?.[1];
    gateway.confirmTelegramVerification(challengeId!, ANI.phoneE164);

    expect(
      await screen.findByText('auth.newPassword.title', undefined, { timeout: 4000 }),
    ).toBeTruthy();
  });
});

describe('a plain code log-in', () => {
  it('asks for no password, and remembers when the phone was proved', async () => {
    const before = Date.now();
    const gateway = createMockGateway({ latencyMs: 0 });
    renderFlow(gateway);

    await passTheCode();
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(screen.queryByText('auth.newPassword.title')).toBeNull();
    // What Edit profile reads to leave the current password out.
    expect(useSession.getState().phoneProvedAtMs).toBeGreaterThanOrEqual(before);
  });
});
