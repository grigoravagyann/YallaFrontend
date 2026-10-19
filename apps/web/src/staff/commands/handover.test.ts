import {
  ApiError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  type StaffGateway,
  type TableActionCommand,
} from '@yalla/api';
import { describe, expect, it, vi } from 'vitest';
import { canSendAnyway, heldFor, isHeld } from './conflictPolicy';
import { commandReducer, initialCommandState, type CommandAction } from './reducer';
import { sendCommand, withPrecondition } from './sync';
import type {
  CommandAuthor,
  CommandState,
  ConflictEntry,
  NewCommand,
  QueuedCommand,
} from './types';

/**
 * Whose a queued command is, and what may be done with it on the conflicts
 * screen (floor tablet phase 4).
 *
 * A tablet is shared. A command queued while Narek was signed in used to be
 * sent under whoever signed in next — so the floor's audit, and now the
 * kitchen ticket's "sent by", named the wrong person. A command now carries
 * who took it, waits for them, and goes under somebody else's name only when
 * that person says so.
 */

const NAREK: CommandAuthor = { staffMemberId: 's-narek', name: 'Narek Hakobyan' };
const ANI: CommandAuthor = { staffMemberId: 's-ani', name: 'Ani Petrosyan' };

function seat(id: string, tableId = 't4'): NewCommand {
  const command: TableActionCommand = {
    kind: 'seatWalkIn',
    branchId: 'b1',
    tableId,
    clientCommandId: id,
    partySize: 2,
  };
  return {
    id,
    scope: tableId,
    precondition: { expectedFromStatus: 'free', rowVersion: 'v1' },
    subject: { tableId, tableLabel: tableId.slice(1), tabId: null },
    body: { kind: 'seatWalkIn', command },
  };
}

function run(state: CommandState, ...actions: CommandAction[]): CommandState {
  return actions.reduce(commandReducer, state);
}

function queued(state: CommandState, id: string): QueuedCommand {
  return state.queue.find((command) => command.id === id)!;
}

describe('who took a queued command', () => {
  it('is kept with it', () => {
    const state = run(initialCommandState, {
      type: 'enqueued',
      command: seat('c1'),
      atMs: 1,
      takenOffline: true,
      by: NAREK,
    });
    expect(queued(state, 'c1').by).toEqual(NAREK);
  });

  it("holds Narek's command while Ani is signed in, and nobody's before this was kept", () => {
    const state = run(
      initialCommandState,
      { type: 'enqueued', command: seat('c1'), atMs: 1, takenOffline: true, by: NAREK },
      { type: 'enqueued', command: seat('c2', 't5'), atMs: 2, takenOffline: true, by: ANI },
      { type: 'enqueued', command: seat('c3', 't6'), atMs: 3, takenOffline: true },
    );
    expect(isHeld(queued(state, 'c1'), ANI.staffMemberId)).toBe(true);
    expect(isHeld(queued(state, 'c2'), ANI.staffMemberId)).toBe(false);
    // Queued by a build that did not record anybody: sent as before.
    expect(isHeld(queued(state, 'c3'), ANI.staffMemberId)).toBe(false);
    // With nobody signed in (the mock, with no staff sign-in) nothing is held.
    expect(isHeld(queued(state, 'c1'), null)).toBe(false);
    expect(heldFor(state, ANI.staffMemberId).map((command) => command.id)).toEqual(['c1']);
  });

  it('goes under the name of whoever says "send it under my name"', () => {
    const state = run(
      initialCommandState,
      { type: 'enqueued', command: seat('c1'), atMs: 1, takenOffline: true, by: NAREK },
      { type: 'claimed', id: 'c1', by: ANI },
    );
    expect(queued(state, 'c1').by).toEqual(ANI);
    expect(heldFor(state, ANI.staffMemberId)).toEqual([]);
    // Same command, same id: the server's idempotency key does not change.
    expect(queued(state, 'c1').id).toBe('c1');
  });

  it('leaves the queue when a person discards it, and only then', () => {
    const state = run(
      initialCommandState,
      { type: 'enqueued', command: seat('c1'), atMs: 1, takenOffline: true, by: NAREK },
      { type: 'dropped', id: 'c1' },
    );
    expect(state.queue).toEqual([]);
    expect(state.conflicts).toEqual([]);
  });

  it("is whoever sends a refused command anyway, not whoever's it was", () => {
    const state = run(
      initialCommandState,
      { type: 'enqueued', command: seat('c1'), atMs: 1, takenOffline: true, by: NAREK },
      { type: 'conflicted', id: 'c1', observed: null, reason: 'precondition', atMs: 5 },
      { type: 'retryConflict', id: 'c1', atMs: 6, by: ANI },
    );
    expect(queued(state, 'c1').by).toEqual(ANI);
    expect(queued(state, 'c1').precondition).toBeNull();
  });
});

