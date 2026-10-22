// @vitest-environment jsdom
import type { PublicBranch, TableAvailability } from '@yalla/api';
import { queryKeys } from '@yalla/api/react';
import { onlineManager } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicApp } from './PublicApp';
import { NotAvailablePage } from './PageStates';
import { defaultSelection, slotInstant } from './slots';
import { createHarness, initTestI18n, stubIntersectionObserverAsNeverVisible } from './testHarness';

/**
 * The five ways the page can have nothing to show (States artboard), each wired
 * to the condition that really produces it, and each with its one next step:
 * offline and a server failure offer to try again, a suspended venue offers its
 * phone, a wrong link and the first load offer nothing to press.
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
  onlineManager.setOnline(true);
});

const OPEN_HOURS = () => new Date('2026-10-16T16:00:00Z');

function open(path: string, harness = createHarness({ now: OPEN_HOURS })) {
  const view = render(harness.wrap(<PublicApp />, path));
  return { ...harness, ...view };
}

describe('the first load', () => {
  it('is a skeleton that says it is loading, and nothing to press', async () => {
    const harness = createHarness({ now: OPEN_HOURS });
    vi.spyOn(harness.publicGateway, 'resolveBranch').mockReturnValue(new Promise(() => {}));
    open('/lumen-coffee/northern-avenue', harness);

    const status = await screen.findByRole('status');
    expect(status.textContent).toBe('Loading…');
    // Never inside a busy subtree: assistive technology may ignore what changes
    // under `aria-busy`, and this is the one line that has to be said.
    expect(status.closest('[aria-busy="true"]')).toBeNull();
    expect(within(status.closest('main')!).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('a link that resolves to nothing', () => {
  it('says the link is wrong, and offers nothing to retry', async () => {
    open('/no-such-venue/no-such-branch');

    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'We could not find that place',
    });
    const main = heading.closest('main')!;
    expect(within(main).getByText(/Check the link/u)).toBeDefined();
    expect(within(main).queryByRole('button')).toBeNull();
    expect(within(main).queryByRole('alert')).toBeNull();
  });
});

describe('a suspended branch', () => {
  it('names the venue and offers its phone when it has one', async () => {
    const harness = createHarness({ now: OPEN_HOURS });
    const real = harness.publicGateway.resolveBranch.bind(harness.publicGateway);
    vi.spyOn(harness.publicGateway, 'resolveBranch').mockImplementation(async (input) => {
      const branch = await real(input);
      return branch && { ...branch, phoneE164: '+37411223344' };
    });
    open('/dolmama/dalma-garden', harness);

    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'Not on SHURJ right now',
    });
    const main = heading.closest('main')!;
    expect(within(main).getByText('Dolmama')).toBeDefined();
    const call = within(main).getByRole('link', { name: 'Call · +374 11 22 33 44' });
    expect(call.getAttribute('href')).toBe('tel:+37411223344');
    expect(within(main).queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('offers no call when the venue has no phone', async () => {
    open('/dolmama/dalma-garden');
    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'Not on SHURJ right now',
    });
    expect(within(heading.closest('main')!).queryByRole('link')).toBeNull();
  });

  it('renders the call as a link straight from the component', () => {
    render(harness().wrap(<NotAvailablePage venueName="Cascade Cafe" phoneE164="+37477123456" />));
    expect(screen.getByRole('link', { name: 'Call · +374 77 12 34 56' })).toBeDefined();
  });
});

describe('no connection on the first load', () => {
  it('says so as an alert, with a retry, instead of a skeleton that never resolves', async () => {
    onlineManager.setOnline(false);
    open('/lumen-coffee/northern-avenue');

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('heading', { level: 1, name: 'No connection' })).toBeDefined();
    expect(
      within(alert).getByText(/The page will open as soon as the connection is back/u),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
  });

  it('opens the page by itself when the connection comes back', async () => {
    onlineManager.setOnline(false);
    open('/lumen-coffee/northern-avenue');
    await screen.findByRole('heading', { level: 1, name: 'No connection' });

    act(() => onlineManager.setOnline(true));
    expect(await screen.findByRole('heading', { level: 1, name: 'Lumen Coffee' })).toBeDefined();
  });
});

describe('a failure on our side', () => {
  it('says so as an alert and tries again on the button', async () => {
    const harness = createHarness({ now: OPEN_HOURS });
    const real = harness.publicGateway.resolveBranch.bind(harness.publicGateway);
    vi.spyOn(harness.publicGateway, 'resolveBranch')
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementation(real);
    open('/lumen-coffee/northern-avenue', harness);

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByRole('heading', { level: 1, name: 'Something went wrong on our side' }),
    ).toBeDefined();
    expect(within(alert).getByText(/Nothing you entered is lost/u)).toBeDefined();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Lumen Coffee' })).toBeDefined();
  });

  it('shows the page loading again the moment "Try again" is pressed', async () => {
    // The retry can take seconds of backoff on a bad line; an error page that
    // does not change under the tap reads as a dead button.
    const harness = createHarness({ now: OPEN_HOURS });
    vi.spyOn(harness.publicGateway, 'resolveBranch')
      .mockRejectedValueOnce(new Error('boom'))
      .mockReturnValue(new Promise(() => {}));
    open('/lumen-coffee/northern-avenue', harness);
    await screen.findByRole('alert');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));

    expect((await screen.findByRole('status')).textContent).toBe('Loading…');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('is the same state on the branch chooser and the manage link', async () => {
    const harness = createHarness({ now: OPEN_HOURS });
    vi.spyOn(harness.publicGateway, 'resolveVenue').mockRejectedValue(new Error('boom'));
    vi.spyOn(harness.publicGateway, 'getManagedBooking').mockRejectedValue(new Error('boom'));

    open('/dolmama', harness);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Something went wrong on our side' }),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
    cleanup();

    open('/lumen-coffee/northern-avenue/booking/some-token', harness);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Something went wrong on our side' }),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
  });
});

describe('a page already on screen', () => {
  it('stays when a refresh fails, and says it could not refresh', async () => {
    const harness = createHarness({ now: OPEN_HOURS });
    const { queryClient } = harness;
    open('/lumen-coffee/northern-avenue', harness);
    await screen.findByRole('heading', { level: 1, name: 'Lumen Coffee' });

    vi.spyOn(harness.publicGateway, 'resolveBranch').mockRejectedValue(new Error('boom'));
    await act(() => queryClient.refetchQueries());
    await waitFor(() =>
      expect(
        queryClient
          .getQueryCache()
          .find({ queryKey: queryKeys.publicBranch('lumen-coffee', 'northern-avenue') })?.state
          .status,
      ).toBe('error'),
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Lumen Coffee' })).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(staleLine()?.textContent).toMatch(/^Could not refresh/u);
  });

  it('stays when the connection drops, and says what it shows may be out of date', async () => {
    const harness = createHarness({ now: OPEN_HOURS });
    open('/lumen-coffee/northern-avenue', harness);
    await screen.findByRole('heading', { level: 1, name: 'Lumen Coffee' });

    act(() => onlineManager.setOnline(false));
    await act(() => harness.queryClient.refetchQueries({ type: 'active' }).catch(() => {}));

    expect(screen.getByRole('heading', { level: 1, name: 'Lumen Coffee' })).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => expect(staleLine()?.textContent).toMatch(/^No connection/u));
  });

  it('says so on the branch chooser too', async () => {
    const harness = createHarness({ now: OPEN_HOURS });
    open('/dolmama', harness);
    await screen.findByRole('heading', { level: 1, name: 'Dolmama' });

    act(() => onlineManager.setOnline(false));
    await act(() => harness.queryClient.refetchQueries({ type: 'active' }).catch(() => {}));

    await waitFor(() => expect(staleLine()?.textContent).toMatch(/^No connection/u));
  });

  it('says so on the manage link of a booking still waiting for the venue', async () => {
    // The countdown keeps ticking while the poll is paused; without the line
    // nothing says the venue's answer may already be waiting.
    const harness = createHarness({ now: OPEN_HOURS });
    const token = await pendingBooking(harness);
    open(`/lumen-coffee/northern-avenue/booking/${token}`, harness);
    await screen.findByRole('heading', { level: 1, name: 'Your booking' });

    act(() => onlineManager.setOnline(false));
    await act(() => harness.queryClient.refetchQueries({ type: 'active' }).catch(() => {}));

    await waitFor(() => expect(staleLine()?.textContent).toMatch(/^No connection/u));
  });
});

/** The quiet line a page on screen carries while its data may be old. */
function staleLine(): HTMLElement | undefined {
  return screen.queryAllByRole('status').find((node) => node.classList.contains('pub-stale'));
}

/** A booking made in the harness's world, two hours out; its manage token. */
async function pendingBooking(h: ReturnType<typeof createHarness>): Promise<string> {
  const branch = (await h.publicGateway.resolveBranch({
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
    await h.gateway.getTableAvailability({
      branchId: branch.id,
      slotUtc,
      partySize: 2,
      timeZoneId: branch.timeZoneId,
    })
  ).find((entry) => entry.isBookable) as TableAvailability;
  const booking = await h.gateway.createBooking({
    commandId: '6f1d0c3a-2b7e-4c55-9a51-3e2f4d1a7b90',
    branchId: branch.id,
    tableId: table.tableId,
    slotUtc,
    timeZoneId: branch.timeZoneId,
    partySize: 2,
    guestName: 'Ani',
    guestPhone: '+37477123456',
    channel: 'web',
  });
  return booking.manageToken!;
}

function harness() {
  return createHarness({ now: OPEN_HOURS });
}
