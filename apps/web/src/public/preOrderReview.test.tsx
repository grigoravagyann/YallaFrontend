// @vitest-environment jsdom
import {
  ConcurrencyConflictError,
  NetworkError,
  OnMyWayNotOpenError,
  PreOrderAlreadySentError,
  type PreOrder,
} from '@yalla/api';
import { formatTime } from '@yalla/format';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingDone } from './BookingDone';
import { PreOrderState } from './PreOrder';
import { PublicApp } from './PublicApp';
import {
  bookAtLumen,
  createHarness,
  initTestI18n,
  stubIntersectionObserverAsNeverVisible,
  type Harness,
} from './testHarness';

/**
 * Pre-orders on the public page, after review (PO-FE-GUEST-REVIEW): the
 * editor that closes under the guest says why and gives the link's actions
 * back (B1), a removal never reuses a failed save's id (S1), a sold-out
 * refusal reads the menu again and its sentence goes with the dish (S2, S3),
 * the link's menu says loading or failure rather than "no dishes" (S4), a
 * move of a sent pre-order is said (S6), and the nits.
 *
 * Against the real mocks, so the link edits the booking the page made.
 */

beforeAll(async () => {
  await initTestI18n();
});

beforeEach(() => {
  stubIntersectionObserverAsNeverVisible();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const HOUR_MS = 3_600_000;
const URL_TAG = 'mock://test';
const BRANCH_ID = 'b-lumen-north';
const LOCKED_LINE = 'Pre-orders close 2 hours before your booking. Call the venue to change it.';

async function bookedTomorrow(harness: Harness) {
  const { branch, booking } = await bookAtLumen(harness, { hoursAhead: 26 });
  return { branch, booking, token: booking.manageToken! };
}

async function preOrderEspresso(harness: Harness, token: string, quantity = 2) {
  await harness.publicGateway.replaceManagedPreOrder({
    token,
    lines: [{ menuItemId: 'espresso', quantity, note: null }],
    note: null,
    clientCommandId: crypto.randomUUID(),
  });
}

describe('an editor that closes under the guest (B1)', () => {
  it('gives the actions back and says why when the window shuts while editing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const harness = createHarness({ preOrders: true });
    const { token } = await bookedTomorrow(harness);
    const read = await harness.publicGateway.getManagedBooking({ token });
    const until = Date.parse(read!.preOrderEditableUntilUtc!);
    vi.setSystemTime(until - 10_000);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    await user.click(await screen.findByRole('button', { name: 'Add a pre-order' }));
    await screen.findByRole('button', { name: 'Add Espresso' });
    expect(screen.queryByRole('button', { name: 'Cancel this booking' })).toBeNull();

    // The page's clock ticks past the window with the editor open.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(await screen.findByText(LOCKED_LINE)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add Espresso' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel this booking' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change time or guests' })).toBeTruthy();
  });

  it('gives the actions back after a 409 and the read that follows it', async () => {
    const harness = createHarness({ preOrders: true });
    const { token } = await bookedTomorrow(harness);
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    await user.click(await screen.findByRole('button', { name: 'Add a pre-order' }));
    await user.click(await screen.findByRole('button', { name: 'Add Espresso' }));
    // The venue switches pre-orders off while the guest chooses.
    harness.gateway.setPreOrderSettingsAsVenue(BRANCH_ID, {
      acceptsPreOrders: false,
      minutesBefore: 30,
      excludedMenuItemIds: [],
    });
    await user.click(screen.getByRole('button', { name: 'Save pre-order' }));

    expect(await screen.findByText('This venue is not taking pre-orders right now.')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Cancel this booking' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save pre-order' })).toBeNull();
  });
});

