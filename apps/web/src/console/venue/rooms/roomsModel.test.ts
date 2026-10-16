import type { EditorFloorPlan, Photo } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  bookableUnpinned,
  duplicateLabels,
  duplicateRoomNames,
  freeSpot,
  initialState,
  isDirty,
  nextLabel,
  nudge,
  reducer,
  toFraction,
  toSaveCommand,
  type RoomsState,
} from './roomsModel';

const photo = (photoId: string): Photo => ({
  photoId,
  thumbnailUrl: `/t/${photoId}`,
  cardUrl: `/c/${photoId}`,
  fullUrl: `/f/${photoId}`,
  width: 1600,
  height: 1200,
});

const PLAN: EditorFloorPlan = {
  branchId: 'b1',
  version: '4',
  areas: [
    { id: 'hall', name: 'Hall', displayOrder: 0, photos: [photo('p1'), photo('p2')] },
    { id: 'terrace', name: 'Terrace', displayOrder: 1, photos: [photo('p3')] },
  ],
  tables: [
    {
      id: 't1',
      label: '1',
      seats: 2,
      floorAreaId: 'hall',
      isBookable: true,
      isActive: true,
      isDeletable: false,
      status: 'occupied',
      qrToken: 'qr1',
      pin: { photoId: 'p1', x: 0.25, y: 0.5 },
    },
    {
      id: 't2',
      label: '2',
      seats: 4,
      floorAreaId: 'terrace',
      isBookable: true,
      isActive: true,
      isDeletable: true,
      status: 'free',
      qrToken: 'qr2',
      pin: null,
    },
    {
      id: 't9',
      label: '9',
      seats: 2,
      floorAreaId: null,
      isBookable: true,
      isActive: false,
      isDeletable: false,
      status: 'free',
      qrToken: 'qr9',
      pin: null,
    },
  ],
};

function loaded(): RoomsState {
  return reducer(initialState(), { type: 'loaded', plan: PLAN });
}

const table = (state: RoomsState, id: string) => state.tables.find((t) => t.id === id)!;
const room = (state: RoomsState, id: string) => state.rooms.find((r) => r.id === id)!;

