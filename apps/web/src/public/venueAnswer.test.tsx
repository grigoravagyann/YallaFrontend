// @vitest-environment jsdom
import type { Booking, PublicBranch, TableAvailability } from '@yalla/api';
import { queryKeys } from '@yalla/api/react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingDone } from './BookingDone';
import { PublicApp } from './PublicApp';
import { defaultSelection, slotInstant } from './slots';
import { createHarness, initTestI18n, type Harness, type HarnessOptions } from './testHarness';

/**
 * A booking for tonight, made from the public page, is a request: the venue's
 * floor has fifteen minutes to answer, and this page is the only place the
 * answer can reach a visitor with no app. So the confirmation counts the
 * minutes down and reads the booking again until it is answered, and the
 * manage link says the same — or, once declined, why, with an apology when
 * nobody answered in time.
 *
 * The bookings here are two hours out, which is short notice by the server's
 * rule. The mock plays the floor: it approves the first request when told to,
 * and otherwise lets the window run out.
 *
 * On a pinned afternoon in Yerevan, still ticking: "two hours out" late in the
 * evening is a closed slot, and the page's default moves to tomorrow morning —
 * not short notice, so confirmed at once, and every test here failed after
 * about 22:00.
 */

/** Tuesday 20 October 2026, 14:00 in Yerevan. */
const AFTERNOON = new Date('2026-10-20T10:00:00Z');

