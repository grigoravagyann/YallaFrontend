// @vitest-environment jsdom
import type { PublicBranch, SlotFloor } from '@yalla/api';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { i18next } from '@yalla/i18n';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { STICKY_QUERY } from './layout';
import { PublicApp } from './PublicApp';
import { pickTableFor } from './tablePick';
import { createHarness, initTestI18n } from './testHarness';

/**
 * Choosing a table and booking it (public-page HANDOFF §6.3, Main artboard).
 *
 * A tap on the room **chooses** a table; the booking card names it and its
 * "Book table N" opens the booking panel — beside the room on a desktop, and
 * on a phone from the bar that appears under the room. "Choose for me" picks
 * the smallest free table that fits, in the room on screen first. A table lost
 * while confirming is said where the visitor was, in red, with the focus on it.
 */

beforeAll(async () => {
  await initTestI18n();
});

const observer = Reflect.get(globalThis, 'IntersectionObserver') as unknown;

beforeEach(() => {
  // No observer at all, so the room draws its photos and a pin can be tapped.
  Reflect.deleteProperty(globalThis, 'IntersectionObserver');
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (observer !== undefined) Reflect.set(globalThis, 'IntersectionObserver', observer);
  if (i18next.language !== 'en') await act(() => i18next.changeLanguage('en'));
});

/** Whether the booking column is sticky beside the room — wide and tall enough. */
function stubViewport(wide: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === STICKY_QUERY ? wide : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
}

function open(options: Parameters<typeof createHarness>[0] = {}) {
  // Confirmed as it is made: these tests are about the room, not the wait.
  const harness = createHarness({ floorApprovesAtOnce: true, ...options });
  render(harness.wrap(<PublicApp />, '/lumen-coffee/northern-avenue'));
  return harness;
}

async function freePins(): Promise<HTMLElement[]> {
  const pins = await screen.findAllByRole('button', { name: /^Table .+, free$/u });
  return pins.filter((pin) => pin.getAttribute('aria-disabled') !== 'true');
}

const card = () => screen.getByRole('region', { name: 'Book a table' });
const room = () => screen.getByRole('region', { name: 'Choose your table' });
/** The card's line saying what happened to the table: a live region of its own. */
const note = () => {
  const line = card().querySelector<HTMLElement>('.pub-pick-note')!;
  expect(line.getAttribute('role')).toBe('status');
  return line;
};

/**
 * Every test here runs at six clocks, Yerevan time (UTC+4) on an ordinary
 * Wednesday. What the card opens on depends on the hour: before opening it is
 * today's first time, by day the first one the server confirms, late in the
 * evening tomorrow, and past midnight Northern Avenue's night (open to 01:00)
 * is still Tuesday's service. A test that holds at one of them and not
 * another is testing the clock, not the page (they failed by day once).
 */
const CLOCKS = [
  { label: '08:30, before the morning rush', at: '2026-10-21T04:30:00Z' },
  { label: '12:00, midday', at: '2026-10-21T08:00:00Z' },
  { label: '18:30, the evening', at: '2026-10-21T14:30:00Z' },
  { label: '22:30, late', at: '2026-10-21T18:30:00Z' },
  { label: '00:30, past midnight inside the night', at: '2026-10-21T20:30:00Z' },
  { label: '02:00, shut', at: '2026-10-21T22:00:00Z' },
] as const;