describe('the replay while somebody else is signed in', () => {
  it("does not send Narek's command under Ani's sign-in, nor anything behind it on that table", async () => {
    const { sendableInOrder } = await import('./conflictPolicy');
    const state = run(
      initialCommandState,
      { type: 'enqueued', command: seat('c1', 't4'), atMs: 1, takenOffline: true, by: NAREK },
      { type: 'enqueued', command: seat('c2', 't4'), atMs: 2, takenOffline: true, by: ANI },
      { type: 'enqueued', command: seat('c3', 't5'), atMs: 3, takenOffline: true, by: ANI },
    );
    // Table 4's second command depends on the first; table 5 is unaffected.
    expect(sendableInOrder(state, ANI.staffMemberId).map((c) => c.id)).toEqual(['c3']);
    // And from Narek's side, Ani's two wait for Ani.
    expect(sendableInOrder(state, NAREK.staffMemberId).map((c) => c.id)).toEqual(['c1']);
  });
});

describe('why the server refused, for the words on the card', () => {
  function command(kind: 'setOrderStatus' | 'acknowledgeServiceRequest'): QueuedCommand {
    const body =
      kind === 'setOrderStatus'
        ? ({
            kind,
            command: { orderId: 'o1', status: 'ready', clientCommandId: 'c1' },
          } as const)
        : ({ kind, command: { requestId: 'r1', clientCommandId: 'c1' } } as const);
    return {
      id: 'c1',
      kind,
      scope: 'tab1',
      seq: 1,
      takenAtMs: 0,
      attempts: 1,
      precondition: null,
      takenOffline: true,
      subject: { tableId: null, tableLabel: '4', tabId: 'tab1' },
      body,
    };
  }

  function failing(error: unknown): StaffGateway {
    const fail = vi.fn(async () => {
      throw error;
    });
    return { setOrderStatus: fail, acknowledgeServiceRequest: fail } as unknown as StaffGateway;
  }

  it('says the thing is gone (404) or the sign-in may not do it (403)', async () => {
    const gone = await sendCommand(command('setOrderStatus'), {
      gateway: failing(new NotFoundError({ url: '/api/orders/o1/status' })),
      floor: null,
      nowMs: () => 9,
    });
    expect(gone).toMatchObject({
      type: 'conflicted',
      reason: 'refused',
      refusal: { kind: 'notFound' },
    });

    const refused = await sendCommand(command('acknowledgeServiceRequest'), {
      gateway: failing(new ForbiddenError({ url: '/api/service-requests/r1/acknowledge' })),
      floor: null,
      nowMs: () => 9,
    });
    expect(refused).toMatchObject({ reason: 'refused', refusal: { kind: 'forbidden' } });
  });

  it('still keeps a plain refusal without a reason it cannot name', async () => {
    const other = await sendCommand(command('setOrderStatus'), {
      gateway: failing(new ApiError('Nope', { url: '/x', status: 400 })),
      floor: null,
      nowMs: () => 9,
    });
    expect(other).toMatchObject({ reason: 'refused' });
    expect((other as { refusal?: unknown }).refusal).toBeUndefined();
  });
});

