import type { TableActionKind, TableStatus } from '@yalla/api';
import { replayOrder } from './reducer';
import { isTableAction, type CommandState, type ConflictEntry, type QueuedCommand } from './types';

/**
 * Two decisions the conflicts screen makes for a person, written down once
 * (floor tablet phase 4): whose turn a queued command is, and whether "send it
 * anyway" is a safe thing to offer.
 *
 * ## A command waits for the person who took it
 *
 * A tablet is shared, and the queue is the tablet's. A command queued while
 * Narek was signed in, still waiting when Ani signs in, used to be sent under
 * Ani's session: the floor's history, and the kitchen ticket's "sent by",
 * named Ani for Narek's tap. Holding everything for Narek would starve a table
 * of its food if Narek has gone home; sending it silently is the bug.
 *
 * So a command is **held** while somebody else is signed in: it is not sent,
 * and neither is anything behind it on the same table or tab, whose
 * precondition was built on it. It goes by itself the moment Narek signs in
 * again. Meanwhile it is on the conflicts screen, where Ani can send it under
 * her own name — one tap, and the server then records her, truthfully — or
 * drop it. Cash never queues at all (`types.ts`), so no payment can be sent
 * under the wrong person by any path.
 *
 * ## "Send it anyway" only where it cannot hurt
 *
 * Re-sending drops the precondition; the server still checks the move is
 * legal from where the table is now, and it records only successes, so the
 * same command id is judged afresh, and it goes as a live decision (not
 * `queued`). It is offered when the move is still legal and acts on nobody —
 * seating a party at a table that is free again, a hold, out of service and
 * back. A table held for a late booking is somebody's, so nothing is sent
 * "anyway" onto it. It is never offered where it would act on whoever
 * is at the table now (free, release a hold, seat the held party: the only
 * way those are legal again is another party), never for an order (it puts
 * money on a bill: take the order again instead), and never where the server
 * would give the same answer — an outright refusal, a move somebody else has
 * already made.
 */

/** Is this command waiting for somebody other than the person signed in? */
export function isHeld(command: QueuedCommand, actorId: string | null): boolean {
  return Boolean(actorId && command.by && command.by.staffMemberId !== actorId);
}

/** The queued commands that wait for somebody else, in replay order. */
export function heldFor(state: CommandState, actorId: string | null): readonly QueuedCommand[] {
  return replayOrder(state).filter((command) => isHeld(command, actorId));
}

/**
 * What may be sent now, in replay order: everything but a held command and
 * whatever queued behind it in its scope — the next command on that table
 * was taken against the state the held one leaves.
 */
export function sendableInOrder(
  state: CommandState,
  actorId: string | null,
): readonly QueuedCommand[] {
  const blocked = new Set<string>();
  const sendable: QueuedCommand[] = [];
  for (const command of replayOrder(state)) {
    if (blocked.has(command.scope)) continue;
    if (isHeld(command, actorId)) {
      blocked.add(command.scope);
      continue;
    }
    sendable.push(command);
  }
  return sendable;
}

export type SendAnyway =
  | { readonly offer: true }
  | {
      readonly offer: false;
      /**
       * - `money` — an order: it changes a bill.
       * - `otherParty` — it would act on whoever is at the table now.
       * - `notFromHere` — the table is somewhere the move cannot start from.
       * - `sameAnswer` — the server would refuse it again, or somebody did it already.
       */
      readonly because: 'money' | 'otherParty' | 'notFromHere' | 'sameAnswer';
    };

/** Moves that act on the party at the table, not on the table itself. */
const ON_A_PARTY: ReadonlySet<TableActionKind> = new Set<TableActionKind>([
  'freeTable',
  'releaseHold',
  'seatHeldParty',
]);

/** Where each move may start, as the server's `TableStatusTransitions` allows. */
const LEGAL_FROM: Readonly<Record<TableActionKind, readonly TableStatus[]>> = {
  seatWalkIn: ['free', 'held'],
  seatReservation: ['free', 'held'],
  seatHeldParty: ['held'],
  hold: ['free'],
  releaseHold: ['held'],
  freeTable: ['occupied'],
  outOfService: ['free', 'held'],
  returnToService: ['outOfService'],
};

/**
 * Where "anyway" may start: a table nobody is waiting for. The server lets a
 * walk-in be seated, or the table closed, over a hold — but a held table is
 * held for a late booking, and that is acting on a party (FT4 review S1).
 */
const ANYWAY_FROM: Readonly<Partial<Record<TableActionKind, readonly TableStatus[]>>> = {
  seatWalkIn: ['free'],
  seatReservation: ['free'],
  hold: ['free'],
  outOfService: ['free'],
  returnToService: ['outOfService'],
};

export function canSendAnyway(entry: ConflictEntry): SendAnyway {
  const kind = entry.command.body.kind;
  if (kind === 'placeOrder' || kind === 'recordCashPayment')
    return { offer: false, because: 'money' };
  if (!isTableAction(kind)) return { offer: false, because: 'sameAnswer' };
  if (ON_A_PARTY.has(kind)) return { offer: false, because: 'otherParty' };
  // A 422, a 404, a 403: refused on the move's own merits, again next time.
  if (entry.reason === 'refused') return { offer: false, because: 'sameAnswer' };
  const now = entry.observed?.currentStatus;
  if (now === 'held') return { offer: false, because: 'otherParty' };
  if (now && !LEGAL_FROM[kind].includes(now)) return { offer: false, because: 'notFromHere' };
  if (now && !(ANYWAY_FROM[kind] ?? []).includes(now)) {
    return { offer: false, because: 'notFromHere' };
  }
  return { offer: true };
}
