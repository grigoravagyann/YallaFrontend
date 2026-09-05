import type { EditorFloorPlan } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  duplicateLabels,
  initialState,
  isDirty,
  isMutation,
  reducer,
  tablesOutsideCanvas,
  toSaveCommand,
  type EditorAction,
  type EditorState,
  type EditorTable,
} from './reducer';

/**
 * The editor's state machine, tested where it is cheap to test.
 *
 * Every claim here is one a person drawing a room in a cafe would notice
 * within a minute of it being false: a table that snaps back, an undo that
 * restores half a selection, a delete that appears to work and does not.
 */

const PLAN: EditorFloorPlan = {
  branchId: 'b1',
  floorWidth: 1000,
  floorHeight: 800,
  areas: [
    { id: 'a-windows', name: 'Windows', displayOrder: 0 },
    { id: 'a-terrace', name: 'Terrace', displayOrder: 1 },
  ],
  tables: [
    {
      id: 't1',
      label: '1',
      seats: 2,
      x: 100,
      y: 100,
      width: 80,
      height: 80,
      rotationDegrees: 0,
      shape: 'rectangle',
      floorAreaId: 'a-windows',
      isBookable: true,
      isActive: true,
      qrToken: 'qr-one',
    },
    {
      id: 't2',
      label: '2',
      seats: 4,
      x: 300,
      y: 200,
      width: 120,
      height: 90,
      rotationDegrees: 0,
      shape: 'round',
      floorAreaId: 'a-terrace',
      isBookable: true,
      isActive: true,
      qrToken: 'qr-two',
    },
  ],
};

function loaded(): EditorState {
  return reducer(initialState('b1'), { type: 'loaded', plan: PLAN });
}

function run(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(reducer, state);
}

const byId = (state: EditorState, id: string): EditorTable =>
  state.plan.tables.find((t) => t.id === id)!;

describe('loading', () => {
  it('starts clean, with nothing to undo', () => {
    const state = loaded();
    expect(state.plan.tables).toHaveLength(2);
    expect(isDirty(state)).toBe(false);
    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(false);
  });

  it("orders areas by the venue's own display order", () => {
    const shuffled: EditorFloorPlan = {
      ...PLAN,
      areas: [
        { id: 'a-terrace', name: 'Terrace', displayOrder: 1 },
        { id: 'a-windows', name: 'Windows', displayOrder: 0 },
      ],
    };
    const state = reducer(initialState('b1'), { type: 'loaded', plan: shuffled });
    expect(state.plan.areas.map((a) => a.name)).toEqual(['Windows', 'Terrace']);
  });
});

describe('move', () => {
  it('moves the selection and snaps to the grid', () => {
    const state = run(loaded(), { type: 'select', ids: ['t1'] }, { type: 'move', dx: 23, dy: 23 });
    // 100 + 23 = 123, snapped to the 10-unit grid.
    expect(byId(state, 't1').x).toBe(120);
    expect(byId(state, 't1').y).toBe(120);
    // The unselected table does not move.
    expect(byId(state, 't2').x).toBe(300);
  });

  it('moves freely when the grid is off', () => {
    const state = run(
      loaded(),
      { type: 'setGrid', enabled: false },
      { type: 'select', ids: ['t1'] },
      { type: 'move', dx: 23, dy: 7 },
    );
    expect(byId(state, 't1').x).toBe(123);
    expect(byId(state, 't1').y).toBe(107);
  });

  it('will not push a table out of the canvas', () => {
    const state = run(
      loaded(),
      { type: 'select', ids: ['t1'] },
      { type: 'move', dx: 5000, dy: 5000 },
    );
    const table = byId(state, 't1');
    expect(table.x + table.width).toBeLessThanOrEqual(1000);
    expect(table.y + table.height).toBeLessThanOrEqual(800);
  });

  it('undoes to exactly the previous position', () => {
    const before = loaded();
    const after = run(before, { type: 'select', ids: ['t1'] }, { type: 'move', dx: 40, dy: 40 });
    const undone = reducer(after, { type: 'undo' });
    expect(undone.plan).toEqual(before.plan);
    expect(canRedo(undone)).toBe(true);
    expect(reducer(undone, { type: 'redo' }).plan).toEqual(after.plan);
  });
});

