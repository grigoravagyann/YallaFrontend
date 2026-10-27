import { createMockGateway, type MockGateway } from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../../stores/session';
import { PhoneAuthFlow } from './PhoneAuthFlow';
import type * as I18nModule from '@yalla/i18n';

/**
 * The swipe back is off while the flow guards back (Expo Go, 2026-10-21).
 *
 * At the code, name, Telegram and new-password steps the system back returns
 * to the step before rather than leaving the flow, through expo-router's
 * `usePreventRemove`. The iOS swipe is a native removal that guard cannot stop:
 * the screen went, and the stack was left with "auth/code was removed natively
 * but didn't get removed from JS state". So the swipe is off exactly while the
 * guard is on, and on again at the first step, where leaving is fine.
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
const preventRemove = vi.hoisted(() =>
  vi.fn((_prevent: boolean, _onPrevented?: () => void) => () => undefined),
);
const screenOptions = vi.hoisted(() => [] as { gestureEnabled?: boolean }[]);

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-clipboard', () => ({ getStringAsync: vi.fn(async () => '') }));
vi.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options: { gestureEnabled?: boolean } }) => {
      screenOptions.push(options);
      return null;
    },
  },
  useRouter: () => router,
  useNavigation: () => navigation,
  usePreventRemove: preventRemove,
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

function renderFlow(gateway: MockGateway) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GatewayProvider gateway={gateway}>
        <PhoneAuthFlow mode="login" params={{}} />
      </GatewayProvider>
    </QueryClientProvider>,
  );
}

const latest = () => screenOptions[screenOptions.length - 1];

beforeEach(() => {
  screenOptions.length = 0;
  useSession.setState({ signedIn: false, phoneE164: null, guestName: null, email: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the swipe back', () => {
  it('is on at the number, off at the code, where back means the number again', async () => {
    renderFlow(createMockGateway({ latencyMs: 0 }));

    fireEvent.change(await screen.findByLabelText('verify.phoneLabel'), {
      target: { value: '77123456' },
    });
    expect(latest()?.gestureEnabled).toBe(true);
    expect(preventRemove.mock.lastCall?.[0]).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'verify.sendCode' }));

    await waitFor(() => expect(latest()?.gestureEnabled).toBe(false));
    // The guard that turns back into "the number again" is on with it.
    expect(preventRemove.mock.lastCall?.[0]).toBe(true);
  });
});
