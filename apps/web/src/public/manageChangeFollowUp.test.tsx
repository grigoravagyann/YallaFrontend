// @vitest-environment jsdom
import {
  BookingsNotAcceptedError,
  ConcurrencyConflictError,
  FreeByRequiredError,
  NetworkError,
  NotFoundError,
  type ManagedBooking,
} from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicApp } from './PublicApp';
import { branchClock } from './slots';
import {
  bookAtLumen,
  createHarness,
  initTestI18n,
  stubIntersectionObserverAsNeverVisible,
  type Harness,
} from './testHarness';

/**
 * The change from the manage link, after review (PP5-FE-REVIEW S1–S4): what
 * the page says once the venue has answered a change, that it keeps reading a
 * waiting booking, that opening the change moves nothing by itself, and the
 * refusals that a fresh read of the link decides.
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

async function fewerGuests(user: ReturnType<typeof userEvent.setup>, card: HTMLElement) {
  await user.click(within(card).getByRole('button', { name: 'Fewer guests' }));
  const save = within(card).getByRole('button', { name: 'Save the change' });
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  return save;
}

function rescheduleSpy(harness: Harness) {
  return vi.spyOn(harness.publicGateway, 'rescheduleManagedBooking');
}

/** The real move, answered as waiting for the venue — with a clock or without one. */
function answeredWaiting(harness: Harness, clock: boolean) {
  const move = harness.publicGateway.rescheduleManagedBooking.bind(harness.publicGateway);
  return rescheduleSpy(harness).mockImplementation(async (command) => ({
    ...(await move(command)),
    status: 'pendingApproval',
    approvalExpiresAtUtc: clock ? new Date(Date.now() + 15 * 60_000).toISOString() : null,
  }));
}

function saveButton(card: HTMLElement) {
  return within(card).getByRole('button', { name: 'Save the change' }) as HTMLButtonElement;
}

describe('after a change that waits for the venue (S1, S2)', () => {
  it('says the venue could not take it when the booking comes back where it was', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    answeredWaiting(harness, true);
    const read = harness.publicGateway.getManagedBooking.bind(harness.publicGateway);
    const { booking, user, card } = await openChange(harness);
    const original = await read({ token: booking.manageToken! });

    await user.click(await fewerGuests(user, card));
    await screen.findByText(/^Changed\. The venue needs to confirm/u);

    // The floor said no: the server put the booking back where it was, confirmed.
    vi.spyOn(harness.publicGateway, 'getManagedBooking').mockResolvedValue(original);
    await harness.queryClient.refetchQueries({ queryKey: ['public', 'booking'] });

    expect(
      await screen.findByText(/^The venue could not take the change\. Your booking stays at /u),
    ).toBeTruthy();
    expect(screen.queryByText(/^Changed\./u)).toBeNull();
    expect(screen.getByText('Confirmed')).toBeTruthy();
    expect(screen.getByText('2 guests')).toBeTruthy();
  });

  it('says it is confirmed when the venue said yes to the change', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const spy = answeredWaiting(harness, true);
    const { user, card } = await openChange(harness);
    await user.click(await fewerGuests(user, card));
    await screen.findByText(/^Changed\. The venue needs to confirm/u);

    const moved = (await spy.mock.results[0]!.value) as ManagedBooking;
    vi.spyOn(harness.publicGateway, 'getManagedBooking').mockResolvedValue({
      ...moved,
      status: 'confirmed',
      approvalExpiresAtUtc: null,
    });
    await harness.queryClient.refetchQueries({ queryKey: ['public', 'booking'] });

    expect(await screen.findByText('Changed. Your booking is confirmed.')).toBeTruthy();
    expect(screen.queryByText(/^Changed\. The venue needs/u)).toBeNull();
  });

  it('keeps reading the link, slowly, while a change waits with no clock — and says so', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    answeredWaiting(harness, false);
    const { user, card } = await openChange(harness);
    await user.click(await fewerGuests(user, card));

    expect(await screen.findByText(/^Changed\. The venue needs to confirm/u)).toBeTruthy();
    // "This page will show the answer" is kept by a slow poll (MANAGE_LINK_SLOW_POLL_MS).
    expect(screen.getByText('This page updates by itself.')).toBeTruthy();
  });
});