describe('multi-select', () => {
  it('moves every selected table', () => {
    const state = run(
      loaded(),
      { type: 'select', ids: ['t1', 't2'] },
      { type: 'move', dx: 50, dy: 0 },
    );
    expect(byId(state, 't1').x).toBe(150);
    expect(byId(state, 't2').x).toBe(350);
  });

  it('undo after a multi-select move restores every table, not just the last', () => {
    const before = loaded();
    const after = run(
      before,
      { type: 'select', ids: ['t1', 't2'] },
      { type: 'move', dx: 50, dy: 30 },
    );

    expect(byId(after, 't1').x).toBe(150);
    expect(byId(after, 't2').x).toBe(350);

    const undone = reducer(after, { type: 'undo' });
    // The whole plan, not the last table touched. A per-table undo stack is
    // the classic version of this bug and it is invisible until you move two.
    expect(byId(undone, 't1')).toEqual(byId(before, 't1'));
    expect(byId(undone, 't2')).toEqual(byId(before, 't2'));
    expect(undone.plan).toEqual(before.plan);
  });

  it('adds to the selection rather than replacing it when asked', () => {
    const state = run(
      loaded(),
      { type: 'select', ids: ['t1'] },
      { type: 'select', ids: ['t2'], additive: true },
    );
    expect([...state.selection].sort()).toEqual(['t1', 't2']);
  });
});

describe('resize', () => {
  it('resizes, snaps and refuses to go below the minimum', () => {
    const state = run(loaded(), {
      type: 'resize',
      id: 't1',
      rect: { x: 100, y: 100, width: 3, height: 204 },
    });
    expect(byId(state, 't1').width).toBe(20);
    expect(byId(state, 't1').height).toBe(200);
  });

  it('undoes to the previous rectangle', () => {
    const before = loaded();
    const after = reducer(before, {
      type: 'resize',
      id: 't1',
      rect: { x: 200, y: 200, width: 200, height: 150 },
    });
    expect(reducer(after, { type: 'undo' }).plan).toEqual(before.plan);
  });
});

describe('rotate', () => {
  it('snaps to 15 degrees by default and rotates freely on request', () => {
    expect(
      reducer(loaded(), { type: 'rotate', id: 't1', degrees: 22 }).plan.tables[0]!.rotationDegrees,
    ).toBe(15);
    expect(
      reducer(loaded(), { type: 'rotate', id: 't1', degrees: 22, free: true }).plan.tables[0]!
        .rotationDegrees,
    ).toBe(22);
  });

  it('normalises past a full turn', () => {
    expect(
      reducer(loaded(), { type: 'rotate', id: 't1', degrees: 375 }).plan.tables[0]!.rotationDegrees,
    ).toBe(15);
    expect(
      reducer(loaded(), { type: 'rotate', id: 't1', degrees: -15 }).plan.tables[0]!.rotationDegrees,
    ).toBe(345);
  });

  it('undoes to the previous angle', () => {
    const before = loaded();
    const after = reducer(before, { type: 'rotate', id: 't1', degrees: 45 });
    expect(reducer(after, { type: 'undo' }).plan).toEqual(before.plan);
  });
});

describe('duplicate', () => {
  it('copies the selection, offsets it, and gives it fresh labels', () => {
    const state = run(loaded(), { type: 'select', ids: ['t1'] }, { type: 'duplicate' });

    expect(state.plan.tables).toHaveLength(3);
    const copy = state.plan.tables[2]!;
    expect(copy.label).toBe('3');
    expect(copy.x).toBe(120);
    expect(copy.y).toBe(120);
    expect(copy.seats).toBe(2);
    expect(copy.shape).toBe('rectangle');
    // The copy is a new physical table: no sticker, no history.
    expect(copy.qrToken).toBe('');
    expect(copy.hasHistory).toBe(false);
    // Selecting the copies is what makes duplicate-drag-duplicate work.
    expect(state.selection).toEqual([copy.id]);
  });

  it('copies a whole multi-selection at once', () => {
    const state = run(loaded(), { type: 'select', ids: ['t1', 't2'] }, { type: 'duplicate' });
    expect(state.plan.tables).toHaveLength(4);
    expect(state.selection).toHaveLength(2);
    expect(new Set(state.plan.tables.map((t) => t.label)).size).toBe(4);
  });

  it('undoes the whole duplication', () => {
    const before = loaded();
    const after = run(before, { type: 'select', ids: ['t1', 't2'] }, { type: 'duplicate' });
    expect(reducer(after, { type: 'undo' }).plan).toEqual(before.plan);
  });
});