describe('removing in the editor (S1)', () => {
  it("never reuses a failed save's command id", async () => {
    const harness = createHarness({ preOrders: true });
    const { token } = await bookedTomorrow(harness);
    await preOrderEspresso(harness, token, 1);
    const saves = vi
      .spyOn(harness.publicGateway, 'replaceManagedPreOrder')
      .mockRejectedValueOnce(new NetworkError({ url: URL_TAG }));
    const clears = vi.spyOn(harness.publicGateway, 'clearManagedPreOrder');
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    await user.click(await screen.findByRole('button', { name: 'Change pre-order' }));
    const line = (await screen.findAllByRole('group', { name: 'Espresso' }))[0]!;
    await user.click(within(line).getByRole('button', { name: 'One more Espresso' }));
    await user.click(screen.getByRole('button', { name: 'Save pre-order' }));
    await screen.findByText(/^The connection dropped/u);

    // The guest gives up on it and empties the list instead.
    await user.click(screen.getByRole('button', { name: 'Remove Espresso' }));
    await user.click(screen.getByRole('button', { name: 'Remove pre-order' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(clears).toHaveBeenCalledTimes(1));
    const saveId = saves.mock.calls[0]![0].clientCommandId;
    expect(clears.mock.calls[0]![0].clientCommandId).not.toBe(saveId);
    expect(await screen.findByText('Pre-order removed.')).toBeTruthy();
  });
});

describe('command ids (N9)', () => {
  it('resends the same draft with the same id, and an edited one with a new id', async () => {
    const harness = createHarness({ preOrders: true });
    const { token } = await bookedTomorrow(harness);
    const saves = vi
      .spyOn(harness.publicGateway, 'replaceManagedPreOrder')
      .mockRejectedValue(new NetworkError({ url: URL_TAG }));
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    await user.click(await screen.findByRole('button', { name: 'Add a pre-order' }));
    await user.click(await screen.findByRole('button', { name: 'Add Espresso' }));
    await user.click(screen.getByRole('button', { name: 'Save pre-order' }));
    await screen.findByText(/^The connection dropped/u);
    await user.click(screen.getByRole('button', { name: 'Save pre-order' }));
    await waitFor(() => expect(saves).toHaveBeenCalledTimes(2));
    await screen.findByText(/^The connection dropped/u);

    const line = (await screen.findAllByRole('group', { name: 'Espresso' }))[0]!;
    await user.click(within(line).getByRole('button', { name: 'One more Espresso' }));
    await user.click(screen.getByRole('button', { name: 'Save pre-order' }));
    await waitFor(() => expect(saves).toHaveBeenCalledTimes(3));

    const ids = saves.mock.calls.map((call) => call[0].clientCommandId);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[1]);
  });
});

describe('a dish sold out after the menu loaded (S2, S3)', () => {
  async function refusedEspresso() {
    const harness = createHarness({ preOrders: true });
    const { branch, token } = await bookedTomorrow(harness);
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${token}`));
    await user.click(await screen.findByRole('button', { name: 'Add a pre-order' }));
    await user.click(await screen.findByRole('button', { name: 'Add Espresso' }));
    await user.click(await screen.findByRole('button', { name: 'Add Americano' }));
    harness.gateway.setDishSoldOutAsVenue(branch.id, 'espresso', true);
    await user.click(screen.getByRole('button', { name: 'Save pre-order' }));
    await screen.findByText(
      "Espresso can't be pre-ordered any more. Remove it to save your changes.",
    );
    return { user };
  }

  it('reads the menu again, so the dish cannot be added back', async () => {
    const { user } = await refusedEspresso();
    await user.click(screen.getByRole('button', { name: 'Remove Espresso' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add Espresso' })).toBeNull());
    expect(screen.getAllByRole('button', { name: 'One more Americano' }).length).toBeGreaterThan(0);
  });

  it('drops the refusal once the dish is removed', async () => {
    const { user } = await refusedEspresso();
    await user.click(screen.getByRole('button', { name: 'Remove Espresso' }));
    expect(screen.queryByText(/can't be pre-ordered any more/u)).toBeNull();
    expect(screen.getByRole('button', { name: 'Save pre-order' })).toHaveProperty(
      'disabled',
      false,
    );
  });
});

describe("the link's menu (S4)", () => {
  it('says the branch read failed, with a retry, rather than "no dishes"', async () => {
    const harness = createHarness({ preOrders: true });
    const { token } = await bookedTomorrow(harness);
    const resolve = harness.publicGateway.resolveBranch.bind(harness.publicGateway);
    const reads = vi
      .spyOn(harness.publicGateway, 'resolveBranch')
      .mockRejectedValue(new NetworkError({ url: URL_TAG }));
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    await user.click(await screen.findByRole('button', { name: 'Add a pre-order' }));
    expect(await screen.findByText("We couldn't load the menu.")).toBeTruthy();
    expect(screen.queryByText('This venue has no dishes to pre-order right now.')).toBeNull();

    reads.mockImplementation(resolve);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Add Espresso' })).toBeTruthy();
  });

  it('says the menu is not available when the branch is gone', async () => {
    const harness = createHarness({ preOrders: true });
    const { token } = await bookedTomorrow(harness);
    vi.spyOn(harness.publicGateway, 'resolveBranch').mockResolvedValue(null);
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    await user.click(await screen.findByRole('button', { name: 'Add a pre-order' }));
    expect(await screen.findByText("The menu isn't available here right now.")).toBeTruthy();
    expect(screen.queryByText('This venue has no dishes to pre-order right now.')).toBeNull();
  });
});

describe('moving a booking whose pre-order went to the kitchen (S6)', () => {
  it('says so, and to call the venue', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    vi.spyOn(harness.publicGateway, 'rescheduleManagedBooking').mockRejectedValue(
      new PreOrderAlreadySentError({ url: URL_TAG }),
    );
    const { booking } = await bookAtLumen(harness);
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${booking.manageToken}?lang=en`));
    await user.click(await screen.findByRole('button', { name: 'Change time or guests' }));
    const card = await screen.findByRole('region', { name: 'Change time or guests' });
    await user.click(within(card).getByRole('button', { name: 'Fewer guests' }));
    const save = within(card).getByRole('button', { name: 'Save the change' });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    await user.click(save);

    expect(
      await within(card).findByText(
        'Your pre-order is already in the kitchen; call the venue to change the time.',
      ),
    ).toBeTruthy();
  });
});