describe('"send it anyway"', () => {
  function entry(
    kind: QueuedCommand['kind'],
    reason: ConflictEntry['reason'],
    observed: Partial<NonNullable<ConflictEntry['observed']>> | null,
  ): ConflictEntry {
    const body =
      kind === 'placeOrder'
        ? { kind, command: { tabId: 'tab1', clientCommandId: 'c1', lines: [] } }
        : kind === 'setOrderStatus'
          ? { kind, command: { orderId: 'o1', status: 'ready' as const, clientCommandId: 'c1' } }
          : kind === 'acknowledgeServiceRequest'
            ? { kind, command: { requestId: 'r1', clientCommandId: 'c1' } }
            : {
                kind,
                command: {
                  kind,
                  branchId: 'b1',
                  tableId: 't4',
                  clientCommandId: 'c1',
                  partySize: 2,
                },
              };
    return {
      command: {
        id: 'c1',
        kind,
        scope: 't4',
        seq: 1,
        takenAtMs: 0,
        attempts: 1,
        precondition: { expectedFromStatus: 'free', rowVersion: 'v1' },
        takenOffline: true,
        subject: { tableId: 't4', tableLabel: '4', tabId: null },
        body: body as QueuedCommand['body'],
      },
      detectedAtMs: 10,
      reason,
      observed: observed
        ? {
            tableId: 't4',
            tableLabel: '4',
            attemptedFromStatus: 'free',
            currentStatus: 'free',
            currentSessionId: null,
            failure: 'statusChanged',
            ...observed,
          }
        : null,
    };
  }

  it('is offered to seat a party at a table that is free again, though it was used since', () => {
    expect(
      canSendAnyway(entry('seatWalkIn', 'precondition', { failure: 'tableChangedAndChangedBack' })),
    ).toEqual({ offer: true });
  });

  it('is not offered to seat a party at a table somebody else is sitting at: the server would refuse it', () => {
    expect(
      canSendAnyway(entry('seatWalkIn', 'precondition', { currentStatus: 'occupied' })),
    ).toEqual({ offer: false, because: 'notFromHere' });
  });

  it('is offered for hold, out of service and back in service where the move is still legal', () => {
    expect(canSendAnyway(entry('hold', 'conflict', { currentStatus: 'free' }))).toEqual({
      offer: true,
    });
    expect(canSendAnyway(entry('outOfService', 'precondition', { currentStatus: 'free' }))).toEqual(
      {
        offer: true,
      },
    );
    expect(
      canSendAnyway(entry('returnToService', 'precondition', { currentStatus: 'outOfService' })),
    ).toEqual({ offer: true });
    expect(
      canSendAnyway(entry('returnToService', 'precondition', { currentStatus: 'occupied' })),
    ).toEqual({ offer: false, because: 'notFromHere' });
  });

  it('is never offered to free a table, release a hold or seat a held party: it would act on another party', () => {
    for (const kind of ['freeTable', 'releaseHold', 'seatHeldParty'] as const) {
      expect(
        canSendAnyway(entry(kind, 'precondition', { failure: 'tableChangedAndChangedBack' })),
      ).toEqual({ offer: false, because: 'otherParty' });
    }
  });

  it('is never offered for an order: it puts money on a bill', () => {
    expect(canSendAnyway(entry('placeOrder', 'refused', null))).toEqual({
      offer: false,
      because: 'money',
    });
  });

  it('is not offered where the server would answer the same again', () => {
    expect(canSendAnyway(entry('seatWalkIn', 'refused', null))).toEqual({
      offer: false,
      because: 'sameAnswer',
    });
    expect(canSendAnyway(entry('setOrderStatus', 'conflict', null))).toEqual({
      offer: false,
      because: 'sameAnswer',
    });
    expect(canSendAnyway(entry('acknowledgeServiceRequest', 'refused', null))).toEqual({
      offer: false,
      because: 'sameAnswer',
    });
  });

  it("S1: never seats or closes a table held for somebody's late booking", () => {
    for (const kind of ['seatWalkIn', 'outOfService', 'hold'] as const) {
      expect(canSendAnyway(entry(kind, 'precondition', { currentStatus: 'held' }))).toEqual({
        offer: false,
        because: 'otherParty',
      });
    }
  });

  it('is offered when the server did not say what the table is now, for a move that acts on nobody', () => {
    expect(canSendAnyway(entry('hold', 'precondition', null))).toEqual({ offer: true });
  });
});

describe('the FT4 review fixes', () => {
  it('B1: "anyway" is a live decision: it goes without the queued flag the server would refuse', () => {
    const state = run(
      initialCommandState,
      { type: 'enqueued', command: seat('c1'), atMs: 1, takenOffline: true, by: NAREK },
      { type: 'deferred', id: 'c1' },
      { type: 'conflicted', id: 'c1', observed: null, reason: 'precondition', atMs: 5 },
      { type: 'retryConflict', id: 'c1', atMs: 6, by: NAREK },
    );
    const resent = withPrecondition(queued(state, 'c1'));
    expect(resent.precondition).toBeNull();
    expect(resent.queued).toBe(false);
  });

  it('B2: a 401 is no verdict on the command: it waits for a sign-in, it is not refused', async () => {
    const action = await sendCommand(
      {
        ...queued(
          run(initialCommandState, {
            type: 'enqueued',
            command: seat('c1'),
            atMs: 1,
            takenOffline: true,
          }),
          'c1',
        ),
      },
      {
        gateway: {
          applyTableAction: async () => {
            throw new UnauthorizedError({ url: '/api/branches/b1/tables/t4/seat-walk-in' });
          },
        } as unknown as StaffGateway,
        floor: null,
        nowMs: () => 9,
      },
    );
    expect(action).toEqual({ type: 'deferred', id: 'c1' });
  });

  it("S3: claiming one of Narek's commands claims what waits ahead of it on that table too", () => {
    const state = run(
      initialCommandState,
      { type: 'enqueued', command: seat('c1', 't4'), atMs: 1, takenOffline: true, by: NAREK },
      { type: 'enqueued', command: seat('c2', 't4'), atMs: 2, takenOffline: true, by: NAREK },
      { type: 'enqueued', command: seat('c3', 't4'), atMs: 3, takenOffline: true, by: NAREK },
      { type: 'enqueued', command: seat('c4', 't5'), atMs: 4, takenOffline: true, by: NAREK },
      { type: 'claimed', id: 'c2', by: ANI },
    );
    expect(state.queue.map((command) => [command.id, command.by?.staffMemberId])).toEqual([
      ['c1', ANI.staffMemberId],
      ['c2', ANI.staffMemberId],
      ['c3', NAREK.staffMemberId],
      ['c4', NAREK.staffMemberId],
    ]);
  });
});
