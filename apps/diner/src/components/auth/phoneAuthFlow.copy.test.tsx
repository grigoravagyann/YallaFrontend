import { createMockGateway } from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginScreen from '../../../app/auth/login';
import { useSession } from '../../stores/session';
import { PhoneAuthFlow, type AuthRouteParams } from './PhoneAuthFlow';
import type * as I18nModule from '@yalla/i18n';

/**
 * What the code screen calls itself. Opened from the profile's "Verify" while
 * signed in, it was titled "Log in" and offered to create an account; opened
 * because a password was forgotten, there was no way to get to it at all.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  dismiss: vi.fn(),
  canGoBack: vi.fn(() => true),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => router,
  useNavigation: () => ({
    addListener: vi.fn(() => () => undefined),
    getState: vi.fn(() => ({ routes: [{}, {}] })),
  }),
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

function renderWith(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GatewayProvider gateway={createMockGateway({ latencyMs: 0 })}>{ui}</GatewayProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  router.replace.mockClear();
  useSession.setState({ signedIn: false, phoneE164: null, guestName: null, email: null });
});

afterEach(cleanup);

describe('the code screen', () => {
  it('is "Log in", with a way to create an account, when nobody is signed in', () => {
    renderWith(<PhoneAuthFlow mode="login" params={{}} />);

    expect(screen.getByText('auth.login.title')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'auth.login.createOne' })).toBeTruthy();
  });

  it('confirms the number, and offers no new account, while signed in', async () => {
    useSession.setState({ signedIn: true, phoneE164: '+37477123456' });

    renderWith(<PhoneAuthFlow mode="login" params={{}} />);

    expect(screen.getByText('auth.login.confirmTitle')).toBeTruthy();
    // The body names the door, so it waits for the backend to say which.
    expect(await screen.findByText('auth.login.confirmBody')).toBeTruthy();
    expect(screen.queryByText('auth.login.title')).toBeNull();
    expect(screen.queryByRole('button', { name: 'auth.login.createOne' })).toBeNull();
  });

  it('says what it is for when a password was forgotten', async () => {
    const params: AuthRouteParams = { reason: 'forgotPassword' };

    renderWith(<PhoneAuthFlow mode="login" params={params} />);

    expect(screen.getByText('auth.login.forgot')).toBeTruthy();
    expect(await screen.findByText('auth.login.forgotBody')).toBeTruthy();
  });
});

describe('the password log-in', () => {
  it('leads a forgotten password to the code screen', () => {
    renderWith(<LoginScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'auth.login.forgot' }));

    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/auth/code',
      params: { reason: 'forgotPassword' },
    });
  });
});
