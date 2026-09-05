import {
  isConcurrencyConflict,
  isOffline,
  tableConflictFrom,
  ApiError,
  InvalidTransitionError,
  type ConcurrencyConflictError,
  type StaffFloor,
  type StaffGateway,
  type TableActionCommand,
  type TableActionResult,
} from '@yalla/api';
import { localConflict, preconditionHolds } from './reducer';
import { isTableAction, type QueuedCommand } from './types';
import type { CommandAction } from './reducer';

/**
 * Sending one queued command, and deciding what its answer means.
 *
 * The decisions here are the whole substance of the offline story, so they are
 * written as one small function that returns an action rather than as branches
 * scattered through a hook. Four outcomes, and they must stay four:
 *
 * - **Applied** — clear it.
 * - **Already processed** — the server replayed the original response because
 *   it recognised the `clientCommandId`. Clear it *silently*: it is a success.
 *   This is the case a flaky connection produces constantly, where the request
 *   landed and the response did not.
 * - **Precondition failed** — the table moved on. Never applied, never
 *   discarded: it goes to the conflict list where a person decides.
 * - **Could not send** — offline, a timeout, a 500. Stays queued, untouched.
 *   This is the only outcome that leaves the command where it was, and it is
 *   the only one where nothing has been decided.
 */

export interface SendContext {
  readonly gateway: StaffGateway;
  /** The floor as the server most recently reported it, for the local check. */
  readonly floor: StaffFloor | null;
  readonly nowMs: () => number;
  /** Applied results, so the caller can fold tab ids and warnings back in. */
  readonly onResult?: ((result: TableActionResult) => void) | undefined;
}

export async function sendCommand(
  command: QueuedCommand,
  context: SendContext,
): Promise<CommandAction> {
  const { gateway, floor, nowMs } = context;

  // The local precondition check, before the request.
  //
  // This is what makes a *late* queued command different from a live race. The
  // command was taken when the table was free; if the floor now says somebody
  // else seated it, sending would apply a decision made about a world that no
  // longer exists. The server would mostly refuse anyway — but not always, and
  // "mostly" is not a property to build a floor plan on.
  //
  // Only the status is checked here. The row version is deliberately not: it is
  // an opaque token, and a client that compared two of them and decided a
  // command was stale would be inventing a refusal the server never made.
  if (!preconditionHolds(command, floor)) {
    return {
      type: 'conflicted',
      id: command.id,
      observed: localConflict(command, floor),
      reason: 'precondition',
      atMs: nowMs(),
    };
  }

  try {
    switch (command.body.kind) {
      case 'placeOrder':
        await gateway.placeOrder(command.body.command);
        break;
      case 'setOrderStatus':
        await gateway.setOrderStatus(command.body.command);
        break;
      case 'acknowledgeServiceRequest':
        await gateway.acknowledgeServiceRequest(command.body.command);
        break;
      case 'recordCashPayment':
        // Unreachable: the reducer refuses payments entry to the queue. Kept as
        // a loud failure rather than a silent send, so a future change that
        // loosens the queue is caught here instead of at a counter.
        throw new Error('A payment must never be replayed from the queue.');
      default: {
        if (!isTableAction(command.body.kind)) throw new Error('Unknown command kind.');
        const result = await gateway.applyTableAction(withPrecondition(command));
        context.onResult?.(result);
        // `wasReplay` is the server saying it had this command already. Same
        // handling as a fresh success, and the reducer says why.
        return { type: result.wasReplay ? 'replayed' : 'applied', id: command.id };
      }
    }
    return { type: 'applied', id: command.id };
  } catch (error) {
    // Offline, a timeout, a server fault, or anything that is not an answer
    // from the server at all: nothing has been decided, so nothing changes
    // except the attempt count.
    if (isOffline(error) || isServerFault(error) || !isServerAnswer(error)) {
      return { type: 'deferred', id: command.id };
    }

    if (isConcurrencyConflict(error)) {
      const conflict = error as ConcurrencyConflictError;
      return {
        type: 'conflicted',
        id: command.id,
        observed: tableConflictFrom(conflict.currentState),
        // Two different 409s wearing the same status code. `precondition-failed`
        // is the server refusing a command that *waited* — it only checks a
        // precondition because the client said the command was queued — so it
        // can never be the gesture a waiter is still standing in front of, and
        // must not be swallowed as a live race. `table-state-conflict` can be.
        reason: conflict.code === 'precondition-failed' ? 'precondition' : 'conflict',
        atMs: nowMs(),
      };
    }

    if (error instanceof InvalidTransitionError) {
      // 422: not a race, but still not something to discard on the device's own
      // judgment. The waiter sees what was attempted and what the table is now.
      return {
        type: 'conflicted',
        id: command.id,
        observed: tableConflictFrom(error.problem?.context),
        reason: 'refused',
        atMs: nowMs(),
      };
    }

    // Anything else — a 400, a 403, a bad payload. Also a conflict entry rather
    // than a retry loop: retrying a request the server has refused on its
    // merits is how a queue jams and stops delivering everything behind it.
    return {
      type: 'conflicted',
      id: command.id,
      observed: null,
      reason: 'refused',
      atMs: nowMs(),
    };
  }
}

/**
 * The command as the wire wants it: both halves of the precondition, and
 * whether it waited.
 *
 * `queued` is what makes the server insist on a precondition, so getting it
 * wrong in the permissive direction is what lets a stale command land. A
 * command taken with the wifi off has never been *attempted*, so the attempt
 * count alone would report it as a live tap on reconnect — which is exactly the
 * case the flag exists for.
 */
function withPrecondition(command: QueuedCommand): TableActionCommand {
  const body = command.body;
  if (!isTableAction(body.kind)) throw new Error('Not a table action.');
  return {
    ...(body.command as TableActionCommand),
    precondition: command.precondition,
    queued: command.attempts > 0 || command.takenOffline,
  };
}

function isServerFault(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 500;
}

/**
 * Did the server actually answer?
 *
 * Every deliberate refusal a gateway makes is an `ApiError` subclass. Anything
 * else — a bare `TypeError: Failed to fetch`, an aborted request, a bug in the
 * client — is the transport or ourselves, and neither is a verdict on the
 * waiter's action.
 *
 * `isOffline` alone is not enough for this, because it only recognises the
 * failures `ApiClient` has already wrapped. A gateway that throws fetch's own
 * error — a mock, or any future implementation that does not go through the
 * client — would otherwise have a seat command classified as *refused* and moved
 * to the conflict list, where the waiter is asked to adjudicate a wifi drop.
 * Deferring keeps it queued; the attempt counter is what makes a genuinely
 * stuck command visible.
 */
function isServerAnswer(error: unknown): boolean {
  return error instanceof ApiError;
}
