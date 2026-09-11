import type { PlaceOrderResult } from '@yalla/api';
import { orderFailureKind, type OrderFailure } from '../tab/ordering';
import { commandFor, type TrayAction, type TrayState } from './tray';

/**
 * Sending the tray: one order, under a command id bound to what is in it.
 *
 * Lifted out of the tray screen so the one thing on it that can place an order
 * twice is tested rather than tapped through. The screen supplies the request
 * and the connection; what a failure means is decided here.
 */

export type SendOutcome =
  | { readonly ok: true; readonly result: PlaceOrderResult }
  | { readonly ok: false; readonly kind: OrderFailure; readonly error: unknown };

export interface SendTrayInput {
  readonly tray: TrayState;
  readonly newCommandId: () => string;
  readonly dispatch: (action: TrayAction) => void;
  /** The phone's connection as it is known right now: `onlineManager.isOnline`. */
  readonly isOnline: () => boolean;
  /** Places the tray under this command id. */
  readonly place: (clientCommandId: string) => Promise<PlaceOrderResult>;
  readonly nowMs: () => number;
}

export async function sendTray(input: SendTrayInput): Promise<SendOutcome> {
  // The same id for the same contents, so a resend cannot place it twice.
  const { commandId, fingerprint } = commandFor(input.tray, input.newCommandId);
  input.dispatch({ type: 'sending', commandId, fingerprint });

  // Read as the request leaves, never after it has failed. The diner app sends
  // mutations whatever the connection (`mutationNetworkMode: 'always'`), so this
  // is the moment the POST goes. Read in the failure instead, a signal lost
  // after the order reached the kitchen — NetInfo flips offline before fetch
  // gives up — said "not placed", dropped the id, and the next Send placed the
  // order a second time.
  const onlineAtSend = input.isOnline();

  try {
    const result = await input.place(commandId);
    input.dispatch({
      type: 'sent',
      order: {
        orderId: result.orderId,
        estimatedReadyAtUtc: result.estimatedReadyAtUtc,
        atMs: input.nowMs(),
      },
    });
    return { ok: true, result };
  } catch (error) {
    const kind = orderFailureKind(error, onlineAtSend);
    input.dispatch({ type: 'sendFailed', uncertain: kind === 'uncertain' });
    return { ok: false, kind, error };
  }
}
