import {
  BookingBlockedNoShowsError,
  PhoneNotVerifiedError,
  TakeawayBusyError,
  TakeawayClosedError,
  TakeawayItemsUnavailableError,
  TakeawayNotAcceptedError,
  TakeawaySlotUnavailableError,
  TakeawayStatusConflictError,
  UnauthorizedError,
  ValidationError,
  isFeatureNotEnabled,
  isOffline,
  type MenuItemDetail,
  type TakeawayStatus,
} from '@yalla/api';
import type { Locale } from '@yalla/format';
import { deviceTimeZone } from '../deviceTimeZone';
import { blockedLine } from '../lib/guestRecord';

/**
 * Why a takeaway send or cancel did not go through, as the screen acts on it.
 *
 * Every refusal the server can give has its own friendly sentence and, where
 * there is one, its own way on: sign in, prove the number, pick a later
 * time, take the named dishes out. Nothing here is a raw server message.
 */
export type TakeawayFailure =
  | { readonly kind: 'signIn' }
  | { readonly kind: 'verify' }
  /**
   * Paused for no-shows — a takeaway order not collected counts as one — so no
   * takeaway either, until then (ISO UTC; null when the server did not say).
   */
  | { readonly kind: 'blocked'; readonly blockedUntilUtc: string | null }
  /** The venue switched takeaway off since the page was read. */
  | { readonly kind: 'notAccepted' }
  /** Shut now, or past the last order; when it opens again, if within the week. */
  | { readonly kind: 'closed'; readonly opensAt: string | null }
  /** ASAP while the kitchen is full: a later time may still be offered. */
  | { readonly kind: 'busy' }
  /** That quarter hour has gone; the ones on offer now. */
  | { readonly kind: 'slot'; readonly at: string | null; readonly slots: readonly string[] }
  /** Dishes that cannot be taken away, each named by its menu id. */
  | { readonly kind: 'items'; readonly menuItemIds: readonly string[] }
  /** The order moved on (the venue answered before the cancel landed). */
  | { readonly kind: 'conflict'; readonly status: TakeawayStatus }
  /** Over a limit the screen should have held: too many dishes, a long note. */
  | { readonly kind: 'invalid' }
  /** It never reached the server, or it may not have: try again (same order, same id). */
  | { readonly kind: 'offline' }
  | { readonly kind: 'unknown' };

export function takeawayFailure(error: unknown): TakeawayFailure {
  if (error instanceof UnauthorizedError) return { kind: 'signIn' };
  if (error instanceof PhoneNotVerifiedError) return { kind: 'verify' };
  if (error instanceof BookingBlockedNoShowsError) {
    return { kind: 'blocked', blockedUntilUtc: error.blockedUntilUtc };
  }
  // The platform has not enabled takeaway here (2026-10-27): to the guest,
  // the same as a place that takes no takeaway.
  if (error instanceof TakeawayNotAcceptedError || isFeatureNotEnabled(error)) {
    return { kind: 'notAccepted' };
  }
  if (error instanceof TakeawayClosedError) return { kind: 'closed', opensAt: error.opensAt };
  if (error instanceof TakeawayBusyError) return { kind: 'busy' };
  if (error instanceof TakeawaySlotUnavailableError) {
    return { kind: 'slot', at: error.at, slots: error.slots };
  }
  if (error instanceof TakeawayItemsUnavailableError) {
    return { kind: 'items', menuItemIds: error.items.map((item) => item.menuItemId) };
  }
  if (error instanceof TakeawayStatusConflictError) {
    return { kind: 'conflict', status: error.orderStatus };
  }
  if (error instanceof ValidationError) return { kind: 'invalid' };
  if (isOffline(error)) return { kind: 'offline' };
  return { kind: 'unknown' };
}

export interface FailureLine {
  readonly key: string;
  readonly params?: Record<string, string | number>;
}

/**
 * The sentence for a failed send. `names` reads a menu id as its dish's name
 * (the cart's), so "Khashlama is not available to take away" names the dish.
 * A pause for no-shows is said in the booking's own sentence, on the phone's
 * clock, as the booking screens say it (`locale` for its date and time).
 */
export function sendFailureLine(
  failure: TakeawayFailure,
  names: (menuItemId: string) => string | null = () => null,
  locale?: Locale,
): FailureLine {
  switch (failure.kind) {
    case 'signIn':
      return { key: 'takeaway.error.signIn' };
    case 'verify':
      return { key: 'takeaway.error.verify' };
    case 'blocked':
      return failure.blockedUntilUtc && locale
        ? blockedLine(failure.blockedUntilUtc, deviceTimeZone(), locale)
        : { key: 'confirm.error.blockedNoShowsPlain' };
    case 'notAccepted':
      return { key: 'takeaway.error.notAccepted' };
    case 'closed':
      return failure.opensAt
        ? { key: 'takeaway.error.closedUntil', params: { time: failure.opensAt } }
        : { key: 'takeaway.error.closed' };
    case 'busy':
      return { key: 'takeaway.error.busy' };
    case 'slot':
      return failure.slots.length > 0
        ? { key: 'takeaway.error.slot' }
        : { key: 'takeaway.error.slotNone' };
    case 'items': {
      const named = failure.menuItemIds.map(names).filter((name): name is string => !!name);
      return named.length > 0
        ? { key: 'takeaway.error.items', params: { names: named.join(', ') } }
        : { key: 'takeaway.error.itemsPlain' };
    }
    case 'conflict':
      return { key: 'takeaway.error.conflict' };
    case 'invalid':
      return { key: 'takeaway.error.invalid' };
    case 'offline':
      return { key: 'takeaway.error.offline' };
    default:
      return { key: 'takeaway.error.unknown' };
  }
}

/** The sentence for a failed cancel: the venue took it already, or try again. */
export function cancelFailureLine(failure: TakeawayFailure): FailureLine {
  if (failure.kind === 'conflict') return { key: 'takeaway.status.cancelTooLate' };
  if (failure.kind === 'offline') return { key: 'takeaway.error.offline' };
  return { key: 'takeaway.status.cancelFailed' };
}

/** A name lookup over the dishes in a cart, for {@link sendFailureLine}. */
export function namesFrom(items: readonly Pick<MenuItemDetail, 'id' | 'name'>[]) {
  return (menuItemId: string) => items.find((item) => item.id === menuItemId)?.name ?? null;
}
