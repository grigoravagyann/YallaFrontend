// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PublicBranch, TableAvailability } from '@yalla/api';
import { BookingDone } from './BookingDone';
import BookingSheet from './BookingSheet';
import { defaultSelection, slotInstant } from './slots';
import { PublicApp } from './PublicApp';
import { bookAtLumen, createHarness, initTestI18n, type Harness } from './testHarness';

/**
 * Pre-orders on the public page (2026-10-21): the done step offers one, and
 * the manage link shows it, edits it with the same rules as the app, asks
 * "Are you on your way?" when the server says to, and says what became of it.
 *
 * Against the real mocks, so the link edits the booking the page made.
 */

beforeAll(async () => {
  await initTestI18n();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const HOUR_MS = 3_600_000;

/** A booking a day out at Northern Avenue, which takes pre-orders in this world. */
async function bookedTomorrow(harness: Harness) {
  const { branch, booking } = await bookAtLumen(harness, { hoursAhead: 26 });
  expect(booking.manageToken).toBeTruthy();
  return { branch, booking, token: booking.manageToken! };
}

async function preOrderEspresso(harness: Harness, token: string) {
  await harness.publicGateway.replaceManagedPreOrder({
    token,
    lines: [{ menuItemId: 'espresso', quantity: 2, note: 'very hot' }],
    note: 'Coffee first',
    clientCommandId: crypto.randomUUID(),
  });
}

describe('the manage link', () => {
  it('offers a pre-order and saves one from the branch’s pre-order menu', async () => {
    const harness = createHarness({ preOrders: true });
    const { token } = await bookedTomorrow(harness);
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    await user.click(await screen.findByRole('button', { name: 'Add a pre-order' }));
    // The gata is excluded from pre-orders at Northern Avenue.
    expect(await screen.findByRole('button', { name: 'Add Espresso' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add Gata' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Add Espresso' }));
    await user.click(screen.getAllByRole('button', { name: 'One more Espresso' })[0]!);
    await user.type(screen.getByLabelText('Note for the kitchen about Espresso'), 'very hot');
    await user.click(screen.getByRole('button', { name: 'Save pre-order' }));

    expect(await screen.findByText('Pre-order saved.')).toBeTruthy();
    expect(screen.getByText('2 × Espresso')).toBeTruthy();
    expect(screen.getByText('very hot')).toBeTruthy();
    const saved = await harness.publicGateway.getManagedBooking({ token });
    expect(saved?.preOrder?.lines).toMatchObject([
      { menuItemId: 'espresso', quantity: 2, note: 'very hot' },
    ]);
  });

  it('offers nothing where the branch takes no pre-orders', async () => {
    const harness = createHarness();
    const { token } = await bookedTomorrow(harness);
    render(harness.wrap(<PublicApp />, `/booking/${token}`));
    await screen.findByRole('button', { name: 'Cancel this booking' });
    expect(screen.queryByRole('button', { name: 'Add a pre-order' })).toBeNull();
  });

  it('shows a pre-order with its total, changes it and removes it after asking', async () => {
    const harness = createHarness({ preOrders: true });
    const { token } = await bookedTomorrow(harness);
    await preOrderEspresso(harness, token);
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    const section = await screen.findByRole('region', { name: 'Pre-order' });
    expect(within(section).getByText('2 × Espresso')).toBeTruthy();
    expect(within(section).getByText('Coffee first')).toBeTruthy();

    await user.click(within(section).getByRole('button', { name: 'Remove pre-order' }));
    expect(await screen.findByText('Remove the pre-order?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Pre-order removed.')).toBeTruthy();
    expect((await harness.publicGateway.getManagedBooking({ token }))?.preOrder ?? null).toBeNull();
  });

  it('marks a dish sold out since and will not save until it is removed', async () => {
    const harness = createHarness({ preOrders: true });
    const { branch, token } = await bookedTomorrow(harness);
    await preOrderEspresso(harness, token);
    harness.gateway.setDishSoldOutAsVenue(branch.id, 'espresso', true);
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    expect(await screen.findByText('Not available now')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Change pre-order' }));
    expect(
      await screen.findByText(
        'Espresso is not available now. Remove it or choose another dish to save.',
      ),
    ).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Add Americano' }));
    expect(screen.getByRole('button', { name: 'Save pre-order' })).toHaveProperty('disabled', true);
    await user.click(screen.getByRole('button', { name: 'Remove Espresso' }));
    expect(screen.getByRole('button', { name: 'Save pre-order' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it.each([
    ['sent', 'Sent to the kitchen'],
    ['notComing', 'Not sent to the kitchen yet'],
  ] as const)('says when it is %s, read-only', async (state, words) => {
    const harness = createHarness({ preOrders: true });
    const { booking, token } = await bookedTomorrow(harness);
    await preOrderEspresso(harness, token);
    if (state === 'sent') harness.gateway.sendPreOrderAsVenue(booking.id);
    else harness.gateway.markPreOrderNotComingAsVenue(booking.id);
    render(harness.wrap(<PublicApp />, `/booking/${token}`));

    expect(await screen.findByText(words)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change pre-order' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove pre-order' })).toBeNull();
  });

  describe('are you on your way?', () => {
    async function asked() {
      let clock = Date.now();
      const harness = createHarness({
        preOrders: true,
        floorApprovesAtOnce: true,
        now: () => new Date(clock),
      });
      const { booking, token } = await bookedTomorrow(harness);
      await preOrderEspresso(harness, token);
      // Half an hour before the start: asked, from 45 minutes before.
      clock = Date.parse(booking.slotUtc) - 0.5 * HOUR_MS;
      return { harness, token };
    }

    it('asks when the server says so, and "yes" tells the waiter', async () => {
      const { harness, token } = await asked();
      const user = userEvent.setup();
      render(harness.wrap(<PublicApp />, `/booking/${token}`));

      expect(await screen.findByText('Are you on your way?')).toBeTruthy();
      await user.click(screen.getByRole('button', { name: "Yes, I'm on my way" }));
      expect(await screen.findByText('The waiter knows')).toBeTruthy();
      expect(screen.queryByText('Are you on your way?')).toBeNull();
      expect(
        (await harness.publicGateway.getManagedBooking({ token }))?.guestConfirmedOnWayAtUtc,
      ).toBeTruthy();
    });

    it('"I can\'t come" is the ordinary cancel, asked first', async () => {
      const { harness, token } = await asked();
      const user = userEvent.setup();
      render(harness.wrap(<PublicApp />, `/booking/${token}`));

      await user.click(await screen.findByRole('button', { name: "I can't come" }));
      expect(await screen.findByRole('heading', { name: 'Cancel the booking?' })).toBeTruthy();
      expect((await harness.publicGateway.getManagedBooking({ token }))?.status).toBe('confirmed');
    });
  });
});

describe('the done step', () => {
  it('offers a pre-order, and saves one without leaving the sheet', async () => {
    const harness = createHarness({ preOrders: true });
    const { branch, booking } = await bookedTomorrow(harness);
    const user = userEvent.setup();
    render(harness.wrap(<BookingDone booking={booking} branch={branch} />));

    await user.click(await screen.findByRole('button', { name: 'Add a pre-order' }));
    await user.click(await screen.findByRole('button', { name: 'Add Espresso' }));
    await user.click(screen.getByRole('button', { name: 'Save pre-order' }));

    expect(await screen.findByText('Pre-order saved.')).toBeTruthy();
    expect(screen.getByText('1 × Espresso')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change pre-order' })).toBeTruthy();
  });

  it('offers none where the branch takes none', async () => {
    const harness = createHarness();
    const { branch, booking } = await bookedTomorrow(harness);
    render(harness.wrap(<BookingDone booking={booking} branch={branch} />));
    await screen.findByText(booking.code);
    expect(screen.queryByRole('button', { name: 'Add a pre-order' })).toBeNull();
  });
});

describe('nothing in browser storage', () => {
  it('keeps the draft in memory only', async () => {
    const harness = createHarness({ preOrders: true });
    const { token } = await bookedTomorrow(harness);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${token}`));
    await user.click(await screen.findByRole('button', { name: 'Add a pre-order' }));
    await user.click(await screen.findByRole('button', { name: 'Add Espresso' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save pre-order' })).toBeTruthy(),
    );
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('before booking', () => {
  async function toName(acceptsPreOrders: boolean) {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const resolved = (await harness.publicGateway.resolveBranch({
      venueSlug: 'lumen-coffee',
      branchSlug: 'northern-avenue',
    })) as PublicBranch;
    // The page's cached plan says whether the branch takes pre-orders.
    const branch = { ...resolved, policy: { ...resolved.policy, acceptsPreOrders } };
    const selection = {
      ...defaultSelection(branch.timeZoneId, new Date(Date.now() + 26 * HOUR_MS), {
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
    const user = userEvent.setup();
    render(
      harness.wrap(
        <BookingSheet
          branch={branch}
          availability={table}
          slotUtc={slotUtc}
          partySize={2}
          onClose={() => {}}
          onTableTaken={() => {}}
        />,
      ),
    );
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText('Phone number'), '77123456');
    await user.click(screen.getByRole('button', { name: 'Get a code by SMS' }));
    await user.type(await screen.findByLabelText('Code'), '123456');
    await screen.findByLabelText('Name for the booking');
  }

  const HINT = 'After booking you can choose dishes ahead, up to 2 hours before your time.';

  it('mentions pre-ordering where the branch takes it', async () => {
    await toName(true);
    expect(screen.getByText(HINT)).toBeTruthy();
  });

  it('says nothing of it where the branch does not', async () => {
    await toName(false);
    expect(screen.queryByText(HINT)).toBeNull();
  });
});
