import { newCommandId, type PlaceOrderLine, type StaffFloor } from '@yalla/api';
import type { TFunction } from 'i18next';
import { useCallback, useMemo, useState } from 'react';
import type { CommandRefusal, OrderRefusal } from '../commands/types';
import type { CommandQueue } from '../commands/useCommandQueue';
import type { OrderSent } from '../OrderEntry';
import type { SetNotice } from './notices';

/**
 * An order's refusal as the order screen words it. A queued order is only
 * ever refused with its own reasons (`sync.ts`); anything else reads "other".
 */
function orderRefusalOf(refusal: CommandRefusal | undefined): OrderRefusal {
  return refusal &&
    refusal.kind !== 'notFound' &&
    refusal.kind !== 'forbidden' &&
    refusal.kind !== 'lineAlreadyPaid' &&
    refusal.kind !== 'featureOff'
    ? refusal
    : { kind: 'other' };
}

export interface UseOrderSendOptions {
  readonly activeTabId: string | null;
  readonly activeTableId: string | null;
  readonly plan: StaffFloor['plan'] | null;
  readonly queue: CommandQueue;
  readonly t: TFunction;
  readonly setNotice: SetNotice;
}

/**
 * Order entry's send: the order through the queue, and what became of it.
 */
export function useOrderSend({
  activeTabId,
  activeTableId,
  plan,
  queue,
  t,
  setNotice,
}: UseOrderSendOptions) {
  /**
   * The order just sent from order entry, while its confirmation is up. What
   * became of it is read off the queue, so the card follows it from "on its
   * way" (or "kept on the tablet") to "the kitchen has it" or "refused".
   */
  const [orderSend, setOrderSend] = useState<{
    readonly id: string;
    readonly count: number;
    readonly atUtc: string;
  } | null>(null);

  const submitOrder = useCallback(
    (lines: readonly PlaceOrderLine[]) => {
      if (!activeTabId) {
        // There is no way for a waiter to open a tab: `POST /api/tabs/open`
        // takes the QR token printed on the table. Said plainly rather than
        // queueing an order against a tab id that does not exist.
        setNotice({ kind: 'info', text: t('order.noTab') });
        return;
      }

      const clientCommandId = newCommandId();
      const count = lines.reduce((sum, line) => sum + line.quantity, 0);
      queue.enqueue({
        id: clientCommandId,
        scope: activeTabId,
        precondition: null,
        subject: {
          tableId: activeTableId,
          tableLabel: plan?.tables.find((table) => table.id === activeTableId)?.label ?? null,
          tabId: activeTabId,
          itemCount: count,
        },
        body: {
          kind: 'placeOrder',
          command: { tabId: activeTabId, clientCommandId, lines, shape: 2 },
        },
      });
      queue.sync();
      // Order entry stays up and says what became of it.
      setOrderSend({ id: clientCommandId, count, atUtc: new Date().toISOString() });
    },
    [activeTabId, activeTableId, plan, queue, t, setNotice],
  );

  const orderSent = useMemo((): OrderSent | null => {
    if (!orderSend) return null;
    const conflict = queue.state.conflicts.find((entry) => entry.command.id === orderSend.id);
    const waiting = queue.state.queue.some((command) => command.id === orderSend.id);
    return {
      count: orderSend.count,
      atUtc: orderSend.atUtc,
      state: conflict ? 'refused' : waiting ? (queue.online ? 'sending' : 'saved') : 'sent',
      refusal: conflict ? orderRefusalOf(conflict.refusal) : null,
    };
  }, [orderSend, queue.state, queue.online]);

  return { orderSend, setOrderSend, submitOrder, orderSent };
}
