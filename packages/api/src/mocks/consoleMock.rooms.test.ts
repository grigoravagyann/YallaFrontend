import { describe, expect, it } from 'vitest';
import type { ConsoleGateway } from '../consoleGateway';
import { FloorPlanChangedError, FloorPlanInvalidError } from '../contracts/errors';
import type {
  EditorFloorPlan,
  ReplaceFloorAreaInput,
  ReplaceFloorPlanCommand,
  ReplaceFloorTableInput,
} from '../contracts/floorPlan';
import { NotFoundError, ValidationError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';

/**
 * Rooms with photos in the console mock, against what
 * `BranchSettingsService.ReplaceFloorPlanAsync` answers: the same statuses,
 * codes, fields, bounds and sentences, so a screen built on the mock meets no
 * surprise on the server.
 */

const BRANCH = 'b-lumen-cascade';

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

function named(error: unknown): (readonly [string, string | undefined])[] {
  expect(error).toBeInstanceOf(ValidationError);
  return (error as ValidationError).violations.map((v) => [v.field, v.bound] as const);
}

async function upload(gateway: ConsoleGateway, name: string, branchId = BRANCH): Promise<string> {
  const { photo } = await gateway.uploadPhoto({
    branchId,
    file: new Blob([new Uint8Array([1, 2, 3, name.length])], { type: 'image/png' }),
    fileName: name,
  });
  return photo.photoId;
}

/** The plan exactly as loaded, as a command: what an editor sends when nothing changed. */
function asCommand(plan: EditorFloorPlan): {
  areas: ReplaceFloorAreaInput[];
  tables: ReplaceFloorTableInput[];
  expectedVersion: string;
} {
  const nameOf = new Map(plan.areas.map((area) => [area.id, area.name]));
  return {
    expectedVersion: plan.version,
    areas: plan.areas.map((area) => ({
      id: area.id,
      name: area.name,
      displayOrder: area.displayOrder,
      photoIds: area.photos.map((photo) => photo.photoId),
    })),
    tables: plan.tables
      .filter((table) => table.isActive)
      .map((table) => ({
        id: table.id,
        label: table.label,
        seats: table.seats,
        floorAreaName: table.floorAreaId ? (nameOf.get(table.floorAreaId) ?? null) : null,
        isBookable: table.isBookable,
        pin: table.pin,
      })),
  };
}

async function save(gateway: ConsoleGateway, command: ReplaceFloorPlanCommand) {
  return gateway.replaceFloorPlan({ branchId: BRANCH, command });
}

describe('rooms in the console mock', () => {
  it('reads rooms with their photos and tables with a pin, a status and whether they can go', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const plan = await gateway.getFloorPlan(BRANCH);

    expect(plan).not.toHaveProperty('floorWidth');
    expect(plan.areas.length).toBeGreaterThan(0);
    for (const area of plan.areas) expect(area.photos).toEqual([]);
    const one = plan.tables.find((table) => table.label === '1')!;
    const two = plan.tables.find((table) => table.label === '2')!;
    expect(one).toMatchObject({ pin: null, status: 'free', isDeletable: false });
    expect(two).toMatchObject({ pin: null, status: 'free', isDeletable: true });
    expect(one).not.toHaveProperty('x');
  });

  it('saves photos in order and pins on them, and reads them back', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const a = await upload(gateway, 'hall-a.png');
    const b = await upload(gateway, 'hall-b.png');
    const command = asCommand(await gateway.getFloorPlan(BRANCH));
    const hall = command.areas[0]!;
    command.areas[0] = { ...hall, photoIds: [b, a] };
    command.tables = command.tables.map((table) =>
      table.floorAreaName === hall.name
        ? { ...table, pin: { photoId: a, x: 0.25, y: 0.75 } }
        : table,
    );

    const result = await save(gateway, command);

    expect(result.plan.areas[0]!.photos.map((photo) => photo.photoId)).toEqual([b, a]);
    const pinned = result.plan.tables.filter((table) => table.pin !== null);
    expect(pinned.length).toBeGreaterThan(0);
    expect(pinned[0]!.pin).toEqual({ photoId: a, x: 0.25, y: 0.75 });
    expect(await gateway.getFloorPlan(BRANCH)).toEqual(result.plan);
  });

  it('warns about bookable tables with no pin, in the server sentence', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const command = asCommand(await gateway.getFloorPlan(BRANCH));
    command.tables = command.tables.map((table) =>
      table.label === '2' ? { ...table, isBookable: false } : table,
    );

    const result = await save(gateway, command);

    const labels = command.tables
      .filter((table) => table.isBookable)
      .map((table) => table.label.trim())
      .join(', ');
    expect(result.warnings).toEqual([
      `Bookable table(s) ${labels} are not pinned on a room photo, so diners are not offered them.`,
    ]);
  });

  it('refuses an eleventh photo, a photo twice and a photo in two rooms, naming each field', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const ids: string[] = [];
    for (let i = 0; i < 12; i += 1) ids.push(await upload(gateway, `p${i}.png`));
    const command = asCommand(await gateway.getFloorPlan(BRANCH));
    command.areas[0] = { ...command.areas[0]!, photoIds: ids.slice(0, 11) };
    command.areas[1] = { ...command.areas[1]!, photoIds: [ids[0]!] };
    command.areas[2] = { ...command.areas[2]!, photoIds: [ids[11]!, ids[11]!] };
    const before = await gateway.getFloorPlan(BRANCH);

    const error = await caught(save(gateway, command));

    expect((error as ValidationError).status).toBe(422);
    expect((error as ValidationError).code).toBe('validation-failed');
    expect(named(error)).toEqual([
      ['areas[0].photoIds', 'max'],
      ['areas[1].photoIds[0]', 'conflict'],
      ['areas[2].photoIds[1]', 'conflict'],
    ]);
    expect((error as ValidationError).violations[1]!.message).toBe(
      `This photo is already in ${command.areas[0]!.name}. A photo belongs to one room.`,
    );
    expect((error as ValidationError).violations[2]!.message).toBe(
      'This photo is in the room more than once.',
    );
    expect(await gateway.getFloorPlan(BRANCH)).toEqual(before);
  });

  it("refuses half a pin, a coordinate outside 0-1 and a pin on another room's photo", async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const hallPhoto = await upload(gateway, 'hall.png');
    const barPhoto = await upload(gateway, 'bar.png');
    const command = asCommand(await gateway.getFloorPlan(BRANCH));
    command.areas[0] = { ...command.areas[0]!, photoIds: [hallPhoto] };
    command.areas[1] = { ...command.areas[1]!, photoIds: [barPhoto] };
    const inHall = command.tables.findIndex((t) => t.floorAreaName === command.areas[0]!.name);
    const second = command.tables.findIndex(
      (t, index) => index > inHall && t.floorAreaName === command.areas[0]!.name,
    );
    const inBar = command.tables.findIndex((t) => t.floorAreaName === command.areas[1]!.name);
    command.tables[inHall] = {
      ...command.tables[inHall]!,
      pin: { photoId: hallPhoto, x: 1.5, y: 0.5 },
    };
    command.tables[second] = {
      ...command.tables[second]!,
      pin: { photoId: barPhoto, x: 0.5, y: 0.5 },
    };
    command.tables[inBar] = { ...command.tables[inBar]!, pin: { photoId: '', x: 0.5, y: 0.5 } };

    const error = await caught(save(gateway, command));

    expect(named(error)).toEqual(
      expect.arrayContaining([
        [`tables[${inHall}].photoX`, 'range'],
        [`tables[${second}].photoId`, 'conflict'],
        [`tables[${inBar}].photoId`, 'required'],
      ]),
    );
    const label = command.tables[second]!.label;
    expect(
      (error as ValidationError).violations.find((v) => v.field === `tables[${second}].photoId`)!
        .message,
    ).toBe(
      `Table ${label} is in ${command.areas[0]!.name}; this photo is ${command.areas[1]!.name}'s. Pin a table on one of its own room's photos.`,
    );
  });

  it("answers 404 for another branch's photo, and writes nothing", async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const foreign = await upload(gateway, 'elsewhere.png', 'b-lumen-north');
    const command = asCommand(await gateway.getFloorPlan(BRANCH));
    command.areas[0] = { ...command.areas[0]!, photoIds: [foreign] };

    expect(await caught(save(gateway, command))).toBeInstanceOf(NotFoundError);
    expect((await gateway.getFloorPlan(BRANCH)).areas[0]!.photos).toEqual([]);
  });

  it('takes tables off a photo the plan drops from every room, with a warning', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const photoId = await upload(gateway, 'hall.png');
    const first = asCommand(await gateway.getFloorPlan(BRANCH));
    first.areas[0] = { ...first.areas[0]!, photoIds: [photoId] };
    const index = first.tables.findIndex((t) => t.floorAreaName === first.areas[0]!.name);
    first.tables[index] = { ...first.tables[index]!, pin: { photoId, x: 0.5, y: 0.5 } };
    const saved = await save(gateway, first);

    // The editor still sends the pin it loaded; the photo is gone from the room.
    const second = asCommand(saved.plan);
    second.areas[0] = { ...second.areas[0]!, photoIds: [] };
    const result = await save(gateway, second);

    const label = first.tables[index]!.label;
    expect(result.plan.tables.find((t) => t.label === label)!.pin).toBeNull();
    expect(result.warnings).toContain(
      `Table(s) ${label} were taken off photos this plan removed from every room.`,
    );
  });

  it('drops a room the plan leaves out, taking its photos and unpinning its tables', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const photoId = await upload(gateway, 'terrace.png');
    const first = asCommand(await gateway.getFloorPlan(BRANCH));
    const terrace = first.areas[2]!;
    first.areas[2] = { ...terrace, photoIds: [photoId] };
    first.tables = first.tables.map((t) =>
      t.floorAreaName === terrace.name ? { ...t, pin: { photoId, x: 0.1, y: 0.2 } } : t,
    );
    await save(gateway, first);

    const second = asCommand(await gateway.getFloorPlan(BRANCH));
    second.areas = second.areas.filter((area) => area.name !== terrace.name);
    second.tables = second.tables.map((t) =>
      t.floorAreaName === terrace.name ? { ...t, floorAreaName: null, pin: null } : t,
    );
    const result = await save(gateway, second);

    expect(result.plan.areas.map((area) => area.name)).not.toContain(terrace.name);
    expect(result.plan.tables.filter((t) => t.pin !== null)).toEqual([]);
  });

  it('refuses a table naming a room the plan does not keep, and repeated room names', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const command = asCommand(await gateway.getFloorPlan(BRANCH));
    const kept = command.areas[0]!;
    const table = command.tables.find((t) => t.floorAreaName === command.areas[2]!.name)!;
    command.areas = [kept, { name: ` ${kept.name.toUpperCase()} `, displayOrder: 1, photoIds: [] }];

    const error = await caught(save(gateway, command));

    expect(error).toBeInstanceOf(FloorPlanInvalidError);
    expect((error as FloorPlanInvalidError).status).toBe(422);
    expect((error as FloorPlanInvalidError).errors[0]).toBe(
      `Area names must be unique within a branch. Repeated: ${kept.name}.`,
    );
    expect((error as FloorPlanInvalidError).errors[1]).toContain(
      `${table.label} -> ${table.floorAreaName}`,
    );
  });

  it('refuses unlabelled tables and repeated labels before anything else', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const command = asCommand(await gateway.getFloorPlan(BRANCH));
    command.tables[0] = { ...command.tables[0]!, label: ' ' };
    command.tables[1] = { ...command.tables[1]!, label: command.tables[2]!.label };

    const error = await caught(save(gateway, command));

    expect(error).toBeInstanceOf(FloorPlanInvalidError);
    expect((error as FloorPlanInvalidError).errors).toEqual([
      '1 table(s) in the plan have no label. Every table needs the label printed on it.',
      `Table labels must be unique within a branch. Repeated: ${command.tables[2]!.label}.`,
    ]);
    expect((error as FloorPlanInvalidError).duplicateLabels).toEqual([command.tables[2]!.label]);
  });

  it('brings a deactivated table back when the plan keeps it', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const one = (await gateway.getFloorPlan(BRANCH)).tables.find((t) => t.label === '1')!;
    const deleted = await gateway.deleteTable({ branchId: BRANCH, tableId: one.id });
    expect(deleted.deactivated).toBe(true);

    const plan = await gateway.getFloorPlan(BRANCH);
    const command = asCommand(plan);
    command.tables.push({
      id: one.id,
      label: one.label,
      seats: one.seats,
      floorAreaName: null,
      isBookable: one.isBookable,
      pin: null,
    });
    const result = await save(gateway, command);

    expect(result.plan.tables.find((t) => t.id === one.id)!.isActive).toBe(true);
  });
});