describe('delete', () => {
  it('removes a table that has never been used', () => {
    const state = run(loaded(), { type: 'select', ids: ['t1'] }, { type: 'delete' });
    expect(state.plan.tables.map((t) => t.id)).toEqual(['t2']);
    expect(state.selection).toEqual([]);
  });

  it('deactivates a table with history rather than removing it', () => {
    // The server would refuse to delete it — removing a table with bookings
    // would orphan financial records — so the editor must not pretend it went.
    const withHistory = loaded();
    const seeded: EditorState = {
      ...withHistory,
      plan: {
        ...withHistory.plan,
        tables: withHistory.plan.tables.map((t) =>
          t.id === 't1' ? { ...t, hasHistory: true } : t,
        ),
      },
    };

    const state = run(seeded, { type: 'select', ids: ['t1'] }, { type: 'delete' });

    expect(state.plan.tables).toHaveLength(2);
    expect(byId(state, 't1').isActive).toBe(false);
    // Still on the canvas, so a person can see what happened and reactivate it.
    expect(byId(state, 't1').label).toBe('1');
  });

  it('reactivates a deactivated table', () => {
    const seeded: EditorState = (() => {
      const base = loaded();
      return {
        ...base,
        plan: {
          ...base.plan,
          tables: base.plan.tables.map((t) => (t.id === 't1' ? { ...t, isActive: false } : t)),
        },
      };
    })();
    expect(byId(reducer(seeded, { type: 'reactivate', id: 't1' }), 't1').isActive).toBe(true);
  });

  it('undoes a delete', () => {
    const before = loaded();
    const after = run(before, { type: 'select', ids: ['t1', 't2'] }, { type: 'delete' });
    expect(after.plan.tables).toHaveLength(0);
    expect(reducer(after, { type: 'undo' }).plan).toEqual(before.plan);
  });
});

describe('canvas resize', () => {
  it('changes the canvas without moving the furniture', () => {
    const state = reducer(loaded(), { type: 'setCanvas', width: 400, height: 300 });
    expect(state.plan.floorWidth).toBe(400);
    // Table 2 now sits outside. It is NOT shoved into bounds: the screen warns
    // and names it first, because silently rearranging a room is how a plan
    // stops matching the actual cafe.
    expect(byId(state, 't2').x).toBe(300);
    expect(tablesOutsideCanvas(state.plan).map((t) => t.label)).toEqual(['2']);
  });

  it('undoes a canvas resize', () => {
    const before = loaded();
    const after = reducer(before, { type: 'setCanvas', width: 400, height: 300 });
    expect(reducer(after, { type: 'undo' }).plan).toEqual(before.plan);
  });
});

describe('the row helper', () => {
  it('lays a run of identical tables along a wall', () => {
    const state = reducer(loaded(), {
      type: 'addRow',
      row: {
        count: 4,
        shape: 'round',
        seats: 2,
        spacing: 20,
        orientation: 'horizontal',
        width: 60,
        height: 60,
        x: 100,
        y: 600,
        floorAreaId: 'a-windows',
      },
    });

    const added = state.plan.tables.slice(2);
    expect(added).toHaveLength(4);
    expect(added.map((t) => t.x)).toEqual([100, 180, 260, 340]);
    expect(added.every((t) => t.y === 600 && t.shape === 'round' && t.seats === 2)).toBe(true);
    expect(added.every((t) => t.floorAreaId === 'a-windows')).toBe(true);
    // Labels continue from what is already there, and none repeat.
    expect(new Set(state.plan.tables.map((t) => t.label)).size).toBe(6);
  });

  it('runs vertically too, and undoes as one step', () => {
    const before = loaded();
    const after = reducer(before, {
      type: 'addRow',
      row: {
        count: 3,
        shape: 'rectangle',
        seats: 4,
        spacing: 10,
        orientation: 'vertical',
        width: 60,
        height: 60,
        x: 500,
        y: 100,
        floorAreaId: null,
      },
    });
    expect(after.plan.tables.slice(2).map((t) => t.y)).toEqual([100, 170, 240]);
    expect(reducer(after, { type: 'undo' }).plan).toEqual(before.plan);
  });
});

