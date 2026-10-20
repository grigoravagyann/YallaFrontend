// @vitest-environment jsdom
import type { ManagedBooking } from '@yalla/api';
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

/**
 * The phase 5 review's nits that change behaviour (PP5-FE-REVIEW N1, N5, N6,
 * N8, N9): the manage link kept out of search engines, a booking the venue
 * cancelled not thanked, the cancel confirm described and never stranded, the
 * star bars only when the counts add up, and the chooser's one-line subtitle.
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

const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content');

async function tokenOf(harness: Harness) {
  const { booking } = await bookAtLumen(harness);
  return booking.manageToken!;
}

function answerWith(harness: Harness, change: Partial<ManagedBooking>) {
  const read = harness.publicGateway.getManagedBooking.bind(harness.publicGateway);
  return vi.spyOn(harness.publicGateway, 'getManagedBooking').mockImplementation(async (input) => {
    const booking = await read(input);
    return booking ? { ...booking, ...change } : booking;
  });
}

describe('the manage link and search engines (N1)', () => {
  it('asks not to be indexed, on the short and the long form, and lets go on leaving', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const token = await tokenOf(harness);
    const view = render(harness.wrap(<PublicApp />, `/booking/${token}`));
    await screen.findByText('Confirmed');
    expect(robots()).toBe('noindex, nofollow');
    view.unmount();
    expect(robots()).toBeUndefined();

    render(harness.wrap(<PublicApp />, `/lumen-coffee/northern-avenue/booking/${token}`));
    await screen.findByText('Confirmed');
    expect(robots()).toBe('noindex, nofollow');
  });

  it('asks the same of a dead link', async () => {
    render(createHarness().wrap(<PublicApp />, '/booking/mbk_nope'));
    await screen.findByText('This link no longer works');
    expect(robots()).toBe('noindex, nofollow');
  });
});

describe('a booking the venue cancelled (N5)', () => {
  it('is not thanked for telling the venue', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const token = await tokenOf(harness);
    answerWith(harness, { status: 'cancelled', cancelledByVenue: true, canCancel: false });
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Booking cancelled' }),
    ).toBeTruthy();
    expect(
      screen.getByText('The venue cancelled this booking. Call them if you have a question.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Thank you for telling them/u)).toBeNull();
  });
});

describe('the cancel confirm (N9)', () => {
  it('is described by its sentence', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const token = await tokenOf(harness);
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${token}`));
    await user.click(await screen.findByRole('button', { name: 'Cancel this booking' }));
    const confirm = screen.getByRole('region', { name: 'Cancel the booking?' });
    const described = confirm.getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    expect(document.getElementById(described!)?.textContent).toMatch(/free to cancel/u);
  });

  it('gives the actions back if the booking can no longer be cancelled while it asks', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const token = await tokenOf(harness);
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${token}`));
    await user.click(await screen.findByRole('button', { name: 'Cancel this booking' }));
    expect(screen.getByRole('region', { name: 'Cancel the booking?' })).toBeTruthy();

    // Seated meanwhile: still live, no longer cancellable.
    answerWith(harness, { canCancel: false });
    await harness.queryClient.refetchQueries({ queryKey: ['public', 'booking'] });

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Cancel the booking?' })).toBeNull(),
    );
    expect(screen.getByRole('link', { name: 'Map' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel this booking' })).toBeNull();
  });
});

describe('the star bars (N6)', () => {
  it('are not drawn when the counts do not add up to the reviews', async () => {
    const harness = createHarness({ showcase: true });
    const detail = harness.gateway.getBranchDetail.bind(harness.gateway);
    vi.spyOn(harness.gateway, 'getBranchDetail').mockImplementation(async (...args) => {
      const answer = await detail(...args);
      // An older server: five zeros against two dozen reviews.
      return answer ? { ...answer, ratingCounts: [0, 0, 0, 0, 0] } : answer;
    });
    render(harness.wrap(<PublicApp />, '/lumen-coffee/northern-avenue'));
    const region = await screen.findByRole('region', { name: 'Reviews' });
    await within(region).findAllByRole('article');
    expect(within(region).getByText('24 reviews')).toBeTruthy();
    expect(within(region).queryByRole('img', { name: /How guests rated it/u })).toBeNull();
  });
});

describe('the chooser subtitle (N8)', () => {
  it("is the venue's type, never its description paragraph", async () => {
    render(createHarness().wrap(<PublicApp />, '/dolmama'));
    await screen.findByRole('heading', { level: 1, name: 'Dolmama' });
    await screen.findByText('Pushkin Street');
    expect(screen.queryByText(/Armenian home cooking, since 1998/u)).toBeNull();
    expect(screen.getByText(/^Restaurant/u)).toBeTruthy();
  });
});