describe.each(CLOCKS)('at $label', ({ at }) => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    vi.setSystemTime(new Date(at));
  });

  describe('a table tapped in the room', () => {
    it('is chosen, not booked: the card names it, and its Book button opens the panel beside it', async () => {
      stubViewport(true);
      open();
      const user = userEvent.setup();
      const pin = (await freePins())[0]!;
      const label = pin.textContent!;

      await user.click(pin);
      expect(pin.getAttribute('aria-pressed')).toBe('true');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(within(card()).getByText(new RegExp(`^Table ${label} · `, 'u'))).toBeDefined();

      const book = await within(card()).findByRole('button', { name: `Book table ${label}` });
      await waitFor(() => expect((book as HTMLButtonElement).disabled).toBe(false));
      await user.click(book);
      const panel = await screen.findByRole('dialog');
      expect(card().contains(panel)).toBe(true);
    });

    it('brings a booking bar under the room on a phone, which opens the panel there', async () => {
      stubViewport(false);
      open();
      const user = userEvent.setup();
      await screen.findByRole('region', { name: 'Choose your table' });
      expect(within(room()).queryByRole('button', { name: /^Book table/u })).toBeNull();

      const pin = (await freePins())[0]!;
      const label = pin.textContent!;
      await user.click(pin);

      const bar = await within(room()).findByRole('button', { name: `Book table ${label}` });
      await waitFor(() => expect((bar as HTMLButtonElement).disabled).toBe(false));
      await user.click(bar);

      const panel = await screen.findByRole('dialog');
      expect(card().contains(panel)).toBe(false);
      expect(room().compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // The panel takes the bar's place while it is open, and gives it back.
      const strip = bar.closest<HTMLElement>('.pub-pickbar')!;
      expect(strip.hidden).toBe(true);
      await user.click(within(panel).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(strip.hidden).toBe(false);
      await waitFor(() => expect(document.activeElement).toBe(bar));
    });

    it('stays chosen through a new party size while the room still gives it, and is let go when not', async () => {
      stubViewport(true);
      const harness = open();
      // The room's answer, with one table refused to parties of more than two.
      let refused: string | null = null;
      const real = harness.gateway.getSlotFloor.bind(harness.gateway);
      const asked: number[] = [];
      vi.spyOn(harness.gateway, 'getSlotFloor').mockImplementation(async (input) => {
        asked.push(input.partySize);
        const answer = await real(input);
        if (!answer || input.partySize <= 2 || refused === null) return answer;
        return {
          ...answer,
          plan: {
            ...answer.plan,
            tables: answer.plan.tables.map((table) =>
              table.id === refused ? { ...table, isBookable: false } : table,
            ),
          },
          tables: answer.tables.map((table) =>
            table.tableId === refused
              ? { ...table, isBookable: false, unavailableReason: 'tooSmall' }
              : table,
          ),
        };
      });
      const user = userEvent.setup();
      const pins = await freePins();
      await user.click(pins[0]!);
      const label = pins[0]!.textContent!;
      expect(within(card()).getByText(new RegExp(`^Table ${label} · `, 'u'))).toBeDefined();

      // Two to one: still given, still chosen.
      await user.click(within(card()).getByRole('button', { name: 'Fewer guests' }));
      // Once the room has answered for one guest, not after a guessed wait (review N13).
      await waitFor(() => expect(asked).toContain(1));
      await waitFor(() =>
        expect(within(card()).getByRole('button', { name: /^Book table/u })).toBeDefined(),
      );
      expect(within(card()).getByText(new RegExp(`^Table ${label} · `, 'u'))).toBeDefined();

      // Up to three, where the room no longer gives it.
      refused = harness.queryClient
        .getQueryCache()
        .findAll({ queryKey: ['availability'] })
        .flatMap((query) => {
          const data = query.state.data as SlotFloor | undefined;
          return data?.plan?.tables ?? [];
        })
        .find((table) => table.label === label)!.id;
      await user.click(within(card()).getByRole('button', { name: 'More guests' }));
      await user.click(within(card()).getByRole('button', { name: 'More guests' }));
      await waitFor(() =>
        expect(note().textContent).toBe(
          `Table ${label} is not free with these choices. Pick another.`,
        ),
      );
      expect(within(card()).getByText('No table chosen yet')).toBeDefined();
    });
  });

  describe('the party stepper on the page', () => {
    it("holds at the branch's largest table however fast it is pressed", async () => {
      // Each press is a new party, whose room is still on its way: the bound
      // comes from the tables, which do not change with the party.
      stubViewport(true);
      const harness = open();
      const branch = (await harness.publicGateway.resolveBranch({
        venueSlug: 'lumen-coffee',
        branchSlug: 'northern-avenue',
      })) as PublicBranch;
      await freePins();
      const floor = harness.queryClient
        .getQueryCache()
        .findAll({ queryKey: ['availability'] })
        .map((query) => query.state.data as SlotFloor | undefined)
        .find((data) => data?.plan)!;
      const largest = Math.max(
        ...floor.plan.tables
          .filter((table) =>
            branch.rooms.some((entry) =>
              entry.photos.some((photo) => photo.photoId === table.pin?.photoId),
            ),
          )
          .map((table) => table.seats),
      );
      expect(largest).toBeLessThan(10);

      const user = userEvent.setup();
      const more = within(card()).getByRole('button', { name: 'More guests' });
      for (let press = 0; press < 12; press += 1) await user.click(more);

      expect(within(card()).getByRole('group', { name: 'Guests' }).textContent).toContain(
        `${largest} guests`,
      );
      expect(more.getAttribute('aria-disabled')).toBe('true');
    });
  });

  describe('choose for me', () => {
    it('takes the smallest free table that fits, in the room on screen first', async () => {
      stubViewport(true);
      const harness = open();
      const answers: SlotFloor[] = [];
      const real = harness.gateway.getSlotFloor.bind(harness.gateway);
      vi.spyOn(harness.gateway, 'getSlotFloor').mockImplementation(async (input) => {
        const answer = await real(input);
        if (answer) answers.push(answer);
        return answer;
      });
      const branch = (await harness.publicGateway.resolveBranch({
        venueSlug: 'lumen-coffee',
        branchSlug: 'northern-avenue',
      })) as PublicBranch;
      await freePins();

      const user = userEvent.setup();
      await user.click(within(card()).getByRole('button', { name: 'Choose for me' }));

      const last = answers.at(-1)!;
      const expected = pickTableFor({
        tables: last.plan.tables,
        rooms: branch.rooms,
        partySize: last.partySize,
        currentRoomId: branch.rooms[0]!.roomId,
      })!;
      expect(expected).toBeDefined();
      const roomName = branch.rooms.find((entry) =>
        entry.photos.some((photo) => photo.photoId === expected.pin?.photoId),
      )!.name;

      expect(within(card()).getByText(`Table ${expected.label} · ${roomName}`)).toBeDefined();
      expect(note().textContent).toBe(
        `We chose table ${expected.label}: ${expected.seats} seats, ${roomName}.`,
      );
      expect(
        screen
          .getByRole('button', { name: `Table ${expected.label}, ${expected.seats} seats, free` })
          .getAttribute('aria-pressed'),
      ).toBe('true');
      expect(within(card()).queryByRole('button', { name: 'Choose for me' })).toBeNull();
    });

    it('says so when no table fits the party then', async () => {
      stubViewport(true);
      const harness = open();
      const real = harness.gateway.getSlotFloor.bind(harness.gateway);
      vi.spyOn(harness.gateway, 'getSlotFloor').mockImplementation(async (input) => {
        const answer = await real(input);
        return (
          answer && {
            ...answer,
            plan: {
              ...answer.plan,
              tables: answer.plan.tables.map((table) => ({ ...table, isBookable: false })),
            },
            tables: answer.tables.map((table) => ({
              ...table,
              isBookable: false,
              unavailableReason: 'alreadyBooked',
            })),
          }
        );
      });
      await screen.findAllByRole('button', { name: /^Table /u });

      await userEvent.setup().click(within(card()).getByRole('button', { name: 'Choose for me' }));
      expect(note().textContent).toMatch(
        /^No free table for \d+ guests? at this time\. Try another time\.$/u,
      );
      expect(within(card()).getByText('No table chosen yet')).toBeDefined();
    });
  });

  /**
   * The red "just taken" line in `where`: focused, and not an alert as well —
   * a focused alert is read twice (review S8).
   */
  async function taken(where: () => HTMLElement): Promise<HTMLElement> {
    const notice = await waitFor(() => {
      const found = where().querySelector<HTMLElement>('.pub-notice-error');
      if (!found) throw new Error('no taken notice yet');
      return found;
    });
    expect(notice.getAttribute('role')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    return notice;
  }

  /**
   * Book the chosen table through to the server, which says somebody took it;
   * the sheet then shows its taken step, and "See the room" closes it.
   */
  async function loseTheTable(user: ReturnType<typeof userEvent.setup>, where: () => HTMLElement) {
    const pin = (await freePins())[0]!;
    const label = pin.textContent!;
    await user.click(pin);
    const book = await within(where()).findByRole('button', { name: `Book table ${label}` });
    await waitFor(() => expect((book as HTMLButtonElement).disabled).toBe(false));
    await user.click(book);
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText('Phone number'), '77123456');
    await user.click(screen.getByRole('button', { name: 'Get a code by SMS' }));
    await user.type(await screen.findByLabelText('Code'), '123456');
    await user.type(await screen.findByLabelText('Name for the booking'), 'Ani');
    await user.click(
      await screen.findByRole('button', { name: /^(Confirm booking|Request table)$/u }),
    );
    await user.click(
      await within(await screen.findByRole('dialog')).findByRole('button', {
        name: 'See the room',
      }),
    );
    return label;
  }

  describe('a table taken while it was being confirmed', () => {
    it('is said in the booking column on a desktop, in red, with the focus on it', async () => {
      stubViewport(true);
      open({ simulateTableTaken: true });
      const label = await loseTheTable(userEvent.setup(), card);

      const notice = await taken(card);
      expect(notice.textContent).toBe(`Table ${label} was just taken. Here is what is free now.`);
      await waitFor(() => expect(document.activeElement).toBe(notice));
      expect(room().querySelector('.pub-notice-error')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('is said under the room on a phone, where the panel was, with the focus on it', async () => {
      stubViewport(false);
      open({ simulateTableTaken: true });
      const label = await loseTheTable(userEvent.setup(), room);

      const notice = await taken(room);
      expect(notice.textContent).toBe(`Table ${label} was just taken. Here is what is free now.`);
      await waitFor(() => expect(document.activeElement).toBe(notice));
      expect(card().querySelector('.pub-notice-error')).toBeNull();
    });
  });

  describe('after the booking panel closes (review B2, S1)', () => {
    it('keeps the taken notice, and the focus on it, when the time it lost was the last there', async () => {
      stubViewport(true);
      const harness = open({ simulateTableTaken: true });
      let lost = false;
      const realDay = harness.gateway.getDaySlots.bind(harness.gateway);
      vi.spyOn(harness.gateway, 'getDaySlots').mockImplementation(async (input) => {
        const day = await realDay(input);
        if (!day || !lost) return day;
        // The table that went was the last at every time that day but the last.
        return {
          ...day,
          slots: day.slots.map((entry, index) =>
            index < day.slots.length - 1
              ? {
                  ...entry,
                  isAvailable: false,
                  requestable: false,
                  freeTableCount: 0,
                  unavailableReason: 'alreadyBooked',
                }
              : entry,
          ),
        };
      });
      const realCreate = harness.gateway.createBooking.bind(harness.gateway);
      vi.spyOn(harness.gateway, 'createBooking').mockImplementation(async (input) => {
        lost = true;
        return realCreate(input);
      });

      await loseTheTable(userEvent.setup(), card);
      const notice = await taken(card);
      await waitFor(() => expect(document.activeElement).toBe(notice));
      // The day reads again and the time moves off the struck one; the notice stays.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(card().querySelector('.pub-notice-error')).toBe(notice);
      expect(document.activeElement).toBe(notice);
    });

    it('does not call the table just booked "not free", and leaves the booked time where it is', async () => {
      stubViewport(true);
      open();
      const user = userEvent.setup();
      const pin = (await freePins())[0]!;
      await user.click(pin);
      const book = await within(card()).findByRole('button', {
        name: `Book table ${pin.textContent}`,
      });
      await waitFor(() => expect((book as HTMLButtonElement).disabled).toBe(false));
      const slotLine = room().querySelector('.pub-room-sub')!.textContent;
      await user.click(book);
      await user.click(await screen.findByRole('button', { name: 'Continue' }));
      await user.type(await screen.findByLabelText('Phone number'), '77123456');
      await user.click(screen.getByRole('button', { name: 'Get a code by SMS' }));
      await user.type(await screen.findByLabelText('Code'), '123456');
      await user.type(await screen.findByLabelText('Name for the booking'), 'Ani');
      await user.click(
        await screen.findByRole('button', { name: /^(Confirm booking|Request table)$/u }),
      );
      const back = await screen.findByRole(
        'button',
        { name: 'Back to the venue page' },
        { timeout: 10_000 },
      );
      await new Promise((resolve) => setTimeout(resolve, 800));
      await user.click(back);
      await new Promise((resolve) => setTimeout(resolve, 800));

      expect(note().textContent).not.toMatch(/is not free with these choices/u);
      expect(within(card()).getByText('No table chosen yet')).toBeDefined();
      expect(room().querySelector('.pub-room-sub')!.textContent).toBe(slotLine);
    });
  });

  describe('while the booking panel is open beside the room (QA 1)', () => {
    it('folds the card to its summary, with Change to open it again', async () => {
      stubViewport(true);
      open();
      const user = userEvent.setup();
      const pin = (await freePins())[0]!;
      await user.click(pin);
      const book = await within(card()).findByRole('button', {
        name: `Book table ${pin.textContent}`,
      });
      await waitFor(() => expect((book as HTMLButtonElement).disabled).toBe(false));
      await user.click(book);
      await screen.findByRole('dialog');

      expect(within(card()).queryByRole('group', { name: 'Day' })).toBeNull();
      await user.click(within(card()).getByRole('button', { name: 'Change' }));
      expect(within(card()).getByRole('group', { name: 'Day' })).toBeDefined();
      expect(screen.getByRole('dialog')).toBeDefined();
    });
  });

  describe('choose for me before the room has answered (review S9)', () => {
    it('says the room is still loading instead of doing nothing', async () => {
      stubViewport(true);
      const harness = open();
      vi.spyOn(harness.gateway, 'getSlotFloor').mockImplementation(() => new Promise(() => {}));
      const button = await within(
        await screen.findByRole('region', { name: 'Book a table' }),
      ).findByRole('button', { name: 'Choose for me' });
      expect(button.getAttribute('aria-disabled')).toBe('true');
      await userEvent.setup().click(button);
      expect(note().textContent).toBe('The room is still loading. Try again in a moment.');
    });
  });

  describe('the reads (review S5)', () => {
    it('reads the room once on opening, at the time the day opens on — not at the first guess', async () => {
      // The page guesses a time from the published hours, then moves to the
      // day's default once the server's day answers. Read for the guess, the
      // room was drawn for a time nobody chose and "Choose for me" said "still
      // loading" while the second read ran — only by day, when the two differ.
      stubViewport(true);
      const harness = createHarness({ floorApprovesAtOnce: true });
      const spy = vi.spyOn(harness.gateway, 'getSlotFloor');
      render(harness.wrap(<PublicApp />, '/lumen-coffee/northern-avenue'));
      const branch = (await harness.publicGateway.resolveBranch({
        venueSlug: 'lumen-coffee',
        branchSlug: 'northern-avenue',
      })) as PublicBranch;

      await freePins();
      await new Promise((resolve) => setTimeout(resolve, 700));
      const pressed = within(card())
        .getByRole('group', { name: 'Time' })
        .querySelector('[aria-pressed="true"]')!;
      const time = /^\d{2}:\d{2}/u.exec(pressed.textContent!)![0];
      const asked = [...new Set(spy.mock.calls.map(([input]) => input.slotUtc))];
      expect(
        asked.map((slotUtc) =>
          new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: branch.timeZoneId,
          }).format(new Date(slotUtc)),
        ),
      ).toEqual([time]);
      // And "Choose for me" can act as soon as the room is drawn.
      expect(
        within(card()).getByRole('button', { name: 'Choose for me' }).getAttribute('aria-disabled'),
      ).toBeNull();
    });

    it('reads no room for a tapped day at the old time, only at the time it opens on', async () => {
      stubViewport(true);
      const harness = open();
      await freePins();
      const branch = (await harness.publicGateway.resolveBranch({
        venueSlug: 'lumen-coffee',
        branchSlug: 'northern-avenue',
      })) as PublicBranch;
      const spy = vi.spyOn(harness.gateway, 'getSlotFloor');

      const days = within(within(card()).getByRole('group', { name: 'Day' })).getAllByRole(
        'button',
      );
      await userEvent.setup().click(days[2]!);
      await waitFor(() => expect(spy).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 600));

      const line = room().querySelector('.pub-room-sub')!.textContent!;
      const time = /(\d{2}:\d{2})/u.exec(line)![1]!;
      const date = days[2]!.getAttribute('aria-label')!;
      expect(date).toBeTruthy();
      const asked = new Set(spy.mock.calls.map(([input]) => input.slotUtc));
      expect(asked.size).toBe(1);
      const [only] = [...asked];
      expect(
        new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: branch.timeZoneId,
        }).format(new Date(only!)),
      ).toBe(time);
    });
  });

  describe('the small things (review N4, N15)', () => {
    it('lets "We chose…" go once the visitor changes the slot', async () => {
      stubViewport(true);
      open();
      await freePins();
      const user = userEvent.setup();
      await waitFor(() =>
        expect(
          within(card())
            .getByRole('button', { name: 'Choose for me' })
            .getAttribute('aria-disabled'),
        ).toBeNull(),
      );
      await user.click(within(card()).getByRole('button', { name: 'Choose for me' }));
      expect(note().textContent).toMatch(/^We chose table/u);
      await user.click(within(card()).getByRole('button', { name: 'More guests' }));
      expect(note().textContent).not.toMatch(/^We chose table/u);
    });

    it("puts the keyboard on the booking card from the header's Book a table", async () => {
      stubViewport(false);
      open();
      const link = await screen.findByRole('link', { name: 'Book a table' });
      await userEvent.setup().click(link);
      expect(document.activeElement).toBe(
        within(card()).getByRole('heading', { level: 2, name: 'Book a table' }),
      );
    });
  });
});