describe('areas', () => {
  it('assigns tables to an area by property', () => {
    const state = reducer(loaded(), {
      type: 'assignArea',
      ids: ['t1', 't2'],
      floorAreaId: 'a-terrace',
    });
    expect(state.plan.tables.every((t) => t.floorAreaId === 'a-terrace')).toBe(true);
  });

  it('removing an area keeps its tables, with no area', () => {
    // Areas are context, not containers. A table belongs to one by property,
    // never by sitting inside a rectangle that owns it.
    const state = reducer(loaded(), { type: 'removeArea', areaId: 'a-windows' });
    expect(state.plan.areas.map((a) => a.id)).toEqual(['a-terrace']);
    expect(state.plan.tables).toHaveLength(2);
    expect(byId(state, 't1').floorAreaId).toBeNull();
  });

  it('reorders areas and renumbers them', () => {
    const state = reducer(loaded(), { type: 'moveArea', areaId: 'a-terrace', direction: -1 });
    expect(state.plan.areas.map((a) => a.name)).toEqual(['Terrace', 'Windows']);
    expect(state.plan.areas.map((a) => a.displayOrder)).toEqual([0, 1]);
  });

  it('refuses to move an area off either end', () => {
    const state = loaded();
    expect(reducer(state, { type: 'moveArea', areaId: 'a-windows', direction: -1 })).toBe(state);
    expect(reducer(state, { type: 'moveArea', areaId: 'a-terrace', direction: 1 })).toBe(state);
  });
});

describe('align', () => {
  it('aligns a selection to an edge', () => {
    const state = run(
      loaded(),
      { type: 'select', ids: ['t1', 't2'] },
      { type: 'align', edge: 'left' },
    );
    expect(byId(state, 't1').x).toBe(100);
    expect(byId(state, 't2').x).toBe(100);
  });

  it('does nothing with fewer than two tables selected', () => {
    const one = run(loaded(), { type: 'select', ids: ['t1'] });
    expect(reducer(one, { type: 'align', edge: 'left' })).toBe(one);
  });
});

describe('undo history', () => {
  it('keeps at least twenty steps', () => {
    let state = run(loaded(), { type: 'select', ids: ['t1'] });
    for (let i = 0; i < 25; i += 1) state = reducer(state, { type: 'move', dx: 10, dy: 0 });

    for (let i = 0; i < 20; i += 1) state = reducer(state, { type: 'undo' });
    expect(canUndo(state)).toBe(true);
  });

  it('abandons the redo branch once a new edit lands', () => {
    const state = run(
      loaded(),
      { type: 'select', ids: ['t1'] },
      { type: 'move', dx: 10, dy: 0 },
      { type: 'undo' },
    );
    expect(canRedo(state)).toBe(true);
    expect(canRedo(reducer(state, { type: 'move', dx: 20, dy: 0 }))).toBe(false);
  });

  it('does not spend an undo step on selecting', () => {
    expect(isMutation({ type: 'select', ids: ['t1'] })).toBe(false);
    expect(isMutation({ type: 'move', dx: 1, dy: 1 })).toBe(true);
    const state = run(loaded(), { type: 'select', ids: ['t1'] }, { type: 'clearSelection' });
    expect(canUndo(state)).toBe(false);
  });

  it('drops a selected id that the restored plan no longer contains', () => {
    const state = run(
      loaded(),
      { type: 'select', ids: ['t1'] },
      { type: 'duplicate' },
      { type: 'undo' },
    );
    expect(state.selection.every((id) => state.plan.tables.some((t) => t.id === id))).toBe(true);
  });
});

