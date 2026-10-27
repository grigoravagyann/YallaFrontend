import { createMockGateway, type MockGateway } from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Linking } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wireQueryManagers, type AppStateSource } from '../../lib/queryManagers';
import { useSession } from '../../stores/session';
import { PhoneAuthFlow } from './PhoneAuthFlow';
import type * as I18nModule from '@yalla/i18n';

/**
 * Logging in through the Telegram bot on the phone.
 *
 * The app hands the diner to Telegram and polls until the bot has confirmed;
 * coming back to the app asks straight away rather than waiting out the
 * interval, and an answer that lands after the screen is gone changes nothing.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  dismiss: vi.fn(),
  canGoBack: vi.fn(() => true),
}));
const navigation = vi.hoisted(() => ({
  getState: vi.fn(() => ({ routes: [{}, {}] })),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-clipboard', () => ({ getStringAsync: vi.fn(async () => '') }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => router,
  useNavigation: () => navigation,
  usePreventRemove: () => () => undefined,
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

const BOT_LINK = /^https:\/\/t\.me\/yalla_mock_bot\?start=(tg_\d+)$/u;

function renderFlow(gateway: MockGateway, params: { tg?: string } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <GatewayProvider gateway={gateway}>
        <PhoneAuthFlow mode="login" params={params} />
      </GatewayProvider>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

/** Press the Telegram button and read the challenge id out of what was opened. */
async function startThroughTelegram(open: ReturnType<typeof vi.spyOn>) {
  fireEvent.click(await screen.findByRole('button', { name: 'verify.telegramButton' }));
  await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  const url = String(open.mock.calls[0]?.[0]);
  const challengeId = BOT_LINK.exec(url)?.[1];
  expect(challengeId, url).toBeDefined();
  return challengeId!;
}

beforeEach(() => {
  router.replace.mockClear();
  router.back.mockClear();
  useSession.setState({ signedIn: false, phoneE164: null, guestName: null, email: null });
  focusManager.setFocused(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('logging in through Telegram', () => {
  it('opens the bot, waits, and goes on to the name step once it confirms', async () => {
    const gateway = createMockGateway({ latencyMs: 0 });
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    renderFlow(gateway);

    const challengeId = await startThroughTelegram(open);
    expect(screen.getByText('verify.telegramWaitingTitle')).toBeTruthy();

    gateway.confirmTelegramVerification(challengeId, '+37477123456');

    // The same tail as a passed code: the number is remembered, and with no
    // name on this phone the flow asks for one.
    await screen.findByText('auth.nameStep.title', undefined, { timeout: 4000 });
    expect(useSession.getState()).toMatchObject({ signedIn: true, phoneE164: '+37477123456' });
  });

  it('shows the link when Telegram is not installed', async () => {
    const gateway = createMockGateway({ latencyMs: 0 });
    const open = vi.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    renderFlow(gateway);

    await startThroughTelegram(open);

    expect(await screen.findByText('verify.telegramNotInstalled')).toBeTruthy();
    expect(screen.getByText(BOT_LINK)).toBeTruthy();
  });

  it('ignores a confirmation that lands after the screen is gone', async () => {
    const gateway = createMockGateway({ latencyMs: 0 });
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const { unmount } = renderFlow(gateway);

    const challengeId = await startThroughTelegram(open);
    unmount();
    gateway.confirmTelegramVerification(challengeId, '+37477123456');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(useSession.getState().signedIn).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('asks the server again the moment the app comes back to the foreground', async () => {
    const gateway = createMockGateway({ latencyMs: 0 });
    const claim = vi.spyOn(gateway, 'claimTelegramVerification');
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    let onAppState: ((status: string) => void) | null = null;
    const appState: AppStateSource = {
      addEventListener: (_type, listener) => {
        onAppState = listener;
        return { remove: () => undefined };
      },
    };
    wireQueryManagers({ appState, netInfo: { addEventListener: () => () => undefined } });
    renderFlow(gateway);

    await startThroughTelegram(open);
    await waitFor(() => expect(claim).toHaveBeenCalledTimes(1));

    // To Telegram and back, well inside the poll interval.
    act(() => onAppState?.('background'));
    act(() => onAppState?.('active'));

    await waitFor(() => expect(claim).toHaveBeenCalledTimes(2));
  });

  it('resumes polling a challenge the bot sent the app back with', async () => {
    const gateway = createMockGateway({ latencyMs: 0 });
    const issued = await gateway.startTelegramVerification();
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    renderFlow(gateway, { tg: issued.challengeId });

    expect(await screen.findByText('verify.telegramWaitingTitle')).toBeTruthy();
    expect(open).not.toHaveBeenCalled();

    gateway.confirmTelegramVerification(issued.challengeId, '+37499000111');

    await screen.findByText('auth.nameStep.title', undefined, { timeout: 4000 });
    expect(useSession.getState().phoneE164).toBe('+37499000111');
  });
});
