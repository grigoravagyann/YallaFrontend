// @vitest-environment jsdom
import {
  NetworkError,
  TelegramUnavailableError,
  availabilityWindowCopy,
  freeCancellationCopy,
  type Booking,
  type PublicBranch,
  type TableAvailability,
} from '@yalla/api';
import { queryKeys } from '@yalla/api/react';
import { i18next } from '@yalla/i18n';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import BookingSheet from './BookingSheet';
import { bookingIcs, icsDescription } from './calendarFile';
import { RoomSection } from './RoomSection';
import { defaultSelection, slotInstant } from './slots';
import { createHarness, initTestI18n, stubIntersectionObserverAsNeverVisible } from './testHarness';

/**
 * Booking a table from a link, with no account and no app.
 *
 * The device's clock is set to Moscow for this whole file, deliberately. The
 * visitor this page exists for is a tourist an hour ahead of Yerevan, and every
 * time on the page — the window, the cancellation deadline, the calendar file —
 * has to read in the *branch's* zone. Run this suite in UTC+4 and a buggy
 * implementation passes.
 */
process.env['TZ'] = 'Europe/Moscow';

const YEREVAN = 'Asia/Yerevan';
const VENUE = 'lumen-coffee';
const BRANCH = 'northern-avenue';

beforeAll(async () => {
  await initTestI18n();
});

beforeEach(() => {
  stubIntersectionObserverAsNeverVisible();
});

afterEach(cleanup);

/**
 * A real branch, a real free table and the slot the page would default to.
 *
 * All three read out of the mock world rather than written here, so the test
 * exercises the shapes the page is actually handed. A hand-built
 * `TableAvailability` would let the window logic drift out from under it.
 */
async function setUp(options: { simulateTableTaken?: boolean } = {}) {
  const harness = createHarness({
    ...(options.simulateTableTaken === undefined
      ? {}
      : { simulateTableTaken: options.simulateTableTaken }),
    // Two hours out is short notice; these are about a booking the floor took.
    floorApprovesAtOnce: true,
  });

  const branch = (await harness.publicGateway.resolveBranch({
    venueSlug: VENUE,
    branchSlug: BRANCH,
  })) as PublicBranch;
  expect(branch).not.toBeNull();

  // Two hours out, so the branch's own lead time cannot refuse it.
  const selection = {
    // With the branch's own hours and sitting length, as the page opens on: a
    // bare "two hours from now" is a closed slot late at night.
    ...defaultSelection(branch.timeZoneId, new Date(Date.now() + 2 * 60 * 60_000), {
      minLeadMinutes: branch.policy.minLeadMinutes,
      turnTimeMinutes: branch.policy.turnTimeMinutes,
      weeklyHours: branch.weeklyHours,
    }),
    partySize: 2,
  };
  const instant = slotInstant(selection, branch.timeZoneId);
  expect(instant, 'the default selection must always resolve').not.toBeNull();
  const slotUtc = instant!.toISOString();

  const availability = await harness.gateway.getTableAvailability({
    branchId: branch.id,
    slotUtc,
    partySize: selection.partySize,
    timeZoneId: branch.timeZoneId,
  });
  const table = availability.find((entry) => entry.isBookable) as TableAvailability;
  expect(table, 'the fixture branch has no bookable table at the default slot').toBeDefined();

  return { harness, branch, selection, slotUtc, table };
}

