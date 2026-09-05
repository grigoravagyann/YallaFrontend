import 'fake-indexeddb/auto';
import {
  ApiError,
  ConcurrencyConflictError,
  NetworkError,
  ServerError,
  type Menu,
  type StaffFloor,
  type StaffGateway,
  type StaffTableDetail,
  type TableStatus,
} from '@yalla/api';
import { cafeFloorPlan } from '@yalla/floorplan/mocks';
import { describe, expect, it, vi } from 'vitest';
import { createCommandStore } from '../offline/commandStore';
import { createMemoryMenuCache } from '../offline/menuCache';
import {
  commandReducer,
  conflictCount,
  initialCommandState,
  pendingCount,
} from './commands/reducer';
import { sendCommand } from './commands/sync';
import type { ConflictEntry, NewCommand, QueuedCommand } from './commands/types';
import { resolveMenuState } from './useCachedMenu';

/**
 * The three defects that shipped invisible, other than the service worker.
 *
 * Every one of them passed a suite of 394 tests. That is the point of this
 * file: each was a decision nothing could ask about, taken in a place where
 * being wrong looks exactly like being right — an app with no worker looks fine
 * online, a dropped conflict looks like a waiter who changed their mind, a
 * paused query looks like a slow one, and a wifi drop reported as a refusal
 * looks like a considered answer.
 *
 * The service-worker one lives in `offline/registerServiceWorker.test.ts`,
 * beside the call site it is about.
 */

// --- Builders ----------------------------------------------------------------

