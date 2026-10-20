import { createMockGateway, SmsUnavailableError, type MockGateway } from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../../stores/session';
import { PhoneAuthFlow, type AuthMode } from './PhoneAuthFlow';
import type * as I18nModule from '@yalla/i18n';

/**
 * Only the doors this backend has open.
 *
 * Until an SMS provider is chosen (decided 2026-10-20) production proves a
 * number by Telegram alone, and `request-code` answers 503 `sms-unavailable`.
 * The screen reads which channels are on before offering one: no "Send code"
 * and no number field where no code can come, a plain sentence where neither
 * door is open, and nothing at all — rather than a guess — while it asks.
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

function renderFlow(gateway: MockGateway, mode: AuthMode = 'login') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GatewayProvider gateway={gateway}>
        <PhoneAuthFlow mode={mode} params={{}} />
      </GatewayProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useSession.setState({ signedIn: false, phoneE164: null, guestName: null, email: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('with SMS and Telegram both on', () => {
  it('offers the code and the bot, as before', async () => {
    renderFlow(createMockGateway({ latencyMs: 0 }));

    expect(await screen.findByRole('button', { name: 'verify.sendCode' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'verify.telegramButton' })).toBeTruthy();
    expect(screen.getByLabelText('verify.phoneLabel')).toBeTruthy();
    expect(screen.getByText('auth.login.body')).toBeTruthy();
  });
});

describe('with no SMS provider', () => {
  it('offers Telegram alone, with no number to type and no word of a text', async () => {
    renderFlow(createMockGateway({ latencyMs: 0, phoneProofChannels: { sms: false } }));

    expect(await screen.findByRole('button', { name: 'verify.telegramButton' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'verify.sendCode' })).toBeNull();
    expect(screen.queryByLabelText('verify.phoneLabel')).toBeNull();
    expect(screen.getByText('auth.login.bodyTelegram')).toBeTruthy();
    expect(screen.queryByText('auth.login.body')).toBeNull();
  });

  it('asks a new account for its name and email only: the bot learns the number', async () => {
    renderFlow(createMockGateway({ latencyMs: 0, phoneProofChannels: { sms: false } }), 'signup');

    expect(await screen.findByRole('button', { name: 'verify.telegramButton' })).toBeTruthy();
    expect(screen.getByLabelText('auth.nameLabel')).toBeTruthy();
    expect(screen.getByLabelText('auth.emailLabel')).toBeTruthy();
    expect(screen.queryByLabelText('verify.phoneLabel')).toBeNull();
    expect(screen.getByText('auth.signup.bodyTelegram')).toBeTruthy();
  });

  it('turns to Telegram when a code request is refused for want of SMS anyway', async () => {
    const gateway = createMockGateway({ latencyMs: 0 });
    vi.spyOn(gateway, 'requestPhoneCode').mockRejectedValue(
      new SmsUnavailableError({ url: 'mock://yalla/api/auth/diner/request-code' }),
    );
    renderFlow(gateway);

    fireEvent.change(await screen.findByLabelText('verify.phoneLabel'), {
      target: { value: '77123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'verify.sendCode' }));

    expect(await screen.findByText('verify.smsUnavailable')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'verify.sendCode' })).toBeNull();
    expect(screen.getByRole('button', { name: 'verify.telegramButton' })).toBeTruthy();
  });
});

describe('with neither way on', () => {
  it('says so, with no button that cannot work', async () => {
    renderFlow(
      createMockGateway({ latencyMs: 0, phoneProofChannels: { sms: false, telegram: false } }),
    );

    expect(await screen.findByText('verify.unavailable')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'verify.sendCode' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'verify.telegramButton' })).toBeNull();
  });
});

describe('while the channels are still being read', () => {
  it('offers neither door, rather than one that may be shut', async () => {
    const gateway = createMockGateway({ latencyMs: 0 });
    vi.spyOn(gateway, 'getPhoneProofChannels').mockReturnValue(new Promise(() => undefined));
    renderFlow(gateway);

    expect(await screen.findByText('auth.login.title')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'verify.sendCode' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'verify.telegramButton' })).toBeNull();
    expect(screen.queryByLabelText('verify.phoneLabel')).toBeNull();
  });
});
