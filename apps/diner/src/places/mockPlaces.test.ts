import { createMockGateway } from '@yalla/api';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { mockPlaces } from './mockPlaces';
import { formatClock, openStateFor } from './model';
import { createMockPlaceRepository } from './repository';

// `repository` picks the app's data source on import; these stand in for the
// phone-only modules that pulls in.
vi.hoisted(() => {
  vi.stubEnv('EXPO_PUBLIC_DATA_SOURCE', 'mock');
});
afterAll(() => {
  vi.unstubAllEnvs();
});
vi.mock('expo-constants', () => ({ default: { expoConfig: null, expoGoConfig: null } }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(() => Promise.resolve(null)),
  setItemAsync: vi.fn(() => Promise.resolve()),
  deleteItemAsync: vi.fn(() => Promise.resolve()),
}));
vi.mock('./devicePosition', () => ({ readDevicePosition: vi.fn(() => Promise.resolve(null)) }));

/**
 * The mock is what every screen renders during development, so a bad entry —
 * a marker off the photo, a place the gateway cannot book — is a bug in the
 * app as far as anyone looking at it can tell.
 */
describe('the mock places', () => {
  it('has eight places with unique branch ids', () => {
    expect(mockPlaces).toHaveLength(8);
    expect(new Set(mockPlaces.map((p) => p.id)).size).toBe(8);
  });

  it('has two bars, on the api mock’s own bar branches, so the Bars filter finds them', () => {
    const bars = mockPlaces.filter((p) => p.type === 'bar');
    expect(bars.map((p) => p.id).sort()).toEqual(['b-copperfox-saryan', 'b-vinoteka-komitas']);
  });

  it('names the district its api-mock branch names, and keeps one place without', () => {
    const byId = new Map(mockPlaces.map((p) => [p.id, p.district]));
    expect(byId.get('b-lumen-north')).toBe('Kentron');
    expect(byId.get('b-lumen-cascade')).toBe('Arabkir');
    expect(byId.get('b-copperfox-saryan')).toBe('Kentron');
    expect(byId.get('b-vinoteka-komitas')).toBe('Arabkir');
    expect(byId.get('b-greenbean-main')).toBeNull();
  });

  it('keeps the named venues on their own api-mock branches', () => {
    const byName = new Map(mockPlaces.map((p) => [p.name, p.id]));
    expect(byName.get('Lumen Coffee')).toBe('b-lumen-north');
    expect(byName.get('Dolmama')).toBe('b-dolmama-pushkin');
    expect(byName.get('Ararat Terrace')).toBe('b-ararat-opera');
    expect(byName.get('Green Bean')).toBe('b-greenbean-main');
  });

  it.each(mockPlaces.map((place) => [place.name, place] as const))(
    '%s is complete',
    (_name, place) => {
      expect(place.photos.length).toBeGreaterThanOrEqual(3);
      expect(place.photos.length).toBeLessThanOrEqual(6);
      for (const url of place.photos) expect(url).toMatch(/^https:\/\/images\.unsplash\.com\//u);

      expect(place.hours).toHaveLength(7);
      expect(new Set(place.hours.map((h) => h.day)).size).toBe(7);

      expect(place.menu).toHaveLength(3);
      for (const section of place.menu) {
        expect(section.items).toHaveLength(3);
        for (const item of section.items) expect(Number.isInteger(item.price)).toBe(true);
      }
      expect(place.reviews).toHaveLength(3);

      // Every mock place is located; only the real backend may lack coordinates.
      expect(place.coords).not.toBeNull();
      expect(place.coords!.latitude).toBeGreaterThan(40.1);
      expect(place.coords!.latitude).toBeLessThan(40.25);
      expect(place.coords!.longitude).toBeGreaterThan(44.45);
      expect(place.coords!.longitude).toBeLessThan(44.6);
    },
  );
});

/**
 * Every place is a branch the api mock knows, with rooms photographed and
 * tables pinned on them — the rooms the mock repository draws, read from the
 * same gateway the slot floor and the booking resolve against.
 */
describe('the mock places against the api mock', () => {
  const gateway = createMockGateway({ latencyMs: 0 });
  const places = createMockPlaceRepository({ latencyMs: 0, gateway });

  it.each(mockPlaces.map((place) => [place.name, place] as const))(
    '%s has rooms with pins the gateway knows',
    async (_name, place) => {
      const floor = await gateway.getFloorPlan(place.id);
      expect(floor).not.toBeNull();
      const byId = new Map(floor!.tables.map((table) => [table.id, table] as const));

      const rooms = await places.rooms(place.id);
      expect(rooms.length).toBeGreaterThan(0);
      const pins = rooms.flatMap((room) =>
        room.photos.flatMap((photo) => photo.tables.map((pin) => ({ pin, photo }))),
      );
      expect(pins.length).toBeGreaterThan(0);
      for (const { pin, photo } of pins) {
        const table = byId.get(pin.tableId);
        expect(table, pin.tableId).toBeDefined();
        expect(table!.pin?.photoId).toBe(photo.photoId);
        expect(pin.x).toBeGreaterThan(0);
        expect(pin.x).toBeLessThan(1);
        expect(pin.capacityMax).toBe(table!.seats);
      }
    },
  );

  it('narrows to bars, and finds a place by its district', async () => {
    const bars = await places.search('', { type: 'bar' });
    expect(bars.map((place) => place.type)).toEqual(['bar', 'bar']);
    const arabkir = await places.search('arabkir');
    expect(arabkir.map((place) => place.id).sort()).toEqual([
      'b-lumen-cascade',
      'b-vinoteka-komitas',
    ]);
  });

  it('serves the same rooms on the place page as on the rooms read', async () => {
    const place = await places.getById('b-lumen-north');
    expect(place?.rooms).toEqual(await places.rooms('b-lumen-north'));
  });
});

describe('openStateFor', () => {
  const hours = ([0, 1, 2, 3, 4, 5, 6] as const).map((day) => ({
    day,
    open: '09:00',
    close: '01:00',
  }));

  it('is open during the day and reads out today', () => {
    // 18:30 in Yerevan.
    const state = openStateFor(hours, new Date('2026-09-12T14:30:00Z'), 'Asia/Yerevan', 'en');
    expect(state.isOpen).toBe(true);
    expect(state.opensAt).toBe('09:00');
    expect(state.closesAt).toBe('01:00');
    expect(state.todayLabel).toBe('09:00 – 01:00');
  });

  it('is still open in the small hours on yesterday’s service', () => {
    // 00:30 in Yerevan.
    expect(openStateFor(hours, new Date('2026-09-12T20:30:00Z'), 'Asia/Yerevan').isOpen).toBe(true);
  });

  it('is shut between closing and opening', () => {
    // 07:00 in Yerevan.
    expect(openStateFor(hours, new Date('2026-09-12T03:00:00Z'), 'Asia/Yerevan').isOpen).toBe(
      false,
    );
  });

  it('is shut all day when the weekday has no hours', () => {
    const weekdays = hours.filter((h) => h.day !== 0);
    // Sunday 13 September 2026, 12:00 in Yerevan.
    const state = openStateFor(weekdays, new Date('2026-09-13T08:00:00Z'), 'Asia/Yerevan');
    expect(state.isOpen).toBe(false);
    expect(state.opensAt).toBeUndefined();
    expect(state.todayLabel).toBe('');
  });

  it('follows a special day over the week, and says its note (VC3)', () => {
    // Saturday 12 September 2026 is a special day: 18:00–03:00, "Wine night".
    const special = [
      { date: '2026-09-12', note: 'Wine night', blocks: [{ open: '18:00', close: '03:00' }] },
      { date: '2026-09-13', note: 'Closed for a wedding', blocks: [] },
    ];
    // 12:00 in Yerevan: the week says open, the special day says not yet.
    const noon = openStateFor(
      hours,
      new Date('2026-09-12T08:00:00Z'),
      'Asia/Yerevan',
      'en',
      special,
    );
    expect(noon.isOpen).toBe(false);
    expect(noon.opensAt).toBe('18:00');
    expect(noon.todayLabel).toBe('18:00 – 03:00');
    expect(noon.todayNote).toBe('Wine night');
    // 02:00 on the 13th: still the 12th's special night, though the 13th is shut.
    expect(
      openStateFor(hours, new Date('2026-09-12T22:00:00Z'), 'Asia/Yerevan', 'en', special).isOpen,
    ).toBe(true);
    // Noon on the 13th: closed all day, and why.
    const closed = openStateFor(
      hours,
      new Date('2026-09-13T08:00:00Z'),
      'Asia/Yerevan',
      'en',
      special,
    );
    expect(closed.isOpen).toBe(false);
    expect(closed.todayLabel).toBe('');
    expect(closed.todayNote).toBe('Closed for a wedding');
  });

  it('formats a clock reading in the locale, without a zone', () => {
    // en-GB, like every other time in the app: 24-hour.
    expect(formatClock('20:30', 'en')).toBe('20:30');
    expect(formatClock('08:00', 'ru')).toBe('08:00');
  });
});