describe('dirty tracking', () => {
  it('is clean on load, dirty after an edit, clean again after a save', () => {
    const state = loaded();
    expect(isDirty(state)).toBe(false);

    const edited = run(state, { type: 'select', ids: ['t1'] }, { type: 'move', dx: 10, dy: 0 });
    expect(isDirty(edited)).toBe(true);

    const savedPlan: EditorFloorPlan = {
      ...PLAN,
      tables: PLAN.tables.map((t) => (t.id === 't1' ? { ...t, x: 110 } : t)),
    };
    const after = reducer(edited, {
      type: 'saved',
      result: { plan: savedPlan, warnings: [], deactivatedTables: [], removedTables: [] },
    });
    expect(isDirty(after)).toBe(false);
    expect(canUndo(after)).toBe(false);
  });

  it('remembers which tables the server said had history', () => {
    const state = reducer(loaded(), {
      type: 'saved',
      result: { plan: PLAN, warnings: [], deactivatedTables: ['1'], removedTables: [] },
    });
    expect(byId(state, 't1').hasHistory).toBe(true);
    expect(byId(state, 't2').hasHistory).toBe(false);
  });
});

describe('the save payload', () => {
  it('never contains a QR token', () => {
    const state = run(
      loaded(),
      { type: 'select', ids: ['t1'] },
      { type: 'duplicate' },
      { type: 'move', dx: 20, dy: 20 },
    );
    const command = toSaveCommand(state);

    const serialised = JSON.stringify(command);
    expect(serialised).not.toContain('qrToken');
    expect(serialised).not.toContain('qr-one');
    expect(serialised).not.toContain('qr-two');
    for (const table of command.tables) {
      expect(table).not.toHaveProperty('qrToken');
    }
  });

  it('sends an area by name, because that is what the server matches on', () => {
    const command = toSaveCommand(loaded());
    expect(command.tables.map((t) => t.floorAreaName)).toEqual(['Windows', 'Terrace']);
  });

  it('omits an id the server has never seen', () => {
    const state = run(loaded(), { type: 'addTable' });
    const command = toSaveCommand(state);
    expect(command.tables).toHaveLength(3);
    expect(command.tables[2]).not.toHaveProperty('id');
    expect(command.tables[0]?.id).toBe('t1');
  });

  it('drops a deactivated table, so it stays retired', () => {
    const seeded = loaded();
    const withDead: EditorState = {
      ...seeded,
      plan: {
        ...seeded.plan,
        tables: seeded.plan.tables.map((t) => (t.id === 't1' ? { ...t, isActive: false } : t)),
      },
    };
    expect(toSaveCommand(withDead).tables.map((t) => t.label)).toEqual(['2']);
  });

  it('rounds geometry, because the server stores integers', () => {
    const state = run(
      loaded(),
      { type: 'setGrid', enabled: false },
      { type: 'select', ids: ['t1'] },
      { type: 'move', dx: 0.4, dy: 0.6 },
    );
    for (const table of toSaveCommand(state).tables) {
      expect(Number.isInteger(table.x)).toBe(true);
      expect(Number.isInteger(table.y)).toBe(true);
    }
  });
});

describe('client-side validation mirrors the server, and no more', () => {
  it('names duplicate labels', () => {
    const state = reducer(loaded(), { type: 'updateTable', id: 't2', patch: { label: '1' } });
    expect(duplicateLabels(state.plan)).toEqual(['1']);
  });

  it('does not treat overlapping tables as a problem', () => {
    // Real rooms have stools tucked under bars. The server warns and saves; a
    // client rule stricter than the server teaches a rule that does not exist.
    const state = run(
      loaded(),
      { type: 'select', ids: ['t2'] },
      { type: 'updateTable', id: 't2', patch: { x: 100, y: 100 } },
    );
    expect(tablesOutsideCanvas(state.plan)).toEqual([]);
    expect(duplicateLabels(state.plan)).toEqual([]);
  });
});
