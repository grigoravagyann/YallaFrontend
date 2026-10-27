import type { FloorChange, StaffFloor, StaffTableDetail, TableStatus } from '@yalla/api';
import { cafeFloorPlan } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { applyFloorChanges, latestChangeFor } from './sequence';

/**
 * Folding the branch's change stream into the floor on screen.
 *
 * The interesting case is not the happy one. It is the gap: a change that never
 * arrived, leaving one table drawn from a state that has since been superseded,
 * with nothing on screen saying which. That is the failure that walks a party
 * into somebody's dinner, so it is the one pinned hardest here.
 */

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

const floor: StaffFloor = {
  plan: cafeFloorPlan,
  details: cafeFloorPlan.tables.map((table) =>
    detail(table.id, table.state === 'occupied' ? 'occupied' : 'free'),
  ),
  lastSequence: 40,
  asOfUtc: '2026-09-04T14:30:00Z',
};

/**
 * One entry as `BranchChange` actually arrives.
 *
 * Note what is absent: no derived state, no party size, no tab id. The change
 * stream is an audit row, and the folding rules exist because of what it does
 * not say.
 */
function change(sequence: number, tableId: string, to: TableStatus): FloorChange {
  return {
    sequence,
    tableId,
    tableLabel: tableId.replace('t', ''),
    fromStatus: 'free',
    toStatus: to,
    atUtc: '2026-09-04T14:31:00Z',
    tableSessionId: to === 'occupied' ? 'session-9' : null,
    reservationId: null,
    actor: 'staff',
    actorId: 'staff-1',
    reason: '',
  };
}

describe('an incremental change', () => {
  it('updates exactly one table and advances the sequence', () => {
    const result = applyFloorChanges(floor, [change(41, 't2', 'occupied')]);

    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') return;

    expect(result.changed).toEqual(['t2']);
    expect(result.floor.lastSequence).toBe(41);

    const updated = result.floor.plan.tables.find((table) => table.id === 't2');
    expect(updated?.state).toBe('occupied');

    const updatedDetail = result.floor.details.find((row) => row.tableId === 't2');
    expect(updatedDetail?.physicalStatus).toBe('occupied');
    expect(updatedDetail?.currentSessionId).toBe('session-9');
    expect(updatedDetail?.seatedAtUtc).toBe('2026-09-04T14:31:00Z');
    // Neither the tab nor the party size is on a `BranchChange`, so folding one
    // in cannot invent them. The detail keeps what it had — here, nothing —
    // and the next full floor read fills them in.
    expect(updatedDetail?.openTabId).toBeNull();
    expect(updatedDetail?.partySize).toBeNull();

    // Every other table is exactly as it was. A change stream that quietly
    // rewrites the room is worse than one that does nothing.
    const untouched = result.floor.plan.tables.find((table) => table.id === 't4');
    expect(untouched).toEqual(cafeFloorPlan.tables.find((table) => table.id === 't4'));
    expect(result.floor.details.length).toBe(floor.details.length);
  });

  it('applies a contiguous run in order', () => {
    const result = applyFloorChanges(floor, [
      change(41, 't2', 'held'),
      change(42, 't2', 'occupied'),
      change(43, 't4', 'held'),
    ]);

    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') return;

    expect(result.floor.plan.tables.find((t) => t.id === 't2')?.state).toBe('occupied');
    expect(result.floor.plan.tables.find((t) => t.id === 't4')?.state).toBe('held');
    expect(result.floor.lastSequence).toBe(43);
  });

  it('does nothing for an empty page', () => {
    const result = applyFloorChanges(floor, []);
    expect(result.kind).toBe('unchanged');
  });
});

describe('sequences with holes (review S1, S2)', () => {
  /*
   * `TableStateChanges.Sequence` is one IDENTITY across every branch, with
   * holes from rolled-back inserts: a branch's next row is rarely
   * `lastSequence + 1`. The server answers every row of the branch after
   * `afterSequence`, so a hole is somebody else's row, never a missing one.
   */
  it('applies a later row across a hole: the numbers are shared by every branch', () => {
    const result = applyFloorChanges(floor, [change(42, 't2', 'occupied')]);

    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') return;
    expect(result.floor.lastSequence).toBe(42);
  });

  it('applies a page that is increasing with holes inside it', () => {
    const result = applyFloorChanges(floor, [
      change(47, 't4', 'held'),
      change(43, 't2', 'occupied'),
    ]);
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') return;
    expect(result.floor.lastSequence).toBe(47);
    expect([...result.changed].sort()).toEqual(['t2', 't4']);
  });

  it('drops rows the floor already has, and is unchanged when that is all of them', () => {
    // The floor was read after these rows were written: they are in it.
    expect(applyFloorChanges(floor, [change(39, 't2', 'occupied')]).kind).toBe('unchanged');
    const result = applyFloorChanges(floor, [
      change(40, 't2', 'occupied'),
      change(45, 't4', 'held'),
    ]);
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') return;
    expect(result.changed).toEqual(['t4']);
    expect(result.floor.lastSequence).toBe(45);
  });

  it('reads one row once, whatever the page repeats', () => {
    const result = applyFloorChanges(floor, [
      change(41, 't2', 'occupied'),
      change(41, 't2', 'occupied'),
    ]);
    expect(result.kind).toBe('applied');
  });

  it('reports a gap for a table the client has never seen', () => {
    // The plan itself changed — a table was added in the editor. Geometry does
    // not travel on this stream, so patching around it is not possible.
    const result = applyFloorChanges(floor, [change(41, 't-new', 'occupied')]);
    expect(result.kind).toBe('gap');
  });

  it('leaves the original floor untouched when it reports a gap', () => {
    const before = JSON.stringify(floor);
    applyFloorChanges(floor, [change(99, 't-new', 'occupied')]);
    expect(JSON.stringify(floor)).toBe(before);
  });
});

