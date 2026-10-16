// @vitest-environment jsdom
import { createMockGateway, type FloorTable, type PublicRoom } from '@yalla/api';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import RoomPhotos from './RoomPhotos';
import { RoomSection } from './RoomSection';
import { defaultSelection } from './slots';
import { createHarness, initTestI18n } from './testHarness';

/**
 * The room, as the page shows it now that tables are pins on room photos: pick
 * a room, move through its photos, and tap a free pin to book that table.
 *
 * Every pin is a named button — "Table 4, free" — so a keyboard or a screen
 * reader reaches the room the way a finger does, and a pin that cannot be
 * booked still says what it is.
 */

beforeAll(async () => {
  await initTestI18n();
});

afterEach(() => {
  cleanup();
});

const photo = (id: string) => ({
  photoId: id,
  thumbnailUrl: `https://cdn.test/${id}/thumb`,
  cardUrl: `https://cdn.test/${id}/card`,
  fullUrl: `https://cdn.test/${id}/full`,
  width: 1600,
  height: 1200,
});

const ROOMS: readonly PublicRoom[] = [
  { roomId: 'hall', name: 'Hall', displayOrder: 0, photos: [photo('h1'), photo('h2')] },
  { roomId: 'terrace', name: 'Terrace', displayOrder: 1, photos: [photo('t1')] },
];

function table(
  id: string,
  label: string,
  photoId: string,
  over: Partial<FloorTable> = {},
): FloorTable {
  const room = photoId.startsWith('h') ? ROOMS[0]! : ROOMS[1]!;
  return {
    id,
    label,
    seats: 2,
    floorAreaId: room.roomId,
    floorAreaName: room.name,
    floorAreaDisplayOrder: room.displayOrder,
    isBookable: true,
    state: 'free',
    nextReservationStartUtc: null,
    pin: { photoId, x: 0.25, y: 0.5 },
    ...over,
  };
}

const TABLES: readonly FloorTable[] = [
  table('a', '1', 'h1'),
  table('b', '2', 'h1', { state: 'reservedSoon', isBookable: false }),
  table('c', '3', 'h1', { state: 'occupied', isBookable: false }),
  table('d', '4', 'h2', { state: 'held', isBookable: false }),
  table('e', '5', 't1'),
];

function show(over: { bookable?: boolean } = {}) {
  const onTableTap = vi.fn();
  render(
    <I18nextProvider i18n={i18next}>
      <RoomPhotos
        rooms={ROOMS}
        tables={TABLES}
        selectedTableId={null}
        onTableTap={onTableTap}
        bookable={over.bookable ?? true}
      />
    </I18nextProvider>,
  );
  return onTableTap;
}

