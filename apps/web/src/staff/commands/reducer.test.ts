import {
  ConcurrencyConflictError,
  type StaffFloor,
  type StaffGateway,
  type StaffTableDetail,
  type TableActionCommand,
  type TableActionResult,
  type TableStatus,
} from '@yalla/api';
import { cafeFloorPlan } from '@yalla/floorplan/mocks';
import { describe, expect, it, vi } from 'vitest';
import {
  commandReducer,
  conflictCount,
  initialCommandState,
  optimisticFloor,
  pendingCount,
  preconditionHolds,
  projectedStatus,
  replayOrder,
  type CommandAction,
} from './reducer';
import { sendCommand } from './sync';
import { isQueueable, type CommandState, type NewCommand } from './types';

/**
 * The offline queue and the conflict model.
 *
 * These are the two places on the counter screen where a bug is invisible: a
 * dropped command looks like a waiter who forgot, and a command applied twice
 * looks like the kitchen. Neither reproduces on demand in a browser, which is
 * why they are pinned here instead.
 */

// --- Builders ---------------------------------------------------------------

function detail(tableId: string, physicalStatus: TableStatus): StaffTableDetail {
  return {
    tableId,
    label: tableId.replace('t', ''),
    seats: 2,
    physicalStatus,
    currentSessionId: physicalStatus === 'occupied' ? `session-${tableId}` : null,
    seatedAtUtc: null,
    partySize: null,
    nextReservationId: null,
    nextReservationStartUtc: null,
    nextReservationPartySize: null,
    freeUntilUtc: null,
    openTabId: null,
    rowVersion: `v-${tableId}`,
  };
}

function floorWith(...tables: readonly (readonly [string, TableStatus])[]): StaffFloor {
  return {
    plan: cafeFloorPlan,
    details: tables.map(([id, status]) => detail(id, status)),
    lastSequence: 10,
    asOfUtc: '2026-09-04T14:30:00Z',
  };
}

function seatWalkIn(id: string, tableId: string, expected: TableStatus = 'free'): NewCommand {
  const command: TableActionCommand = {
    kind: 'seatWalkIn',
    branchId: 'branch-cafe-01',
    tableId,
    clientCommandId: id,
    partySize: 2,
  };
  return {
    id,
    scope: tableId,
    precondition: { expectedFromStatus: expected, rowVersion: null },
    subject: { tableId, tableLabel: tableId.replace('t', ''), tabId: null },
    body: { kind: 'seatWalkIn', command },
  };
}

function freeTable(id: string, tableId: string, expected: TableStatus = 'occupied'): NewCommand {
  const command: TableActionCommand = {
    kind: 'freeTable',
    branchId: 'branch-cafe-01',
    tableId,
    clientCommandId: id,
  };
  return {
    id,
    scope: tableId,
    precondition: { expectedFromStatus: expected, rowVersion: null },
    subject: { tableId, tableLabel: tableId.replace('t', ''), tabId: null },
    body: { kind: 'freeTable', command },
  };
}

function cashPayment(id: string, tabId: string): NewCommand {
  return {
    id,
    scope: tabId,
    precondition: null,
    subject: { tableId: null, tableLabel: null, tabId },
    body: {
      kind: 'recordCashPayment',
      command: { tabId, amountDram: 8000, tipDram: 0, clientCommandId: id },
    },
  };
}

function enqueue(
  state: CommandState,
  command: NewCommand,
  atMs = 1_000,
  takenOffline = false,
): CommandState {
  return commandReducer(state, { type: 'enqueued', command, atMs, takenOffline });
}