describe('the nits', () => {
  it('N1: the done step takes the latest pre-order after a concurrent update', async () => {
    const harness = createHarness({ preOrders: true });
    const { branch, booking, token } = await bookedTomorrow(harness);
    const user = userEvent.setup();
    render(harness.wrap(<BookingDone booking={booking} branch={branch} />));

    await user.click(await screen.findByRole('button', { name: 'Add a pre-order' }));
    await user.click(await screen.findByRole('button', { name: 'Add Espresso' }));
    // Saved from another tab meanwhile; this save loses the race.
    await harness.publicGateway.replaceManagedPreOrder({
      token,
      lines: [{ menuItemId: 'americano', quantity: 3, note: null }],
      note: null,
      clientCommandId: crypto.randomUUID(),
    });
    vi.spyOn(harness.publicGateway, 'replaceManagedPreOrder').mockRejectedValueOnce(
      new ConcurrencyConflictError({ url: URL_TAG }),
    );
    await user.click(screen.getByRole('button', { name: 'Save pre-order' }));

    await screen.findByText(/^Your pre-order changed in the meantime/u);
    expect(await screen.findByRole('button', { name: 'Remove Americano' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove Espresso' })).toBeNull();
  });

  it('N2: a ticket the venue voided is said in a neutral tone, not as a success', () => {
    const harness = createHarness();
    const preOrder = { kitchenStatus: 'voided' } as unknown as PreOrder;
    render(harness.wrap(<PreOrderState view={{ kind: 'sent', preOrder }} kitchen="voided" />));
    const notice = screen.getByText('Taken off by the venue').closest('.pub-notice')!;
    expect(notice.className).not.toContain('pub-notice-ok');
    expect(notice.className).toContain('pub-notice-neutral');
  });

  it("N4: a dish listed twice: each line's + and − change that line", async () => {
    const harness = createHarness({ preOrders: true });
    const { token } = await bookedTomorrow(harness);
    await harness.publicGateway.replaceManagedPreOrder({
      token,
      lines: [
        { menuItemId: 'espresso', quantity: 1, note: 'very hot' },
        { menuItemId: 'espresso', quantity: 2, note: 'iced' },
      ],
      note: null,
      clientCommandId: crypto.randomUUID(),
    });
    const user = userEvent.setup();
    const { container } = render(harness.wrap(<PublicApp />, `/booking/${token}`));
    await user.click(await screen.findByRole('button', { name: 'Change pre-order' }));
    await screen.findAllByRole('group', { name: 'Espresso' });

    const counts = () =>
      [...container.querySelectorAll('.pub-po-lines .pub-po-line output')].map(
        (output) => output.textContent,
      );
    expect(counts()).toEqual(['1', '2']);
    const lines = container.querySelectorAll('.pub-po-lines .pub-po-line');
    await user.click(
      within(lines[1] as HTMLElement).getByRole('button', { name: 'One more Espresso' }),
    );
    expect(counts()).toEqual(['1', '3']);
    await user.click(
      within(lines[1] as HTMLElement).getByRole('button', { name: 'One fewer Espresso' }),
    );
    await user.click(
      within(lines[0] as HTMLElement).getByRole('button', { name: 'One more Espresso' }),
    );
    expect(counts()).toEqual(['2', '2']);
  });

  it('N6: an early "yes" says from when it can be confirmed', async () => {
    let clock = Date.now();
    const harness = createHarness({
      preOrders: true,
      floorApprovesAtOnce: true,
      now: () => new Date(clock),
    });
    const { booking, token } = await bookedTomorrow(harness);
    await preOrderEspresso(harness, token);
    clock = Date.parse(booking.slotUtc) - 0.5 * HOUR_MS;
    const opensAtUtc = new Date(Date.now() + HOUR_MS).toISOString();
    vi.spyOn(harness.publicGateway, 'confirmManagedOnMyWay').mockRejectedValue(
      new OnMyWayNotOpenError({ url: URL_TAG, opensAtUtc }),
    );
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    await user.click(await screen.findByRole('button', { name: "Yes, I'm on my way" }));
    const time = formatTime(opensAtUtc, 'Asia/Yerevan', 'en');
    expect(await screen.findByText(`You can confirm from ${time}.`)).toBeTruthy();
  });

  it('N7: the remove question takes focus, in the editor and on the link', async () => {
    const harness = createHarness({ preOrders: true });
    const { token } = await bookedTomorrow(harness);
    await preOrderEspresso(harness, token, 1);
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    const section = await screen.findByRole('region', { name: 'Pre-order' });
    await user.click(within(section).getByRole('button', { name: 'Remove pre-order' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'Remove the pre-order?' }),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Keep it' }));

    await user.click(screen.getByRole('button', { name: 'Change pre-order' }));
    await user.click(await screen.findByRole('button', { name: 'Remove Espresso' }));
    await user.click(screen.getByRole('button', { name: 'Remove pre-order' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'Remove the pre-order?' }),
      ),
    );
  });
});
