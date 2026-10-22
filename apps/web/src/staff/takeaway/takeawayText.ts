import {
  ApiError,
  TakeawayNoShowTooEarlyError,
  TakeawayStatusConflictError,
  ValidationError,
  isOffline,
  takeawayItemCount,
  type StaffTakeawayOrder,
} from '@yalla/api';
import type { TFunction } from 'i18next';

/**
 * The takeaway counter's words that more than one card needs: a refusal, and
 * the answer countdown.
 */

/** A refused move at the counter, in the floor's words. */
export function takeawayFailureText(
  t: TFunction,
  error: unknown,
  time: (iso: string) => string,
): string {
  if (error instanceof TakeawayStatusConflictError) return t('takeaway.error.moved');
  if (error instanceof TakeawayNoShowTooEarlyError) {
    return error.noShowFromUtc
      ? t('takeaway.error.noShowTooEarly', { time: time(error.noShowFromUtc) })
      : t('takeaway.error.noShowTooEarlyPlain');
  }
  if (error instanceof ValidationError) return t('takeaway.error.invalid');
  if (error instanceof ApiError && isOffline(error)) return t('takeaway.error.offline');
  return t('takeaway.error.generic');
}

/**
 * "4:12" to the accept deadline, by the second; `null` with no deadline
 * (auto-accept). Expired at zero: the server declines it at its own instant.
 */
export function answerCountdown(
  deadlineUtc: string | null,
  now: Date,
): { readonly label: string; readonly urgent: boolean; readonly expired: boolean } | null {
  if (!deadlineUtc) return null;
  const left = Math.max(0, Math.ceil((Date.parse(deadlineUtc) - now.getTime()) / 1000));
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  return {
    label: `${minutes}:${String(seconds).padStart(2, '0')}`,
    urgent: left <= 60,
    expired: left === 0,
  };
}

/** "Ani M. · 4 items". */
export function whoAndItems(t: TFunction, order: StaffTakeawayOrder): string {
  return t('takeaway.who', { name: order.guestName, count: takeawayItemCount(order.lines) });
}
