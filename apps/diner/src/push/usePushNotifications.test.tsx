import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as ReactNativeModule from 'react-native';
import type * as ApiReactModule from '@yalla/api/react';
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
const gateway = vi.hoisted(() => ({
  confirmOnMyWay: vi.fn(),
  reportRunningLate: vi.fn(),
  sendGuestMessage: vi.fn(),
}));

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
vi.mock('@yalla/api/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiReactModule>()),
  useGateway: () => gateway,
}));
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

/**
 * Guest messages (2026-10-23): the venue's message is answered from its
 * banner — "I'm coming", "Late 15 min", a typed "Reply" — and anything that
 * does not go through opens the thread, the reply's words in its field.
 */
describe("a venue message's buttons", () => {
  function respond(actionIdentifier: string, userText?: string, signedIn = true) {
    notifications.getLastNotificationResponseAsync.mockResolvedValue({
      actionIdentifier,
      ...(userText === undefined ? {} : { userText }),
      notification: {
        request: {
          content: {
            data: {
              kind: 'venue-message',
              conversationId: 'c1',
              reservationId: 'r-1',
              ask: 'true',
            },
          },
        },
      },
    });
    renderHook(() => usePushNotifications({ projectId: 'p', signedIn }), { wrapper });
  }

  it("'I'm coming' tells the venue without opening anything", async () => {
    gateway.confirmOnMyWay.mockResolvedValue({ wasReplay: false });
    respond('venue-ask-coming');
    await waitFor(() => expect(gateway.confirmOnMyWay).toHaveBeenCalledWith('r-1'));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('"Late 15 min" reports fifteen minutes', async () => {
    gateway.reportRunningLate.mockResolvedValue({ wasReplay: false });
    respond('venue-ask-late-15');
    await waitFor(() =>
      expect(gateway.reportRunningLate).toHaveBeenCalledWith({ reservationId: 'r-1', minutes: 15 }),
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it('"Reply" sends the typed words into the thread', async () => {
    gateway.sendGuestMessage.mockResolvedValue({ id: 'm9', wasReplay: false });
    respond('venue-reply', '  Ten minutes away  ');
    await waitFor(() =>
      expect(gateway.sendGuestMessage).toHaveBeenCalledWith({
        subject: { kind: 'reservation', id: 'r-1' },
        text: 'Ten minutes away',
        clientCommandId: expect.any(String),
      }),
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it('opens the thread with the words when the reply does not go through', async () => {
    gateway.sendGuestMessage.mockRejectedValue(new Error('offline'));
    respond('venue-reply', 'Ten minutes away');
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/messages/reservation/[id]',
        params: { id: 'r-1', draft: 'Ten minutes away' },
      }),
    );
  });

  it('a tap on the banner itself opens the thread', async () => {
    respond('expo.modules.notifications.actions.DEFAULT');
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/messages/reservation/[id]',
        params: { id: 'r-1' },
      }),
    );
    expect(gateway.confirmOnMyWay).not.toHaveBeenCalled();
  });

  it('sends nothing as nobody: signed out, the thread opens with the words', async () => {
    respond('venue-reply', 'Ten minutes away', false);
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/messages/reservation/[id]',
        params: { id: 'r-1', draft: 'Ten minutes away' },
      }),
    );
    expect(gateway.sendGuestMessage).not.toHaveBeenCalled();
  });

  it("signed out, 'I'm coming' opens the thread instead of answering", async () => {
    respond('venue-ask-coming', undefined, false);
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/messages/reservation/[id]',
        params: { id: 'r-1' },
      }),
    );
    expect(gateway.confirmOnMyWay).not.toHaveBeenCalled();
  });
});