describe('opening the change on a time the venue no longer offers (S3)', () => {
  it('stays on the booking as it stands, says so, and leaves Save off', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const { booking: made, branch } = await bookAtLumen(harness);
    const time = branchClock(new Date(made.slotUtc), branch.timeZoneId);
    const days = harness.gateway.getDaySlots.bind(harness.gateway);
    // The venue lengthened its sittings: the booked time is no longer offered.
    vi.spyOn(harness.gateway, 'getDaySlots').mockImplementation(async (input) => {
      const day = await days(input);
      return day && { ...day, slots: day.slots.filter((slot) => slot.time !== time) };
    });
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${made.manageToken}?lang=en`));
    await user.click(await screen.findByRole('button', { name: 'Change time or guests' }));
    const card = await screen.findByRole('region', { name: 'Change time or guests' });

    expect(
      await within(card).findByText(
        'Your current time is no longer offered. Pick another time to change the booking.',
      ),
    ).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 600));
    // Nothing moved by itself: no time is pressed, the party is the booking's.
    const pressedTimes = within(card)
      .getAllByRole('button', { pressed: true })
      .filter((button) =>
        /^\d\d:\d\d/u.test(button.getAttribute('aria-label') ?? button.textContent ?? ''),
      );
    expect(pressedTimes).toHaveLength(0);
    expect(within(card).getByText('2 guests')).toBeTruthy();
    expect(saveButton(card).disabled).toBe(true);
  });
});

describe('the refusals a fresh read decides (S4)', () => {
  const notFound = () =>
    new NotFoundError({
      url: URL_TAG,
      problem: {
        type: 'about:blank',
        title: 'Not found',
        status: 404,
        detail: 'No such table.',
        code: 'not-found',
        traceId: 't',
      },
    });

  it('a 404 while the link still answers: the table is gone — red, released, Save off', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    rescheduleSpy(harness).mockRejectedValue(notFound());
    const { user, card } = await openChange(harness);
    await user.click(await fewerGuests(user, card));

    const line = await within(card).findByText('That table is no longer available. Pick another.');
    expect(line.className).toContain('pub-notice-error');
    expect(within(card).getByText('No table chosen yet')).toBeTruthy();
    expect(saveButton(card).disabled).toBe(true);
  });

  it('a 404 when the link no longer answers: the page says the link no longer works', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const reads = vi.spyOn(harness.publicGateway, 'getManagedBooking');
    rescheduleSpy(harness).mockImplementation(async () => {
      reads.mockResolvedValue(null);
      throw notFound();
    });
    const { user, card } = await openChange(harness);
    await user.click(await fewerGuests(user, card));
    expect(await screen.findByText('This link no longer works')).toBeTruthy();
  });

  it('an answer window that closed: the link is read again, and the page says why', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const reads = vi.spyOn(harness.publicGateway, 'getManagedBooking');
    rescheduleSpy(harness).mockRejectedValue(
      new ConcurrencyConflictError({
        url: URL_TAG,
        problem: {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          detail: 'Closed.',
          code: 'reservation-approval-expired',
          traceId: 't',
        },
      }),
    );
    const { user, card } = await openChange(harness);
    const before = reads.mock.calls.length;
    await user.click(await fewerGuests(user, card));
    const line = await screen.findByText(/^Too late to change/u);
    expect(line.className).toContain('pub-notice-alert');
    await waitFor(() => expect(reads.mock.calls.length).toBeGreaterThan(before));
  });

  it('a booking that moved on meanwhile (concurrent update): read again, nothing claimed', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const reads = vi.spyOn(harness.publicGateway, 'getManagedBooking');
    rescheduleSpy(harness).mockRejectedValue(new ConcurrencyConflictError({ url: URL_TAG }));
    const { user, card } = await openChange(harness);
    const before = reads.mock.calls.length;
    await user.click(await fewerGuests(user, card));
    expect(
      await within(card).findByText('We could not save that. Your booking is unchanged.'),
    ).toBeTruthy();
    await waitFor(() => expect(reads.mock.calls.length).toBeGreaterThan(before));
  });

  it('a branch that stopped taking bookings online', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    rescheduleSpy(harness).mockRejectedValue(new BookingsNotAcceptedError({ url: URL_TAG }));
    const { user, card } = await openChange(harness);
    await user.click(await fewerGuests(user, card));
    expect(
      await within(card).findByText(
        'The venue is not taking bookings online right now. Your booking is unchanged.',
      ),
    ).toBeTruthy();
  });

  it("a booking now follows the table: the server's free-by time is asked, and Save waits for it", async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const spy = rescheduleSpy(harness).mockRejectedValueOnce(
      new FreeByRequiredError({
        url: URL_TAG,
        requiredFreeByUtc: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
        nextBookingStartUtc: null,
      }),
    );
    const { user, card } = await openChange(harness);
    const save = await fewerGuests(user, card);
    await user.click(save);

    const promise = await within(card).findByRole('checkbox', { name: /^I.ll free the table by / });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await user.click(promise);
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    await user.click(save);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1]![0].acceptsFreeByUtc).toBeTruthy();
    // The same attempt, now with the promise: the same command id.
    expect(spy.mock.calls[1]![0].commandId).toBe(spy.mock.calls[0]![0].commandId);
  });

  it('a lost answer: the link is read again, and pressing again is the same command', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const reads = vi.spyOn(harness.publicGateway, 'getManagedBooking');
    const spy = rescheduleSpy(harness).mockRejectedValueOnce(new NetworkError({ url: URL_TAG }));
    const { user, card } = await openChange(harness);
    const before = reads.mock.calls.length;
    const save = await fewerGuests(user, card);
    await user.click(save);
    expect(
      await within(card).findByText(/cannot tell yet whether your booking moved/u),
    ).toBeTruthy();
    await waitFor(() => expect(reads.mock.calls.length).toBeGreaterThan(before));
    await user.click(save);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1]![0].commandId).toBe(spy.mock.calls[0]![0].commandId);
  });
});
