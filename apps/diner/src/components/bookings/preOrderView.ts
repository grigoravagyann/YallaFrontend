import {
  asksOnYourWay,
  canClearPreOrder,
  canEditPreOrder,
  type BookingPreOrderFields,
  type OnYourWayInput,
  type PreOrder,
} from '@yalla/api';

/**
 * What a booking says about its pre-order (2026-10-21), from the server's
 * fields alone — `preOrder`, `preOrderEditableUntilUtc` — through the API's
 * rules (`canEditPreOrder`, `canClearPreOrder`). The server's `state` wins;
 * the only thing read off the clock is a window that shut since the read.
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
