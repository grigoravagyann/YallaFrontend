// @vitest-environment jsdom
import { ApiError, type Booking, type CreateBookingCommand } from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicApp } from './PublicApp';
import { createHarness, initTestI18n } from './testHarness';

/**
 * Booking by time only (2026-10-29): at such a branch a visitor picks the day,
 * how many and a time, may add a wish, and books with no table — the venue
 * chooses it when they arrive. No room is drawn and no table is offered.
 *
 * The mock world has no such branch, so the page's two reads are turned to
 * one: the branch says it books by time only, and its day counts guests. The
 * booking itself is the mock's, made at a real table and handed back without
 * it, as the server answers one made by time.
 */

beforeAll(async () => {
  await initTestI18n();
});

beforeEach(() => {
  // Midday on an ordinary Wednesday, Yerevan time: Northern Avenue is open.
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-21T08:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const GUESTS_LEFT = 6;

function open(options: { readonly refuse?: unknown; readonly path?: string } = {}) {
  const harness = createHarness({ floorApprovesAtOnce: true });
  const { publicGateway, gateway } = harness;
  // As the server reads a booking made by time only from its link: no table yet.
  const getManagedBooking = publicGateway.getManagedBooking.bind(publicGateway);
  vi.spyOn(publicGateway, 'getManagedBooking').mockImplementation(async (input) => {
    const booking = await getManagedBooking(input);
    return (
      booking && {
        ...booking,
        tableId: null,
        tableLabel: null,
        floorAreaName: null,
        bookedWithoutTable: true,
        canChange: false,
      }
    );
  });

  const resolveBranch = publicGateway.resolveBranch.bind(publicGateway);
  vi.spyOn(publicGateway, 'resolveBranch').mockImplementation(async (input) => {
    const branch = await resolveBranch(input);
    return branch && { ...branch, policy: { ...branch.policy, bookingMode: 'timeOnly' } };
  });
  const getTimeOnlySlots = publicGateway.getTimeOnlySlots.bind(publicGateway);
  const slotsRead = vi
    .spyOn(publicGateway, 'getTimeOnlySlots')
    .mockImplementation(async (input) => {
      const day = await getTimeOnlySlots(input);
      return (
        day && {
          ...day,
          slots: day.slots.map((slot) => ({
            ...slot,
            guestsLeft: slot.isAvailable ? GUESTS_LEFT : 0,
          })),
        }
      );
    });
  const daySlots = vi.spyOn(gateway, 'getDaySlots');

  const sent: CreateBookingCommand[] = [];
  const createBooking = gateway.createBooking.bind(gateway);
  vi.spyOn(gateway, 'createBooking').mockImplementation(async (command) => {
    sent.push(command);
    if (options.refuse) throw options.refuse;
    // A real booking from the mock, at whichever table it has, returned as
    // the server returns one made by time: no table yet.
    const tables = await gateway.getTableAvailability({
      branchId: command.branchId,
      slotUtc: command.slotUtc,
      partySize: command.partySize,
      timeZoneId: command.timeZoneId,
    });
    const table = tables.find((entry) => entry.isBookable)!;
    const booking: Booking = await createBooking({ ...command, tableId: table.tableId });
    return { ...booking, tableId: null, tableLabel: null, bookedWithoutTable: true };
  });

  if (options.path !== undefined) {
    render(harness.wrap(<PublicApp />, options.path));
  }
  return { harness, sent, slotsRead, daySlots };
}

const PAGE = '/lumen-coffee/northern-avenue';
const card = () => screen.getByRole('region', { name: 'Book a table' });

async function bookButton(): Promise<HTMLButtonElement> {
  const column = await screen.findByRole('region', { name: 'Book a table' }, { timeout: 5000 });
  const button = (await within(column).findByRole(
    'button',
    { name: /^Book for \d{2}:\d{2}$/u },
    { timeout: 5000 },
  )) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  return button;
}

async function proveThePhone(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
  await user.type(await screen.findByLabelText('Phone number'), '77123456');
  await user.click(screen.getByRole('button', { name: 'Get a code by SMS' }));
  await user.type(await screen.findByLabelText('Code'), '123456');
}

describe('booking by time only on the public page', () => {
  it('offers no room and no table, and says how many places the time has left', async () => {
    const { slotsRead, daySlots } = open({ path: PAGE });
    await bookButton();

    expect(screen.queryByRole('region', { name: 'Choose your table' })).toBeNull();
    expect(within(card()).queryByRole('button', { name: 'Choose for me' })).toBeNull();
    expect(within(card()).getByText('The venue chooses your table when you arrive.')).toBeTruthy();
    expect(within(card()).getByText(`${GUESTS_LEFT} places left at this time`)).toBeTruthy();
    // The day is read where guests are counted, never as tables: the mock's
    // public read is the app's day underneath, so each app read is one of those.
    expect(slotsRead).toHaveBeenCalled();
    expect(daySlots).toHaveBeenCalledTimes(slotsRead.mock.calls.length);
  });

  it('books the time with a wish and no table, and the venue chooses it on arrival', async () => {
    const { sent } = open({ path: PAGE });
    const user = userEvent.setup();
    await user.click(await bookButton());

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('The venue chooses it when you arrive')).toBeTruthy();
    expect(within(sheet).getByText('Time')).toBeTruthy();
    await proveThePhone(user);

    await user.type(await screen.findByLabelText('Name for the booking'), 'Ani');
    await user.type(screen.getByLabelText(/Your wish/u), 'By the window');
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    expect(await screen.findByText('You are booked')).toBeTruthy();
    expect(screen.getByText(/Table chosen when you arrive/u)).toBeTruthy();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ tableId: null, note: 'By the window', channel: 'web' });
  });

  it('says how many the time could still take when it filled up meanwhile', async () => {
    const refusal = new ApiError('time-full', {
      status: 409,
      url: 'https://api.test/api/public/branches/b/reservations',
      problem: {
        type: 'https://yalla.am/problems/time-full',
        title: 'Conflict',
        status: 409,
        detail: 'time-full',
        code: 'time-full',
        traceId: 'test',
        context: { branchId: 'b', partySize: 4, guestsLeft: 2 },
      } as unknown as NonNullable<ApiError['problem']>,
    });
    open({ refuse: refusal, path: PAGE });
    const user = userEvent.setup();
    await user.click(await bookButton());
    await proveThePhone(user);
    await user.type(await screen.findByLabelText('Name for the booking'), 'Ani');
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    expect(
      await screen.findByText(
        'This time has just filled up: only 2 more guests fit. Choose another time or fewer guests.',
      ),
    ).toBeTruthy();
  });
});

describe('a booking made by time only, from its manage link', () => {
  it('says the venue chooses the table on arrival, and offers no change', async () => {
    const { harness } = open();
    const branch = (await harness.publicGateway.resolveBranch({
      venueSlug: 'lumen-coffee',
      branchSlug: 'northern-avenue',
    }))!;
    // Four hours out, inside Northern Avenue's day.
    const booking = await harness.gateway.createBooking({
      commandId: '3f0c2a7e-5b1d-4c39-9a51-0d6f3c2b7e10',
      branchId: branch.id,
      tableId: null,
      slotUtc: '2026-10-21T12:00:00Z',
      timeZoneId: branch.timeZoneId,
      partySize: 2,
      guestName: 'Ani',
      guestPhone: '+37477123456',
      channel: 'web',
    });
    render(harness.wrap(<PublicApp />, `/booking/${booking.manageToken!}`));

    expect(await screen.findByText('The venue chooses it when you arrive')).toBeTruthy();
    expect(
      screen.getByText(
        'A booking by time cannot be moved online. To change it, cancel it and book again.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change time or guests' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel this booking' })).toBeTruthy();
  });
});
