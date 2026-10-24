// @vitest-environment jsdom
import { createQueryClient, createStaffMockGateway, type StaffGateway } from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../../console/venue/reports/testHarness';
import { offerInstallPromptForTest } from '../pwa/installPrompt';
import { PhoneInstall } from './PhoneInstall';

/**
 * The Install artboard: home screen guidance for iPhone and Android, then
 * notifications — asked from the tap, subscribed with the server's key, the
 * server told — and the switches, saved as they flip in the app's language.
 */

const KEY =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

/** A browser that can be pushed: a staff worker, a push manager, a permission prompt. */
function pushableBrowser(answer: NotificationPermission = 'granted') {
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    options: { applicationServerKey: null as ArrayBuffer | null },
    toJSON: () => ({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'p256', auth: 'auth' },
    }),
    unsubscribe: vi.fn(async () => true),
  };
  let current: typeof subscription | null = null;
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async (options: { applicationServerKey: Uint8Array }) => {
      subscription.options.applicationServerKey = options.applicationServerKey
        .buffer as ArrayBuffer;
      current = subscription;
      return subscription;
    }),
  };
  const permission = { value: 'default' as NotificationPermission };
  vi.stubGlobal('Notification', {
    get permission() {
      return permission.value;
    },
    requestPermission: vi.fn(async () => {
      permission.value = answer;
      return answer;
    }),
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: vi.fn(async () => ({ pushManager })) },
  });
  return { pushManager, subscription };
}

function renderInstall(gateway: StaffGateway, props: Parameters<typeof PhoneInstall>[0] = {}) {
  const queryClient = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
  render(
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <GatewayProvider staffGateway={gateway}>
          <PhoneInstall support="supported" {...props} />
        </GatewayProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  offerInstallPromptForTest(null);
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('turning notifications on', () => {
  it('asks, subscribes with the server’s key, tells the server, then shows the switches', async () => {
    const browser = pushableBrowser('granted');
    const gateway = createStaffMockGateway({ latencyMs: 0 });
    vi.spyOn(gateway, 'getPushConfig').mockResolvedValue({ enabled: true, publicKey: KEY });
    const store = vi.spyOn(gateway, 'savePushSubscription');
    const save = vi.spyOn(gateway, 'saveNotificationSettings');
    renderInstall(gateway);
    const user = userEvent.setup({ delay: null });

    await user.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    await waitFor(() =>
      expect(store).toHaveBeenCalledWith({
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'p256', auth: 'auth' },
      }),
    );
    expect(browser.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    // Saved once at once, in the app's language.
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en' })),
    );

    const ready = await screen.findByRole('switch', { name: 'Kitchen is ready' });
    expect(ready.getAttribute('aria-checked')).toBe('false');
    expect(
      screen.getByRole('switch', { name: 'Booking to approve' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(screen.getByRole('switch', { name: 'Only during my shift' })).toBeTruthy();

    await user.click(ready);
    await waitFor(() =>
      expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ kitchenReady: true })),
    );
    await waitFor(() => expect(ready.getAttribute('aria-checked')).toBe('true'));
  });

  it('says how to unblock them when the person said no', async () => {
    pushableBrowser('denied');
    const gateway = createStaffMockGateway({ latencyMs: 0 });
    vi.spyOn(gateway, 'getPushConfig').mockResolvedValue({ enabled: true, publicKey: KEY });
    const store = vi.spyOn(gateway, 'savePushSubscription');
    renderInstall(gateway);
    await userEvent
      .setup({ delay: null })
      .click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    expect(await screen.findByText(/^Notifications are blocked for SHURJ\./u)).toBeTruthy();
    expect(store).not.toHaveBeenCalled();
  });

  it('asks again when the prompt was closed without an answer, rather than calling it blocked', async () => {
    pushableBrowser('default');
    const gateway = createStaffMockGateway({ latencyMs: 0 });
    vi.spyOn(gateway, 'getPushConfig').mockResolvedValue({ enabled: true, publicKey: KEY });
    const store = vi.spyOn(gateway, 'savePushSubscription');
    renderInstall(gateway);
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Turn on notifications' }));

    const again = await screen.findByRole('button', { name: 'Turn on notifications' });
    await waitFor(() => expect(again.hasAttribute('disabled')).toBe(false));
    expect(screen.queryByText(/^Notifications are blocked for SHURJ\./u)).toBeNull();
    expect(store).not.toHaveBeenCalled();
  });

  it('offers no switch on a server that sends no pushes', async () => {
    pushableBrowser();
    const gateway = createStaffMockGateway({ latencyMs: 0 });
    vi.spyOn(gateway, 'getPushConfig').mockResolvedValue({ enabled: false, publicKey: null });
    renderInstall(gateway);
    expect(await screen.findByText(/^This server does not send notifications yet\./u)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).toBeNull();
  });

  it('tells an iPhone in Safari to add SHURJ to the home screen first', async () => {
    renderInstall(createStaffMockGateway({ latencyMs: 0 }), { support: 'needsInstall' });
    expect(
      await screen.findByText(
        /^On an iPhone, notifications work only in SHURJ opened from the Home Screen/u,
      ),
    ).toBeTruthy();
  });
});

describe('the home screen', () => {
  it('gives iPhone the Share steps and Android Chrome’s own install button', async () => {
    const prompt = vi.fn(async () => undefined);
    offerInstallPromptForTest({
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    } as unknown as Parameters<typeof offerInstallPromptForTest>[0]);
    pushableBrowser();
    renderInstall(createStaffMockGateway({ latencyMs: 0 }));
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('tab', { name: 'iPhone' }));
    expect(screen.getByText('Choose “Add to Home Screen”')).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Android' }));
    await user.click(screen.getByRole('button', { name: 'Install SHURJ' }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Done')).toBeTruthy();
  });

  it('ends with Start right after pairing', async () => {
    pushableBrowser();
    const start = vi.fn();
    renderInstall(createStaffMockGateway({ latencyMs: 0 }), { onboarding: true, onStart: start });
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Start' }));
    expect(start).toHaveBeenCalledTimes(1);
  });
});
