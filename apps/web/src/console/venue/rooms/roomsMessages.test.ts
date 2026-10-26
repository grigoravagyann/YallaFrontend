import { MAX_ROOM_PHOTOS, type ReplaceFloorPlanCommand } from '@yalla/api';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { sameName, saveResultLines, savedWarnings, violationLine } from './roomsMessages';

/** A `t` that says which key it was asked for, and with what. */
const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key) as unknown as TFunction;

const SENT = {
  areas: [
    { name: 'Hall', photoIds: [] },
    { name: 'Terrace', photoIds: [] },
  ],
  tables: [{ label: '1' }, { label: '7' }],
  expectedVersion: 'v1',
} as unknown as ReplaceFloorPlanCommand;

describe('sameName', () => {
  it('ignores case and the spaces round a name', () => {
    expect(sameName(' Terrace ', 'terrace')).toBe(true);
    expect(sameName('Hall', 'Hall 2')).toBe(false);
  });
});

describe('savedWarnings', () => {
  it('leaves out the unpinned-bookable warning the banner already says', () => {
    expect(
      savedWarnings(t, [
        'Bookable table(s) 3, 4 are not pinned on a room photo, so diners are not offered them.',
      ]),
    ).toEqual([]);
  });

  it("puts the warnings it knows in the person's words, with the tables they name", () => {
    expect(
      savedWarnings(t, [
        'Table(s) 5, 6 were taken off photos this plan removed from every room.',
        'Table(s) 9 were taken off photos this plan moved to another room.',
      ]),
    ).toEqual([
      'rooms.result.unpinnedByRemoval {"labels":"5, 6"}',
      'rooms.result.unpinnedByMove {"labels":"9"}',
    ]);
  });

  it("keeps any other warning in the server's own sentence", () => {
    expect(savedWarnings(t, ['Something new.'])).toEqual(['Something new.']);
  });
});

describe('saveResultLines', () => {
  it('is nothing when the save said nothing', () => {
    expect(saveResultLines(t, { deactivatedTables: [], removedTables: [], warnings: [] })).toBe(
      null,
    );
  });

  it('says what was taken out of service, then removed, then the warnings', () => {
    expect(
      saveResultLines(t, {
        deactivatedTables: ['2', '3'],
        removedTables: ['8'],
        warnings: ['Something new.'],
      }),
    ).toEqual([
      'rooms.result.deactivated {"labels":"2, 3"}',
      'rooms.result.removed {"labels":"8"}',
      'Something new.',
    ]);
  });
});

describe('violationLine', () => {
  it('names the room of a photo in two rooms, or of too many photos', () => {
    expect(violationLine(t, { field: 'areas[1].photoIds[3]' }, SENT)).toBe(
      'rooms.error.photoInTwoRooms {"name":"Terrace"}',
    );
    expect(violationLine(t, { field: 'areas[0].photoIds' }, SENT)).toBe(
      `rooms.error.tooManyPhotos {"name":"Hall","max":${MAX_ROOM_PHOTOS}}`,
    );
  });

  it('names the table of a pin on another room, or a pin out of place', () => {
    expect(violationLine(t, { field: 'tables[1].photoId', bound: 'conflict' }, SENT)).toBe(
      'rooms.error.pinOtherRoom {"label":"7"}',
    );
    expect(violationLine(t, { field: 'tables[0].photoX' }, SENT)).toBe(
      'rooms.error.pinInvalid {"label":"1"}',
    );
  });

  it('names nothing it cannot find, and falls back to the general refusal', () => {
    expect(violationLine(t, { field: 'tables[5].photoY' }, null)).toBe(
      'rooms.error.pinInvalid {"label":""}',
    );
    expect(violationLine(t, { field: 'expectedVersion' }, SENT)).toBe('rooms.error.invalid');
  });
});