function detail(tableId: string, physicalStatus: TableStatus): StaffTableDetail {
  return {
    tableId,
    label: tableId.replace('t', ''),
    seats: 2,
    physicalStatus,
    currentSessionId: null,
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

function seatWalkIn(id: string, tableId: string, from: TableStatus): NewCommand {
  return {
    id,
    scope: tableId,
    precondition: { expectedFromStatus: from, rowVersion: `v-${tableId}` },
    subject: { tableId, tableLabel: tableId.replace('t', ''), tabId: null },
    body: {
      kind: 'seatWalkIn',
      command: {
        kind: 'seatWalkIn',
        branchId: 'branch-1',
        tableId,
        clientCommandId: id,
        partySize: 2,
      },
    },
  };
}

function enqueue(state = initialCommandState, command = seatWalkIn('cmd-1', 't2', 'free')) {
  return commandReducer(state, { type: 'enqueued', command, atMs: 1_000, takenOffline: false });
}

function gatewayWith(applyTableAction: StaffGateway['applyTableAction']): StaffGateway {
  return { applyTableAction } as unknown as StaffGateway;
}

const nowMs = () => 5_000;

// ---------------------------------------------------------------------------
// Defect 2: the conflict list did not survive a reload
// ---------------------------------------------------------------------------

describe('a tablet that reboots with conflicts outstanding', () => {
  it('reads both lists back off disk and restores every conflict', async () => {
    // Through the real store and a real IndexedDB, not a fake in front of it.
    // The original bug was in the *shape* of what was restored — the queue
    // alone — so an in-memory double that took whatever it was handed would
    // have kept passing.
    const store = createCommandStore();
    await store.clear();

    let before = enqueue(initialCommandState, seatWalkIn('cmd-1', 't2', 'free'));
    before = enqueue(before, seatWalkIn('cmd-2', 't4', 'free'));

    // One of them meets a table that has moved on. It leaves the queue and
    // becomes a decision somebody owes.
    const conflicted = await sendCommand(before.queue[0]!, {
      gateway: gatewayWith(vi.fn()),
      floor: floorWith(['t2', 'occupied'], ['t4', 'free']),
      nowMs,
    });
    before = commandReducer(before, conflicted);

    expect(pendingCount(before)).toBe(1);
    expect(conflictCount(before)).toBe(1);

    await store.saveQueue(before.queue);
    await store.saveConflicts(before.conflicts);

    // Reboot: a brand-new state, hydrated from what is on disk.
    const [queue, conflicts] = await Promise.all([store.loadQueue(), store.loadConflicts()]);
    const after = commandReducer(initialCommandState, { type: 'hydrated', queue, conflicts });

    expect(pendingCount(after)).toBe(1);
    // The assertion that would have failed. A conflicted command is no longer
    // *in* the queue, so restoring the queue and replaying `conflicted` for
    // each saved entry finds nothing to move and drops every one of them — and
    // the waiter comes back to a floor that has quietly forgotten three
    // decisions it was waiting on.
    expect(conflictCount(after)).toBe(1);
    expect(after.conflicts[0]?.command.id).toBe('cmd-1');
    expect(after.conflicts[0]?.observed?.currentStatus).toBe('occupied');
    // And the restored entry is still actionable: both buttons need the body.
    expect(after.conflicts[0]?.command.body.kind).toBe('seatWalkIn');

    await store.clear();
  });

  it('restores several at once, none of them merged or lost', async () => {
    const store = createCommandStore();
    await store.clear();

    const conflicts: ConflictEntry[] = ['cmd-a', 'cmd-b', 'cmd-c'].map((id, index) => {
      const state = enqueue(initialCommandState, seatWalkIn(id, `t${index + 1}`, 'free'));
      return {
        command: state.queue[0] as QueuedCommand,
        detectedAtMs: 2_000 + index,
        observed: null,
        reason: 'precondition',
      };
    });

    await store.saveConflicts(conflicts);
    const restored = await store.loadConflicts();
    const after = commandReducer(initialCommandState, {
      type: 'hydrated',
      queue: [],
      conflicts: restored,
    });

    expect(conflictCount(after)).toBe(3);
    expect(after.conflicts.map((entry) => entry.command.id)).toEqual(['cmd-a', 'cmd-b', 'cmd-c']);
    // "Apply anyway" gives an entry a fresh sequence number, so hydration has to
    // clear the conflicts too or two commands could share one.
    expect(after.nextSeq).toBeGreaterThan(
      Math.max(...after.conflicts.map((entry) => entry.command.seq)),
    );

    await store.clear();
  });
});

// ---------------------------------------------------------------------------
// Defect 3: order entry did not work offline
// ---------------------------------------------------------------------------

const MENU: Menu = {
  branchId: 'branch-1',
  updatedAtUtc: '2026-09-04T10:00:00Z',
  sections: [
    {
      id: 'hot',
      name: 'Hot drinks',
      items: [
        {
          id: 'cappuccino',
          name: 'Cappuccino',
          description: null,
          priceDram: 1200,
          isAvailable: true,
        },
      ],
    },
  ],
};

describe('order entry with the wifi off', () => {
  it('draws the menu from this tablet rather than starting a query that pauses forever', () => {
    // The exact shape of the failure: TanStack Query does not fail a request the
    // browser cannot send — it pauses it. `isError` stays false, `isLoading`
    // stays true, and the screen shows a spinner nothing will ever resolve.
    const state = resolveMenuState({
      seed: { menu: MENU, storedAtMs: 1_000 },
      queryData: MENU,
      fetchStatus: 'paused',
      isLoading: false,
      isError: false,
    });

    expect(state.data).toBe(MENU);
    expect(state.loading).toBe(false);
    expect(state.unavailable).toBe(false);
    expect(state.fromCache).toBe(true);
  });

  it('says the menu is unavailable rather than loading when there is no cached copy', () => {
    const state = resolveMenuState({
      seed: null,
      queryData: undefined,
      fetchStatus: 'paused',
      isLoading: true,
      isError: false,
    });

    expect(state.data).toBeNull();
    // The regression in one line. `loading: true` here is the spinner that
    // never resolves; a waiter is entitled to be told the menu is not on this
    // tablet and that there is no way to fetch it right now.
    expect(state.loading).toBe(false);
    expect(state.unavailable).toBe(true);
  });

  it('is still loading while the cache read is in flight', () => {
    const state = resolveMenuState({
      seed: undefined,
      queryData: undefined,
      fetchStatus: 'idle',
      isLoading: false,
      isError: false,
    });
    expect(state.loading).toBe(true);
    expect(state.unavailable).toBe(false);
  });

  it('survives the app being killed: what was written is what is read back', async () => {
    const cache = createMemoryMenuCache();
    await cache.write('branch-1', MENU);

    // A new process. Nothing in memory, no network.
    const restored = await cache.read('branch-1');
    expect(restored?.menu.sections[0]?.items[0]?.name).toBe('Cappuccino');

    const state = resolveMenuState({
      seed: restored,
      queryData: undefined,
      fetchStatus: 'paused',
      isLoading: true,
      isError: false,
    });
    expect(state.data?.sections[0]?.items).toHaveLength(1);
    expect(state.loading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Defect 4: a transport error was reported as a refusal
// ---------------------------------------------------------------------------

describe('a send that never got an answer', () => {
  /** The three ways the transport fails, and none of them is a verdict. */
  const transportFailures: readonly (readonly [string, unknown])[] = [
    // The client's own wrapper: no signal, DNS, TLS, wifi switched off.
    ['a network failure', new NetworkError({ url: '/api/branches/b/tables/t2/seat-walk-in' })],
    // Anything that did not go through `ApiClient` at all — a mock, a bug in
    // our own code, an aborted request. Fetch's bare `TypeError` is the one
    // that used to be classified as a refusal.
    ['an unwrapped exception', new TypeError('Failed to fetch')],
    // The server fell over. It may or may not have applied the command, which
    // is precisely why nothing may be decided about it here.
    [
      'a 5xx',
      new ServerError({
        status: 503,
        url: '/api/branches/b/tables/t2/seat-walk-in',
      }),
    ],
  ];

  for (const [name, failure] of transportFailures) {
    it(`defers on ${name} and never reaches the conflict list`, async () => {
      const state = enqueue();
      const action = await sendCommand(state.queue[0]!, {
        gateway: gatewayWith(
          vi.fn(async () => {
            throw failure;
          }),
        ),
        floor: floorWith(['t2', 'free']),
        nowMs,
      });

      expect(action).toEqual({ type: 'deferred', id: 'cmd-1' });

      const after = commandReducer(state, action);
      // Still queued, attempt counted, nothing decided. Asking a waiter to
      // adjudicate a wifi drop is worse than showing them a spinner.
      expect(pendingCount(after)).toBe(1);
      expect(conflictCount(after)).toBe(0);
      expect(after.queue[0]?.attempts).toBe(1);
    });
  }

  it('does treat a real refusal as one, so the deferral is not a catch-all', async () => {
    // The control. If everything deferred, the queue would retry a command the
    // server has refused on its merits until it jammed.
    const state = enqueue();
    const action = await sendCommand(state.queue[0]!, {
      gateway: gatewayWith(
        vi.fn(async () => {
          throw new ApiError('Bad request', {
            status: 400,
            url: '/api/branches/b/tables/t2/seat-walk-in',
          });
        }),
      ),
      floor: floorWith(['t2', 'free']),
      nowMs,
    });

    expect(action.type).toBe('conflicted');
    const after = commandReducer(state, action);
    expect(pendingCount(after)).toBe(0);
    expect(conflictCount(after)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The two 409s, which are not interchangeable
// ---------------------------------------------------------------------------

describe('the two ways a table refuses a command', () => {
  function conflict(code: string, context: Record<string, unknown>): ConcurrencyConflictError {
    return new ConcurrencyConflictError({
      url: '/api/branches/b/tables/t2/seat-walk-in',
      problem: {
        code,
        status: 409,
        title: '',
        detail: '',
        type: '',
        traceId: '',
        instance: null,
        errors: null,
        context,
      },
    });
  }

  it('reports a live race as a race, so the waiter is told and not filed', async () => {
    const state = enqueue();
    const action = await sendCommand(state.queue[0]!, {
      gateway: gatewayWith(
        vi.fn(async () => {
          throw conflict('table-state-conflict', {
            tableId: 't2',
            tableLabel: '2',
            attemptedFromStatus: 1,
            currentStatus: 4,
            changedByName: 'Aram',
          });
        }),
      ),
      floor: floorWith(['t2', 'free']),
      nowMs,
    });

    expect(action.type).toBe('conflicted');
    if (action.type !== 'conflicted') return;
    expect(action.reason).toBe('conflict');
    expect(action.observed?.changedBy).toBe('Aram');
    // No `failure`: there was no precondition to fail, and the copy branches on
    // exactly this.
    expect(action.observed?.failure).toBeNull();
  });

  it('reports the table changing and changing back as its own thing', async () => {
    const state = enqueue();
    const action = await sendCommand(state.queue[0]!, {
      gateway: gatewayWith(
        vi.fn(async () => {
          throw conflict('precondition-failed', {
            tableId: 't2',
            tableLabel: '2',
            expectedFromStatus: 1,
            currentStatus: 1,
            // 2 = TableChangedAndChangedBack: the status matches and the table
            // is not the same table. Nothing on any screen shows this, which is
            // the entire reason the row version is sent.
            failure: 2,
          });
        }),
      ),
      floor: floorWith(['t2', 'free']),
      nowMs,
    });

    expect(action.type).toBe('conflicted');
    if (action.type !== 'conflicted') return;
    // Never `conflict`: a precondition only fails for a command that waited, so
    // it can never be the gesture somebody is still standing in front of, and
    // must not be swallowed as a live race.
    expect(action.reason).toBe('precondition');
    expect(action.observed?.failure).toBe('tableChangedAndChangedBack');
    expect(action.observed?.currentStatus).toBe('free');
  });
});
