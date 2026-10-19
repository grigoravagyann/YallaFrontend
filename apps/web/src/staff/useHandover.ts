import { queryKeys } from '@yalla/api/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { isHeld } from './commands/conflictPolicy';
import type { CommandQueue } from './commands/useCommandQueue';
import type { QueuedCommand } from './commands/types';
import { firstName } from './kitchenBoard';

/**
 * What a tablet changing hands needs on the screens that send commands (floor
 * tablet phase 4, FT4 review S2 and live QA 5).
 */

/** Whose a held command is, in the words a mark has room for. */
export function heldName(command: QueuedCommand): string {
  return firstName(command.by?.name ?? '');
}

/**
 * The person each held command waits for, by table and by order: the marks
 * that say "waiting for Ani" where a waiter would otherwise read "not sent".
 */
export function useHeldMarks(queue: CommandQueue): {
  readonly tables: ReadonlyMap<string, string>;
  readonly orders: ReadonlyMap<string, string>;
} {
  return useMemo(() => {
    const tables = new Map<string, string>();
    const orders = new Map<string, string>();
    for (const command of queue.held) {
      if (command.subject.tableId) tables.set(command.subject.tableId, heldName(command));
      if (command.body.kind === 'setOrderStatus') {
        orders.set(command.body.command.orderId, heldName(command));
      }
    }
    return { tables, orders };
  }, [queue.held]);
}

/**
 * Says so when the person signed in queues something behind a command that
 * waits for somebody else. It does not go until that one is decided, and
 * otherwise the only sign was a "not sent" that never cleared.
 */
export function useBehindHeldNotice(
  queue: CommandQueue,
  actorId: string | null,
  notify: (command: QueuedCommand, waitingFor: string) => void,
): void {
  const told = useRef(new Set<string>());
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  });

  const commands = queue.state.queue;
  useEffect(() => {
    for (const command of commands) {
      if (told.current.has(command.id) || isHeld(command, actorId)) continue;
      const ahead = commands.find(
        (other) =>
          other.scope === command.scope && other.seq < command.seq && isHeld(other, actorId),
      );
      if (!ahead) continue;
      told.current.add(command.id);
      notifyRef.current(command, heldName(ahead));
    }
  }, [commands, actorId]);
}

/**
 * Locked: no read goes out. The staff queries are disabled under the PIN gate,
 * but a read the tablet asked for while offline is *paused*, not dropped, and
 * TanStack resumes a paused fetch when the connection returns whether or not
 * the query is still enabled — so a reconnect at the gate sent the floor read
 * with no token, and got a 401. Cancelling on lock drops them.
 */
export function useCancelReadsWhileLocked(paused: boolean, branchId: string): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!paused) return;
    for (const queryKey of [
      queryKeys.staffFloor(branchId),
      queryKeys.orderQueue(branchId),
      queryKeys.serviceRequests(branchId),
      queryKeys.awaitingApproval(branchId),
      ['staff', 'tab'],
      ['staff', 'tabLines'],
    ]) {
      void queryClient.cancelQueries({ queryKey });
    }
  }, [paused, branchId, queryClient]);
}
