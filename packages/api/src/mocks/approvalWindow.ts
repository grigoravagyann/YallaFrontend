import { zonedParts, type TimeZone } from '@yalla/format';
import { APPROVAL_WINDOW_MINUTES } from '../contracts/approvals';

/**
 * The server's booking-approval rules, as every mock applies them.
 *
 * Three mocks book or decide — the diner's, the floor tablet's and the
 * console's — and each has to agree with the others and with the server about
 * which booking waits and for how long. One copy, so the diner's "answer within
 * 14:05" and the tablet's countdown are the same number.
 */

export const APPROVAL_WINDOW_MS = APPROVAL_WINDOW_MINUTES * 60_000;

/** The short-notice rule, from the contract every surface reads it from. */
export { isShortNotice } from '../contracts/approvals';

/**
 * When the floor's answer window closes: fifteen minutes from the request, or
 * the booking's own start if that comes first — a booking cannot be approved
 * after it has begun.
 */
export function approvalExpiryFor(
  createdAt: Date,
  startUtc: string,
  windowMs: number = APPROVAL_WINDOW_MS,
): string {
  const window = createdAt.getTime() + windowMs;
  const start = new Date(startUtc).getTime();
  return new Date(Math.min(window, start)).toISOString();
}

/** Whether a request with this window, for this start, can no longer be answered. */
export function answerWindowClosed(
  approvalExpiresAtUtc: string | null,
  startUtc: string,
  now: Date,
): boolean {
  const t = now.getTime();
  if (t >= new Date(startUtc).getTime()) return true;
  return approvalExpiresAtUtc !== null && t >= new Date(approvalExpiresAtUtc).getTime();
}

/** `YYYY-MM-DD` and `HH:mm:ss` at the branch, as `ReservationView` writes them. */
export function localDateAndTime(
  startUtc: string,
  timeZoneId: string,
): { readonly localDate: string; readonly localStartTime: string } {
  const parts = zonedParts(new Date(startUtc), timeZoneId as TimeZone);
  const two = (value: number) => String(value).padStart(2, '0');
  return {
    localDate: `${parts.year}-${two(parts.month)}-${two(parts.day)}`,
    localStartTime: `${two(parts.hour)}:${two(parts.minute)}:00`,
  };
}