describe('deleting a table in the console mock', () => {
  it('deactivates a table with history, in the server sentence, and keeps it inactive', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const one = (await gateway.getFloorPlan(BRANCH)).tables.find((t) => t.label === '1')!;

    const result = await gateway.deleteTable({ branchId: BRANCH, tableId: one.id });

    expect(result).toEqual({
      tableId: one.id,
      label: '1',
      deleted: false,
      deactivated: true,
      floorPlanVersion: expect.any(String),
      message:
        'Table 1 has reservations, seatings or tabs in its history, so it was deactivated rather than deleted. ' +
        'Its records are kept; it no longer appears on the floor plan or takes bookings.',
    });
    const after = (await gateway.getFloorPlan(BRANCH)).tables.find((t) => t.id === one.id)!;
    expect(after.isActive).toBe(false);
  });

  it('removes a table that was never used, in the server sentence', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const two = (await gateway.getFloorPlan(BRANCH)).tables.find((t) => t.label === '2')!;

    const result = await gateway.deleteTable({ branchId: BRANCH, tableId: two.id });

    expect(result.message).toBe('Table 2 was never used and has been removed.');
    expect(result).toMatchObject({ deleted: true, deactivated: false });
    expect((await gateway.getFloorPlan(BRANCH)).tables.some((t) => t.id === two.id)).toBe(false);
  });

  it('moves the plan version, so a tab that loaded before the delete cannot save it back', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const stale = await gateway.getFloorPlan(BRANCH);
    const one = stale.tables.find((t) => t.label === '1')!;
    const two = stale.tables.find((t) => t.label === '2')!;

    const removed = await gateway.deleteTable({ branchId: BRANCH, tableId: two.id });
    const afterRemove = await gateway.getFloorPlan(BRANCH);
    expect(afterRemove.version).not.toBe(stale.version);
    // The answer says the version it moved to, as the server's does.
    expect(removed.floorPlanVersion).toBe(afterRemove.version);
    await gateway.deleteTable({ branchId: BRANCH, tableId: one.id });
    expect((await gateway.getFloorPlan(BRANCH)).version).not.toBe(afterRemove.version);

    expect(await caught(save(gateway, asCommand(stale)))).toBeInstanceOf(FloorPlanChangedError);
  });

  it('answers 404 for a table that is not at the branch', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    expect(
      await caught(gateway.deleteTable({ branchId: BRANCH, tableId: 'tbl-nowhere' })),
    ).toBeInstanceOf(NotFoundError);
  });

  it('unpins the tables of a room deleted on its own route', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const photoId = await upload(gateway, 'bar.png');
    const command = asCommand(await gateway.getFloorPlan(BRANCH));
    const bar = command.areas[1]!;
    command.areas[1] = { ...bar, photoIds: [photoId] };
    command.tables = command.tables.map((t) =>
      t.floorAreaName === bar.name ? { ...t, pin: { photoId, x: 0.5, y: 0.5 } } : t,
    );
    await save(gateway, command);

    await gateway.deleteFloorArea({ branchId: BRANCH, areaId: bar.id! });

    const plan = await gateway.getFloorPlan(BRANCH);
    expect(plan.areas.some((area) => area.id === bar.id)).toBe(false);
    expect(plan.tables.filter((t) => t.pin !== null)).toEqual([]);
  });

  it('creates a room with no photos', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const area = await gateway.createFloorArea({ branchId: BRANCH, name: 'VIP', displayOrder: 9 });
    expect(area).toMatchObject({ name: 'VIP', displayOrder: 9, photos: [] });
  });
});

