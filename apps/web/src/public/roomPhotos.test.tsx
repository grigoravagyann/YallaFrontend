// @vitest-environment jsdom
import { createMockGateway, type FloorTable, type PublicRoom } from '@yalla/api';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import RoomPhotos from './RoomPhotos';
import { RoomSection } from './RoomSection';
import { defaultSelection, slotInstant } from './slots';
import { createHarness, initTestI18n } from './testHarness';

/**
 * The room, as the page shows it now that tables are pins on room photos: pick
 * a room, move through its photos, and tap a free pin to book that table.
 *
 * Every pin is a named button — "Table 4, 2 seats, free" — so a keyboard or a screen
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
  table('f', '6', 'h1', { state: 'outOfService', isBookable: false }),
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
        partySize={2}
      />
    </I18nextProvider>,
  );
  return onTableTap;
}

describe('the rooms on the public page', () => {
  it('offers a choice of room and shows the first room first', () => {
    show();
    const picker = screen.getByRole('group', { name: 'Rooms' });
    const hall = within(picker).getByRole('button', { name: /^Hall/u });
    expect(hall.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('group', { name: 'Hall, photo 1 of 2' })).toBeTruthy();
  });

  it('names every pin on the photo by table, seats and state, coloured by state', () => {
    // The seats as the list row says them (review N6).
    show();
    const tone = (name: string) => screen.getByRole('button', { name }).getAttribute('data-tone');
    expect(tone('Table 1, 2 seats, free')).toBe('free');
    expect(tone('Table 2, 2 seats, booked')).toBe('booked');
    expect(tone('Table 3, 2 seats, occupied')).toBe('occupied');
    // Out of service is its own grey, never the occupied red.
    expect(tone('Table 6, 2 seats, out of service')).toBe('outOfService');
    // Table 4 is on the second photo, table 5 in another room.
    expect(screen.queryByRole('button', { name: /^Table 4,/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Table 5,/u })).toBeNull();
  });

  it('moves through the photos with the arrows and the arrow keys', async () => {
    show();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(screen.getByRole('group', { name: 'Hall, photo 2 of 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Table 4, 2 seats, booked' })).toBeTruthy();

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
    await user.click(screen.getByRole('button', { name: /^Terrace/u }));
    expect(screen.getByRole('group', { name: 'Terrace, photo 1 of 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Table 5, 2 seats, free' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next photo' })).toBeNull();
  });

  it('starts booking a free pin on a tap, Enter or Space, and never a taken one', async () => {
    const onTableTap = show();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Table 3, 2 seats, occupied' }));
    expect(onTableTap).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole('button', { name: 'Table 3, 2 seats, occupied' })
        .getAttribute('aria-disabled'),
    ).toBe('true');

    const free = screen.getByRole('button', { name: 'Table 1, 2 seats, free' });
    await user.click(free);
    expect(onTableTap).toHaveBeenLastCalledWith('a');
    free.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onTableTap).toHaveBeenCalledTimes(3);
  });

  it('offers nothing to tap when the venue takes no web bookings', async () => {
    const onTableTap = show({ bookable: false });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Table 1, 2 seats, free' }));
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
    // Tomorrow's first slot the venue takes: a bare "this time tomorrow" is a
    // closed slot late at night.
    const selection = defaultSelection(branch!.timeZoneId, new Date(Date.now() + 86_400_000), {
      minLeadMinutes: branch!.policy.minLeadMinutes,
      turnTimeMinutes: branch!.policy.turnTimeMinutes,
      weeklyHours: branch!.weeklyHours,
    });
    const onTableTap = vi.fn();
    render(
      harness.wrap(
        <RoomSection
          branch={branch!}
          selection={selection}
          slotUtc={slotInstant(selection, branch!.timeZoneId)!.toISOString()}
          selectedTableId={null}
          onTableTap={onTableTap}
          takenTableLabel={null}
        />,
      ),
    );

    expect(await screen.findByRole('group', { name: /^Windows, photo 1 of 2$/u })).toBeTruthy();
    const free = (
      await screen.findAllByRole('button', { name: /^Table \d+, \d+ seats?, free$/u })
    ).find((pin) => pin.getAttribute('aria-disabled') !== 'true');
    await userEvent.setup().click(free!);
    await waitFor(() => expect(onTableTap).toHaveBeenCalledTimes(1));
    const label = /^Table (\d+),/u.exec(free!.getAttribute('aria-label') ?? '')?.[1];
    expect(onTableTap.mock.lastCall?.[0]).toMatchObject({ tableLabel: label, isBookable: true });
  });
});

describe('the room photo stage, from review', () => {
  it('leaves the photo alone when an arrow key is pressed on a pin, so focus stays on the pin', () => {
    show();
    const pin = screen.getByRole('button', { name: 'Table 1, 2 seats, free' });
    pin.focus();

    fireEvent.keyDown(pin, { key: 'ArrowRight' });

    expect(screen.getByRole('group', { name: 'Hall, photo 1 of 2' })).toBeTruthy();
    expect(document.activeElement).toBe(pin);
  });

  it('gives a photo with no stored size a placeholder shape, then its own once loaded', () => {
    const unsized = { ...photo('u1'), width: null, height: null };
    render(
      <I18nextProvider i18n={i18next}>
        <RoomPhotos
          rooms={[{ roomId: 'hall', name: 'Hall', displayOrder: 0, photos: [unsized] }]}
          tables={[table('a', '1', 'h1', { pin: { photoId: 'u1', x: 0.5, y: 0.02 } })]}
          selectedTableId={null}
          onTableTap={() => {}}
          bookable
          partySize={2}
        />
      </I18nextProvider>,
    );
    const stage = screen.getByRole('group', { name: 'Hall, photo 1 of 1' });

    // Before the picture loads, the stage has a height for the pins to sit in.
    expect(stage.classList.contains('is-unsized')).toBe(true);
    expect(stage.style.getPropertyValue('--stage-ratio')).toBe('');

    const img = stage.querySelector('img')!;
    Object.defineProperty(img, 'naturalWidth', { value: 1000 });
    Object.defineProperty(img, 'naturalHeight', { value: 500 });
    fireEvent.load(img);

    expect(stage.style.getPropertyValue('--stage-ratio')).toBe('1000 / 500');
  });
});

describe('the rooms, from QA 2026-10-16', () => {
  function showWith(tables: readonly FloorTable[], unavailable: Record<string, string>) {
    const onTableTap = vi.fn();
    render(
      <I18nextProvider i18n={i18next}>
        <RoomPhotos
          rooms={ROOMS}
          tables={tables}
          selectedTableId={null}
          onTableTap={onTableTap}
          bookable
          unavailable={unavailable}
          partySize={4}
        />
      </I18nextProvider>,
    );
    return onTableTap;
  }

  it('does not draw a table this party cannot book at the slot as free, and says why on a tap (P-B1)', async () => {
    const onTableTap = showWith(
      [table('a', '1', 'h1'), table('g', '7', 'h1', { isBookable: false })],
      { g: 'Too small for 4 guests.' },
    );

    const pin = screen.getByRole('button', {
      name: 'Table 7, 2 seats, not available: Too small for 4 guests.',
    });
    expect(pin.getAttribute('data-tone')).toBe('unavailable');
    await userEvent.setup().click(pin);
    expect(onTableTap).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Table 7: Too small for 4 guests.');
    expect(screen.getByRole('list', { name: 'What the colours mean' }).textContent).toContain(
      'Not for this time or party',
    );
  });

  it('turns the photo on a swipe that starts on a pin, and books nothing (B4)', () => {
    const onTableTap = show();
    const pin = screen.getByRole('button', { name: 'Table 1, 2 seats, free' });
    fireEvent.pointerDown(pin, { clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(pin, { clientX: 120, pointerId: 1 });
    fireEvent.click(pin);

    expect(screen.getByRole('group', { name: 'Hall, photo 2 of 2' })).toBeTruthy();
    expect(onTableTap).not.toHaveBeenCalled();
  });
});

/**
 * Phase 3 of the public page redesign (Main artboard): room tabs that say how
 * many tables each room has free, a list of the tables as the photo's
 * accessible alternative, and a room that follows a table chosen elsewhere.
 */