function actionResult(overrides: Partial<TableActionResult> = {}): TableActionResult {
  return {
    branchId: 'branch-cafe-01',
    tableId: 't2',
    tableLabel: '2',
    fromStatus: 'free',
    toStatus: 'occupied',
    state: 'occupied',
    tableSessionId: 'session-1',
    reservationId: null,
    tabId: null,
    nextReservationStartUtc: null,
    freeUntilUtc: null,
    atUtc: '2026-09-04T14:31:00Z',
    clientCommandId: 'cmd-1',
    wasReplay: false,
    outstandingDram: null,
    affectedReservations: [],
    warnings: [],
    ...overrides,
  };
}

/** A gateway with only the methods the queue actually calls. */
function gatewayWith(applyTableAction: StaffGateway['applyTableAction']): StaffGateway {
  return { applyTableAction } as unknown as StaffGateway;
}

const nowMs = () => 2_000;

// --- 1. Enqueue, sync, clear -------------------------------------------------

describe('a successful command', () => {
  it('leaves the queue empty and is applied exactly once', async () => {
    let state = enqueue(initialCommandState, seatWalkIn('cmd-1', 't2'));
    expect(pendingCount(state)).toBe(1);

    const apply = vi.fn(async (command: TableActionCommand) =>
      actionResult({ clientCommandId: command.clientCommandId }),
    );
    const queued = replayOrder(state)[0]!;

    const action = await sendCommand(queued, {
      gateway: gatewayWith(apply),
      floor: floorWith(['t2', 'free']),
      nowMs,
    });

    expect(action).toEqual({ type: 'applied', id: 'cmd-1' });
    state = commandReducer(state, action);

    expect(pendingCount(state)).toBe(0);
    expect(conflictCount(state)).toBe(0);
    expect(apply).toHaveBeenCalledTimes(1);
    // The id the server saw is the id the queue stored: that is what makes a
    // resend idempotent rather than a second party at the table.
    expect(apply.mock.calls[0]?.[0]?.clientCommandId).toBe('cmd-1');
  });
});

// --- 2. Idempotent replay ----------------------------------------------------

describe('a command the server had already applied', () => {
  it('clears without duplicating local state', async () => {
    let state = enqueue(initialCommandState, seatWalkIn('cmd-1', 't2'));

    // `wasReplay` is the server saying "I have this one already" — the case a
    // dropped response produces, where the action landed and the answer did not.
    const apply = vi.fn(async () => actionResult({ wasReplay: true }));
    const action = await sendCommand(replayOrder(state)[0]!, {
      gateway: gatewayWith(apply),
      floor: floorWith(['t2', 'free']),
      nowMs,
    });

    expect(action).toEqual({ type: 'replayed', id: 'cmd-1' });
    state = commandReducer(state, action);

    expect(pendingCount(state)).toBe(0);
    expect(conflictCount(state)).toBe(0);

    // And re-enqueuing the same id is not a second command.
    state = enqueue(state, seatWalkIn('cmd-1', 't2'));
    state = enqueue(state, seatWalkIn('cmd-1', 't2'));
    expect(pendingCount(state)).toBe(1);
  });
});

// --- 3. Precondition failure -------------------------------------------------