describe('the room routes and the plan version in the console mock', () => {
  it('moves the version when a room is added, renamed or deleted, so a stale save is refused', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const loaded = await gateway.getFloorPlan(BRANCH);

    const vip = await gateway.createFloorArea({ branchId: BRANCH, name: 'VIP', displayOrder: 5 });
    const afterAdd = await gateway.getFloorPlan(BRANCH);
    expect(afterAdd.version).not.toBe(loaded.version);
    expect(await caught(save(gateway, asCommand(loaded)))).toBeInstanceOf(FloorPlanChangedError);

    await gateway.updateFloorArea({
      branchId: BRANCH,
      areaId: vip.id,
      name: 'Lounge',
      displayOrder: 5,
    });
    const afterRename = await gateway.getFloorPlan(BRANCH);
    expect(afterRename.version).not.toBe(afterAdd.version);

    await gateway.deleteFloorArea({ branchId: BRANCH, areaId: vip.id });
    expect((await gateway.getFloorPlan(BRANCH)).version).not.toBe(afterRename.version);
  });

  it('refuses a room name another room has, ignoring case and spaces, but not its own', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const [first, second] = (await gateway.getFloorPlan(BRANCH)).areas;

    const added = await caught(
      gateway.createFloorArea({
        branchId: BRANCH,
        name: ` ${first!.name.toUpperCase()} `,
        displayOrder: 9,
      }),
    );
    expect(named(added)).toEqual([['name', 'conflict']]);
    expect((added as ValidationError).violations[0]!.message).toBe(
      `Area names must be unique within a branch. ${first!.name.toUpperCase()} is already used.`,
    );
    expect(
      named(
        await caught(
          gateway.updateFloorArea({
            branchId: BRANCH,
            areaId: second!.id,
            name: first!.name,
            displayOrder: 1,
          }),
        ),
      ),
    ).toEqual([['name', 'conflict']]);

    const renamed = await gateway.updateFloorArea({
      branchId: BRANCH,
      areaId: first!.id,
      name: first!.name.toLowerCase(),
      displayOrder: 0,
    });
    expect(renamed.name).toBe(first!.name.toLowerCase());
  });
});