beforeAll(async () => {
  await initTestI18n();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(AFTERNOON);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function bookTonight(
  options: HarnessOptions,
): Promise<{ harness: Harness; branch: PublicBranch; booking: Booking }> {
  const harness = createHarness(options);
  const branch = (await harness.publicGateway.resolveBranch({
    venueSlug: 'lumen-coffee',
    branchSlug: 'northern-avenue',
  })) as PublicBranch;
  const selection = {
    ...defaultSelection(branch.timeZoneId, new Date(Date.now() + 2 * 60 * 60_000), {
      minLeadMinutes: branch.policy.minLeadMinutes,
      turnTimeMinutes: branch.policy.turnTimeMinutes,
      weeklyHours: branch.weeklyHours,
    }),
    partySize: 2,
  };
  const slotUtc = slotInstant(selection, branch.timeZoneId)!.toISOString();
  const table = (
    await harness.gateway.getTableAvailability({
      branchId: branch.id,
      slotUtc,
      partySize: 2,
      timeZoneId: branch.timeZoneId,
    })
  ).find((entry) => entry.isBookable) as TableAvailability;
  const booking = await harness.gateway.createBooking({
    commandId: '1d5d2f4e-6a4b-4f43-9d6e-2b1d61c4f0a7',
    branchId: branch.id,
    tableId: table.tableId,
    slotUtc,
    timeZoneId: branch.timeZoneId,
    partySize: 2,
    guestName: 'Ani',
    guestPhone: '+37477123456',
    channel: 'web',
  });
  return { harness, branch, booking };
}

/** The poll's next read, now rather than in ten seconds. */
async function readAgain(harness: Harness, token: string): Promise<void> {
  await act(async () => {
    await harness.queryClient.invalidateQueries({ queryKey: queryKeys.managedBooking(token) });
  });
}

/** Lets `ms` pass on the pinned clock, then lets anything waiting on it run. */
async function elapse(ms: number): Promise<void> {
  vi.setSystemTime(Date.now() + ms);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('the confirmation of a booking for tonight', () => {
  it('says it is a request, why, and how long the venue has to answer', async () => {
    const { harness, branch, booking } = await bookTonight({});
    expect(booking.status).toBe('pendingApproval');

    render(harness.wrap(<BookingDone booking={booking} branch={branch} />));

    expect(await screen.findByRole('heading', { level: 3, name: 'Request sent' })).toBeTruthy();
    expect(screen.getByText(/checks the table is free before confirming/u)).toBeTruthy();
    const timer = screen.getByRole('timer');
    expect(timer.textContent).toMatch(/^Waiting for the venue · answer within 1[45]:\d\d$/u);
  });

  it('turns into a booking once the venue approves it', async () => {
    const { harness, branch, booking } = await bookTonight({ simulateVenueApprovalAfterMs: 1 });
    render(harness.wrap(<BookingDone booking={booking} branch={branch} />));
    await screen.findByRole('heading', { level: 3, name: 'Request sent' });

    await elapse(5);
    await readAgain(harness, booking.manageToken!);

    expect(await screen.findByRole('heading', { name: 'Table booked' })).toBeTruthy();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add to my calendar' })).toBeTruthy();
  });

  it('apologises when nobody answered in time, and offers nothing to remember', async () => {
    const { harness, branch, booking } = await bookTonight({ approvalWindowMs: 5 });
    render(harness.wrap(<BookingDone booking={booking} branch={branch} />));

    await elapse(10);
    await readAgain(harness, booking.manageToken!);

    expect(
      await screen.findByRole('heading', { name: 'Sorry, not confirmed in time' }),
    ).toBeTruthy();
    expect(screen.getByText(/could not confirm in time\. Try another time/u)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add to my calendar' })).toBeNull();
    expect(screen.queryByText(/\/booking\//u)).toBeNull();
  });
});

describe('the manage link on the confirmation', () => {
  it('keeps the language the visitor chose, so the saved link opens in it', async () => {
    const { harness, branch, booking } = await bookTonight({});
    render(
      harness.wrap(
        <BookingDone booking={booking} branch={branch} />,
        '/lumen-coffee/northern-avenue?lang=ru',
      ),
    );

    // Waiting for the venue: the booking page is the sheet's link (Book artboard).
    const link = await screen.findByRole('link', { name: 'Open the booking page' });
    expect(link.getAttribute('href')).toBe(
      `${window.location.origin}/booking/${booking.manageToken}?lang=ru`,
    );
  });

  it('keeps it on a booked table’s link too, the one shown with its copy button', async () => {
    const { harness, branch, booking } = await bookTonight({ floorApprovesAtOnce: true });
    expect(booking.status).toBe('confirmed');
    render(
      harness.wrap(
        <BookingDone booking={booking} branch={branch} />,
        '/lumen-coffee/northern-avenue?lang=ru',
      ),
    );

    const link = await screen.findByText(/\/booking\//u, { selector: 'a' });
    // The short form the reminders carry too: the page finds the branch from
    // the answer (public page phase 5).
    expect(link.getAttribute('href')).toBe(
      `${window.location.origin}/booking/${booking.manageToken}?lang=ru`,
    );
    expect(link.textContent).toBe(link.getAttribute('href'));
  });

  it('adds no language when the browser chose it', async () => {
    const { harness, branch, booking } = await bookTonight({});
    render(
      harness.wrap(
        <BookingDone booking={booking} branch={branch} />,
        '/lumen-coffee/northern-avenue',
      ),
    );

    const link = await screen.findByRole('link', { name: 'Open the booking page' });
    expect(link.getAttribute('href')).toBe(
      `${window.location.origin}/booking/${booking.manageToken}`,
    );
  });
});

describe('the manage link of a booking for tonight', () => {
  it('counts the answer down while the venue decides', async () => {
    const { harness, branch, booking } = await bookTonight({});
    render(
      harness.wrap(
        <PublicApp />,
        `/${branch.venue.slug}/${branch.slug}/booking/${booking.manageToken}`,
      ),
    );

    const timer = await screen.findByRole('timer');
    expect(timer.textContent).toMatch(/^Waiting for the venue · answer within /u);
    // Still the diner's to cancel while it waits.
    expect(screen.getByRole('button', { name: /cancel/iu })).toBeTruthy();
  });

  it('says why it was declined rather than that it was cancelled', async () => {
    const { harness, branch, booking } = await bookTonight({ approvalWindowMs: 5 });
    await elapse(10);
    render(
      harness.wrap(
        <PublicApp />,
        `/${branch.venue.slug}/${branch.slug}/booking/${booking.manageToken}`,
      ),
    );

    expect(
      await screen.findByRole('heading', { name: 'Sorry, not confirmed in time' }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText(/could not confirm in time\. Try another time/u)).toBeTruthy(),
    );
    expect(screen.queryByRole('heading', { name: /cancelled/iu })).toBeNull();
  });
});