describe('the most recent change to a table', () => {
  it('is the one a live-race message is written from', () => {
    const latest = latestChangeFor(
      [change(41, 't2', 'held'), change(42, 't2', 'occupied'), change(43, 't4', 'held')],
      't2',
    );
    expect(latest?.sequence).toBe(42);
    expect(latest?.actorId).toBe('staff-1');
  });
});

describe('a booking cancelled by a guest block', () => {
  it("reads the floor again: the table's next booking is not on the row", () => {
    const result = applyFloorChanges(floor, [
      {
        ...change(41, 't2', 'free'),
        fromStatus: 'free',
        reservationId: 'r-blocked',
        signal: 'bookingCancelledByBlock',
      },
    ]);
    expect(result.kind).toBe('gap');
  });
});

describe('a booking event at a table (signal 5)', () => {
  it('reads the floor again, never folding the status the row carries', () => {
    // From = to = the status the save saw: a new booking on an occupied table
    // is not a sitting starting.
    const result = applyFloorChanges(floor, [
      {
        ...change(41, 't2', 'occupied'),
        fromStatus: 'occupied',
        reservationId: 'r-new',
        signal: 'bookingChanged',
      },
    ]);
    expect(result.kind).toBe('gap');
  });
});

describe('a table handed to another waiter (signal 7)', () => {
  it('reads the floor again: the row does not say whose the table is now', () => {
    const result = applyFloorChanges(floor, [
      {
        ...change(41, 't2', 'occupied'),
        fromStatus: 'occupied',
        tabId: 'tab-2',
        signal: 'tableTransferred',
      },
    ]);
    expect(result.kind).toBe('gap');
  });
});

describe('a tab written off (signal 9)', () => {
  it('reads the floor again: the row is the table as it is, not where the tab went', () => {
    const result = applyFloorChanges(floor, [
      {
        ...change(41, 't2', 'occupied'),
        fromStatus: 'occupied',
        tabId: 'tab-2',
        signal: 'tabWrittenOff',
      },
    ]);
    expect(result.kind).toBe('gap');
  });
});

describe('a pre-order row (signal 6)', () => {
  it('leaves a free table with its booking coming as it is, without reading the floor (review S1)', () => {
    // A pre-order's table is normally free with that booking next until the
    // party sits: a read of the whole floor for every guest edit, send or
    // kitchen move would cost every tablet a request each time.
    const booked: StaffFloor = {
      ...floor,
      details: floor.details.map((row) =>
        row.tableId === 't2'
          ? {
              ...row,
              physicalStatus: 'free',
              nextReservationId: 'r-po',
              nextReservationStartUtc: '2026-09-04T15:30:00Z',
              nextReservationPartySize: 4,
            }
          : row,
      ),
    };
    const result = applyFloorChanges(booked, [
      {
        ...change(41, 't2', 'free'),
        fromStatus: 'free',
        reservationId: 'r-po',
        signal: 'preOrderChanged',
      },
    ]);
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') return;
    expect(result.floor.details).toEqual(booked.details);
    expect(result.floor.plan).toEqual(booked.plan);
    expect(result.floor.lastSequence).toBe(41);
  });

  it('is skipped even for a table this screen has never seen', () => {
    const result = applyFloorChanges(floor, [
      { ...change(41, 't-new', 'free'), signal: 'preOrderChanged' },
    ]);
    expect(result.kind).toBe('applied');
  });
});

describe('a takeaway row (signal 8)', () => {
  /** As the server writes it: about the counter, no table, free to free, the system's. */
  const takeaway = (sequence: number): FloorChange => ({
    ...change(sequence, 't2', 'free'),
    tableId: null,
    tableLabel: null,
    tableSessionId: null,
    actor: 'system',
    actorId: null,
    reason: 'takeaway placed',
    tabId: null,
    signal: 'takeawayChanged',
  });

  it('folds nothing into the floor and never reads it again, but moves the sequence on', () => {
    // An order placed, accepted or collected must not cost every tablet a
    // whole-floor read: the counter is read again by the stream's handler.
    const result = applyFloorChanges(floor, [takeaway(41), takeaway(43)]);
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') return;
    expect(result.changed).toEqual([]);
    expect(result.floor.details).toEqual(floor.details);
    expect(result.floor.plan).toEqual(floor.plan);
    expect(result.floor.lastSequence).toBe(43);
  });

  it('folds the table changes around it as ever', () => {
    const result = applyFloorChanges(floor, [
      takeaway(41),
      change(42, 't2', 'occupied'),
      takeaway(43),
    ]);
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') return;
    expect(result.changed).toEqual(['t2']);
    expect(result.floor.lastSequence).toBe(43);
  });
});
