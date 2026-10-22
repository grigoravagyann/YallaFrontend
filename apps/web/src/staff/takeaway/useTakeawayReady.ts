import type { OrderQueueEntry } from '@yalla/api';
import { useMarkTakeawayOrderReady } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useRef, useState } from 'react';
import { takeawayFailureText } from './takeawayText';

/**
 * The kitchen's "Ready" on a takeaway ticket (2026-10-22), for the kitchen's
 * own screen and the waiter's Kitchen tab: `markTakeawayOrderReady`, online
 * only, one tap per ticket at a time. What became of it is said in the
 * screen's notice.
 */
export function useTakeawayReady(
  branchId: string | undefined,
  say: (text: string) => void,
  time: (iso: string) => string,
): {
  readonly marking: ReadonlySet<string>;
  readonly markReady: (order: OrderQueueEntry) => void;
} {
  const { t } = useTranslation(['staff', 'common']);
  const mark = useMarkTakeawayOrderReady(branchId);
  const [marking, setMarking] = useState<ReadonlySet<string>>(() => new Set());
  /** Taps already on their way: two in one frame are one request. */
  const sending = useRef(new Set<string>());

  const markReady = useCallback(
    (order: OrderQueueEntry) => {
      const id = order.orderId;
      if (sending.current.has(id)) return;
      sending.current.add(id);
      setMarking(new Set(sending.current));
      const code = order.takeaway?.code ?? order.tableLabel;
      const settle = () => {
        sending.current.delete(id);
        setMarking(new Set(sending.current));
      };
      mark.mutate(id, {
        onSuccess: () => {
          settle();
          say(t('kitchen.takeaway.readyNotice', { code }));
        },
        onError: (error) => {
          settle();
          say(`${code} · ${takeawayFailureText(t, error, time)}`);
        },
      });
    },
    [mark, say, t, time],
  );

  return { marking, markReady };
}
