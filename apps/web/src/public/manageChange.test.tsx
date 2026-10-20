// @vitest-environment jsdom
import {
  BookingBusyError,
  BookingCommandInUseError,
  BookingLinkAccountUnavailableError,
  BookingNotChangeableError,
  BookingOverlapsOwnError,
  TableTakenError,
  TooManyRequestsError,
  type ManagedBooking,
} from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicApp } from './PublicApp';
import {
  bookAtLumen,
  createHarness,
  initTestI18n,
  stubIntersectionObserverAsNeverVisible,
  type Harness,
} from './testHarness';
import { branchClock } from './slots';

/**
 * Changing a booking from its manage link (public page phase 5, HANDOFF §5.1).
 *
 * The booking card again — day, time, party and the table — opened on the
 * booking as it stands, reading the room with the booking itself left out so
 * its own table reads free; one press sends the whole new slot to
 * `reschedulePublicBooking` under one command id per attempt; the page then
 * shows the status the answer carries, never a guess, and says every refusal
 * in words.
 */

beforeAll(async () => {
  await initTestI18n();
});

beforeEach(() => {
  stubIntersectionObserverAsNeverVisible();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const URL_TAG = 'mock://test';

async function openChange(harness: Harness) {
  const { booking, branch } = await bookAtLumen(harness);
  const user = userEvent.setup();
  render(harness.wrap(<PublicApp />, `/booking/${booking.manageToken}?lang=en`));
  await user.click(await screen.findByRole('button', { name: 'Change time or guests' }));
  const card = await screen.findByRole('region', { name: 'Change time or guests' });
  return { booking, branch, user, card };
}

/** Wait until the card can save — the room has answered for the slot. */
async function fewerGuests(user: ReturnType<typeof userEvent.setup>, card: HTMLElement) {
  await user.click(within(card).getByRole('button', { name: 'Fewer guests' }));
  const save = within(card).getByRole('button', { name: 'Save the change' });
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  return save;
}

function rescheduleSpy(harness: Harness) {
  return vi.spyOn(harness.publicGateway, 'rescheduleManagedBooking');
}

describe('opening the change', () => {
  it('starts on the booking as it stands: its day, its time, its party and its table', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const { booking, branch, card } = await openChange(harness);

    const time = branchClock(new Date(booking.slotUtc), branch.timeZoneId);
    await waitFor(() =>
      expect(
        within(card)
          .getAllByRole('button', { pressed: true })
          .map((button) => button.getAttribute('aria-label') ?? button.textContent),
      ).toContainEqual(expect.stringMatching(new RegExp(`^${time}`, 'u'))),
    );
    expect(within(card).getByText('2 guests')).toBeTruthy();
    expect(within(card).getByText(new RegExp(`^Table ${booking.tableLabel}`, 'u'))).toBeTruthy();
    // Nothing changed yet, so nothing to save.
    const save = within(card).getByRole('button', { name: 'Save the change' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    // The venue's say, said before anything is sent — never predicted.
    expect(within(card).getByText(/The venue may need to confirm the change/u)).toBeTruthy();
  });

  it('reads the day and the room with this booking left out, so its own table reads free', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const days = vi.spyOn(harness.gateway, 'getDaySlots');
    const rooms = vi.spyOn(harness.gateway, 'getSlotFloor');
    const { booking } = await openChange(harness);

    await waitFor(() => expect(days).toHaveBeenCalled());
    await waitFor(() => expect(rooms).toHaveBeenCalled());
    for (const call of days.mock.calls) {
      expect(call[0].excludeBookingId).toBe(booking.id);
    }
    for (const call of rooms.mock.calls) {
      expect(call[0].excludeBookingId).toBe(booking.id);
    }
  });

  it('closes again on "Keep it as it is", sending nothing', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const spy = rescheduleSpy(harness);
    const { user, card } = await openChange(harness);
    await user.click(within(card).getByRole('button', { name: 'Keep it as it is' }));
    expect(screen.queryByRole('region', { name: 'Change time or guests' })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('saving the change', () => {
  it('sends the whole new slot with the booking’s table, and shows the status the answer carries', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const spy = rescheduleSpy(harness);
    const { booking, user, card } = await openChange(harness);

    await user.click(await fewerGuests(user, card));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]![0]).toMatchObject({
      token: booking.manageToken,
      tableId: booking.tableId,
      partySize: 1,
      slotUtc: booking.slotUtc,
      timeZoneId: 'Asia/Yerevan',
    });
    expect(spy.mock.calls[0]![0].commandId).toMatch(/^[0-9a-f-]{36}$/u);

    // A confirmed booking keeping its table and start with a smaller party
    // stays confirmed (the mock decides as the server does): said as such.
    const moved = (await spy.mock.results[0]!.value) as ManagedBooking;
    expect(moved.status).toBe('confirmed');
    expect(await screen.findByText('Changed. Your booking is confirmed.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Change time or guests' })).toBeNull();
    expect(screen.getByText('1 guest')).toBeTruthy();
  });

  it('says it waits for the venue when the answer is back to waiting, in blue', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const { booking } = await bookAtLumen(harness);
    const move = harness.publicGateway.rescheduleManagedBooking.bind(harness.publicGateway);
    rescheduleSpy(harness).mockImplementation(async (command) => ({
      ...(await move(command)),
      status: 'pendingApproval',
      approvalExpiresAtUtc: new Date(Date.now() + 15 * 60_000).toISOString(),
    }));
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${booking.manageToken}`));
    await user.click(await screen.findByRole('button', { name: 'Change time or guests' }));
    const card = await screen.findByRole('region', { name: 'Change time or guests' });
    await user.click(await fewerGuests(user, card));

    expect(
      await screen.findByText(
        'Changed. The venue needs to confirm the new time — this page will show the answer.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Waiting for confirmation')).toBeTruthy();
  });

  it('retries a busy table with the same command id, and mints a new one when the id is spent', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const spy = rescheduleSpy(harness)
      .mockRejectedValueOnce(new BookingBusyError({ url: URL_TAG }))
      .mockRejectedValueOnce(new BookingCommandInUseError({ url: URL_TAG }));
    const { user, card } = await openChange(harness);

    const save = await fewerGuests(user, card);
    await user.click(save);
    expect(
      await within(card).findByText(
        'Someone is booking that table this second. Press “Save the change” again.',
      ),
    ).toBeTruthy();
    await user.click(save);
    expect(
      await within(card).findByText('That try could not be used. Press “Save the change” again.'),
    ).toBeTruthy();
    await user.click(save);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(3));
    const ids = spy.mock.calls.map((call) => call[0].commandId);
    // A retry of one attempt is the same command; a spent id is replaced.
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[1]);
    await screen.findByText(/^Changed\./u);
  });

  it('a new choice is a new attempt, with a new id', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const spy = rescheduleSpy(harness).mockRejectedValueOnce(
      new BookingBusyError({ url: URL_TAG }),
    );
    const { user, card } = await openChange(harness);

    await user.click(await fewerGuests(user, card));
    await within(card).findByText(/Press “Save the change” again/u);
    // Back to two, then to one again: the choice moved, so it is another attempt.
    await user.click(within(card).getByRole('button', { name: 'More guests' }));
    const save = await fewerGuests(user, card);
    await user.click(save);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1]![0].commandId).not.toBe(spy.mock.calls[0]![0].commandId);
  });
});

describe('a change the server refuses', () => {
  async function refused(error: Error, harness = createHarness({ floorApprovesAtOnce: true })) {
    rescheduleSpy(harness).mockRejectedValue(error);
    const opened = await openChange(harness);
    await opened.user.click(await fewerGuests(opened.user, opened.card));
    return { harness, ...opened };
  }

  it("says the account behind the link can no longer change it, with the venue's number", async () => {
    await refused(new BookingLinkAccountUnavailableError({ url: URL_TAG }));

    expect(
      await screen.findByText(
        'This booking can no longer be changed online. Call the venue, or cancel it and book again.',
      ),
    ).toBeTruthy();
    // Changing is over for this link; calling and cancelling are not.
    expect(screen.queryByRole('region', { name: 'Change time or guests' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change time or guests' })).toBeNull();
    expect(screen.getByRole('link', { name: /^Call the venue · / })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel this booking' })).toBeTruthy();
  });

  it('says another booking is in the way without naming it', async () => {
    const { card } = await refused(
      new BookingOverlapsOwnError({
        url: URL_TAG,
        existingReservationId: null,
        localStartTime: null,
        tableLabel: null,
      }),
    );
    expect(
      await within(card).findByText(
        'You already have a booking at this venue around then. Choose another time.',
      ),
    ).toBeTruthy();
  });

  it('asks for a minute when the link has been used too often, and does not retry by itself', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const spy = rescheduleSpy(harness);
    const { card } = await refused(new TooManyRequestsError({ url: URL_TAG }), harness);
    expect(
      await within(card).findByText(
        'Too many tries with this link just now. Wait a minute, then try again.',
      ),
    ).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('says the table was just taken, in red, and lets it go', async () => {
    const { card, booking } = await refused(
      new TableTakenError({ url: URL_TAG, tableId: 'x', tableLabel: '7', floor: null }),
    );
    const notice = await within(card).findByText(/^Table 7 was just taken/u);
    expect(notice.className).toContain('pub-notice-error');
    expect(within(card).queryByText(new RegExp(`^Table ${booking.tableLabel} ·`, 'u'))).toBeNull();
  });

  it('reads the link again when the booking can no longer move, and says so', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const reads = vi.spyOn(harness.publicGateway, 'getManagedBooking');
    await refused(new BookingNotChangeableError({ url: URL_TAG }), harness);
    expect(await screen.findByText('This booking can no longer be changed.')).toBeTruthy();
    await waitFor(() => expect(reads.mock.calls.length).toBeGreaterThan(1));
  });
});
