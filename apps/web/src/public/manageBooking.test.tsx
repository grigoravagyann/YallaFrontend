// @vitest-environment jsdom
import type { PublicBranch, TableAvailability } from '@yalla/api';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PublicApp } from './PublicApp';
import { defaultSelection, slotInstant } from './slots';
import { createHarness, initTestI18n, type Harness } from './testHarness';

/**
 * Cancelling a booking with no account, from a link in a chat.
 *
 * The most important page in the route group and the one easiest to leave for
 * later. A booking made from the web reaches no push channel — no reminder, no
 * "still coming?", no one-tap cancel — so this link is the *only* way out that
 * is easier than simply not turning up. Ship the page without it and the venue
 * that printed it on a card is worse off than before it did.
 *
 * Everything here runs with no session: the harness mounts the page cold,
 * nothing writes a token anywhere, and the token in the URL is the whole
 * credential.
 */

beforeAll(async () => {
  await initTestI18n();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * Make a real booking in the harness's world, then hand back its own link.
 *
 * Through the gateway rather than by fabricating a `ManagedBooking`, because
 * what is under test is that the token the confirmation screen hands out opens
 * the booking the confirmation screen made. A fixture would only prove that a
 * fixture renders.
 */
async function bookedLink(
  harness: Harness,
): Promise<{ url: string; code: string; tableLabel: string; roomName: string | null }> {
  const branch = (await harness.publicGateway.resolveBranch({
    venueSlug: 'lumen-coffee',
    branchSlug: 'northern-avenue',
  })) as PublicBranch;

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
  const table = (
    await harness.gateway.getTableAvailability({
      branchId: branch.id,
      slotUtc,
      partySize: selection.partySize,
      timeZoneId: branch.timeZoneId,
    })
  ).find((entry) => entry.isBookable) as TableAvailability;

  const booking = await harness.gateway.createBooking({
    commandId: '6b820184-0c7b-44e7-87fa-726a8cb29b9b',
    branchId: branch.id,
    tableId: table.tableId,
    slotUtc,
    timeZoneId: branch.timeZoneId,
    partySize: selection.partySize,
    guestName: 'Ani',
    guestPhone: '+37477123456',
    channel: 'web',
  });

  expect(booking.manageToken, 'a web booking must be issued a manage token').toBeTruthy();
  return {
    url: `/${branch.venue.slug}/${branch.slug}/booking/${booking.manageToken}`,
    code: booking.code,
    tableLabel: booking.tableLabel,
    roomName: booking.roomName,
  };
}

describe('the manage-booking link', () => {
  it('opens the booking without an authenticated session', async () => {
    // Confirmed as it is made, so the page reads "Your booking" (a request
    // still waiting reads "Your request": manageLink.test.tsx).
    const harness = createHarness({ floorApprovesAtOnce: true });
    const { url, code } = await bookedLink(harness);

    render(harness.wrap(<PublicApp />, url));

    expect(await screen.findByText('Your booking')).toBeDefined();
    // The code staff ask for at the door, which is the one thing on the page
    // somebody might be reading it for.
    expect(screen.getByText(code)).toBeDefined();
    expect(screen.getByText('Lumen Coffee · Northern Avenue')).toBeDefined();
  });

  it('cancels, and says so, from that link alone', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const { url, code } = await bookedLink(harness);
    const user = userEvent.setup();

    render(harness.wrap(<PublicApp />, url));
    await screen.findByText('Your booking');

    await user.click(screen.getByRole('button', { name: 'Cancel this booking' }));

    // Asked once, with the consequence spelled out — and never refused for
    // lateness, which is a sentence rather than a disabled button.
    expect(screen.getByText('Cancel the booking?')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Booking cancelled' }),
    ).toBeDefined();
    expect(screen.getByText(/table has gone back to the venue/u)).toBeDefined();

    // Cancelled in the world, not only on screen — the table really did go
    // back to the venue.
    const { upcoming, past } = await harness.gateway.listBookings();
    expect([...upcoming, ...past].find((booking) => booking.code === code)?.status).toBe(
      'cancelledByDiner',
    );
  });

  it('says one thing for every kind of dead token', async () => {
    /*
     * Unknown, expired, malformed and revoked all answer the same. Telling them
     * apart would turn the endpoint into an oracle for finding valid tokens,
     * and none of the four is actionable by the person holding the link — the
     * useful sentence is identical in all of them.
     */
    for (const token of ['mbk_nope', 'not-a-token', 'mbk_']) {
      const harness = createHarness();
      render(harness.wrap(<PublicApp />, `/lumen-coffee/northern-avenue/booking/${token}`));

      expect(await screen.findByText('This link no longer works')).toBeDefined();
      // With the one useful next step attached.
      expect(screen.getByRole('link', { name: 'See the venue' })).toBeDefined();
      cleanup();
    }
  });
});

/**
 * Bookings made without a verified number — the few hours of 2026-10-20 when
 * the page took them. No new ones are made (guest record), but the link still
 * reads those rows as the server sends them: the badge, no Change and why, and
 * cancelling as for any booking.
 */
describe('the manage link of a legacy booking without a verified number', () => {
  it('says the number is not verified, offers no change and says why, and still cancels', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const { url } = await bookedLink(harness);
    const read = harness.publicGateway.getManagedBooking.bind(harness.publicGateway);
    vi.spyOn(harness.publicGateway, 'getManagedBooking').mockImplementation(async (query) => {
      const booking = await read(query);
      return booking && { ...booking, phoneUnverified: true, canChange: false };
    });

    render(harness.wrap(<PublicApp />, url));

    expect(await screen.findByText('Number not verified')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Change time or guests' })).toBeNull();
    expect(
      screen.getByText(
        'A booking made without a verified phone number cannot be changed online. Cancel it and book again, or call the venue.',
      ),
    ).toBeDefined();
    expect(
      screen.getByText('No reminders are sent for this booking. Keep this link.'),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cancel this booking' })).toBeDefined();
  });

  it('shows no badge on a booking made with a verified number', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const { url } = await bookedLink(harness);

    render(harness.wrap(<PublicApp />, url));

    expect(await screen.findByText('Your booking')).toBeDefined();
    expect(screen.queryByText('Number not verified')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Change time or guests' })).toBeDefined();
  });
});

/**
 * Every page in this route group left the shell's `<title>Yalla</title>` in
 * place, so a tab bar full of them was a row of identical labels — and the
 * table row read as "Table" with a bare digit beside it.
 */
describe('the manage page in the browser chrome', () => {
  it('titles the tab after the booking and names the table in full, with its room', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const { url, tableLabel, roomName } = await bookedLink(harness);
    // Every Lumen table sits in a room, so the page has one to name.
    expect(roomName).toBeTruthy();

    render(harness.wrap(<PublicApp />, url));
    await screen.findByText('Your booking');

    await waitFor(() => expect(document.title).toBe('Your booking · Yalla'));
    expect(screen.getByText(`Table ${tableLabel} · ${roomName}`)).toBeTruthy();
  });

  it('retitles the tab once the booking is cancelled', async () => {
    const harness = createHarness();
    const { url } = await bookedLink(harness);
    const user = userEvent.setup();

    render(harness.wrap(<PublicApp />, url));
    await user.click(await screen.findByRole('button', { name: 'Cancel this booking' }));
    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }));

    await waitFor(() => expect(document.title).toBe('Booking cancelled · Yalla'));
  });

  it('titles a dead link as one', async () => {
    const harness = createHarness();
    render(harness.wrap(<PublicApp />, '/lumen-coffee/northern-avenue/booking/mbk_nope'));

    await screen.findByText('This link no longer works');
    await waitFor(() => expect(document.title).toBe('This link no longer works · Yalla'));
  });
});
