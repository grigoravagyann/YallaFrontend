import { SmsUnavailableError } from '@yalla/api';
import { usePhoneProofChannels } from '@yalla/api/react';

/**
 * Which doors the Book sheet offers for proving a phone: the Telegram bot, a
 * code by SMS, or both — the one place the sheet learns it.
 *
 * Production has Telegram only until an SMS provider is chosen (decided
 * 2026-10-20). The backend says which it has at `GET /api/auth/diner/phone-proof`,
 * read here through `usePhoneProofChannels()`.
 *
 * While the answer loads neither door is offered rather than a guessed one; if
 * the read fails both are, and each door's own refusal closes it after one try.
 */
export interface PhoneProofDoors {
  readonly sms: boolean;
  readonly telegram: boolean;
  /** False while the backend's answer is on its way: offer neither door yet. */
  readonly known: boolean;
}

const BOTH: PhoneProofDoors = { sms: true, telegram: true, known: true };

export function usePhoneProofDoors(): PhoneProofDoors {
  const query = usePhoneProofChannels();

  if (query.data) return { sms: query.data.sms, telegram: query.data.telegram, known: true };
  if (query.isError) return BOTH;
  return { sms: false, telegram: false, known: false };
}

/**
 * `requestPhoneCode` refused because this backend sends no SMS. Without this
 * the refusal read as "Something went wrong" and the SMS door stayed open.
 */
export function isSmsUnavailable(error: unknown): boolean {
  return error instanceof SmsUnavailableError;
}
