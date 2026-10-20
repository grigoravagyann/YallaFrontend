// @vitest-environment jsdom
import type { DaySlot, DaySlots, PublicBranch, SlotFloor } from '@yalla/api';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { i18next } from '@yalla/i18n';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingCard, type BookingCardProps } from './BookingCard';
import { addDays, branchToday, slotInstant, type SlotSelection } from './slots';
import { largestOfferedTable } from './tablePick';
import { createHarness, initTestI18n } from './testHarness';

/**
 * The booking card (Main artboard, public-page HANDOFF §6.3): day chips inside
 * the branch's booking window, a party stepper bounded by its tables, and time
 * chips from the server's day of slots — opening on the first time that
 * confirms at once.
 */

beforeAll(async () => {
  await initTestI18n();
});

// Midday in Yerevan, whatever the machine's clock (review N13): "today" is read
// in the set-up and again at render, and must be the same day both times.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-21T08:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function setUp(over: Partial<PublicBranch> = {}) {
  const harness = createHarness();
  const found = await harness.publicGateway.resolveBranch({
    venueSlug: 'lumen-coffee',
    branchSlug: 'northern-avenue',
  });
  const branch = { ...found!, ...over };
  const today = branchToday(branch.timeZoneId);
  return { harness, branch, today };
}

/** The card with its selection live, the way the page holds it. */
function LiveCard({
  branch,
  initial,
  floor,
  onChange,
  panelOpen,
  extra,
}: {
  readonly branch: PublicBranch;
  readonly initial: SlotSelection;
  readonly floor?: SlotFloor;
  readonly onChange?: (next: SlotSelection, automatic: boolean) => void;
  readonly panelOpen?: boolean;
  readonly extra?: Partial<BookingCardProps>;
}) {
  const [selection, setSelection] = useState(initial);
  const slotUtc = (slotInstant(selection, branch.timeZoneId) ?? new Date()).toISOString();
  return (
    <>
      <BookingCard
        branch={branch}
        selection={selection}
        onSelectionChange={(next, how) => {
          onChange?.(next, how?.automatic ?? false);
          setSelection(next);
        }}
        slotUtc={slotUtc}
        headingId="book"
        floor={floor}
        panelOpen={panelOpen}
        {...extra}
      />
      <output data-testid="selection">{`${selection.date} ${selection.time} ${selection.partySize}`}</output>
    </>
  );
}

const slot = (time: string, extra: Partial<DaySlot> = {}): DaySlot => ({
  time,
  slotUtc: `${time}Z`,
  isAvailable: true,
  requiresApproval: false,
  freeTableCount: 2,
  unavailableReason: null,
  ...extra,
});
const FULL = { isAvailable: false, freeTableCount: 0, unavailableReason: 'alreadyBooked' } as const;

/** The server's day, as the test wants it. */
function answerDay(
  harness: ReturnType<typeof createHarness>,
  date: string,
  slots: readonly DaySlot[],
) {
  return vi
    .spyOn(harness.gateway, 'getDaySlots')
    .mockImplementation(async (input): Promise<DaySlots> => ({
      branchId: input.branchId,
      date: input.date,
      partySize: input.partySize,
      stepMinutes: 15,
      unavailableReason: null,
      slots: input.date === date ? slots : [],
    }));
}

function timeChips(): HTMLElement[] {
  return within(screen.getByRole('group', { name: 'Time' })).getAllByRole('button');
}

function pressedTime(): string | null {
  return (
    timeChips().find((chip) => chip.getAttribute('aria-pressed') === 'true')?.textContent ?? null
  );
}