describe('the rooms on the public page', () => {
  it('offers a choice of room and shows the first room first', () => {
    show();
    const picker = screen.getByRole('group', { name: 'Rooms' });
    const hall = within(picker).getByRole('button', { name: 'Hall' });
    expect(hall.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('group', { name: 'Hall, photo 1 of 2' })).toBeTruthy();
  });

  it('names every pin on the photo by table and state, coloured by state', () => {
    show();
    const tone = (name: string) => screen.getByRole('button', { name }).getAttribute('data-tone');
    expect(tone('Table 1, free')).toBe('free');
    expect(tone('Table 2, booked')).toBe('booked');
    expect(tone('Table 3, occupied')).toBe('occupied');
    // Table 4 is on the second photo, table 5 in another room.
    expect(screen.queryByRole('button', { name: /^Table 4,/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Table 5,/u })).toBeNull();
  });

  it('moves through the photos with the arrows and the arrow keys', async () => {
    show();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(screen.getByRole('group', { name: 'Hall, photo 2 of 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Table 4, booked' })).toBeTruthy();

    const stage = screen.getByRole('group', { name: 'Hall, photo 2 of 2' });
    fireEvent.keyDown(stage, { key: 'ArrowLeft' });
    expect(screen.getByRole('group', { name: 'Hall, photo 1 of 2' })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Previous photo' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('moves to the next photo on a swipe to the left', () => {
    show();
    const stage = screen.getByRole('group', { name: 'Hall, photo 1 of 2' });
    fireEvent.pointerDown(stage, { clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(stage, { clientX: 120, pointerId: 1 });
    expect(screen.getByRole('group', { name: 'Hall, photo 2 of 2' })).toBeTruthy();
  });

  it("shows another room's photos and pins when it is picked", async () => {
    show();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Terrace' }));
    expect(screen.getByRole('group', { name: 'Terrace, photo 1 of 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Table 5, free' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next photo' })).toBeNull();
  });

  it('starts booking a free pin on a tap, Enter or Space, and never a taken one', async () => {
    const onTableTap = show();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Table 3, occupied' }));
    expect(onTableTap).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Table 3, occupied' }).getAttribute('aria-disabled'),
    ).toBe('true');

    const free = screen.getByRole('button', { name: 'Table 1, free' });
    await user.click(free);
    expect(onTableTap).toHaveBeenLastCalledWith('a');
    free.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onTableTap).toHaveBeenCalledTimes(3);
  });

  it('offers nothing to tap when the venue takes no web bookings', async () => {
    const onTableTap = show({ bookable: false });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Table 1, free' }));
    expect(onTableTap).not.toHaveBeenCalled();
  });
});

describe('a real thirty-table branch', () => {
  it('puts every offered table on a photo of its own room', async () => {
    // The rooms a real branch has, read through the same gateway the page reads.
    const gateway = createMockGateway({ latencyMs: 0, simulateJoiners: false });
    const detail = await gateway.getBranchDetail('b-ararat-opera');
    const slot = await gateway.getSlotFloor({
      branchId: 'b-ararat-opera',
      slotUtc: new Date(Date.now() + 86_400_000).toISOString(),
      partySize: 2,
    });
    const rooms = detail!.rooms;
    expect(rooms.map((room) => room.name)).toEqual(['Windows', 'Bar', 'Terrace']);
    expect(slot!.plan.tables).toHaveLength(30);
    for (const t of slot!.plan.tables) {
      const room = rooms.find((candidate) => candidate.roomId === t.floorAreaId);
      expect(room?.photos.map((entry) => entry.photo.photoId)).toContain(t.pin?.photoId);
    }
  });
});

describe('the room section on the page', () => {
  it('puts the slot answer on the photos and books a free pin with its availability', async () => {
    const harness = createHarness();
    const branch = await harness.publicGateway.resolveBranch({
      venueSlug: 'lumen-coffee',
      branchSlug: 'northern-avenue',
    });
    expect(branch?.rooms.length).toBeGreaterThan(0);
    const selection = defaultSelection(branch!.timeZoneId);
    const onTableTap = vi.fn();
    render(
      harness.wrap(
        <RoomSection
          branch={branch!}
          selection={selection}
          onSelectionChange={() => {}}
          slotUtc={new Date(Date.now() + 86_400_000).toISOString()}
          selectedTableId={null}
          onTableTap={onTableTap}
          takenTableLabel={null}
        />,
      ),
    );

    expect(await screen.findByRole('group', { name: /^Windows, photo 1 of 2$/u })).toBeTruthy();
    const free = (await screen.findAllByRole('button', { name: /^Table \d+, free$/u })).find(
      (pin) => pin.getAttribute('aria-disabled') !== 'true',
    );
    await userEvent.setup().click(free!);
    await waitFor(() => expect(onTableTap).toHaveBeenCalledTimes(1));
    const label = /^Table (\d+),/u.exec(free!.getAttribute('aria-label') ?? '')?.[1];
    expect(onTableTap.mock.lastCall?.[0]).toMatchObject({ tableLabel: label, isBookable: true });
  });
});
