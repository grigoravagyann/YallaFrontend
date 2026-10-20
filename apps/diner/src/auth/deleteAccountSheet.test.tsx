import {
  SmsUnavailableError,
  ValidationError,
  type DinerProfileView,
  type YallaGateway,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Linking } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../stores/session';
import { DeleteAccountSheet } from './DeleteAccountSheet';
import type * as I18nModule from '@yalla/i18n';

/**
 * Deleting an account that has no password.
 *
 * With SMS on it asks for a code for the account's own number: in a dev build
 * it shows the code Development hands back, as the code screen does, and in
 * every build it says how to set a password instead.
 *
 * With SMS off (Telegram only, decided 2026-10-20) there is no code to ask
 * for. The sheet offers the Telegram bot instead; the claim signs the same
 * account in again with a token that carries the fresh phone proof, and the
 * deletion then goes with nothing in its body.
 */

const gateway = vi.hoisted(() => ({
  getPhoneProofChannels: vi.fn(),
  requestPhoneCode: vi.fn(),
  startTelegramVerification: vi.fn(),
  claimTelegramVerification: vi.fn(),
  deleteDinerAccount: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({
    t: (key: string, options?: { code?: string }) =>
      options?.code ? `${key} ${options.code}` : key,
  }),
  useLocale: () => ({ locale: 'en' }),
}));

const PROFILE = {
  dinerUserId: 'diner-a',
  username: null,
  email: null,
  phoneE164: '+37499000123',
  phoneVerified: true,
  displayName: 'Anahit',
  localeCode: 'en',
  hasPassword: false,
  photo: null,
} as DinerProfileView;

const CHALLENGE = {
  challengeId: 'tg_1',
  deepLinkUrl: 'https://t.me/yalla_bot?start=tg_1',
  expiresAtUtc: new Date(Date.now() + 10 * 60_000).toISOString(),
  pollAfterMs: 50,
};

function renderSheet(onDeleted = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <GatewayProvider gateway={gateway as unknown as YallaGateway}>
        <DeleteAccountSheet visible profile={PROFILE} onClose={vi.fn()} onDeleted={onDeleted} />
      </GatewayProvider>
    </QueryClientProvider>,
  );
  return { onDeleted };
}

/** Press the Telegram button and let the bot confirm `phoneE164`. */
async function proveByTelegram(phoneE164: string = PROFILE.phoneE164) {
  gateway.startTelegramVerification.mockResolvedValue(CHALLENGE);
  gateway.claimTelegramVerification.mockResolvedValue({
    state: 'verified',
    verified: { verificationToken: 'access-with-proof', phoneE164 },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'verify.telegramButton' }));
}

beforeEach(() => {
  for (const fn of Object.values(gateway)) fn.mockReset();
  gateway.getPhoneProofChannels.mockResolvedValue({ sms: true, telegram: true });
  useSession.setState({
    signedIn: true,
    phoneE164: PROFILE.phoneE164,
    guestName: 'Anahit',
    phoneProvedAtMs: null,
  });
  vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the delete-account sheet without a password, SMS on', () => {
  it('shows the Development code in a dev build, and the way round it', async () => {
    gateway.requestPhoneCode.mockResolvedValue({
      challengeId: 'challenge-1',
      expiresAtUtc: '2026-09-15T12:00:00Z',
      devCode: '482913',
    });
    renderSheet();

    fireEvent.click(await screen.findByRole('button', { name: 'profile.deleteAccount.sendCode' }));
    expect(screen.getByText('profile.deleteAccount.noCodeHint')).toBeTruthy();

    expect(await screen.findByText('verify.devBanner 482913')).toBeTruthy();
    expect(gateway.requestPhoneCode).toHaveBeenCalledWith(PROFILE.phoneE164, { localeCode: 'en' });
  });

  it('never prints a code outside a dev build', async () => {
    vi.stubGlobal('__DEV__', false);
    gateway.requestPhoneCode.mockResolvedValue({
      challengeId: 'challenge-1',
      expiresAtUtc: '2026-09-15T12:00:00Z',
      devCode: '482913',
    });
    renderSheet();

    fireEvent.click(await screen.findByRole('button', { name: 'profile.deleteAccount.sendCode' }));

    expect(await screen.findByText('profile.deleteAccount.codeSent')).toBeTruthy();
    expect(screen.queryByText(/verify\.devBanner/u)).toBeNull();
  });

  it('turns to Telegram when the code request is refused for want of SMS anyway', async () => {
    gateway.requestPhoneCode.mockRejectedValue(new SmsUnavailableError({ url: 'test://code' }));
    renderSheet();

    fireEvent.click(await screen.findByRole('button', { name: 'profile.deleteAccount.sendCode' }));

    expect(await screen.findByRole('button', { name: 'verify.telegramButton' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'profile.deleteAccount.sendCode' })).toBeNull();
    expect(screen.queryByLabelText('profile.deleteAccount.codeLabel')).toBeNull();
  });
});

