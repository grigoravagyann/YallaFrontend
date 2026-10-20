// @vitest-environment jsdom
import type { ManagedBooking } from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PublicApp } from './PublicApp';
import { RESERVED_FIRST_SEGMENTS, isPublicPath } from '../publicRoutes';
import { bookAtLumen, createHarness, initTestI18n, type Harness } from './testHarness';

/**
 * Public page phase 5: the manage page (Manage artboard) and the short link
 * the reminders carry.
 *
 * Every reminder links to `/booking/{token}` — no venue, no branch — and the
 * web used to route only `/{venue}/{branch}/booking/{token}`, so each one
 * landed on "not found". The page now opens on the token alone and learns the
 * branch from the answer.
 */

beforeAll(async () => {
  await initTestI18n();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function tokenOf(harness: Harness, options: { partySize?: number } = {}) {
  const { booking } = await bookAtLumen(harness, options);
  expect(booking.manageToken).toBeTruthy();
  return { token: booking.manageToken!, booking };
}

/** The real answer for the link, with something about it changed. */
function answerWith(harness: Harness, change: Partial<ManagedBooking>) {
  const read = harness.publicGateway.getManagedBooking.bind(harness.publicGateway);
  vi.spyOn(harness.publicGateway, 'getManagedBooking').mockImplementation(async (input) => {
    const booking = await read(input);
    return booking ? { ...booking, ...change } : booking;
  });
}

describe('the short manage link the reminders carry', () => {
  it('opens the booking from the token alone', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const { token, booking } = await tokenOf(harness);

    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    expect(await screen.findByRole('heading', { level: 1, name: 'Your booking' })).toBeTruthy();
    expect(screen.getByText(booking.code)).toBeTruthy();
    // Named from the answer: the address had no venue in it.
    expect(screen.getByText('Lumen Coffee · Northern Avenue')).toBeTruthy();
  });

  it("links to the branch the answer names, keeping the reader's language", async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const { token } = await tokenOf(harness);

    render(harness.wrap(<PublicApp />, `/booking/${token}?lang=en`));

    const link = await screen.findByRole('link', { name: 'See the venue' });
    expect(link.getAttribute('href')).toBe('/lumen-coffee/northern-avenue?lang=en');
  });

  it('says a dead short link is dead, with nowhere made up to send them', async () => {
    const harness = createHarness();
    render(harness.wrap(<PublicApp />, '/booking/mbk_nope'));

    expect(await screen.findByText('This link no longer works')).toBeTruthy();
    // No branch in the address and none in an answer: no venue link at all.
    expect(screen.queryByRole('link', { name: 'See the venue' })).toBeNull();
  });

  it('keeps the long link working', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const { token, booking } = await tokenOf(harness);
    render(harness.wrap(<PublicApp />, `/lumen-coffee/northern-avenue/booking/${token}`));
    expect(await screen.findByText(booking.code)).toBeTruthy();
  });

  it('stays a public path: `booking` is not a console word', () => {
    expect(isPublicPath('/booking/mbk_1')).toBe(true);
    expect(RESERVED_FIRST_SEGMENTS).not.toContain('booking');
  });
});

