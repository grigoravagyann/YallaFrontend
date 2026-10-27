import {
  ConcurrencyConflictError,
  FeatureNotEnabledError,
  LineAlreadyPaidError,
  type StaffGateway,
} from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  FRESH_REFUSAL_MS,
  commandReducer,
  freshPaidRefusal,
  initialCommandState,
  isLiveRace,
} from './reducer';
import { sendCommand } from './sync';
import type { ConflictEntry, NewCommand, QueuedCommand } from './types';

/**
 * A whole order voided on a bill already paid against (2026-10-25). The server
 * refuses it with `line-already-paid`, a 409 — but the bill's, never a race, so
 * the queue must not redraw it away as "somebody took the table" and must say
 * why the order is still on the bill.
 */

function voidOrder(id: string): NewCommand {
  return {
    id,
    scope: 'tab-4',
    precondition: null,
    subject: { tableId: null, tableLabel: '4', tabId: 'tab-4' },
    body: {
      kind: 'setOrderStatus',
      command: { orderId: 'o-1', status: 'voided', clientCommandId: id },
    },
  };
}

function queued(id: string): QueuedCommand {
  const state = commandReducer(initialCommandState, {
    type: 'enqueued',
    command: voidOrder(id),
    atMs: 1_000,
    takenOffline: false,
  });
  return state.queue[0]!;
}

function gatewayRefusing(error: unknown): StaffGateway {
  return {
    setOrderStatus: () => Promise.reject(error),
  } as unknown as StaffGateway;
}

const nowMs = () => 1_500;

describe('an order void a paid bill refuses', () => {
  it('goes to the list as refused, saying it is the bill, and is not a live race', async () => {
    const command = queued('v-1');

    const action = await sendCommand(command, {
      gateway: gatewayRefusing(
        new LineAlreadyPaidError({ url: '/api/orders/o-1/status', lineId: 'l-1' }),
      ),
      floor: null,
      nowMs,
    });

    expect(action).toEqual({
      type: 'conflicted',
      id: 'v-1',
      observed: null,
      reason: 'refused',
      atMs: 1_500,
      refusal: { kind: 'lineAlreadyPaid' },
    });
    const state = commandReducer(
      { ...initialCommandState, queue: [command] },
      action as Parameters<typeof commandReducer>[1],
    );
    const entry = state.conflicts[0]!;
    expect(entry.refusal).toEqual({ kind: 'lineAlreadyPaid' });
    // Sent on its first attempt, moments after the tap — and still not a race.
    expect(isLiveRace(entry)).toBe(false);
  });

  it("leaves the rail's own 409 a conflict, as before", async () => {
    const action = await sendCommand(queued('v-2'), {
      gateway: gatewayRefusing(new ConcurrencyConflictError({ url: '/api/orders/o-1/status' })),
      floor: null,
      nowMs,
    });

    expect(action).toMatchObject({ type: 'conflicted', reason: 'conflict' });
    expect(action).not.toHaveProperty('refusal');
  });
});

describe('saying it on the screen', () => {
  const entry = (id: string, detectedAtMs: number, paid = true): ConflictEntry => ({
    command: queued(id),
    detectedAtMs,
    observed: null,
    reason: 'refused',
    ...(paid ? { refusal: { kind: 'lineAlreadyPaid' as const } } : {}),
  });

  it('picks a refusal that has just come back, once', () => {
    const fresh = entry('a', 10_000);

    expect(freshPaidRefusal([fresh], new Set(), 10_500)).toBe(fresh);
    expect(freshPaidRefusal([fresh], new Set(['a']), 10_500)).toBeNull();
  });

  it('is silent on one restored after a reload, and on other refusals', () => {
    expect(freshPaidRefusal([entry('a', 0)], new Set(), FRESH_REFUSAL_MS + 1)).toBeNull();
    expect(freshPaidRefusal([entry('b', 10_000, false)], new Set(), 10_500)).toBeNull();
  });
});

describe('a queued command the platform has switched off since', () => {
  it('is refused as feature-off, never filed as a table race', async () => {
    const action = await sendCommand(queued('v-3'), {
      gateway: gatewayRefusing(
        new FeatureNotEnabledError({
          url: '/api/orders/o-1/status',
          feature: 'staffPhone',
          branchId: 'b',
        }),
      ),
      floor: null,
      nowMs,
    });

    expect(action).toEqual({
      type: 'conflicted',
      id: 'v-3',
      observed: null,
      reason: 'refused',
      atMs: 1_500,
      refusal: { kind: 'featureOff' },
    });
  });
});