describe('matching rooms in a plan save in the console mock', () => {
  it('refuses one room id sent by two entries, naming both', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const command = asCommand(await gateway.getFloorPlan(BRANCH));
    const hall = command.areas[0]!;
    command.areas.push({ ...hall, name: 'Annex', displayOrder: 9 });

    const error = await caught(save(gateway, command));

    expect(error).toBeInstanceOf(FloorPlanInvalidError);
    expect((error as FloorPlanInvalidError).errors).toEqual([
      `Room ${hall.name} is matched by more than one entry in the plan: ${hall.name} and Annex.`,
    ]);
  });

  it('makes two rooms when one is renamed and a new one takes its old name in the same save', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const command = asCommand(await gateway.getFloorPlan(BRANCH));
    const hall = command.areas[0]!;
    command.areas = [
      { name: hall.name, displayOrder: 0, photoIds: [] },
      { ...hall, name: 'Lounge', displayOrder: 1 },
      ...command.areas.slice(1).map((area, i) => ({ ...area, displayOrder: i + 2 })),
    ];
    command.tables = command.tables.map((t) =>
      t.floorAreaName === hall.name ? { ...t, floorAreaName: 'Lounge' } : t,
    );

    const result = await save(gateway, command);

    const lounge = result.plan.areas.find((area) => area.name === 'Lounge')!;
    const fresh = result.plan.areas.find((area) => area.name === hall.name)!;
    expect(lounge.id).toBe(hall.id);
    expect(fresh.id).not.toBe(hall.id);
  });

  it('takes a pin off a photo the save moves to another room, with a warning, instead of refusing', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const photoId = await upload(gateway, 'moving.png');
    const first = asCommand(await gateway.getFloorPlan(BRANCH));
    first.areas[0] = { ...first.areas[0]!, photoIds: [photoId] };
    const index = first.tables.findIndex((t) => t.floorAreaName === first.areas[0]!.name);
    first.tables[index] = { ...first.tables[index]!, pin: { photoId, x: 0.5, y: 0.5 } };
    const saved = await save(gateway, first);

    const second = asCommand(saved.plan);
    second.areas[0] = { ...second.areas[0]!, photoIds: [] };
    second.areas[1] = { ...second.areas[1]!, photoIds: [photoId] };
    const result = await save(gateway, second);

    const label = first.tables[index]!.label;
    expect(result.plan.tables.find((t) => t.label === label)!.pin).toBeNull();
    expect(result.warnings).toContain(
      `Table(s) ${label} were taken off photos this plan moved to another room.`,
    );
  });
});

