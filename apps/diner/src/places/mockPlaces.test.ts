import { createMockGateway } from '@yalla/api';
import type { DerivedTableState } from '@yalla/floorplan/types';
import { describe, expect, it } from 'vitest';
import { mockPlaces } from './mockPlaces';
import { formatClock, openStateFor, type TableStatus } from './model';

/**
 * The mock is what every screen renders during development, so a bad entry —
 * a marker off the photo, a place the gateway cannot book — is a bug in the
 * app as far as anyone looking at it can tell.
 */
describe('the mock places', () => {
  it('has six places with unique branch ids', () => {
    expect(mockPlaces).toHaveLength(6);
    expect(new Set(mockPlaces.map((p) => p.id)).size).toBe(6);
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

      expect(place.tables.length).toBeGreaterThanOrEqual(6);
      expect(place.tables.length).toBeLessThanOrEqual(9);
      expect(new Set(place.tables.map((t) => t.tableId)).size).toBe(place.tables.length);
      for (const table of place.tables) {
        expect(table.x).toBeGreaterThan(0);
        expect(table.x).toBeLessThan(1);
        expect(table.y).toBeGreaterThan(0);
        expect(table.y).toBeLessThan(1);
        expect(table.capacityMin).toBeLessThanOrEqual(table.capacityMax);
        expect(table.tableId.startsWith(`${place.id}-`)).toBe(true);
      }

      // Every mock place is located; only the real backend may lack coordinates.
      expect(place.coords).not.toBeNull();
      expect(place.coords!.latitude).toBeGreaterThan(40.1);
      expect(place.coords!.latitude).toBeLessThan(40.25);
      expect(place.coords!.longitude).toBeGreaterThan(44.45);
      expect(place.coords!.longitude).toBeLessThan(44.6);
    },
  );

  it('has free tables to tap on most photos', () => {
    const withFree = mockPlaces.filter(
      (place) => place.tables.filter((t) => t.status === 'free').length >= 3,
    );
    expect(withFree.length).toBeGreaterThanOrEqual(5);
  });
});

/**
 * Every place is a branch the api mock knows, and every marker is one of that
 * branch's tables in the state the floor has it — so a table drawn green on
 * the photo is a table the gateway will book, and a party the marker says
 * fits is a party the gateway will not refuse as too big.
 */
describe('the mock places against the api mock', () => {
  const gateway = createMockGateway({ latencyMs: 0 });

  const asMarkerStatus: Record<DerivedTableState, TableStatus> = {
    free: 'free',
    reservedSoon: 'reserved',
    held: 'reserved',
    occupied: 'occupied',
    outOfService: 'occupied',
  };

  it.each(mockPlaces.map((place) => [place.name, place] as const))(
    '%s is a branch the gateway can book, with its own tables',
    async (_name, place) => {
      const floor = await gateway.getFloorPlan(place.id);
      expect(floor).not.toBeNull();
      const byId = new Map(floor!.tables.map((table) => [table.id, table] as const));

      for (const marker of place.tables) {
        const table = byId.get(marker.tableId);
        expect(table, marker.tableId).toBeDefined();
        expect(marker.label).toBe(table!.label);
        expect(marker.status).toBe(asMarkerStatus[table!.state]);
        expect(marker.capacityMax).toBe(table!.seats);
        expect(marker.capacityMin).toBeGreaterThanOrEqual(1);
      }
    },
  );
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

  it('formats a clock reading in the locale, without a zone', () => {
    // en-GB, like every other time in the app: 24-hour.
    expect(formatClock('20:30', 'en')).toBe('20:30');
    expect(formatClock('08:00', 'ru')).toBe('08:00');
  });
});
