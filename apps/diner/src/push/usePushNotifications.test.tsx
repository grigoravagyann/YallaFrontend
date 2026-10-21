import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as ReactNativeModule from 'react-native';
import { usePushNotifications } from './usePushNotifications';

/**
 * The tap that opened the app (PO-FE-GUEST-REVIEW N5): handled once, then
 * forgotten. `getLastNotificationResponseAsync` keeps answering the same tap
 * for the life of the process, so without clearing it any re-run of the
 * responses effect — a new gateway, a sign-in — would route again and, for
 * the "on your way" push's "I can't come", ask the cancel question again.
 */

const notifications = vi.hoisted(() => ({
  setNotificationHandler: vi.fn(),
  getLastNotificationResponseAsync: vi.fn(),
  clearLastNotificationResponse: vi.fn(),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  addNotificationReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  getPermissionsAsync: vi.fn(async () => ({ granted: false })),
}));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('expo-notifications', () => notifications);
vi.mock('expo-router', () => ({ useRouter: () => router }));
vi.mock('react-native', async (importOriginal) => {
  const native = await importOriginal<typeof ReactNativeModule>();
  return { ...native, Platform: { ...native.Platform, OS: 'ios' } };
});
vi.mock('./registration', () => ({
  registerCategories: vi.fn(async () => undefined),
  registerDevice: vi.fn(async () => undefined),
  onTokenRotation: vi.fn(() => ({ remove: vi.fn() })),
  platformCode: vi.fn(() => 1),
}));
vi.mock('@yalla/api/react', () => ({ useGateway: () => ({}) }));
vi.mock('@yalla/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  useLocale: () => ({ locale: 'en' }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the tap that opened the app', () => {
  it('is handled, then cleared, so it is never handled again', async () => {
    notifications.getLastNotificationResponseAsync.mockResolvedValue({
      actionIdentifier: 'on-your-way-cant-come',
      notification: {
        request: {
          content: {
            data: {
              kind: 'reservation-on-your-way',
              reservationId: 'r-1',
              code: 'K7Q2LM',
              actions: 'on-my-way,cancel',
            },
          },
        },
      },
    });
    renderHook(() => usePushNotifications({ projectId: 'p', signedIn: false }), { wrapper });

    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    expect(notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
  });
});