describe('the manage page, as the Manage artboard draws it', () => {
  it('a confirmed booking: green badge, the code to show at the door, every action', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const { token } = await tokenOf(harness);
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    const badge = await screen.findByText('Confirmed');
    expect(badge.closest('.pub-badge')?.className).toContain('is-ok');
    expect(screen.getByText('Show it at the door')).toBeTruthy();
    expect(document.querySelector('.pub-code')?.className).not.toContain('is-pending');

    expect(screen.getByRole('button', { name: 'Calendar' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Map' }).getAttribute('href')).toMatch(
      /^https:\/\/maps\.google\.com\/\?q=/u,
    );
    expect(await screen.findByRole('button', { name: 'Change time or guests' })).toBeTruthy();
    const call = await screen.findByRole('link', { name: /^Call the venue · / });
    expect(call.getAttribute('href')).toBe('tel:+37410500501');
    expect(screen.getByRole('button', { name: 'Cancel this booking' })).toBeTruthy();
    // Free cancellation, and that cancelling later is still allowed.
    expect(screen.getByText(/^Free cancellation until /u)).toBeTruthy();
  });

  it('a request still waiting: blue, never green — badge, dashed code and the countdown', async () => {
    const harness = createHarness();
    const { token } = await tokenOf(harness);
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    expect(await screen.findByRole('heading', { level: 1, name: 'Your request' })).toBeTruthy();
    const badge = screen.getByText('Waiting for confirmation');
    expect(badge.closest('.pub-badge')?.className).toContain('is-pending');
    expect(document.querySelector('.pub-code')?.className).toContain('is-pending');
    expect((await screen.findByRole('timer')).textContent).toMatch(/^Waiting for the venue/u);
    expect(screen.getByText(/This page updates by itself/u)).toBeTruthy();
  });

  it('asks before cancelling, inline, and keeps the booking on "no"', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const { token } = await tokenOf(harness);
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    await user.click(await screen.findByRole('button', { name: 'Cancel this booking' }));
    const confirm = screen.getByRole('region', { name: 'Cancel the booking?' });
    // The other actions step aside while it asks.
    expect(screen.queryByRole('button', { name: 'Change time or guests' })).toBeNull();
    await user.click(within(confirm).getByRole('button', { name: 'No, keep the booking' }));
    expect(screen.queryByRole('region', { name: 'Cancel the booking?' })).toBeNull();
    expect(screen.getByText('Confirmed')).toBeTruthy();
  });

  it('cancels on "yes", then says so with the summary struck and a way to book again', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const { token } = await tokenOf(harness);
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${token}?lang=en`));

    await user.click(await screen.findByRole('button', { name: 'Cancel this booking' }));
    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Booking cancelled' }),
    ).toBeTruthy();
    expect(screen.getByText('Cancelled').closest('.pub-badge')?.className).toContain('is-off');
    expect(document.querySelector('.pub-summary')?.className).toContain('is-dim');
    expect(screen.queryByText('Show it at the door')).toBeNull();
    expect(screen.getByRole('link', { name: 'Book again' }).getAttribute('href')).toBe(
      '/lumen-coffee/northern-avenue?lang=en',
    );
    expect(screen.queryByRole('button', { name: 'Change time or guests' })).toBeNull();
  });

  it('a declined request: red badge, why, and a way to book again', async () => {
    const harness = createHarness({ approvalWindowMs: 5 });
    const { token } = await tokenOf(harness);
    await new Promise((resolve) => setTimeout(resolve, 15));
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sorry, not confirmed in time' }),
    ).toBeTruthy();
    expect(screen.getByText('Declined').closest('.pub-badge')?.className).toContain('is-red');
    expect(screen.getByRole('link', { name: 'Book again' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /cancel/iu })).toBeNull();
  });

  it('a past visit: thanks, no code, no actions, a way to book again', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const { token } = await tokenOf(harness);
    answerWith(harness, { status: 'completed', canCancel: false });
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    expect(await screen.findByRole('heading', { level: 1, name: 'Your visit' })).toBeTruthy();
    expect(screen.getByText('Past').closest('.pub-badge')?.className).toContain('is-off');
    expect(screen.getByText(/Thank you for choosing Lumen Coffee/u)).toBeTruthy();
    expect(screen.queryByText('Show it at the door')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Calendar' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Book again' })).toBeTruthy();
  });

  it('offers no change once the booking has started', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const { token } = await tokenOf(harness);
    answerWith(harness, { slotUtc: new Date(Date.now() - 10 * 60_000).toISOString() });
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    await screen.findByText('Confirmed');
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /^Call the venue · / })).toBeTruthy(),
    );
    expect(screen.queryByRole('button', { name: 'Change time or guests' })).toBeNull();
  });
});