describe('a queued command whose table has moved on', () => {
  it('goes to the conflict list and reverts local state to server truth', async () => {
    // Taken while table 2 was free; by the time it syncs somebody else has
    // seated it.
    let state = enqueue(initialCommandState, seatWalkIn('cmd-1', 't2', 'free'));
    const serverFloor = floorWith(['t2', 'occupied']);

    const apply = vi.fn(async () => actionResult());
    const action = await sendCommand(replayOrder(state)[0]!, {
      gateway: gatewayWith(apply),
      floor: serverFloor,
      nowMs,
    });

    expect(action.type).toBe('conflicted');
    // Never sent. The point of the local check is that the command is not
    // applied to a world it was not taken in.
    expect(apply).not.toHaveBeenCalled();

    state = commandReducer(state, action);

    expect(pendingCount(state)).toBe(0);
    expect(conflictCount(state)).toBe(1);

    const entry = state.conflicts[0]!;
    expect(entry.reason).toBe('precondition');
    expect(entry.observed?.currentStatus).toBe('occupied');
    expect(entry.observed?.attemptedFromStatus).toBe('free');

    // Local state is server truth again: with nothing pending, the optimistic
    // floor is the plan untouched and nothing is marked.
    const overlay = optimisticFloor(serverFloor.plan, state.queue);
    expect(overlay.pendingTableIds.size).toBe(0);
    expect(overlay.plan).toBe(serverFloor.plan);
  });

  it('records a server 409 as a conflict rather than a retry', async () => {
    let state = enqueue(initialCommandState, seatWalkIn('cmd-1', 't2', 'free'));

    const apply = vi.fn(async () => {
      throw new ConcurrencyConflictError({
        url: '/api/branches/b/tables/t2/seat-walk-in',
        problem: {
          code: 'table-state-conflict',
          status: 409,
          title: '',
          detail: '',
          type: '',
          traceId: '',
          instance: null,
          errors: null,
          context: {
            tableId: 't2',
            tableLabel: '2',
            attemptedFromStatus: 1,
            currentStatus: 4,
            currentSessionId: 'session-9',
            changedByName: 'Aram',
          },
        },
      });
    });

    // The floor still says free, so the local check passes and the server is
    // the one that refuses. That is the live-race path.
    const action = await sendCommand(replayOrder(state)[0]!, {
      gateway: gatewayWith(apply),
      floor: floorWith(['t2', 'free']),
      nowMs,
    });

    expect(action.type).toBe('conflicted');
    state = commandReducer(state, action);

    const entry = state.conflicts[0]!;
    expect(entry.reason).toBe('conflict');
    expect(entry.observed?.currentStatus).toBe('occupied');
    expect(entry.observed?.changedBy).toBe('Aram');
  });
});

// --- 4. Apply anyway ---------------------------------------------------------

describe('apply anyway', () => {
  it('re-sends without the precondition and clears the conflict', async () => {
    let state = enqueue(initialCommandState, freeTable('cmd-1', 't1', 'occupied'));
    const movedOn = floorWith(['t1', 'free']);

    state = commandReducer(
      state,
      await sendCommand(replayOrder(state)[0]!, {
        gateway: gatewayWith(vi.fn()),
        floor: movedOn,
        nowMs,
      }),
    );
    expect(conflictCount(state)).toBe(1);

    state = commandReducer(state, { type: 'retryConflict', id: 'cmd-1', atMs: 3_000 });

    expect(conflictCount(state)).toBe(0);
    expect(pendingCount(state)).toBe(1);

    const requeued = replayOrder(state)[0]!;
    expect(requeued.precondition).toBeNull();
    // The same command id, so the server's idempotency still protects it.
    expect(requeued.id).toBe('cmd-1');

    // And now it sends: with no precondition the local check cannot stop it.
    const apply = vi.fn(async () => actionResult({ tableId: 't1', toStatus: 'free' }));
    const action = await sendCommand(requeued, {
      gateway: gatewayWith(apply),
      floor: movedOn,
      nowMs,
    });

    expect(apply).toHaveBeenCalledTimes(1);
    state = commandReducer(state, action);
    expect(pendingCount(state)).toBe(0);
    expect(conflictCount(state)).toBe(0);
  });
});

// --- 5. Discard --------------------------------------------------------------

describe('discard', () => {
  it('clears the conflict and changes nothing else', async () => {
    let state = enqueue(initialCommandState, seatWalkIn('cmd-1', 't2', 'free'));
    const serverFloor = floorWith(['t2', 'occupied']);

    state = commandReducer(
      state,
      await sendCommand(replayOrder(state)[0]!, {
        gateway: gatewayWith(vi.fn()),
        floor: serverFloor,
        nowMs,
      }),
    );
    expect(conflictCount(state)).toBe(1);

    state = commandReducer(state, { type: 'discardConflict', id: 'cmd-1' });

    expect(conflictCount(state)).toBe(0);
    expect(pendingCount(state)).toBe(0);
    // Server truth is untouched: discard is a decision not to send, and it
    // never reaches the server at all.
    expect(serverFloor.details.find((d) => d.tableId === 't2')?.physicalStatus).toBe('occupied');
  });
});