describe('the booking flow', () => {
  it('shows the availability window before any confirm button exists', async () => {
    const { harness, branch, slotUtc, selection, table } = await setUp();

    render(
      harness.wrap(
        <BookingSheet
          branch={branch}
          availability={table}
          slotUtc={slotUtc}
          partySize={selection.partySize}
          onClose={() => {}}
          onTableTaken={() => {}}
        />,
      ),
    );

    /*
     * The rule this product is built on: the limit is *told*, not asked for.
     * Asserted against the shared `availabilityWindowCopy` — the same function
     * the phone app's sheet and confirm screen render — so the two surfaces
     * cannot start promising different things.
     */
    const expected = availabilityWindowCopy(table.window, branch.timeZoneId, 'en');
    const windowText =
      expected.primary.key === 'table.noBookingAfter'
        ? 'No booking after yours'
        : `Held for you ${String(expected.primary.params['range'])}`;

    const rendered = await screen.findByText(windowText);
    const reserve = screen.getByRole('button', { name: /^Reserve table/u });

    // Before, in document order. A confirm above the window makes the limit a
    // disclosure rather than a choice.
    expect(
      rendered.compareDocumentPosition(reserve) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // And the deadline, from the same shared rule.
    // The server's own deadline, carried on the offer. Rendered through the
    // same copy the page uses: late in the branch's evening a slot two hours
    // out crosses midnight, and the rule then says "on <date> at 00:00" rather
    // than "until 00:00" — a literal here failed every night after ten.
    expect(table.freeCancellationUntilUtc).not.toBeNull();
    const deadline = freeCancellationCopy(table.freeCancellationUntilUtc!, branch.timeZoneId, 'en');
    // The sheet renders these keys with its `diner` translator.
    expect(
      screen.getByText(i18next.t(deadline.key, { ...deadline.params, ns: 'diner' })),
    ).toBeDefined();
  });

  it('reaches a confirmed reservation through phone verification', async () => {
    const { harness, branch, slotUtc, selection, table } = await setUp();
    const user = userEvent.setup();

    render(
      harness.wrap(
        <BookingSheet
          branch={branch}
          availability={table}
          slotUtc={slotUtc}
          partySize={selection.partySize}
          onClose={() => {}}
          onTableTaken={() => {}}
        />,
      ),
    );

    await user.click(await screen.findByRole('button', { name: /^Reserve table/u }));

    // Phone step. The prefix defaults to +374 and stays editable, because the
    // tourist is the reason this page exists.
    const number = await screen.findByLabelText('Phone number');
    expect((screen.getByLabelText('Country code') as HTMLInputElement).value).toBe('+374');
    await user.type(number, '77123456');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    // Code step. The mock's code is the one it printed in its own dev banner,
    // which is what the real backend does outside production.
    const code = await screen.findByLabelText('Enter the code');
    await user.type(code, '123456');

    // Confirm step: the window again, at the moment of commitment — and the
    // name the venue will ask for at the door, which the server requires.
    const confirm = await screen.findByRole('button', { name: 'Confirm booking' });
    expect((confirm as HTMLButtonElement).disabled, 'no name, no booking').toBe(true);
    await user.type(screen.getByLabelText('Name for the booking'), 'Ani');
    await user.click(confirm);

    expect(await screen.findByText('Table booked')).toBeDefined();

    // A real reservation, with a code staff can be asked for at the door.
    const { upcoming: stored } = await harness.gateway.listBookings();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.status).toBe('confirmed');
    expect(screen.getByText(stored[0]!.code)).toBeDefined();
  });

  it('offers the calendar file, the manage link and no app badge', async () => {
    const { harness, branch, slotUtc, selection, table } = await setUp();
    const user = userEvent.setup();

    render(
      harness.wrap(
        <BookingSheet
          branch={branch}
          availability={table}
          slotUtc={slotUtc}
          partySize={selection.partySize}
          onClose={() => {}}
          onTableTaken={() => {}}
        />,
      ),
    );

    await user.click(await screen.findByRole('button', { name: /^Reserve table/u }));
    await user.type(await screen.findByLabelText('Phone number'), '77123456');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.type(await screen.findByLabelText('Enter the code'), '123456');
    await user.type(await screen.findByLabelText('Name for the booking'), 'Ani');
    await user.click(await screen.findByRole('button', { name: 'Confirm booking' }));
    await screen.findByText('Table booked');

    // First, because it is the only one of the three that fully replaces the
    // push reminder this visitor will never get.
    const calendar = screen.getByRole('button', { name: 'Add to my calendar' });
    const manage = screen.getByText(/\/booking\//u);
    expect(
      calendar.compareDocumentPosition(manage) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // The app is not published in this configuration, so it is not mentioned.
    // A store badge for an app that does not exist is a dead end with a logo.
    expect(screen.queryByText('Get the app')).toBeNull();
  });
});

describe('another table tapped while the panel is open', () => {
  it('is a new attempt: a new command id, its own free-by, the phone proof kept', async () => {
    /*
     * HANDOFF §3: one client command id per booking attempt. The panel stays
     * mounted when the visitor taps another table — the room sits beside it on
     * a desktop — so table B must not be sent under table A's id: after an
     * attempt on A whose outcome is unknown, the server would replay A's
     * booking or answer `client-command-id-in-use`.
     */
    const { harness, branch, slotUtc, selection, table } = await setUp();
    const other = (
      await harness.gateway.getTableAvailability({
        branchId: branch.id,
        slotUtc,
        partySize: selection.partySize,
        timeZoneId: branch.timeZoneId,
      })
    ).find((entry) => entry.isBookable && entry.tableId !== table.tableId) as TableAvailability;
    expect(other, 'the fixture needs a second bookable table').toBeDefined();

    const create = vi.spyOn(harness.gateway, 'createBooking');
    create.mockRejectedValueOnce(new NetworkError({ url: '/api/reservations' }));
    const user = userEvent.setup();
    const sheet = (availability: TableAvailability) =>
      harness.wrap(
        <BookingSheet
          branch={branch}
          availability={availability}
          slotUtc={slotUtc}
          partySize={selection.partySize}
          onClose={() => {}}
          onTableTaken={() => {}}
        />,
      );
    const view = render(sheet(table));

    await user.click(await screen.findByRole('button', { name: /^Reserve table/u }));
    await user.type(await screen.findByLabelText('Phone number'), '77123456');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.type(await screen.findByLabelText('Enter the code'), '123456');
    await user.type(await screen.findByLabelText('Name for the booking'), 'Ani');
    await user.click(screen.getByRole('button', { name: /^(Confirm booking|Request table)$/u }));
    // The outcome is unknown, so the button checks rather than books.
    await screen.findByRole('button', { name: 'Check again' });
    const firstId = create.mock.calls[0]![0].commandId;

    view.rerender(sheet(other));

    // Still verified, so still on the name step — and a fresh attempt, not a check.
    const submit = await screen.findByRole('button', {
      name: /^(Confirm booking|Request table)$/u,
    });
    expect(screen.queryByLabelText('Phone number')).toBeNull();
    if ((other.mustFreeByUtc ?? null) !== null) await user.click(screen.getByRole('checkbox'));
    await user.click(submit);

    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    const second = create.mock.calls[1]![0];
    expect(second.tableId).toBe(other.tableId);
    expect(second.commandId).not.toBe(firstId);
  });
});

describe('the calendar file the confirmation hands over', () => {
  it("writes the branch's local time, not the device's", async () => {
    const { harness, branch, slotUtc, selection, table } = await setUp();

    const booking = (await harness.gateway.createBooking({
      commandId: '821075c1-812c-4846-8c3c-3adc4b452189',
      branchId: branch.id,
      tableId: table.tableId,
      slotUtc,
      timeZoneId: branch.timeZoneId,
      partySize: selection.partySize,
      guestName: 'Ani',
      guestPhone: '+37477123456',
      channel: 'web',
    })) as Booking;

    const ics = bookingIcs({
      booking,
      venueName: branch.venue.name,
      addressLine: branch.addressLine,
      manageUrl: `https://yalla.am/${VENUE}/${BRANCH}/booking/${booking.manageToken}`,
      locale: 'en',
      summary: `Table ${booking.tableLabel} · ${booking.venueName}`,
      descriptionLines: icsDescription({
        booking,
        locale: 'en',
        codeLabel: 'Your code',
        cancellationLine: 'Free cancellation',
        manageLabel: 'Manage',
        manageUrl: `https://yalla.am/${VENUE}/${BRANCH}/booking/${booking.manageToken}`,
      }),
    });

    // The wall clock in Yerevan at the booked instant. Computed here from the
    // instant rather than hardcoded, so the assertion stays true whenever the
    // suite runs — and it is *not* what a Moscow device would produce, which
    // is the whole point.
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: YEREVAN,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .format(new Date(booking.slotUtc))
      .split(', ') as [string, string];
    const yerevanStamp = `${parts[0].replace(/-/gu, '')}T${parts[1].replace(/:/gu, '')}00`;

    expect(ics).toContain(`DTSTART;TZID=${YEREVAN}:${yerevanStamp}`);
    // Not the device's clock, which is an hour ahead in this suite.
    expect(new Date(booking.slotUtc).getHours()).not.toBe(Number(yerevanStamp.slice(9, 11)));
    expect(ics).toContain(`TZID:${YEREVAN}`);

    // And the way out travels inside the event itself.
    expect(ics).toContain('/booking/');
    expect(ics).toContain(booking.code);
  });
});

describe('losing the table while confirming', () => {
  it('refreshes the room, says which table went, and does not retry', async () => {
    const { harness, branch, slotUtc, selection, table } = await setUp({
      simulateTableTaken: true,
    });
    const user = userEvent.setup();

    const onTableTaken = vi.fn();
    const onClose = vi.fn();

    // Seed the cache with the room the page draws — the slot floor — as it
    // stood, so the refresh is observable.
    const lookup = {
      branchId: branch.id,
      slotUtc,
      partySize: selection.partySize,
      timeZoneId: branch.timeZoneId,
    };
    const roomKey = queryKeys.slotFloor(branch.id, slotUtc, selection.partySize, branch.timeZoneId);
    harness.queryClient.setQueryData(roomKey, await harness.gateway.getSlotFloor(lookup));

    render(
      harness.wrap(
        <BookingSheet
          branch={branch}
          availability={table}
          slotUtc={slotUtc}
          partySize={selection.partySize}
          onClose={onClose}
          onTableTaken={onTableTaken}
        />,
      ),
    );

    await user.click(await screen.findByRole('button', { name: /^Reserve table/u }));
    await user.type(await screen.findByLabelText('Phone number'), '77123456');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.type(await screen.findByLabelText('Enter the code'), '123456');
    await user.type(await screen.findByLabelText('Name for the booking'), 'Ani');
    await user.click(await screen.findByRole('button', { name: 'Confirm booking' }));

    // The panel hands the visitor back to the room, naming the table, because
    // the next thing to do is pick another one and that happens in the room.
    await waitFor(() => expect(onTableTaken).toHaveBeenCalledWith(table.tableLabel));
    expect(onClose).toHaveBeenCalled();

    // The room the page is drawing was told to refetch — not a floor key no
    // surface reads — and the refetch finds the table gone.
    expect(harness.queryClient.getQueryState(roomKey)?.isInvalidated).toBe(true);
    const refreshed = await harness.gateway.getSlotFloor(lookup);
    expect(refreshed?.tables.find((entry) => entry.tableId === table.tableId)?.isBookable).toBe(
      false,
    );

    // Nothing was booked, and nothing was retried.
    expect((await harness.gateway.listBookings()).upcoming).toHaveLength(0);
  });

  it('shows the taken-table message above the room', async () => {
    const { harness, branch, selection, slotUtc, table } = await setUp();

    render(
      harness.wrap(
        <RoomSection
          branch={branch}
          selection={selection}
          slotUtc={slotUtc}
          selectedTableId={null}
          onTableTap={() => {}}
          takenTableLabel={table.tableLabel}
        />,
      ),
    );

    expect(
      await screen.findByText(
        `Table ${table.tableLabel} was just taken. Here is what is free now.`,
      ),
    ).toBeDefined();
  });
});

/**
 * Verifying through the Telegram bot instead of an SMS code.
 *
 * The page opens the bot in a new tab, waits, and lands on the same confirm
 * step a passed code lands on. The window is opened synchronously in the
 * click, before the start request resolves, because a popup opened from a
 * resolved promise is what browsers block.
 */
describe('verifying through Telegram', () => {
  function fakePopup() {
    return { location: { href: '' }, close: vi.fn(), closed: false };
  }

  async function reachPhoneStep(harness: Awaited<ReturnType<typeof setUp>>) {
    const { branch, slotUtc, selection, table } = harness;
    render(
      harness.harness.wrap(
        <BookingSheet
          branch={branch}
          availability={table}
          slotUtc={slotUtc}
          partySize={selection.partySize}
          onClose={() => {}}
          onTableTaken={() => {}}
        />,
      ),
    );
    return screen.findByRole('button', { name: /^Reserve table/u });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reaches a confirmed reservation once the bot confirms', async () => {
    const world = await setUp();
    const popup = fakePopup();
    const open = vi.fn(() => popup);
    vi.stubGlobal('open', open);
    const user = userEvent.setup();

    await user.click(await reachPhoneStep(world));
    await user.click(await screen.findByRole('button', { name: 'Verify with Telegram' }));

    // Opened in the click, blank, then pointed at the bot once the server answered.
    expect(open).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Waiting for Telegram…')).toBeDefined();
    const again = (await screen.findByRole('link', {
      name: 'Open Telegram again',
    })) as HTMLAnchorElement;
    expect(again.href).toMatch(/^https:\/\/t\.me\/yalla_mock_bot\?start=tg_/u);
    expect(again.target).toBe('_blank');
    expect(again.rel).toContain('noopener');
    await waitFor(() => expect(popup.location.href).toBe(again.href));

    // The bot confirms. The page is polling, so it finds out by itself.
    const challengeId = new URL(again.href).searchParams.get('start')!;
    world.harness.gateway.confirmTelegramVerification(challengeId, '+37477123456');

    const confirm = await screen.findByRole(
      'button',
      { name: 'Confirm booking' },
      { timeout: 4000 },
    );
    await user.type(screen.getByLabelText('Name for the booking'), 'Ani');
    await user.click(confirm);

    expect(await screen.findByText('Table booked')).toBeDefined();
    const { upcoming } = await world.harness.gateway.listBookings();
    expect(upcoming[0]?.status).toBe('confirmed');
  });

  it('says the link expired and starts a fresh challenge on Try again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const world = await setUp();
      vi.stubGlobal('open', () => null);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await user.click(await reachPhoneStep(world));
      await user.click(await screen.findByRole('button', { name: 'Verify with Telegram' }));
      const first = (await screen.findByRole('link', {
        name: 'Open Telegram again',
      })) as HTMLAnchorElement;

      // The challenge's own lifetime passes without the bot confirming.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(11 * 60_000);
      });
      expect(
        await screen.findByText('The Telegram link has expired. Start again to get a new one.'),
      ).toBeDefined();
      expect(screen.queryByText('Waiting for Telegram…')).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Try again' }));
      const second = (await screen.findByRole('link', {
        name: 'Open Telegram again',
      })) as HTMLAnchorElement;
      expect(second.href).not.toBe(first.href);
      expect(screen.getByText('Waiting for Telegram…')).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides the Telegram button once the backend says it has none', async () => {
    const world = await setUp();
    vi.stubGlobal('open', () => null);
    world.harness.gateway.startTelegramVerification = () =>
      Promise.reject(new TelegramUnavailableError({ url: 'mock://yalla' }));
    const user = userEvent.setup();

    await user.click(await reachPhoneStep(world));
    await user.click(await screen.findByRole('button', { name: 'Verify with Telegram' }));

    expect(
      await screen.findByText('Verifying through Telegram is not available right now.'),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Verify with Telegram' })).toBeNull();
    // The SMS code remains the way in.
    expect(screen.getByRole('button', { name: 'Send code' })).toBeDefined();
  });

  it('offers the code instead from the waiting screen', async () => {
    const world = await setUp();
    vi.stubGlobal('open', () => null);
    const user = userEvent.setup();

    await user.click(await reachPhoneStep(world));
    await user.click(await screen.findByRole('button', { name: 'Verify with Telegram' }));
    await screen.findByText('Waiting for Telegram…');

    await user.click(screen.getByRole('button', { name: 'Use the code instead' }));

    expect(await screen.findByLabelText('Phone number')).toBeDefined();
  });
});
