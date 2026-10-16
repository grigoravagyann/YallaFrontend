import { describe, expect, it } from 'vitest';
import { createMockGateway } from './mockGateway';
import { createPublicMockGateway } from './publicMock';
import { createStaffMockGateway } from './staffMock';
import { cafeFloorPlan, publicRooms } from './roomFloors';
import { findBranch } from './venues';

/**
 * The mocks answer with the server's shapes now that tables are pins on room
 * photos: rooms with photos, each table's room and pin, and availability that
 * offers only the tables pinned on a photo of their own room.
 */
const NOW = () => new Date('2026-09-04T08:00:00Z');
const SLOT = '2026-09-04T15:00:00Z';

describe('the mock rooms', () => {
  it('pins every cafe table but the out-of-service one on a photo of its own room', () => {
    const byId = new Map(cafeFloorPlan.tables.map((table) => [table.id, table]));
    expect(byId.get('t10')?.pin).toBeNull();
    expect(byId.get('t1')).toMatchObject({ floorAreaName: 'Bar', floorAreaDisplayOrder: 0 });
    expect(byId.get('t5')).toMatchObject({ floorAreaName: 'Windows', floorAreaDisplayOrder: 1 });
    for (const table of cafeFloorPlan.tables.filter((t) => t.id !== 't10')) {
      expect(table.pin?.photoId.startsWith(table.floorAreaId ?? '?')).toBe(true);
      expect(table.pin!.x).toBeGreaterThan(0);
      expect(table.pin!.x).toBeLessThan(1);
    }
  });

  it('serves rooms with photos and live pins on the public rooms read', async () => {
    const gateway = createMockGateway({ now: NOW });
    const rooms = await gateway.getBranchRooms('b-lumen-north');
    expect(rooms?.rooms.map((room) => room.name)).toEqual(['Windows', 'Bar']);
    const pins = rooms!.rooms.flatMap((room) => room.photos.flatMap((photo) => photo.tables));
    expect(pins.length).toBe(22);
    expect(new Set(pins.map((pin) => pin.status))).toEqual(
      new Set(['free', 'reserved', 'occupied', 'outOfService']),
    );

    const detail = await gateway.getBranchDetail('b-lumen-north');
    expect(detail?.rooms).toEqual(rooms?.rooms);
  });

  it('draws an out-of-service pin as out of service, as the server does', () => {
    const photo = {
      photoId: 'p1',
      thumbnailUrl: '',
      cardUrl: '',
      fullUrl: '',
      width: 4,
      height: 3,
    };
    const table = {
      ...cafeFloorPlan.tables[0]!,
      state: 'outOfService' as const,
      pin: { photoId: 'p1', x: 0.5, y: 0.5 },
    };
    const rooms = publicRooms(
      [{ roomId: 'r', name: 'Hall', displayOrder: 0, photos: [photo] }],
      [table],
    );
    expect(rooms[0]?.photos[0]?.tables[0]?.status).toBe('outOfService');
  });

  it('offers only pinned tables in availability, each with its pin on the slot floor', async () => {
    const gateway = createMockGateway({ now: NOW });
    const floor = await gateway.getFloorPlan('b-lumen-north');
    const unpinned = { ...floor!.tables[0]!, pin: null };
    // Take one table off its photo, as a manager would in the rooms editor.
    (floor!.tables as unknown as (typeof unpinned)[])[0] = unpinned;

    const slot = await gateway.getSlotFloor({
      branchId: 'b-lumen-north',
      slotUtc: SLOT,
      partySize: 2,
    });
    expect(slot?.tables.map((t) => t.tableId)).not.toContain(unpinned.id);
    expect(slot?.plan.tables.map((t) => t.id)).not.toContain(unpinned.id);
    expect(slot?.plan.tables.every((t) => t.pin !== null)).toBe(true);
  });

  it('gives the public page the rooms that have photos', async () => {
    const gateway = createMockGateway({ now: NOW });
    const publicGateway = createPublicMockGateway({ gateway, now: NOW });
    const branch = await publicGateway.resolveBranch({
      venueSlug: 'lumen-coffee',
      branchSlug: 'northern-avenue',
    });
    const mock = findBranch('b-lumen-north')!.branch;
    expect(branch?.rooms.map((room) => room.roomId)).toEqual(mock.rooms.map((r) => r.roomId));
    expect(branch?.rooms[0]?.photos.length).toBe(2);
  });

  it('gives the staff floor each table room and pin', async () => {
    const staff = createStaffMockGateway({ now: NOW });
    const floor = await staff.getFloor(cafeFloorPlan.branchId);
    const t1 = floor?.plan.tables.find((table) => table.id === 't1');
    expect(t1?.floorAreaName).toBe('Bar');
    expect(t1?.pin).not.toBeNull();
  });
});