describe('matching tables in a plan save in the console mock', () => {
  const entry = (label: string): ReplaceFloorTableInput => ({
    label,
    seats: 2,
    floorAreaName: null,
    isBookable: false,
    pin: null,
  });

  it('refuses one table id sent by two entries, naming both', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const command = asCommand(await gateway.getFloorPlan(BRANCH));
    const two = command.tables.find((t) => t.label === '2')!;
    command.tables.push({ ...two, label: '42' });

    const error = await caught(save(gateway, command));

    expect(error).toBeInstanceOf(FloorPlanInvalidError);
    expect((error as FloorPlanInvalidError).errors).toEqual([
      'Table 2 is matched by more than one entry in the plan: 2 and 42.',
    ]);
  });

  it('makes two tables when one is renamed and a new one takes its old label in the same save', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const command = asCommand(await gateway.getFloorPlan(BRANCH));
    const two = command.tables.find((t) => t.label === '2')!;
    command.tables = [
      ...command.tables.map((t) => (t.id === two.id ? { ...t, label: '20' } : t)),
      entry('2'),
    ];

    const result = await save(gateway, command);

    expect(result.plan.tables.find((t) => t.label === '20')!.id).toBe(two.id);
    const fresh = result.plan.tables.find((t) => t.label === '2')!;
    expect(fresh.id).not.toBe(two.id);
    expect(result.deactivatedTables).toEqual([]);
    expect(result.removedTables).toEqual([]);
  });

  it("refuses a new table under an out-of-service table's label, in the server sentence", async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const one = (await gateway.getFloorPlan(BRANCH)).tables.find((t) => t.label === '1')!;
    await gateway.deleteTable({ branchId: BRANCH, tableId: one.id });
    const command = asCommand(await gateway.getFloorPlan(BRANCH));
    command.tables.push(entry('1'));

    const error = await caught(save(gateway, command));

    expect(error).toBeInstanceOf(FloorPlanInvalidError);
    expect((error as FloorPlanInvalidError).errors).toEqual([
      'Table 1 is out of service. Put it back instead of adding a new table with the same label.',
    ]);
  });

  it("refuses renaming a table to an out-of-service table's label, in the server sentence", async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const one = (await gateway.getFloorPlan(BRANCH)).tables.find((t) => t.label === '1')!;
    await gateway.deleteTable({ branchId: BRANCH, tableId: one.id });
    const command = asCommand(await gateway.getFloorPlan(BRANCH));
    command.tables = command.tables.map((t) => (t.label === '2' ? { ...t, label: '1' } : t));

    const error = await caught(save(gateway, command));

    expect(error).toBeInstanceOf(FloorPlanInvalidError);
    expect((error as FloorPlanInvalidError).errors).toEqual([
      'Table 1 is out of service and keeps its label. Put it back, or give table 2 another label.',
    ]);
  });

  it('refuses renaming a table to the label of a table with history the save leaves out', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const command = asCommand(await gateway.getFloorPlan(BRANCH));
    command.tables = command.tables
      .filter((t) => t.label !== '7')
      .map((t) => (t.label === '2' ? { ...t, label: '7' } : t));

    const error = await caught(save(gateway, command));

    expect(error).toBeInstanceOf(FloorPlanInvalidError);
    expect((error as FloorPlanInvalidError).errors).toEqual([
      'Table 7 has history, so leaving it out of the plan takes it out of service with its label. ' +
        'Keep it in the plan, or give the other table another label.',
    ]);
  });

  it('lists as deactivated only the tables this save took out of service', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const one = (await gateway.getFloorPlan(BRANCH)).tables.find((t) => t.label === '1')!;
    await gateway.deleteTable({ branchId: BRANCH, tableId: one.id });

    const unchanged = await save(gateway, asCommand(await gateway.getFloorPlan(BRANCH)));
    expect(unchanged.deactivatedTables).toEqual([]);

    const command = asCommand(unchanged.plan);
    command.tables = command.tables.filter((t) => t.label !== '7');
    const result = await save(gateway, command);
    expect(result.deactivatedTables).toEqual(['7']);
  });
});
