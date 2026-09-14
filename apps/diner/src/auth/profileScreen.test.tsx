import type { DinerProfileView } from '@yalla/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileScreen from '../../app/(tabs)/profile';
import type { ProfileRowProps } from '../components/profile/ProfileRow';
import { useSession } from '../stores/session';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';
import type * as ProfileRowModule from '../components/profile/ProfileRow';

/**
 * Every row on the Profile tab opens something. A row with nowhere to go is a
 * dead end drawn to look like a door, so the test records every row the screen
 * renders and fails on one without `onPress`.
 */

const rows = vi.hoisted(() => [] as ProfileRowProps[]);
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
}));
const gateway = vi.hoisted(() => ({
  getDinerProfile: vi.fn(() => new Promise<never>(() => undefined)),
  getUnreadNotificationCount: vi.fn(() => Promise.resolve(3)),
  requestPhoneCode: vi.fn(),
  deleteDinerAccount: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-router', () => ({ useRouter: () => router }));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({ t: (key: string) => key }),
  useLocale: () => ({ locale: 'en' }),
}));
vi.mock('@yalla/api/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiReactModule>()),
  useGateway: () => gateway,
}));
vi.mock('./session', () => ({ authSession: { signOut: vi.fn(() => Promise.resolve()) } }));
vi.mock('../components/profile/ProfileRow', async (importOriginal) => {
  const actual = await importOriginal<typeof ProfileRowModule>();
  return {
    ProfileRow: (props: ProfileRowProps) => {
      rows.push(props);
      return actual.ProfileRow(props);
    },
  };
});

const PROFILE = {
  dinerUserId: 'diner-a',
  username: 'anahit',
  email: 'anahit@example.test',
  phoneE164: '+37491000123',
  phoneVerified: true,
  displayName: 'Anahit Sargsyan',
  localeCode: 'en',
  hasPassword: true,
  photo: null,
} as DinerProfileView;

function renderProfile() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProfileScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rows.length = 0;
  router.push.mockClear();
});

afterEach(() => {
  cleanup();
  useSession.setState({ signedIn: false, profile: null, phoneE164: null, guestName: null });
});

describe('the Profile tab', () => {
  it('draws no row without somewhere to go, signed out', () => {
    useSession.setState({ signedIn: false, profile: null });

    renderProfile();

    expect(rows.length).toBeGreaterThanOrEqual(7);
    expect(rows.filter((row) => typeof row.onPress !== 'function')).toEqual([]);
  });

  it('draws no row without somewhere to go, signed in, delete account included', async () => {
    useSession.setState({ signedIn: true, profile: PROFILE, phoneE164: PROFILE.phoneE164 });

    renderProfile();
    // The unread count arrives from the feed.
    expect(await screen.findByText('3')).toBeTruthy();

    const labels = rows.map((row) => row.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'profile.notifications',
        'profile.help',
        'profile.about',
        'profile.settings',
        'profile.deleteAccount.row',
      ]),
    );
    expect(rows.filter((row) => typeof row.onPress !== 'function')).toEqual([]);
  });

  it('opens Notifications, Help & Support and About', () => {
    renderProfile();

    fireEvent.click(screen.getByRole('button', { name: 'profile.notifications' }));
    fireEvent.click(screen.getByRole('button', { name: 'profile.help' }));
    fireEvent.click(screen.getByRole('button', { name: 'profile.about' }));

    expect(router.push.mock.calls.map(([href]) => href)).toEqual([
      '/notifications',
      '/help',
      '/about',
    ]);
  });
});
