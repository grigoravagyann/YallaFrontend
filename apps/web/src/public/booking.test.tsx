// @vitest-environment jsdom
import {
  availabilityWindowCopy,
  freeCancellationCopy,
  type Booking,
  type PublicBranch,
  type TableAvailability,
} from '@yalla/api';
import { queryKeys } from '@yalla/api/react';
import { i18next } from '@yalla/i18n';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  });

  const branch = (await harness.publicGateway.resolveBranch({
    venueSlug: VENUE,
    branchSlug: BRANCH,
  })) as PublicBranch;
  expect(branch).not.toBeNull();

  // Two hours out, so the branch's own lead time cannot refuse it.
  const selection = {
    ...defaultSelection(branch.timeZoneId, new Date(Date.now() + 2 * 60 * 60_000)),
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
    expect(screen.getByText(i18next.t(deadline.key, deadline.params))).toBeDefined();
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

describe('the calendar file the confirmation hands over', () => {
  it("writes the branch's local time, not the device's", async () => {
    const { harness, branch, slotUtc, selection, table } = await setUp();

    const booking = (await harness.gateway.createBooking({
      commandId: 'cmd-ics',
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
          onSelectionChange={() => {}}
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