// --- 6. Replay order ---------------------------------------------------------

describe('replay', () => {
  it('sends commands in the order they were taken', async () => {
    let state = initialCommandState;
    state = enqueue(state, seatWalkIn('cmd-1', 't2', 'free'), 1_000);
    state = enqueue(state, seatWalkIn('cmd-2', 't4', 'free'), 1_100);
    state = enqueue(state, freeTable('cmd-3', 't2', 'occupied'), 1_200);

    expect(replayOrder(state).map((command) => command.id)).toEqual(['cmd-1', 'cmd-2', 'cmd-3']);

    const sent: string[] = [];
    const apply = vi.fn(async (command: TableActionCommand) => {
      sent.push(command.clientCommandId);
      return actionResult({ clientCommandId: command.clientCommandId });
    });

    // The floor is what the server currently says. Table 2's free follows its
    // own seat, so its precondition is checked against the *projected* status,
    // not the stale server one — see `projectedStatus`.
    const server = floorWith(['t2', 'free'], ['t4', 'free']);

    for (const command of replayOrder(state)) {
      const action = await sendCommand(
        command,
        // The seat is applied first, so by the time the free is sent the table
        // really is occupied; the loop reflects that.
        {
          gateway: gatewayWith(apply),
          floor: sent.includes('cmd-1') ? floorWith(['t2', 'occupied'], ['t4', 'free']) : server,
          nowMs,
        },
      );
      state = commandReducer(state, action);
    }

    expect(sent).toEqual(['cmd-1', 'cmd-2', 'cmd-3']);
    expect(pendingCount(state)).toBe(0);
  });

  it('captures the next command against the status the queue will produce', () => {
    // Seat then free, both offline. The server still says free; without
    // projection the free would capture `free` and immediately conflict.
    let state = enqueue(initialCommandState, seatWalkIn('cmd-1', 't2', 'free'));
    const server = floorWith(['t2', 'free']);

    expect(projectedStatus(server, state.queue, 't2')).toBe('occupied');

    state = enqueue(
      state,
      freeTable('cmd-2', 't2', projectedStatus(server, state.queue, 't2') ?? 'free'),
    );

    // Once the seat has been applied the free's precondition holds.
    expect(preconditionHolds(replayOrder(state)[1]!, floorWith(['t2', 'occupied']))).toBe(true);
  });
});

// --- 7. Payments -------------------------------------------------------------

describe('payments', () => {
  it('are refused entry to the queue', () => {
    expect(isQueueable('recordCashPayment')).toBe(false);

    const state = enqueue(initialCommandState, cashPayment('pay-1', 'tab-1'));

    // Not queued, not partially queued, not queued-and-flagged. A cash payment
    // recorded against a balance this device cannot verify is how a table pays
    // twice, and there is no marker that makes that acceptable.
    expect(pendingCount(state)).toBe(0);
    expect(state).toBe(initialCommandState);
  });

  it('refuses every non-queueable kind and accepts every queueable one', () => {
    for (const kind of [
      'seatWalkIn',
      'seatReservation',
      'seatHeldParty',
      'hold',
      'releaseHold',
      'freeTable',
      'outOfService',
      'returnToService',
      'placeOrder',
      'setOrderStatus',
      'acknowledgeServiceRequest',
    ] as const) {
      expect(isQueueable(kind)).toBe(true);
    }
    expect(isQueueable('recordCashPayment')).toBe(false);
  });
});

// --- 9. Optimistic state is marked ------------------------------------------

