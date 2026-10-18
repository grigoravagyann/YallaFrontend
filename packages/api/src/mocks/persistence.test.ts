import { describe, expect, it } from 'vitest';
import type { ConsoleGateway } from '../consoleGateway';
import type { YallaGateway } from '../gateway';
import { createConsoleMockGateway } from './consoleMock';
import { createMockGateway } from './mockGateway';
import {
  clearMockJournal,
  isMutatingMethod,
  persistMockGateway,
  type MockJournalStorage,
} from './persistence';

/**
 * QA F2 (2026-10-16): the mock world was lost on every full page load, so a
 * booking link, a diner's orders tab and a venue just created all vanished on
 * reload — and the next venue took the id the lost one had.
 */

function memoryStorage(): MockJournalStorage & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

let n = 0;
const cmd = () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`;

const venue = (slug: string) => ({
  commandId: cmd(),
  name: `Venue ${slug}`,
  slug,
  type: 'cafe' as const,
  firstBranch: {
    name: 'Main',
    slug: 'main',
    timeZoneId: 'Asia/Yerevan',
    address: '1 Street, Yerevan',
    latitude: 40.18,
    longitude: 44.51,
  },
});

function console_(storage: MockJournalStorage | null, now = () => new Date()) {
  return persistMockGateway<ConsoleGateway>({
    key: 'console',
    storage,
    now,
    create: (inner) => createConsoleMockGateway({ ...inner, role: 'platformAdmin' }),
  });
}

describe('a mock world across a reload', () => {
  it('keeps what was created, and never reuses an id', async () => {
    const storage = memoryStorage();
    const first = console_(storage);
    const created = await first.createVenue(venue('kond'));
    expect(created.id).toBe('v-new-1');

    // A full page load: a new wrapper over the same storage.
    const second = console_(storage);
    expect(await second.getVenue('v-new-1')).toMatchObject({ name: 'Venue kond' });
    expect((await second.createVenue(venue('arabkir'))).id).toBe('v-new-2');
    expect((await second.listVenues({ pageSize: 50 })).items.map((v) => v.slug)).toContain('kond');
  });

  it('journals only the calls that changed the world, and only when they succeeded', async () => {
    const storage = memoryStorage();
    const gateway = console_(storage);
    await gateway.listVenues({});
    await gateway.getVenue('v-lumen');
    expect(gateway.journalLength()).toBe(0);

    await gateway.createVenue(venue('kond'));
    expect(gateway.journalLength()).toBe(1);
    // A refused call changed nothing and is not replayed.
    await expect(gateway.createVenue(venue('kond'))).rejects.toThrow();
    expect(gateway.journalLength()).toBe(1);
  });

  it('replays a flow at the moments it happened, so a code that has since expired still counts', async () => {
    const storage = memoryStorage();
    const t0 = new Date('2026-09-16T10:00:00.000Z');
    const diner = (now: () => Date) =>
      persistMockGateway<YallaGateway>({
        key: 'diner',
        storage,
        now,
        create: (inner) => createMockGateway({ ...inner, simulateJoiners: false }),
      });

    const before = diner(() => t0);
    const challenge = await before.requestPhoneCode('+37491000199');
    await before.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode! });
    const slotUtc = '2026-09-17T15:00:00.000Z';
    const floor = await before.getSlotFloor({ branchId: 'b-lumen-north', slotUtc, partySize: 2 });
    const booking = await before.createBooking({
      commandId: cmd(),
      branchId: 'b-lumen-north',
      tableId: floor!.tables.find((t) => t.isBookable)!.tableId,
      slotUtc,
      timeZoneId: 'Asia/Yerevan',
      partySize: 2,
      guestName: 'Test Diner',
      guestPhone: '+37491000199',
      channel: 'web',
    });

    // Two hours later the page is reloaded: the SMS code is long expired on
    // the wall clock, but replay runs it at 10:00, when it was good.
    const after = diner(() => new Date(t0.getTime() + 2 * 60 * 60_000));
    const kept = await after.getBooking(booking.id);
    expect(kept).toMatchObject({ id: booking.id, code: booking.code, tableId: booking.tableId });
    expect((await after.listBookings()).upcoming.map((b) => b.id)).toContain(booking.id);
    // The table is still taken on the floor the public page draws.
    const room = await after.getFloorPlan('b-lumen-north');
    expect(room?.tables.find((t) => t.id === booking.tableId)?.state).toBe('reservedSoon');
  });

  it('forgets the world when asked, and works in memory with no storage at all', async () => {
    const storage = memoryStorage();
    await console_(storage).createVenue(venue('kond'));
    clearMockJournal(storage, 'console');
    expect(await console_(storage).getVenue('v-new-1')).toBeNull();

    const memoryOnly = console_(null);
    await memoryOnly.createVenue(venue('kond'));
    expect(await memoryOnly.getVenue('v-new-1')).not.toBeNull();
    expect(await console_(null).getVenue('v-new-1')).toBeNull();
  });

  it('tells a read from a write by the verb', () => {
    for (const read of [
      'getVenue',
      'listVenues',
      'searchBranches',
      'resolveBranch',
      'exportReport',
    ]) {
      expect(isMutatingMethod(read), read).toBe(false);
    }
    for (const write of ['createVenue', 'scanTableCode', 'requestPhoneCode', 'placeOrder']) {
      expect(isMutatingMethod(write), write).toBe(true);
    }
  });
});