describe('the rooms working copy', () => {
  it('loads the plan as it is, and is not dirty', () => {
    const state = loaded();
    expect(state.rooms.map((r) => r.name)).toEqual(['Hall', 'Terrace']);
    expect(isDirty(state)).toBe(false);
    expect(toSaveCommand(state)).toEqual({
      expectedVersion: '4',
      areas: [
        { id: 'hall', name: 'Hall', displayOrder: 0, photoIds: ['p1', 'p2'] },
        { id: 'terrace', name: 'Terrace', displayOrder: 1, photoIds: ['p3'] },
      ],
      // The deactivated table is left out: sending it would bring it back.
      tables: [
        {
          id: 't1',
          label: '1',
          seats: 2,
          floorAreaName: 'Hall',
          isBookable: true,
          pin: { photoId: 'p1', x: 0.25, y: 0.5 },
        },
        { id: 't2', label: '2', seats: 4, floorAreaName: 'Terrace', isBookable: true, pin: null },
      ],
    });
  });

  it('adds, renames and reorders rooms; a new room is sent without an id', () => {
    let state = reducer(loaded(), { type: 'addRoom', name: '  VIP ' });
    const vip = state.rooms[2]!;
    state = reducer(state, { type: 'renameRoom', id: 'hall', name: 'Main hall' });
    state = reducer(state, { type: 'moveRoom', id: vip.id, delta: -1 });

    expect(isDirty(state)).toBe(true);
    expect(toSaveCommand(state).areas).toEqual([
      { id: 'hall', name: 'Main hall', displayOrder: 0, photoIds: ['p1', 'p2'] },
      { name: 'VIP', displayOrder: 1, photoIds: [] },
      { id: 'terrace', name: 'Terrace', displayOrder: 2, photoIds: ['p3'] },
    ]);
    expect(toSaveCommand(state).tables[0]!.floorAreaName).toBe('Main hall');
  });

  it('deletes a room with its photos, and its tables lose the room and the pin', () => {
    const state = reducer(loaded(), { type: 'removeRoom', id: 'hall' });
    expect(state.rooms.map((r) => r.id)).toEqual(['terrace']);
    expect(table(state, 't1')).toMatchObject({ roomId: null, pin: null });
  });

  it('adds photos up to ten, once each, never one already in another room', () => {
    let state = loaded();
    state = reducer(state, { type: 'addPhoto', roomId: 'terrace', photo: photo('p1') });
    state = reducer(state, { type: 'addPhoto', roomId: 'hall', photo: photo('p2') });
    expect(room(state, 'terrace').photos.map((p) => p.photoId)).toEqual(['p3']);
    expect(room(state, 'hall').photos.map((p) => p.photoId)).toEqual(['p1', 'p2']);

    for (let i = 0; i < 12; i += 1) {
      state = reducer(state, { type: 'addPhoto', roomId: 'terrace', photo: photo(`n${i}`) });
    }
    expect(room(state, 'terrace').photos).toHaveLength(10);
  });

  it('reorders photos, and removing one takes its tables off it', () => {
    let state = reducer(loaded(), { type: 'movePhoto', roomId: 'hall', photoId: 'p2', delta: -1 });
    expect(room(state, 'hall').photos.map((p) => p.photoId)).toEqual(['p2', 'p1']);

    state = reducer(state, { type: 'removePhoto', roomId: 'hall', photoId: 'p1' });
    expect(room(state, 'hall').photos.map((p) => p.photoId)).toEqual(['p2']);
    expect(table(state, 't1')).toMatchObject({ roomId: 'hall', pin: null });
  });

  it('adds a table pinned where the photo was clicked, in the photo room, sent without an id', () => {
    const state = reducer(loaded(), {
      type: 'addTable',
      table: { label: ' 12 ', seats: 6, isBookable: false },
      pin: { photoId: 'p3', x: 0.1234567, y: 2 },
    });
    const added = state.tables.at(-1)!;
    expect(added).toMatchObject({ label: '12', seats: 6, roomId: 'terrace', isBookable: false });
    expect(added.pin).toEqual({ photoId: 'p3', x: 0.1235, y: 1 });
    expect(toSaveCommand(state).tables.at(-1)).toEqual({
      label: '12',
      seats: 6,
      floorAreaName: 'Terrace',
      isBookable: false,
      pin: { photoId: 'p3', x: 0.1235, y: 1 },
    });
  });

  it("moves a pin, and placing a table on another room's photo moves the table there", () => {
    let state = reducer(loaded(), {
      type: 'placeTable',
      id: 't1',
      pin: { photoId: 'p2', x: 0.6, y: 0.4 },
    });
    expect(table(state, 't1')).toMatchObject({ roomId: 'hall', pin: { photoId: 'p2', x: 0.6 } });

    state = reducer(state, {
      type: 'placeTable',
      id: 't2',
      pin: { photoId: 'p1', x: 0.5, y: 0.5 },
    });
    expect(table(state, 't2').roomId).toBe('hall');

    state = reducer(state, { type: 'placeTable', id: 't2', pin: null });
    expect(table(state, 't2')).toMatchObject({ roomId: 'hall', pin: null });
  });

  it('edits a table, and drops an unsaved one outright', () => {
    let state = reducer(loaded(), {
      type: 'updateTable',
      id: 't2',
      patch: { label: '2A', seats: 3, isBookable: false },
    });
    expect(table(state, 't2')).toMatchObject({ label: '2A', seats: 3, isBookable: false });

    state = reducer(state, {
      type: 'addTable',
      table: { label: '30', seats: 2, isBookable: true },
      pin: { photoId: 'p1', x: 0.5, y: 0.5 },
    });
    const added = state.tables.at(-1)!;
    state = reducer(state, { type: 'discardTable', id: added.id });
    expect(state.tables.some((t) => t.id === added.id)).toBe(false);
  });

  it("applies the server's deletion: gone when removed, kept inactive when deactivated", () => {
    let state = reducer(loaded(), {
      type: 'deleted',
      result: { tableId: 't2', label: '2', deleted: true, deactivated: false, message: '' },
    });
    expect(state.tables.some((t) => t.id === 't2')).toBe(false);

    state = reducer(state, {
      type: 'deleted',
      result: { tableId: 't1', label: '1', deleted: false, deactivated: true, message: '' },
    });
    expect(table(state, 't1').isActive).toBe(false);
    expect(toSaveCommand(state).tables).toEqual([]);
    // The server already holds both, so neither is an unsaved change.
    expect(isDirty(state)).toBe(false);
  });

  it('takes a replaced QR code without making it an unsaved change', () => {
    const state = reducer(loaded(), { type: 'qrReplaced', id: 't2', qrToken: 'qr2-new' });
    expect(table(state, 't2').qrToken).toBe('qr2-new');
    expect(isDirty(state)).toBe(false);
  });

  it('puts a deactivated table back in service through the next save', () => {
    const state = reducer(loaded(), { type: 'restoreTable', id: 't9' });
    expect(table(state, 't9').isActive).toBe(true);
    expect(toSaveCommand(state).tables.map((t) => t.label)).toContain('9');
    expect(isDirty(state)).toBe(true);
  });

  it('takes the saved plan, with its new version, as the new baseline', () => {
    let state = reducer(loaded(), { type: 'renameRoom', id: 'hall', name: 'Bar' });
    state = reducer(state, {
      type: 'loaded',
      plan: { ...PLAN, version: '5', areas: [{ ...PLAN.areas[0]!, name: 'Bar' }, PLAN.areas[1]!] },
    });
    expect(isDirty(state)).toBe(false);
    expect(toSaveCommand(state).expectedVersion).toBe('5');
  });
});

