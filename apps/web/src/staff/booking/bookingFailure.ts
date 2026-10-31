import {
  ApiError,
  BookingBusyError,
  BookingRejectedError,
  BranchUnavailableError,
  LeadTimeExceededError,
  TableTakenError,
  ValidationError,
  isOffline,
  timeFullGuestsLeft,
} from '@yalla/api';
import type { TFunction } from 'i18next';

/**
 * Why a booking taken by hand was refused, as a kind the sheet words (2026-10-31).
 *
 * Not copy: each kind is one sentence in the staff namespace
 * (`newBooking.failed.*`), and the sheet decides what to clear — a taken
 * table sends the staff back to the tables, a closed time back to the times.
 */
export type NewBookingFailure =
  | { readonly kind: 'tableTaken' }
  | { readonly kind: 'tableOccupied' }
  | { readonly kind: 'closed' }
  | { readonly kind: 'past' }
  | { readonly kind: 'tooFarAhead' }
  | { readonly kind: 'tooSmall' }
  | { readonly kind: 'outOfService' }
  | { readonly kind: 'timeFull'; readonly guestsLeft: number }
  | { readonly kind: 'busy' }
  | { readonly kind: 'notTaking' }
  | { readonly kind: 'invalid'; readonly field: string | null }
  | { readonly kind: 'offline' }
  | { readonly kind: 'generic' };

export function newBookingFailure(error: unknown): NewBookingFailure {
  if (error instanceof TableTakenError) {
    return { kind: error.reason === 'occupied' ? 'tableOccupied' : 'tableTaken' };
  }
  if (error instanceof LeadTimeExceededError) return { kind: 'past' };
  if (error instanceof BookingBusyError) return { kind: 'busy' };
  if (error instanceof BranchUnavailableError) return { kind: 'notTaking' };
  if (error instanceof BookingRejectedError) {
    switch (error.reason) {
      case 'closed':
      case 'invalidTime':
        return { kind: 'closed' };
      case 'pastLeadTime':
        return { kind: 'past' };
      case 'tooFarAhead':
        return { kind: 'tooFarAhead' };
      case 'tooSmall':
      case 'tooLarge':
        return { kind: 'tooSmall' };
      case 'outOfService':
        return { kind: 'outOfService' };
      case 'alreadyBooked':
      case 'occupied':
      case 'held':
        return { kind: 'tableTaken' };
      default:
        return { kind: 'generic' };
    }
  }
  const guestsLeft = timeFullGuestsLeft(error);
  if (guestsLeft !== null) return { kind: 'timeFull', guestsLeft };
  if (error instanceof ValidationError) return { kind: 'invalid', field: error.field };
  if (error instanceof ApiError && isOffline(error)) return { kind: 'offline' };
  if (error instanceof TypeError) return { kind: 'offline' };
  return { kind: 'generic' };
}

/** The sentence the sheet says for a refusal. */
export function newBookingFailureText(t: TFunction, failure: NewBookingFailure): string {
  switch (failure.kind) {
    case 'timeFull':
      return failure.guestsLeft > 0
        ? t('newBooking.failed.timeFull', { count: failure.guestsLeft })
        : t('newBooking.failed.timeFullNone');
    case 'invalid':
      return t('newBooking.failed.invalid');
    default:
      return t(`newBooking.failed.${failure.kind}`);
  }
}

/**
 * A phone number as the keypad types it, made E.164 where it can be read as
 * an Armenian one: `091 77 88 99` and `374 91 77 88 99` are `+37491778899`.
 * Anything else is kept as typed, spaces out — the server takes up to 32
 * characters and the taker is the one who dials it.
 */
export function normalisePhone(raw: string): string {
  const compact = raw.replace(/[\s\-().]/gu, '');
  if (/^0\d{8}$/u.test(compact)) return `+374${compact.slice(1)}`;
  if (/^374\d{8}$/u.test(compact)) return `+${compact}`;
  if (/^00374\d{8}$/u.test(compact)) return `+${compact.slice(2)}`;
  return compact;
}

/** `YYYY-MM-DD` plus whole days, as another key. */
export function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