describe('the day chips', () => {
  it("offer a week from the branch's today, and the rest of the window behind 'Other day'", async () => {
    const { harness, branch, today } = await setUp({ bookingWindowDays: 14 });
    render(
      harness.wrap(
        <LiveCard branch={branch} initial={{ date: today, time: '19:00', partySize: 2 }} />,
      ),
    );

    const days = within(screen.getByRole('group', { name: 'Day' })).getAllByRole('button');
    // Seven days, then "Other day…".
    expect(days).toHaveLength(8);
    // The chip says "Today" and is named by it, with the date (WCAG 2.5.3).
    expect(days[0]!.textContent).toContain('Today');
    expect(days[0]!.getAttribute('aria-label')).toMatch(/^Today, \w{3} \d{1,2} \w+$/u);
    expect(days[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(days[1]!.getAttribute('aria-label')).toMatch(/^Tomorrow, /u);
    expect(days[7]!.textContent).toBe('Other day…');

    // The rest of the window is reached with a date input, bounded by it.
    await userEvent.setup().click(days[7]!);
    const input = screen.getByLabelText('Pick a date (up to 14 days ahead)') as HTMLInputElement;
    expect(input.min).toBe(today);
    expect(input.max).toBe(addDays(today, 14));
  });

  it('stop at the end of a short window, with no other day to reach', async () => {
    const { harness, branch, today } = await setUp({ bookingWindowDays: 2 });
    render(
      harness.wrap(
        <LiveCard branch={branch} initial={{ date: today, time: '19:00', partySize: 2 }} />,
      ),
    );

    const days = within(screen.getByRole('group', { name: 'Day' })).getAllByRole('button');
    expect(days).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Other day…' })).toBeNull();
  });

  it('moves the selection to the day picked', async () => {
    const { harness, branch, today } = await setUp({ bookingWindowDays: 14 });
    render(
      harness.wrap(
        <LiveCard branch={branch} initial={{ date: today, time: '19:00', partySize: 2 }} />,
      ),
    );
    const days = within(screen.getByRole('group', { name: 'Day' })).getAllByRole('button');
    await userEvent.setup().click(days[2]!);
    // Pressed at once; the selection follows when the day has answered.
    expect(days[2]!.getAttribute('aria-pressed')).toBe('true');
    await waitFor(() =>
      expect(screen.getByTestId('selection').textContent).toMatch(
        new RegExp(`^${addDays(today, 2)} `, 'u'),
      ),
    );
  });
});

describe('the party stepper', () => {
  it('cannot go under one guest', async () => {
    const { harness, branch, today } = await setUp();
    render(
      harness.wrap(
        <LiveCard branch={branch} initial={{ date: today, time: '19:00', partySize: 1 }} />,
      ),
    );
    const fewer = screen.getByRole('button', { name: 'Fewer guests' });
    expect(fewer.getAttribute('aria-disabled')).toBe('true');
    await userEvent.setup().click(fewer);
    expect(screen.getByTestId('selection').textContent).toMatch(/ 1$/u);
    expect(screen.getByRole('group', { name: 'Guests' }).textContent).toContain('1 guest');
  });

  it("stops at the branch's largest table and sends a bigger party to the phone", async () => {
    const { harness, branch, today } = await setUp();
    const at = slotInstant(
      { date: addDays(today, 1), time: '13:00', partySize: 2 },
      branch.timeZoneId,
    )!;
    const floor = (await harness.gateway.getSlotFloor({
      branchId: branch.id,
      slotUtc: at.toISOString(),
      partySize: 2,
      timeZoneId: branch.timeZoneId,
    }))!;
    const largest = Math.min(largestOfferedTable(floor.plan.tables, branch.rooms)!, 10);

    render(
      harness.wrap(
        <LiveCard
          branch={branch}
          floor={floor}
          initial={{ date: today, time: '19:00', partySize: largest - 1 }}
        />,
      ),
    );
    const user = userEvent.setup();
    const more = screen.getByRole('button', { name: 'More guests' });
    expect(more.getAttribute('aria-disabled')).toBeNull();
    expect(screen.queryByText(/^For more than/u)).toBeNull();

    await user.click(more);
    expect(screen.getByTestId('selection').textContent).toMatch(new RegExp(` ${largest}$`, 'u'));
    expect(more.getAttribute('aria-disabled')).toBe('true');
    await user.click(more);
    expect(screen.getByTestId('selection').textContent).toMatch(new RegExp(` ${largest}$`, 'u'));

    expect(screen.getByText(`For more than ${largest} guests, call`)).toBeDefined();
    expect(screen.getByRole('link', { name: '+374 10 50 05 01' }).getAttribute('href')).toBe(
      'tel:+37410500501',
    );
  });
});

describe('the time chips', () => {
  it('open on the first time that confirms at once, past earlier on-request ones', async () => {
    const { harness, branch, today } = await setUp();
    const date = addDays(today, 1);
    answerDay(harness, date, [
      slot('18:00', FULL),
      slot('18:15', { requiresApproval: true }),
      slot('18:30', { requestable: true, requiresApproval: true }),
      slot('18:45'),
      slot('19:00'),
    ]);
    render(
      harness.wrap(<LiveCard branch={branch} initial={{ date, time: '18:00', partySize: 2 }} />),
    );

    await waitFor(() => expect(pressedTime()).toBe('18:45'));
    expect(screen.getByTestId('selection').textContent).toBe(`${date} 18:45 2`);

    // A full time is drawn, struck and named, and cannot be had.
    const full = screen.getByRole('button', { name: '18:00, no free tables' });
    expect(full.getAttribute('aria-disabled')).toBe('true');
    expect(full.classList.contains('is-full')).toBe(true);
    // A time the venue answers first says so, on the chip and in its name.
    expect(screen.getByRole('button', { name: '18:15 · on request' }).textContent).toBe(
      '18:15on request',
    );
    expect(screen.getByRole('button', { name: '18:30 · on request' })).toBeDefined();
    expect(screen.getByRole('button', { name: '18:45' })).toBeDefined();
  });

  it('fall back to the first on-request time when nothing confirms at once', async () => {
    const { harness, branch, today } = await setUp();
    const date = addDays(today, 1);
    answerDay(harness, date, [
      slot('18:00', FULL),
      slot('18:15', { requiresApproval: true }),
      slot('18:30', { requestable: true, requiresApproval: true }),
    ]);
    render(
      harness.wrap(<LiveCard branch={branch} initial={{ date, time: '18:00', partySize: 2 }} />),
    );

    await waitFor(() => expect(pressedTime()).toBe('18:15on request'));
    // And the card says the venue answers first — tomorrow is not short
    // notice, so not "it is for soon" (review S3).
    expect(screen.getByText('The venue will confirm your booking')).toBeDefined();
  });

  it('leave the selection alone when every time is full', async () => {
    const { harness, branch, today } = await setUp();
    const date = addDays(today, 1);
    const spy = answerDay(harness, date, [slot('18:00', FULL), slot('18:15', FULL)]);
    const onChange = vi.fn();
    render(
      harness.wrap(
        <LiveCard
          branch={branch}
          initial={{ date, time: '18:00', partySize: 2 }}
          onChange={onChange}
        />,
      ),
    );

    await waitFor(() => expect(spy).toHaveBeenCalled());
    await waitFor(() =>
      expect(timeChips().every((chip) => chip.getAttribute('aria-disabled') === 'true')).toBe(true),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keep a time the visitor picked, rather than jumping back to the default', async () => {
    const { harness, branch, today } = await setUp();
    const date = addDays(today, 1);
    answerDay(harness, date, [
      slot('18:00'),
      slot('18:15'),
      slot('18:30', { requiresApproval: true }),
    ]);
    render(
      harness.wrap(<LiveCard branch={branch} initial={{ date, time: '18:00', partySize: 2 }} />),
    );

    // The server's day, not the published hours that stand in until it answers.
    const late = await screen.findByRole('button', { name: '18:30 · on request' });
    expect(pressedTime()).toBe('18:00');
    const user = userEvent.setup();
    await user.click(late);
    expect(screen.getByTestId('selection').textContent).toBe(`${date} 18:30 2`);
    await user.click(screen.getByRole('button', { name: 'More guests' }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.getByTestId('selection').textContent).toBe(`${date} 18:30 3`);
  });

  it('split the day from the evening, and a part opens on its own default', async () => {
    const { harness, branch, today } = await setUp();
    const date = addDays(today, 1);
    answerDay(harness, date, [
      slot('12:00', { requiresApproval: true }),
      slot('12:15'),
      slot('19:00'),
      slot('19:15'),
    ]);
    render(
      harness.wrap(<LiveCard branch={branch} initial={{ date, time: '12:00', partySize: 2 }} />),
    );

    // The afternoon's default is 12:15, the first that confirms at once.
    await waitFor(() => expect(pressedTime()).toBe('12:15'));
    const parts = screen.getByRole('group', { name: 'Part of the day' });
    expect(
      within(parts).getByRole('button', { name: 'Daytime' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(timeChips().map((chip) => chip.textContent)).toEqual(['12:00on request', '12:15']);

    await userEvent.setup().click(within(parts).getByRole('button', { name: 'Evening' }));
    expect(timeChips().map((chip) => chip.textContent)).toEqual(['19:00', '19:15']);
    expect(pressedTime()).toBe('19:00');
    expect(screen.getByTestId('selection').textContent).toBe(`${date} 19:00 2`);
  });

  it('open a new day on the half of the day the visitor was choosing in', async () => {
    const { harness, branch, today } = await setUp({ bookingWindowDays: 14 });
    const slots = [slot('12:00'), slot('12:15'), slot('19:00', FULL), slot('19:15')];
    vi.spyOn(harness.gateway, 'getDaySlots').mockImplementation(async (input) => ({
      branchId: input.branchId,
      date: input.date,
      partySize: input.partySize,
      stepMinutes: 15,
      unavailableReason: null,
      slots,
    }));
    const tomorrow = addDays(today, 1);
    render(
      harness.wrap(
        <LiveCard branch={branch} initial={{ date: tomorrow, time: '19:30', partySize: 2 }} />,
      ),
    );

    // An evening the page opened on: the evening's first that confirms at once,
    // not the day's noon.
    await waitFor(() => expect(pressedTime()).toBe('19:15'));
    const days = within(screen.getByRole('group', { name: 'Day' })).getAllByRole('button');
    await userEvent.setup().click(days[3]!);
    await waitFor(() =>
      expect(screen.getByTestId('selection').textContent).toBe(`${addDays(today, 3)} 19:15 2`),
    );
  });

  it('move nothing while the booking panel is open, so a confirmation is never closed under the visitor', async () => {
    // The visitor booked the last table at 18:15: the day reads again, and that
    // time is full now. Moving the time would close the panel showing the
    // booking they just made.
    const { harness, branch, today } = await setUp();
    const date = addDays(today, 1);
    const spy = answerDay(harness, date, [slot('18:00'), slot('18:15', FULL), slot('18:30')]);
    const onChange = vi.fn();
    render(
      harness.wrap(
        <LiveCard
          branch={branch}
          initial={{ date, time: '18:15', partySize: 2 }}
          onChange={onChange}
          panelOpen
        />,
      ),
    );

    await screen.findByRole('button', { name: '18:15, no free tables' });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onChange).not.toHaveBeenCalled();
  });
});

/** Every date answered with the same slots, for the tests that tap days. */
function answerEveryDay(harness: ReturnType<typeof createHarness>, slots: readonly DaySlot[]) {
  return vi
    .spyOn(harness.gateway, 'getDaySlots')
    .mockImplementation(async (input): Promise<DaySlots> => ({
      branchId: input.branchId,
      date: input.date,
      partySize: input.partySize,
      stepMinutes: 15,
      unavailableReason: null,
      slots,
    }));
}

describe('the reason a time waits (review S3)', () => {
  it('is not "for soon" for a time days away that the venue confirms itself', async () => {
    const { harness, branch, today } = await setUp();
    const date = addDays(today, 3);
    answerDay(harness, date, [slot('19:00', { requiresApproval: true })]);
    render(
      harness.wrap(<LiveCard branch={branch} initial={{ date, time: '19:00', partySize: 2 }} />),
    );

    await screen.findByRole('button', { name: '19:00 · on request' });
    expect(screen.getByText('The venue will confirm your booking')).toBeDefined();
    expect(screen.queryByText(/It is for soon/u)).toBeNull();
  });

  it('is "for soon" for a time today', async () => {
    const { harness, branch, today } = await setUp();
    answerDay(harness, today, [slot('19:00', { requiresApproval: true })]);
    render(
      harness.wrap(
        <LiveCard branch={branch} initial={{ date: today, time: '19:00', partySize: 2 }} />,
      ),
    );
    expect(await screen.findByText(/It is for soon/u)).toBeDefined();
  });

  it('is left to the booking panel while it is open (QA 2)', async () => {
    const { harness, branch, today } = await setUp();
    answerDay(harness, today, [slot('19:00', { requiresApproval: true })]);
    render(
      harness.wrap(
        <LiveCard
          branch={branch}
          panelOpen
          initial={{ date: today, time: '19:00', partySize: 2 }}
        />,
      ),
    );
    await screen.findByRole('button', { name: '19:00 · on request' });
    expect(screen.queryByText(/It is for soon/u)).toBeNull();
  });
});

describe('the reads (review S5)', () => {
  it('says the times could not be checked when the day read fails, and promises nothing', async () => {
    const { harness, branch, today } = await setUp();
    const date = addDays(today, 1);
    vi.spyOn(harness.gateway, 'getDaySlots').mockRejectedValue(new Error('429'));
    const onChange = vi.fn();
    render(
      harness.wrap(
        <LiveCard
          branch={branch}
          initial={{ date, time: '19:00', partySize: 2 }}
          onChange={onChange}
        />,
      ),
    );

    expect(
      await screen.findByText(
        'We could not check which times are free. Pick a time, and the room will show what is free then.',
      ),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: / · on request$/u })).toBeNull();
    expect(screen.queryByText(/confirm/u)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves the selection once on a day tap, straight to that day's default", async () => {
    const { harness, branch, today } = await setUp({ bookingWindowDays: 14 });
    const start = addDays(today, 1);
    // The day on screen opens on 18:15; every other day on 18:00.
    vi.spyOn(harness.gateway, 'getDaySlots').mockImplementation(async (input) => ({
      branchId: input.branchId,
      date: input.date,
      partySize: input.partySize,
      stepMinutes: 15,
      unavailableReason: null,
      slots:
        input.date === start
          ? [slot('18:00', { requiresApproval: true }), slot('18:15')]
          : [slot('18:00'), slot('18:15')],
    }));
    const onChange = vi.fn();
    render(
      harness.wrap(
        <LiveCard
          branch={branch}
          initial={{ date: addDays(today, 1), time: '18:15', partySize: 2 }}
          onChange={onChange}
        />,
      ),
    );
    await screen.findByRole('button', { name: '18:00 · on request' });
    onChange.mockClear();

    const days = within(screen.getByRole('group', { name: 'Day' })).getAllByRole('button');
    await userEvent.setup().click(days[3]!);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 400));
    // Not the new day at the old time first: no room is read for a slot nobody chose.
    expect(onChange.mock.calls.map(([next]) => `${next.date} ${next.time}`)).toEqual([
      `${addDays(today, 3)} 18:00`,
    ]);
  });

  it('asks only about the day a run along the chips stops on', async () => {
    const { harness, branch, today } = await setUp({ bookingWindowDays: 14 });
    const spy = answerEveryDay(harness, [slot('18:15')]);
    render(
      harness.wrap(
        <LiveCard branch={branch} initial={{ date: today, time: '18:15', partySize: 2 }} />,
      ),
    );
    await waitFor(() => expect(spy).toHaveBeenCalled());
    spy.mockClear();

    const days = within(screen.getByRole('group', { name: 'Day' })).getAllByRole('button');
    for (const index of [1, 2, 3, 4, 5]) fireEvent.click(days[index]!);
    await waitFor(() =>
      expect(screen.getByTestId('selection').textContent).toMatch(
        new RegExp(`^${addDays(today, 5)} `, 'u'),
      ),
    );
    expect(spy.mock.calls.map(([input]) => input.date)).toEqual([addDays(today, 5)]);
  });
});

describe("a late-closing venue's day (review B1)", () => {
  const LATE = ([0, 1, 2, 3, 4, 5, 6] as const).map((day) => ({
    day,
    blocks: [{ opensAt: '18:00', closesAt: '02:00' }],
  }));

  it('opens on its own evening, and runs on past midnight on the next date', async () => {
    const { harness, branch, today } = await setUp({ weeklyHours: LATE });
    const date = addDays(today, 1);
    // Every date lists its own 00:00–00:30 first: the night before's.
    answerEveryDay(harness, [
      slot('00:00'),
      slot('00:15'),
      slot('00:30'),
      slot('18:00'),
      slot('18:15'),
      slot('23:45'),
    ]);
    render(
      harness.wrap(<LiveCard branch={branch} initial={{ date, time: '12:00', partySize: 2 }} />),
    );

    await waitFor(() =>
      expect(screen.getByTestId('selection').textContent).toBe(`${date} 18:00 2`),
    );
    expect(timeChips().map((chip) => chip.textContent)).toEqual([
      '18:00',
      '18:15',
      '23:45',
      '00:00',
      '00:15',
      '00:30',
    ]);

    await userEvent.setup().click(screen.getByRole('button', { name: '00:15' }));
    expect(screen.getByTestId('selection').textContent).toBe(`${addDays(date, 1)} 00:15 2`);
    // Still the night it belongs to.
    const days = within(screen.getByRole('group', { name: 'Day' })).getAllByRole('button');
    expect(days[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(pressedTime()).toBe('00:15');
  });
});

describe('while the booking panel is open in the column (QA 1)', () => {
  it('folds to a summary with Change, so the column fits beside the panel', async () => {
    const { harness, branch, today } = await setUp();
    const date = addDays(today, 1);
    answerDay(harness, date, [slot('18:15')]);
    render(
      harness.wrap(
        <LiveCard
          branch={branch}
          panelOpen
          initial={{ date, time: '18:15', partySize: 2 }}
          extra={{ panelInColumn: true }}
        />,
      ),
    );

    expect(screen.queryByRole('group', { name: 'Day' })).toBeNull();
    expect(screen.getByText('Tomorrow · 18:15 · 2 guests')).toBeDefined();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('group', { name: 'Day' })).toBeDefined();
  });
});

describe('the table part (QA 3, review S9)', () => {
  it('keeps "We chose…" for the screen reader once the badge shows the table', async () => {
    const { harness, branch, today } = await setUp();
    render(
      harness.wrap(
        <LiveCard
          branch={branch}
          initial={{ date: today, time: '19:00', partySize: 2 }}
          extra={{
            onBook: () => {},
            table: { label: '2', seats: 2, roomName: 'Windows', availability: null },
            tableNote: 'We chose table 2: 2 seats, Windows.',
          }}
        />,
      ),
    );
    const note = screen.getByText('We chose table 2: 2 seats, Windows.');
    expect(note.classList.contains('visually-hidden')).toBe(true);
    expect(note.getAttribute('role')).toBe('status');
  });

  it('marks "Choose for me" unavailable until the room has answered', async () => {
    const { harness, branch, today } = await setUp();
    render(
      harness.wrap(
        <LiveCard
          branch={branch}
          initial={{ date: today, time: '19:00', partySize: 2 }}
          extra={{ onBook: () => {}, onPickForMe: () => {}, roomReady: false }}
        />,
      ),
    );
    expect(
      screen.getByRole('button', { name: 'Choose for me' }).getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('never says "0 seats" for a table whose seats are not known (N3)', async () => {
    const { harness, branch, today } = await setUp();
    render(
      harness.wrap(
        <LiveCard
          branch={branch}
          initial={{ date: today, time: '19:00', partySize: 2 }}
          extra={{
            onBook: () => {},
            table: { label: '2', seats: null, roomName: 'Windows', availability: null },
          }}
        />,
      ),
    );
    expect(screen.getByText('Today, 19:00 · 2 guests')).toBeDefined();
  });
});

describe('the nits', () => {
  it('moves a day that has passed to today, by itself (N1)', async () => {
    const { harness, branch, today } = await setUp();
    const onChange = vi.fn();
    render(
      harness.wrap(
        <LiveCard
          branch={branch}
          initial={{ date: addDays(today, -1), time: '19:00', partySize: 2 }}
          onChange={onChange}
        />,
      ),
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ date: today }), true),
    );
  });

  it('brings a party over the largest table down when the tables answer, and leaves the off-line ones out (N2)', async () => {
    const { harness, branch, today } = await setUp();
    const at = slotInstant(
      { date: addDays(today, 1), time: '13:00', partySize: 2 },
      branch.timeZoneId,
    )!;
    const real = (await harness.gateway.getSlotFloor({
      branchId: branch.id,
      slotUtc: at.toISOString(),
      partySize: 2,
      timeZoneId: branch.timeZoneId,
    }))!;
    const largest = Math.min(largestOfferedTable(real.plan.tables, branch.rooms)!, 10);
    // A twelve-top the venue never books online, on a photo.
    const banquet = {
      ...real.plan.tables[0]!,
      id: 'banquet',
      label: '99',
      seats: 12,
      isBookable: false,
    };
    const floor: SlotFloor = {
      ...real,
      plan: { ...real.plan, tables: [...real.plan.tables, banquet] },
      tables: [
        ...real.tables,
        {
          ...real.tables[0]!,
          tableId: 'banquet',
          tableLabel: '99',
          seats: 12,
          isBookable: false,
          unavailableReason: 'notBookable',
        },
      ],
    };
    render(
      harness.wrap(
        <LiveCard
          branch={branch}
          floor={floor}
          initial={{ date: today, time: '19:00', partySize: 10 }}
        />,
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('selection').textContent).toBe(`${today} 19:00 ${largest}`),
    );
  });

  it('names the day chosen past the chips on "Other day" (N7)', async () => {
    const { harness, branch, today } = await setUp({ bookingWindowDays: 14 });
    render(
      harness.wrap(
        <LiveCard
          branch={branch}
          initial={{ date: addDays(today, 10), time: '19:00', partySize: 2 }}
        />,
      ),
    );
    const other = within(screen.getByRole('group', { name: 'Day' }))
      .getAllByRole('button')
      .at(-1)!;
    expect(other.textContent).toMatch(/^Other day: \w{3} \d{1,2} \w+$/u);
    expect(other.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(other.getAttribute('aria-controls')!)).not.toBeNull();
  });

  it('is one tab stop for the times, moved through with the arrows (N8)', async () => {
    const { harness, branch, today } = await setUp();
    const date = addDays(today, 1);
    answerDay(harness, date, [slot('18:00'), slot('18:15', FULL), slot('18:30')]);
    render(
      harness.wrap(<LiveCard branch={branch} initial={{ date, time: '18:00', partySize: 2 }} />),
    );
    await screen.findByRole('button', { name: '18:15, no free tables' });

    const stops = timeChips().filter((chip) => chip.tabIndex === 0);
    expect(stops.map((chip) => chip.textContent)).toEqual(['18:00']);
    stops[0]!.focus();
    fireEvent.keyDown(stops[0]!, { key: 'ArrowRight' });
    expect(document.activeElement?.textContent).toBe('18:15');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement?.textContent).toBe('18:30');
  });
});

describe("the chosen table's free-cancellation line (public-page phase 4)", () => {
  it('writes the date in Armenian from our own words, not the browser’s', async () => {
    const { harness, branch, today } = await setUp();
    await act(() => i18next.changeLanguage('hy'));
    try {
      const date = addDays(today, 3);
      const slotUtc = slotInstant({ date, time: '19:00', partySize: 2 }, branch.timeZoneId)!;
      const availability = (
        await harness.gateway.getTableAvailability({
          branchId: branch.id,
          slotUtc: slotUtc.toISOString(),
          partySize: 2,
          timeZoneId: branch.timeZoneId,
        })
      ).find((entry) => entry.isBookable)!;
      render(
        harness.wrap(
          <LiveCard
            branch={branch}
            initial={{ date, time: '19:00', partySize: 2 }}
            extra={{
              table: { label: availability.tableLabel, seats: 2, roomName: 'Սրահ', availability },
              onBook: () => {},
            }}
          />,
        ),
      );
      const line = await screen.findByText(/^Անվճար չեղարկում մինչև /u);
      // The card's own day words ("ուրբ, 24 հոկտեմբերի", lower case mid-sentence), which read the same
      // in a browser with no Armenian date data; `Intl` printed "Oct 24, 2026"
      // there, and its own hy form where it has the data.
      expect(line.textContent).toMatch(
        /^Անվճար չեղարկում մինչև [ա-ֆ]+, \d{1,2} [ա-ֆ]+ի, \d{2}:\d{2}$/u,
      );
    } finally {
      await act(() => i18next.changeLanguage('en'));
    }
  });
});