describe('the room tabs, the list and the chosen table', () => {
  function showWith(
    over: {
      selectedTableId?: string | null;
      tables?: readonly FloorTable[];
      bookable?: boolean;
      onRoomShown?: (roomId: string) => void;
    } = {},
  ) {
    const onTableTap = vi.fn();
    const view = (selectedTableId: string | null) => (
      <I18nextProvider i18n={i18next}>
        <RoomPhotos
          rooms={ROOMS}
          tables={over.tables ?? TABLES}
          selectedTableId={selectedTableId}
          onTableTap={onTableTap}
          bookable={over.bookable ?? true}
          partySize={2}
          unavailable={{ g: 'Too small for 2 guests.' }}
          onRoomShown={over.onRoomShown}
        />
      </I18nextProvider>
    );
    const rendered = render(view(over.selectedTableId ?? null));
    return { onTableTap, rerender: (id: string | null) => rendered.rerender(view(id)) };
  }

  it('says on every room tab how many tables it has free for the visitor', () => {
    showWith();
    const tabs = within(screen.getByRole('group', { name: 'Rooms' })).getAllByRole('button');
    // Read as "Hall 1 free": the count is part of the tab's name.
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Hall 1 free', 'Terrace 1 free']);
    expect(tabs[0]!.getAttribute('aria-label')).toBeNull();
  });

  it('lists the same tables the photos show, with the same states and the same taps', async () => {
    const tables = [...TABLES, table('g', '7', 'h2', { isBookable: false })];
    const { onTableTap } = showWith({ tables });
    const user = userEvent.setup();

    // Every pin of the room, through both photos.
    const pins: { label: string; pickable: boolean }[] = [];
    for (let photoIndex = 0; photoIndex < 2; photoIndex += 1) {
      for (const pin of within(
        screen.getByRole('group', { name: `Hall, photo ${photoIndex + 1} of 2` }),
      ).getAllByRole('button')) {
        pins.push({
          label: pin.textContent ?? '',
          pickable: pin.getAttribute('aria-disabled') !== 'true',
        });
      }
      if (photoIndex === 0) await user.click(screen.getByRole('button', { name: 'Next photo' }));
    }

    const views = screen.getByRole('group', { name: 'How to show the tables' });
    await user.click(within(views).getByRole('button', { name: 'List' }));
    expect(within(views).getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    // No photo, no legend: the states are words on the rows.
    expect(screen.queryByRole('group', { name: /^Hall, photo/u })).toBeNull();
    expect(screen.queryByRole('list', { name: 'What the colours mean' })).toBeNull();

    const list = screen.getByRole('list', { name: 'Tables in Hall' });
    const rows = within(list).getAllByRole('button');
    const badge = (row: HTMLElement) => row.querySelector('.pub-table-badge')?.textContent ?? '';
    const byLabel = (entries: { label: string; pickable: boolean }[]) =>
      [...entries].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    expect(
      byLabel(
        rows.map((row) => ({
          label: badge(row),
          pickable: row.getAttribute('aria-disabled') !== 'true',
        })),
      ),
    ).toEqual(byLabel(pins));
    expect(rows.map(badge)).toEqual(['1', '2', '3', '4', '6', '7']);

    // Each row says its seats and its state, as the pin's name does.
    const row = (label: string) => rows.find((entry) => badge(entry) === label)!;
    expect(row('1').textContent).toContain('Table 1 · 2 seats');
    expect(row('1').textContent).toContain('Free');
    expect(row('3').textContent).toContain('Occupied');
    expect(row('7').textContent).toContain('Too small for 2 guests.');

    await user.click(row('3'));
    expect(onTableTap).not.toHaveBeenCalled();
    await user.click(row('7'));
    expect(onTableTap).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Table 7: Too small for 2 guests.');
    await user.click(row('1'));
    expect(onTableTap).toHaveBeenCalledWith('a');
  });

  it('marks the chosen table on its row', async () => {
    showWith({ selectedTableId: 'a' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'List' }));
    const chosen = within(screen.getByRole('list', { name: 'Tables in Hall' }))
      .getAllByRole('button')
      .filter((entry) => entry.getAttribute('aria-pressed') === 'true');
    expect(chosen.map((entry) => entry.querySelector('.pub-table-badge')?.textContent)).toEqual([
      '1',
    ]);
  });

  it('moves to the room and the photo of a table chosen for the visitor', () => {
    const onRoomShown = vi.fn();
    const { rerender } = showWith({ onRoomShown });
    expect(onRoomShown).toHaveBeenLastCalledWith('hall');

    rerender('e');
    expect(screen.getByRole('group', { name: 'Terrace, photo 1 of 1' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Table 5, 2 seats, free' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(onRoomShown).toHaveBeenLastCalledWith('terrace');

    rerender('d');
    expect(screen.getByRole('group', { name: 'Hall, photo 2 of 2' })).toBeTruthy();
  });

  it('says when the room on screen has no table for the party, and points at the others', async () => {
    showWith({
      tables: [
        table('a', '1', 'h1', { state: 'occupied', isBookable: false }),
        table('e', '5', 't1'),
      ],
    });
    expect(
      screen.getByText(
        'No free table for 2 guests in this room at this time. Look at the other rooms or pick another time.',
      ),
    ).toBeDefined();
    await userEvent.setup().click(screen.getByRole('button', { name: /^Terrace/u }));
    expect(screen.queryByText(/^No free table/u)).toBeNull();
  });

  it('puts the legend under the photo, and the table number inside its pin', () => {
    showWith();
    const stage = screen.getByRole('group', { name: 'Hall, photo 1 of 2' });
    const legend = screen.getByRole('list', { name: 'What the colours mean' });
    expect(stage.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The button is the 44px target; the dot inside it carries the number.
    const pin = screen.getByRole('button', { name: 'Table 1, 2 seats, free' });
    expect(pin.querySelector('.pub-pin-face')?.textContent).toBe('1');
  });
});

describe('an answer for the slot before (review N5)', () => {
  it('draws no counts or "no free table" from the last slot while the new one loads', () => {
    render(
      <I18nextProvider i18n={i18next}>
        <RoomPhotos
          rooms={ROOMS}
          tables={[
            table('a', '1', 'h1', { state: 'occupied', isBookable: false }),
            table('e', '5', 't1'),
          ]}
          selectedTableId={null}
          onTableTap={() => {}}
          bookable
          partySize={2}
          stale
        />
      </I18nextProvider>,
    );
    const tabs = screen.getByRole('group', { name: 'Rooms' });
    expect(tabs.getAttribute('aria-busy')).toBe('true');
    expect(
      within(tabs)
        .getAllByRole('button')
        .map((tab) => tab.textContent),
    ).toEqual(['Hall', 'Terrace']);
    expect(screen.queryByText(/^No free table/u)).toBeNull();
  });
});

describe('pins pinned close together (review S7)', () => {
  it('draws them a whole target apart on the photo as it is drawn', () => {
    class FixedSize {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ target, contentRect: { width: 358, height: 268 } } as unknown as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FixedSize);
    try {
      render(
        <I18nextProvider i18n={i18next}>
          <RoomPhotos
            rooms={ROOMS}
            tables={[
              table('a', '1', 'h1', { pin: { photoId: 'h1', x: 0.5, y: 0.5 } }),
              table('b', '2', 'h1', { pin: { photoId: 'h1', x: 0.55, y: 0.5 } }),
            ]}
            selectedTableId={null}
            onTableTap={() => {}}
            bookable
            partySize={2}
          />
        </I18nextProvider>,
      );
      const at = (name: string) => {
        const style = screen.getByRole('button', { name }).style;
        return { x: parseFloat(style.left), y: parseFloat(style.top) };
      };
      const one = at('Table 1, 2 seats, free');
      const two = at('Table 2, 2 seats, free');
      expect(Math.hypot(one.x - two.x, one.y - two.y)).toBeGreaterThanOrEqual(43.5);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