describe('the delete-account sheet without a password, SMS off', () => {
  beforeEach(() => {
    gateway.getPhoneProofChannels.mockResolvedValue({ sms: false, telegram: true });
  });

  it('proves the number with Telegram, then deletes with nothing in the body', async () => {
    const { onDeleted } = renderSheet();
    gateway.deleteDinerAccount.mockResolvedValue(undefined);

    expect(await screen.findByText('profile.deleteAccount.telegramBody')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'profile.deleteAccount.sendCode' })).toBeNull();
    expect(screen.queryByLabelText('profile.deleteAccount.codeLabel')).toBeNull();
    expect(screen.getByRole('button', { name: 'profile.deleteAccount.confirm' })).toHaveProperty(
      'disabled',
      true,
    );

    await proveByTelegram();

    expect(await screen.findByText('profile.deleteAccount.telegramConfirmed')).toBeTruthy();
    expect(Linking.openURL).toHaveBeenCalledWith(CHALLENGE.deepLinkUrl);
    // The claim signed the account in again: the session knows the proof, as
    // after a Telegram log-in.
    expect(useSession.getState().phoneProvedAtMs).not.toBeNull();
    expect(useSession.getState().phoneE164).toBe(PROFILE.phoneE164);

    fireEvent.click(screen.getByRole('button', { name: 'profile.deleteAccount.confirm' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(gateway.deleteDinerAccount).toHaveBeenCalledWith({});
  });

  it('deletes nothing when Telegram confirmed some other number', async () => {
    renderSheet();

    await proveByTelegram('+37477000999');

    expect(await screen.findByText('profile.deleteAccount.otherNumber')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'profile.deleteAccount.confirm' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(gateway.deleteDinerAccount).not.toHaveBeenCalled();
  });

  it('asks for Telegram again when the server no longer takes the proof', async () => {
    renderSheet();
    gateway.deleteDinerAccount.mockRejectedValue(
      new ValidationError({
        url: 'test://me',
        status: 422,
        problem: {
          type: 'about:blank',
          title: 'Validation failed',
          status: 422,
          detail: 'Enter the code, or prove the number with Telegram again.',
          code: 'validation-failed',
          traceId: 'test',
          context: { field: 'code' },
        },
      }),
    );

    await proveByTelegram();
    await screen.findByText('profile.deleteAccount.telegramConfirmed');
    fireEvent.click(screen.getByRole('button', { name: 'profile.deleteAccount.confirm' }));

    expect(await screen.findByText('profile.deleteAccount.proofExpired')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'verify.telegramButton' })).toBeTruthy();
    expect(screen.queryByText('profile.deleteAccount.telegramConfirmed')).toBeNull();
  });

  it('says how else to delete when Telegram is off too, with no dead button', async () => {
    gateway.getPhoneProofChannels.mockResolvedValue({ sms: false, telegram: false });
    renderSheet();

    expect(await screen.findByText('profile.deleteAccount.noProofHint')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'verify.telegramButton' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'profile.deleteAccount.sendCode' })).toBeNull();
  });
});

describe('the delete-account sheet while the channels are still being read', () => {
  it('offers neither the code nor Telegram yet', async () => {
    gateway.getPhoneProofChannels.mockReturnValue(new Promise(() => undefined));
    renderSheet();

    expect(await screen.findByText('profile.deleteAccount.title')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'profile.deleteAccount.sendCode' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'verify.telegramButton' })).toBeNull();
  });
});
