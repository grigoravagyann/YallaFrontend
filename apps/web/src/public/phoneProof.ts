import { ApiError, staleTime } from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { useQuery } from '@tanstack/react-query';
import { usingMockData } from './gateways';

/**
 * Which doors the Book sheet offers for proving a phone: the Telegram bot, a
 * code by SMS, or both — the one place the sheet learns it.
 *
 * Production has Telegram only until an SMS provider is chosen (decided
 * 2026-10-20). The backend says which it has at `GET /api/auth/diner/phone-proof`
 * — `getPhoneProofChannels` and `usePhoneProofChannels()` in `@yalla/api`,
 * arriving with YallaFrontend#62 / Yalla#52. Until that merges the gateway may
 * not have the method, and this reads it if it is there and offers both doors
 * if it is not, which is today's behaviour. Once #62 is on main this becomes
 * `usePhoneProofChannels()` and `error instanceof SmsUnavailableError`, and
 * nothing else in the sheet changes.
 *
 * The rules are #62's: while the answer loads neither door is offered rather
 * than a guessed one; if it fails both are, and each door's own refusal
 * closes it after one try.
 */
export interface PhoneProofDoors {
  readonly sms: boolean;
  readonly telegram: boolean;
  /** False while the backend's answer is on its way: offer neither door yet. */
  readonly known: boolean;
}

interface PhoneProofChannels {
  readonly sms: boolean;
  readonly telegram: boolean;
}

/** The gateway as #62 shapes it: the method may not exist yet. */
interface MaybeChannels {
  readonly getPhoneProofChannels?: (() => Promise<PhoneProofChannels>) | undefined;
}

const BOTH: PhoneProofDoors = { sms: true, telegram: true, known: true };

export function usePhoneProofDoors(): PhoneProofDoors {
  const gateway = useGateway() as unknown as MaybeChannels;
  const read = gateway.getPhoneProofChannels;
  const query = useQuery({
    // #62's `queryKeys.phoneProofChannels`.
    queryKey: ['phoneProofChannels'],
    queryFn: () => read!.call(gateway),
    enabled: typeof read === 'function',
    // A fact about the deployment, the same for everybody: read once, and
    // retried as the client retries any read — exactly as #62's hook does
    // (review N15), so the switch changes nothing.
    staleTime: staleTime.static,
  });

  if (mockSmsOff()) return { sms: false, telegram: true, known: true };
  if (typeof read !== 'function') return BOTH;
  if (query.data) return { sms: query.data.sms, telegram: query.data.telegram, known: true };
  if (query.isError) return BOTH;
  return { sms: false, telegram: false, known: false };
}

/**
 * `requestPhoneCode` refused because this backend sends no SMS — #62's
 * `SmsUnavailableError`, read by name until it exists, or the raw 503
 * `sms-unavailable` a gateway without #62 hands over from a backend that has
 * Yalla#52 (#62's own mapping; review S4). Without this the refusal read as
 * "Something went wrong" and the SMS door stayed open for good.
 */
export function isSmsUnavailable(error: unknown): boolean {
  if (error instanceof Error && error.name === 'SmsUnavailableError') return true;
  return error instanceof ApiError && error.status === 503 && error.code === 'sms-unavailable';
}

/**
 * Mock data only: `VITE_MOCK_SMS_OFF=1` walks production's Telegram-only sheet
 * in a browser. Ignored against a real backend, which says for itself.
 */
function mockSmsOff(): boolean {
  return import.meta.env['VITE_MOCK_SMS_OFF'] === '1' && usingMockData();
}