describe('optimistic state', () => {
  it('is applied and marked pending, never presented as confirmed', () => {
    const state = enqueue(initialCommandState, seatWalkIn('cmd-1', 't2', 'free'));
    const overlay = optimisticFloor(cafeFloorPlan, state.queue);

    const table = overlay.plan.tables.find((candidate) => candidate.id === 't2');
    // Applied: a waiter who seats a party and sees the table stay white seats
    // it again.
    expect(table?.state).toBe('occupied');
    // And marked: the screen must be able to say this has not reached anyone.
    expect(overlay.pendingTableIds.has('t2')).toBe(true);

    // Nothing else is touched or claimed.
    expect(overlay.pendingTableIds.size).toBe(1);
    const untouched = overlay.plan.tables.find((candidate) => candidate.id === 't4');
    expect(untouched).toEqual(cafeFloorPlan.tables.find((c) => c.id === 't4'));
  });

  it('applies the last command per table when several are queued', () => {
    let state = enqueue(initialCommandState, seatWalkIn('cmd-1', 't2', 'free'), 1_000);
    state = enqueue(state, freeTable('cmd-2', 't2', 'occupied'), 1_100);

    const overlay = optimisticFloor(cafeFloorPlan, state.queue);
    expect(overlay.plan.tables.find((c) => c.id === 't2')?.state).toBe('free');
    expect(overlay.pendingTableIds.has('t2')).toBe(true);
  });

  it('drops the mark as soon as the command leaves the queue', () => {
    let state = enqueue(initialCommandState, seatWalkIn('cmd-1', 't2', 'free'));
    state = commandReducer(state, { type: 'applied', id: 'cmd-1' });

    const overlay = optimisticFloor(cafeFloorPlan, state.queue);
    expect(overlay.pendingTableIds.size).toBe(0);
    // Identity, not equality: with nothing pending the plan is not rebuilt, so
    // the renderer does not redraw the room on every poll.
    expect(overlay.plan).toBe(cafeFloorPlan);
  });
});

// --- 10. Derived counts ------------------------------------------------------

describe('the header counts', () => {
  it('derive from the queue rather than from state that can drift', () => {
    let state = initialCommandState;
    expect(pendingCount(state)).toBe(0);

    state = enqueue(state, seatWalkIn('cmd-1', 't2'), 1_000);
    state = enqueue(state, seatWalkIn('cmd-2', 't4'), 1_100);
    expect(pendingCount(state)).toBe(state.queue.length);
    expect(pendingCount(state)).toBe(2);

    state = commandReducer(state, { type: 'applied', id: 'cmd-1' });
    expect(pendingCount(state)).toBe(state.queue.length);
    expect(pendingCount(state)).toBe(1);

    const conflicted: CommandAction = {
      type: 'conflicted',
      id: 'cmd-2',
      observed: null,
      reason: 'precondition',
      atMs: 2_000,
    };
    state = commandReducer(state, conflicted);

    // One moved across: pending fell, conflicts rose, and neither is a counter
    // that could disagree with the list it describes.
    expect(pendingCount(state)).toBe(0);
    expect(pendingCount(state)).toBe(state.queue.length);
    expect(conflictCount(state)).toBe(1);
    expect(conflictCount(state)).toBe(state.conflicts.length);
  });

  it('survives a deferral without losing the command', async () => {
    let state = enqueue(initialCommandState, seatWalkIn('cmd-1', 't2', 'free'));

    const apply = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const action = await sendCommand(replayOrder(state)[0]!, {
      gateway: gatewayWith(apply),
      floor: floorWith(['t2', 'free']),
      nowMs,
    });

    expect(action).toEqual({ type: 'deferred', id: 'cmd-1' });
    state = commandReducer(state, action);

    // Still pending, attempt counted. Nothing has been decided, so nothing has
    // moved: this is the one outcome that leaves the command exactly where it
    // was.
    expect(pendingCount(state)).toBe(1);
    expect(conflictCount(state)).toBe(0);
    expect(replayOrder(state)[0]?.attempts).toBe(1);
  });
});