describe('what the rooms editor warns about', () => {
  it('names bookable tables with no pin, the ones diners cannot see or book', () => {
    let state = loaded();
    expect(bookableUnpinned(state).map((t) => t.label)).toEqual(['2']);
    state = reducer(state, { type: 'updateTable', id: 't2', patch: { isBookable: false } });
    expect(bookableUnpinned(state)).toEqual([]);
  });

  it('names labels used twice, ignoring case and spaces', () => {
    const state = reducer(loaded(), { type: 'updateTable', id: 't2', patch: { label: ' 1 ' } });
    expect(duplicateLabels(state)).toEqual(['1']);
  });

  it('names rooms called the same, ignoring case and spaces, and not unnamed ones', () => {
    let state = reducer(loaded(), { type: 'addRoom', name: 'terrace ' });
    state = reducer(state, { type: 'addRoom', name: ' TERRACE' });
    state = reducer(state, { type: 'addRoom', name: 'x' });
    state = reducer(state, { type: 'renameRoom', id: `new-room-${state.sequence}`, name: ' ' });
    state = reducer(state, { type: 'addRoom', name: 'y' });
    state = reducer(state, { type: 'renameRoom', id: `new-room-${state.sequence}`, name: '' });
    expect(duplicateRoomNames(state)).toEqual(['Terrace']);
  });

  it('suggests the next number for a new table', () => {
    expect(nextLabel(loaded())).toBe('10');
    expect(
      nextLabel(reducer(initialState(), { type: 'loaded', plan: { ...PLAN, tables: [] } })),
    ).toBe('1');
  });
});

describe('pin arithmetic', () => {
  it('clamps to 0-1 and rounds to four places', () => {
    expect(toFraction(-0.2)).toBe(0);
    expect(toFraction(1.7)).toBe(1);
    expect(toFraction(0.123456)).toBe(0.1235);
    expect(toFraction(Number.NaN)).toBe(0);
  });

  it('nudges with the arrow keys, further with shift, and ignores other keys', () => {
    const pin = { photoId: 'p1', x: 0.5, y: 0.5 };
    expect(nudge(pin, 'ArrowLeft', false)).toEqual({ photoId: 'p1', x: 0.49, y: 0.5 });
    expect(nudge(pin, 'ArrowDown', true)).toEqual({ photoId: 'p1', x: 0.5, y: 0.55 });
    expect(nudge({ ...pin, x: 0 }, 'ArrowLeft', false)?.x).toBe(0);
    expect(nudge(pin, 'Enter', false)).toBeNull();
  });
});

describe('the version a table delete moved', () => {
  it('is taken when the plan read back is the baseline, and not when somebody else saved too', () => {
    const state = reducer(initialState(), { type: 'loaded', plan: PLAN });
    const same = reducer(state, { type: 'versionMoved', plan: { ...PLAN, version: '5' } });
    expect(same.version).toBe('5');

    const changed = reducer(state, {
      type: 'versionMoved',
      plan: { ...PLAN, version: '6', areas: PLAN.areas.slice(1) },
    });
    expect(changed.version).toBe('4');
  });
});

describe('the spot for a table added in the middle', () => {
  it('is the middle when it is clear, and beside the pins already there otherwise', () => {
    const state = reducer(initialState(), { type: 'loaded', plan: PLAN });
    expect(freeSpot(state, 'p2')).toEqual({ photoId: 'p2', x: 0.5, y: 0.5 });

    const one = reducer(state, {
      type: 'addTable',
      table: { label: '20', seats: 2, isBookable: true },
      pin: freeSpot(state, 'p2'),
    });
    const second = freeSpot(one, 'p2');
    expect(second).not.toEqual({ photoId: 'p2', x: 0.5, y: 0.5 });
    const two = reducer(one, {
      type: 'addTable',
      table: { label: '21', seats: 2, isBookable: true },
      pin: second,
    });
    expect(freeSpot(two, 'p2')).not.toEqual(second);
  });
});
