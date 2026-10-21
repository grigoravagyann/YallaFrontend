import { formatTime, type Locale, type TimeZone } from '@yalla/format';
import { OnMyWayNotOpenError } from './errors';
import {
  asksOnYourWay,
  canClearPreOrder,
  canEditPreOrder,
  preOrderFailure,
  type BookingPreOrderFields,
  type OnYourWayInput,
  type PreOrder,
} from './preOrder';
import type { CopyLine } from './reservation';

/**
 * What a booking says about its pre-order (2026-10-21), from the server's
 * fields alone — `preOrder`, `preOrderEditableUntilUtc` — through the API's
 * rules (`canEditPreOrder`, `canClearPreOrder`). The server's `state` wins;
 * the only thing read off the clock is a window that shut since the read.
 * The app's booking screen and the manage link both decide from this.
 *
 * - `offer`: none yet, and one may be added (the branch takes them, the window is open).
 * - `editable`: one there, `canEdit` while the branch takes them, `canClear` while its window is open.
 * - `locked` / `sent` / `notComing` / `cancelled`: said as they are, read-only.
 * - `unknown`: a state a newer server added — the dishes, and nothing offered.
 */
export type PreOrderViewState =
  | { readonly kind: 'none' }
  | { readonly kind: 'offer'; readonly editableUntilUtc: string }
  | {
      readonly kind: 'editable';
      readonly preOrder: PreOrder;
      readonly canEdit: boolean;
      readonly canClear: boolean;
      readonly editableUntilUtc: string;
    }
  | {
      readonly kind: 'locked' | 'sent' | 'notComing' | 'cancelled' | 'unknown';
      readonly preOrder: PreOrder;
    };

export function preOrderView(booking: BookingPreOrderFields, now: Date): PreOrderViewState {
  const preOrder = booking.preOrder;
  if (!preOrder) {
    return canEditPreOrder(booking, now) && booking.preOrderEditableUntilUtc
      ? { kind: 'offer', editableUntilUtc: booking.preOrderEditableUntilUtc }
      : { kind: 'none' };
  }
  if (preOrder.state === 'editable') {
    const canEdit = canEditPreOrder(booking, now);
    const canClear = canClearPreOrder(booking, now);
    if (!canEdit && !canClear) return { kind: 'locked', preOrder };
    return {
      kind: 'editable',
      preOrder,
      canEdit,
      canClear,
      editableUntilUtc: booking.preOrderEditableUntilUtc ?? preOrder.editableUntilUtc,
    };
  }
  return { kind: preOrder.state, preOrder };
}

/**
 * Why the editor may not be open on this booking now, or `null` while it may
 * (`offer`, or `editable` with `canEdit`). For an editor that closes under the
 * guest — the window shut while they chose, or a save's 409 was followed by a
 * read that says why — so the screen says what happened rather than dropping
 * the draft without a word. Keys in the **`diner`** namespace.
 */
export function preOrderEditorClosedLine(
  booking: BookingPreOrderFields,
  now: Date,
): CopyLine | null {
  const view = preOrderView(booking, now);
  const until = booking.preOrderEditableUntilUtc ?? booking.preOrder?.editableUntilUtc;
  const windowShut = Boolean(until) && now.getTime() >= Date.parse(until!);
  switch (view.kind) {
    case 'offer':
      return null;
    case 'editable':
      if (view.canEdit) return null;
      return {
        key: windowShut ? 'preOrder.error.locked' : 'preOrder.error.notAccepted',
        params: {},
      };
    case 'none':
      return {
        key: windowShut ? 'preOrder.error.locked' : 'preOrder.error.notAccepted',
        params: {},
      };
    case 'locked':
      return { key: 'preOrder.error.locked', params: {} };
    case 'sent':
      return { key: 'preOrder.error.alreadySent', params: {} };
    default:
      return { key: 'preOrder.error.notChangeable', params: {} };
  }
}

/**
 * The tone a read-only pre-order's state is said in: `ok` (green) for locked
 * or on its way, `wait` (amber) for held because nobody answered, `off`
 * (grey) for cancelled, and `neutral` for a sent one whose ticket the venue
 * took off — neither good news nor a failure. `null` where nothing is said.
 */
export function preOrderStateTone(
  view: PreOrderViewState,
  kitchen: PreOrder['kitchenStatus'],
): 'ok' | 'wait' | 'off' | 'neutral' | null {
  switch (view.kind) {
    case 'locked':
      return 'ok';
    case 'sent':
      return kitchen === 'voided' ? 'neutral' : 'ok';
    case 'notComing':
      return 'wait';
    case 'cancelled':
      return 'off';
    default:
      return null;
  }
}

/**
 * "Are you on your way?" on the booking: `ask` from 45 minutes before
 * (`asksOnYourWay`), `confirmed` once the guest said yes and the booking is
 * still to be sat ("the waiter knows"), and nothing otherwise.
 */
export function onYourWayView(booking: OnYourWayInput, now: Date): 'ask' | 'confirmed' | 'none' {
  if (asksOnYourWay(booking, now)) return 'ask';
  const preOrder = booking.preOrder;
  if (
    booking.guestConfirmedOnWayAtUtc &&
    booking.status === 'confirmed' &&
    preOrder &&
    preOrder.state !== 'cancelled'
  ) {
    return 'confirmed';
  }
  return 'none';
}

/**
 * A failed "Yes, I'm on my way", as the sentence to show. Too early — a push
 * from before the booking moved, tapped long after — says when the answer
 * opens ("You can confirm from 17:30", the branch's clock) when the server
 * named it; every other refusal reads as `preOrderFailure` says it.
 */
export function onMyWayFailureLine(
  error: unknown,
  timeZoneId: TimeZone,
  locale: Locale,
  now: Date = new Date(),
): CopyLine {
  if (error instanceof OnMyWayNotOpenError && error.opensAtUtc) {
    const opensAt = Date.parse(error.opensAtUtc);
    if (Number.isFinite(opensAt) && opensAt > now.getTime()) {
      return {
        key: 'preOrder.error.onMyWayOpensAt',
        params: { time: formatTime(error.opensAtUtc, timeZoneId, locale) },
      };
    }
  }
  return preOrderFailure(error, timeZoneId, locale).line;
}