// --- Restarting the tablet --------------------------------------------------

describe('what survives a restart', () => {
  it('restores the queue and the conflict list together', async () => {
    // A tablet that had one command still waiting and one decision outstanding
    // when somebody rebooted it mid-service.
    let before = enqueue(initialCommandState, seatWalkIn('cmd-1', 't2', 'free'), 1_000);
    before = enqueue(before, freeTable('cmd-2', 't1', 'occupied'), 1_100);
    before = commandReducer(
      before,
      await sendCommand(replayOrder(before)[0]!, {
        gateway: gatewayWith(vi.fn()),
        floor: floorWith(['t2', 'occupied'], ['t1', 'occupied']),
        nowMs,
      }),
    );

    expect(pendingCount(before)).toBe(1);
    expect(conflictCount(before)).toBe(1);

    // What the store would have written, read back into a fresh session.
    const after = commandReducer(initialCommandState, {
      type: 'hydrated',
      queue: before.queue,
      conflicts: before.conflicts,
    });

    expect(pendingCount(after)).toBe(1);
    // The one that matters: a conflict is a decision a person still owes, and a
    // restart is not a decision. Restoring the queue alone silently dropped
    // every conflict, because a conflicted command is no longer in the queue for
    // a replayed `conflicted` action to find.
    expect(conflictCount(after)).toBe(1);
    expect(after.conflicts[0]?.command.id).toBe('cmd-1');
    expect(after.conflicts[0]?.observed?.currentStatus).toBe('occupied');

    // And the next sequence number clears both lists, so an "apply anyway"
    // after the restart cannot collide with a command still queued.
    expect(after.nextSeq).toBeGreaterThan(
      Math.max(...[...before.queue, ...before.conflicts.map((c) => c.command)].map((c) => c.seq)),
    );
  });

  it('starts clean when the store is empty', () => {
    const after = commandReducer(initialCommandState, {
      type: 'hydrated',
      queue: [],
      conflicts: [],
    });
    expect(pendingCount(after)).toBe(0);
    expect(conflictCount(after)).toBe(0);
    expect(after.nextSeq).toBe(1);
  });
});

// --- Order within a table, across a failure ---------------------------------

describe('a table whose first command could not be sent', () => {
  it('keeps its later commands behind it, in order', async () => {
    // Two tables interleaved. Table 2 goes offline mid-pass; table 4 must be
    // unaffected, and table 2's free must stay behind its seat.
    let state = initialCommandState;
    state = enqueue(state, seatWalkIn('cmd-1', 't2', 'free'), 1_000);
    state = enqueue(state, seatWalkIn('cmd-2', 't4', 'free'), 1_100);
    state = enqueue(state, freeTable('cmd-3', 't2', 'occupied'), 1_200);

    // The seat on table 2 could not be sent at all.
    state = commandReducer(state, { type: 'deferred', id: 'cmd-1' });
    // Table 4's went through.
    state = commandReducer(state, { type: 'applied', id: 'cmd-2' });

    const order = replayOrder(state);
    expect(order.map((command) => command.id)).toEqual(['cmd-1', 'cmd-3']);
    // Position is by `seq`, not by attempt count, so a retried command cannot
    // drift behind one that was taken after it.
    expect(order[0]?.seq).toBeLessThan(order[1]!.seq);
    expect(order[0]?.attempts).toBe(1);

    // And the floor still shows both of table 2's commands as pending work,
    // with the last one winning — which is what the room will look like once
    // the queue drains.
    const overlay = optimisticFloor(cafeFloorPlan, state.queue);
    expect(overlay.plan.tables.find((table) => table.id === 't2')?.state).toBe('free');
    expect(overlay.pendingTableIds.has('t2')).toBe(true);
    expect(overlay.pendingTableIds.has('t4')).toBe(false);
  });
});
