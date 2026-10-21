// @vitest-environment jsdom
import { ValidationError, createConsoleMockGateway, type ConsoleGateway } from '@yalla/api';
import { formatDram } from '@yalla/format';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui/toast';
import { MenuEditorScreen } from './menu/MenuEditorScreen';
import { ApprovalsCard } from './overview/ApprovalsCard';
import { ReservationPolicyScreen } from './policy/ReservationPolicyScreen';
import { queryKeys } from '@yalla/api/react';
import { createConsoleHarness, initConsoleTestI18n } from './reports/testHarness';

/**
 * Pre-orders on a booking, in the venue console (2026-10-21).
 *
 * - Policy: "We accept pre-orders" and when the waiter's card appears, within
 *   the server's bounds, honest about the two-hour lock, the "on your way"
 *   question and the waiter's step. Saved on its own, keeping the dishes
 *   switched off.
 * - Menu: a dish can be switched off for pre-orders, on its row; the whole
 *   list is what is saved.
 * - The bookings waiting for an answer show the pre-order a guest added.
 *
 * The console mock's `seedPreOrders`: Northern Avenue (`b-lumen-north`) takes
 * pre-orders, 30 minutes before, the gata switched off; Ani's pending party
 * of ten there has six cappuccinos and two cheesecakes on theirs.
 */

vi.mock('./menu/BulkPhotoDrop', () => ({ BulkPhotoDrop: () => null }));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(async () => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  await initConsoleTestI18n();
});

afterEach(cleanup);

const NORTH = 'b-lumen-north';
const CASCADE = 'b-lumen-cascade';

function gatewayWithPreOrders(): ConsoleGateway {
  return createConsoleMockGateway({ latencyMs: 0, role: 'owner', seedPreOrders: true });
}

function renderAt(
  path: 'policy' | 'menu',
  element: ReactNode,
  branchId: string,
  gateway: ConsoleGateway,
) {
  const harness = createConsoleHarness({ gateway });
  const context = {
    branchId,
    branchName: 'Northern Avenue',
    timeZoneId: 'Asia/Yerevan',
    branchCount: 3,
    canRollUpVenue: true,
    canRelocate: true,
  };
  render(
    harness.wrap(
      <ToastProvider>
        <Routes>
          <Route path="/venue" element={<Outlet context={context} />}>
            <Route path={path} element={element} />
          </Route>
        </Routes>
      </ToastProvider>,
      `/venue/${path}`,
    ),
  );
  return harness;
}

/** Another manager's save, in another browser: this one's cache never hears of it. */
async function savedElsewhere(
  gateway: ConsoleGateway,
  change: (settings: Awaited<ReturnType<ConsoleGateway['getPreOrderSettings']>>) => {
    readonly minutesBefore?: number;
    readonly excludedMenuItemIds?: readonly string[];
  },
): Promise<void> {
  const now = await gateway.getPreOrderSettings(NORTH);
  await gateway.savePreOrderSettings({
    branchId: NORTH,
    settings: {
      acceptsPreOrders: now.acceptsPreOrders,
      minutesBefore: now.minutesBefore,
      excludedMenuItemIds: now.excludedMenuItemIds,
      ...change(now),
    },
  });
}

async function preOrderCard(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: 'Pre-orders' }, { timeout: 5000 });
}

describe('the policy', () => {
  it('is off by default, and says the two-hour lock, the question and the waiter’s step', async () => {
    renderAt('policy', <ReservationPolicyScreen />, CASCADE, gatewayWithPreOrders());

    const card = await preOrderCard();
    const accept = await within(card).findByRole('switch', { name: 'We accept pre-orders' });
    expect(accept.getAttribute('aria-checked')).toBe('false');
    expect(
      within(card).getByText(
        'Guests can change a pre-order until 2 hours before the booking. After that it is locked: to change it, they call you.',
      ),
    ).toBeTruthy();
    expect(
      within(card).getByText(
        '45 minutes before, a guest with a pre-order is asked whether they are on the way. A “yes” shows on the waiter’s card, so nobody has to phone.',
      ),
    ).toBeTruthy();
    expect(
      within(card).getByText(
        'Nothing goes to the kitchen until a waiter taps “Coming → Send to kitchen”. “Not coming” keeps it out of the kitchen; it can still be sent if they arrive.',
      ),
    ).toBeTruthy();
    // In the contents, beside the policy's own groups.
    expect(
      within(screen.getByRole('navigation', { name: 'Policy groups' })).getByRole('link', {
        name: 'Pre-orders',
      }),
    ).toBeTruthy();
  });

  it('saves the switch and the minutes on their own, keeping the dishes switched off', async () => {
    const user = userEvent.setup();
    const gateway = gatewayWithPreOrders();
    const before = await gateway.getPreOrderSettings(NORTH);
    expect(before.excludedMenuItemIds).toHaveLength(1);
    const save = vi.spyOn(gateway, 'savePreOrderSettings');
    renderAt('policy', <ReservationPolicyScreen />, NORTH, gateway);

    const card = await preOrderCard();
    const minutes = (await within(card).findByRole('textbox', {
      name: 'When the waiter’s card appears',
    })) as HTMLInputElement;
    expect(minutes.value).toBe('30');
    expect(within(card).getByText(/^1 dish is not offered for pre-order\./u)).toBeTruthy();

    await user.click(
      within(card).getByRole('button', { name: 'Increase: When the waiter’s card appears' }),
    );
    expect(minutes.value).toBe('35');
    await user.click(within(card).getByRole('button', { name: 'Save pre-order settings' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![0]).toEqual({
      branchId: NORTH,
      settings: {
        acceptsPreOrders: true,
        minutesBefore: 35,
        excludedMenuItemIds: before.excludedMenuItemIds,
      },
    });
    expect(await screen.findByText('Pre-order settings saved')).toBeTruthy();
    expect((await gateway.getPreOrderSettings(NORTH)).minutesBefore).toBe(35);
  });

  // Review S6: the PUT has no version. The card reads the settings fresh just
  // before it, and changes only its own two fields.
  it('keeps the dishes another manager switched off since this card was read', async () => {
    const user = userEvent.setup();
    const gateway = gatewayWithPreOrders();
    const save = vi.spyOn(gateway, 'savePreOrderSettings');
    renderAt('policy', <ReservationPolicyScreen />, NORTH, gateway);

    const card = await preOrderCard();
    await within(card).findByRole('textbox', { name: 'When the waiter’s card appears' });
    await savedElsewhere(gateway, (now) => ({
      excludedMenuItemIds: [...now.excludedMenuItemIds, 'cappuccino'],
    }));
    save.mockClear();

    await user.click(
      within(card).getByRole('button', { name: 'Increase: When the waiter’s card appears' }),
    );
    await user.click(within(card).getByRole('button', { name: 'Save pre-order settings' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const { excludedMenuItemIds, ...rest } = save.mock.calls[0]![0].settings;
    expect(rest).toEqual({ acceptsPreOrders: true, minutesBefore: 35 });
    expect([...excludedMenuItemIds].sort()).toEqual(['cappuccino', 'gata']);
    expect(await screen.findByText('Pre-order settings saved')).toBeTruthy();
  });

  // Review NIT 13: a re-read that brings another session's values is not a
  // change this manager made.
  it('takes in values read since, while untouched, without calling them unsaved', async () => {
    const gateway = gatewayWithPreOrders();
    const harness = renderAt('policy', <ReservationPolicyScreen />, NORTH, gateway);

    const card = await preOrderCard();
    const minutes = (await within(card).findByRole('textbox', {
      name: 'When the waiter’s card appears',
    })) as HTMLInputElement;
    expect(minutes.value).toBe('30');

    await savedElsewhere(gateway, () => ({ minutesBefore: 60 }));
    await act(() =>
      harness.queryClient.invalidateQueries({ queryKey: queryKeys.preOrderSettings(NORTH) }),
    );

    await waitFor(() => expect(minutes.value).toBe('60'));
    expect(within(card).queryByText('Unsaved changes')).toBeNull();
  });

  it('marks minutes outside the bounds and sends nothing', async () => {
    const user = userEvent.setup();
    const gateway = gatewayWithPreOrders();
    const save = vi.spyOn(gateway, 'savePreOrderSettings');
    renderAt('policy', <ReservationPolicyScreen />, NORTH, gateway);

    const card = await preOrderCard();
    const minutes = await within(card).findByRole('textbox', {
      name: 'When the waiter’s card appears',
    });
    await user.clear(minutes);
    await user.type(minutes, '3');
    expect(within(card).getByText('Must be between 5 and 120')).toBeTruthy();
    expect(minutes.getAttribute('aria-invalid')).toBe('true');

    await user.click(within(card).getByRole('button', { name: 'Save pre-order settings' }));
    expect(save).not.toHaveBeenCalled();
  });

  it('marks the field the server refused', async () => {
    const user = userEvent.setup();
    const gateway = gatewayWithPreOrders();
    vi.spyOn(gateway, 'savePreOrderSettings').mockRejectedValue(
      new ValidationError({
        url: 'x',
        status: 422,
        problem: {
          type: '',
          title: 'Invalid',
          status: 422,
          detail: 'minutesBefore must be between 5 and 120.',
          code: 'validation-failed',
          traceId: 't',
          context: { fields: [{ field: 'minutesBefore', message: 'out of range' }] },
        },
      }),
    );
    renderAt('policy', <ReservationPolicyScreen />, NORTH, gateway);

    const card = await preOrderCard();
    await user.click(await within(card).findByRole('switch', { name: 'We accept pre-orders' }));
    await user.click(within(card).getByRole('button', { name: 'Save pre-order settings' }));

    expect(
      await within(card).findByText(
        'The server did not accept this value. Check it and save again.',
      ),
    ).toBeTruthy();
    expect(await screen.findByText('Could not save the pre-order settings.')).toBeTruthy();
  });

  /*
   * Live QA 2026-10-21, bug 5: the card said "Unsaved changes" while the
   * page's bar said "Saved", and the bar's Save sent nothing ("No changes").
   * The bar now names the card and saves it too.
   */
  describe("the page's save bar", () => {
    async function changed() {
      const user = userEvent.setup();
      const gateway = gatewayWithPreOrders();
      const save = vi.spyOn(gateway, 'savePreOrderSettings');
      renderAt('policy', <ReservationPolicyScreen />, NORTH, gateway);
      const card = await preOrderCard();
      await within(card).findByRole('textbox', { name: 'When the waiter’s card appears' });
      await user.click(
        within(card).getByRole('button', { name: 'Increase: When the waiter’s card appears' }),
      );
      return { user, gateway, save, card, bar: screen.getByRole('region', { name: 'Saving' }) };
    }

    it('names the pre-order card while it holds changes, and saves it', async () => {
      const { user, gateway, save, bar } = await changed();
      expect(within(bar).getByText('Unsaved changes in Pre-orders')).toBeTruthy();

      await user.click(within(bar).getByRole('button', { name: 'Save the policy' }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      expect(save.mock.calls[0]![0].settings.minutesBefore).toBe(35);
      expect(await screen.findByText('Pre-order settings saved')).toBeTruthy();
      expect(screen.queryByText('No changes')).toBeNull();
      expect((await gateway.getPreOrderSettings(NORTH)).minutesBefore).toBe(35);
      await waitFor(() => expect(within(bar).queryByText(/Pre-orders/u)).toBeNull());
    });

    it("discards the card's changes with the page's", async () => {
      const { user, save, card, bar } = await changed();
      await user.click(within(bar).getByRole('button', { name: 'Discard changes' }));
      expect(
        (
          within(card).getByRole('textbox', {
            name: 'When the waiter’s card appears',
          }) as HTMLInputElement
        ).value,
      ).toBe('30');
      expect(within(bar).queryByText(/Pre-orders/u)).toBeNull();
      expect(save).not.toHaveBeenCalled();
    });
  });
});

describe('the menu', () => {
  it('switches a dish off for pre-orders on its row, saving the whole list', async () => {
    const user = userEvent.setup();
    const gateway = gatewayWithPreOrders();
    const excluded = (await gateway.getPreOrderSettings(NORTH)).excludedMenuItemIds;
    const save = vi.spyOn(gateway, 'savePreOrderSettings');
    renderAt('menu', <MenuEditorScreen />, NORTH, gateway);

    const row = (
      await screen.findByText('Cappuccino', { selector: '.yc-dn' }, { timeout: 5000 })
    ).closest('tr')!;
    const toggle = await within(row).findByRole('switch', {
      name: 'Cappuccino: can be pre-ordered',
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    await user.click(toggle);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![0].settings).toEqual({
      acceptsPreOrders: true,
      minutesBefore: 30,
      excludedMenuItemIds: [...excluded, 'cappuccino'],
    });
    expect(
      await screen.findByText(
        '“Cappuccino” is no longer offered for pre-order. Pre-orders that already have it keep it.',
      ),
    ).toBeTruthy();
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));

    await user.click(toggle);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0].settings.excludedMenuItemIds).toEqual(excluded);
  });

  // Review S6: the minutes another manager set since this screen read them
  // are what the switch sends, not the cached ones.
  it('sends the settings as the server has them now, with only this dish changed', async () => {
    const user = userEvent.setup();
    const gateway = gatewayWithPreOrders();
    const save = vi.spyOn(gateway, 'savePreOrderSettings');
    renderAt('menu', <MenuEditorScreen />, NORTH, gateway);

    const row = (
      await screen.findByText('Cappuccino', { selector: '.yc-dn' }, { timeout: 5000 })
    ).closest('tr')!;
    const toggle = await within(row).findByRole('switch', {
      name: 'Cappuccino: can be pre-ordered',
    });
    await savedElsewhere(gateway, () => ({ minutesBefore: 60 }));
    save.mockClear();

    await user.click(toggle);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![0].settings).toEqual({
      acceptsPreOrders: true,
      minutesBefore: 60,
      excludedMenuItemIds: ['gata', 'cappuccino'],
    });
  });

  // Review S5: the exclusions live on the dish rows, so a deleted dish leaves
  // the server's list — and a list still carrying it is refused.
  it('switches another dish after a switched-off dish was deleted', async () => {
    const user = userEvent.setup();
    const gateway = gatewayWithPreOrders();
    await savedElsewhere(gateway, (now) => ({
      excludedMenuItemIds: [...now.excludedMenuItemIds, 'americano'],
    }));
    const save = vi.spyOn(gateway, 'savePreOrderSettings');
    renderAt('menu', <MenuEditorScreen />, NORTH, gateway);

    const row = (
      await screen.findByText('Cappuccino', { selector: '.yc-dn' }, { timeout: 5000 })
    ).closest('tr')!;
    const toggle = await within(row).findByRole('switch', {
      name: 'Cappuccino: can be pre-ordered',
    });
    // Deleted in another tab: this screen's cache still has the americano.
    expect((await gateway.deleteMenuItem({ branchId: NORTH, itemId: 'americano' })).deleted).toBe(
      true,
    );

    await user.click(toggle);
    expect(
      await screen.findByText(
        '“Cappuccino” is no longer offered for pre-order. Pre-orders that already have it keep it.',
      ),
    ).toBeTruthy();
    expect(save.mock.calls.at(-1)![0].settings.excludedMenuItemIds).toEqual(['gata', 'cappuccino']);
  });

  it('reads the pre-order settings again when a dish is deleted here', async () => {
    const user = userEvent.setup();
    const gateway = gatewayWithPreOrders();
    const read = vi.spyOn(gateway, 'getPreOrderSettings');
    renderAt('menu', <MenuEditorScreen />, NORTH, gateway);

    const americano = (
      await screen.findByText('Americano', { selector: '.yc-dn' }, { timeout: 5000 })
    ).closest('tr')!;
    await waitFor(() => expect(read).toHaveBeenCalled());
    const before = read.mock.calls.length;
    await user.click(within(americano).getByRole('button', { name: /^edit$/i }));
    const drawer = screen.getByRole('dialog', { name: 'Edit: Americano' });
    await user.click(within(drawer).getByRole('button', { name: /^delete$/i }));
    const confirm = screen.getByRole('alertdialog', { name: 'Delete “Americano”?' });
    await user.click(within(confirm).getByRole('button', { name: /^delete$/i }));

    expect(await screen.findByText('“Americano” deleted')).toBeTruthy();
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(before));
  });

  it('has no pre-order column where the branch does not take them', async () => {
    renderAt('menu', <MenuEditorScreen />, CASCADE, gatewayWithPreOrders());

    await screen.findByText('Cappuccino', { selector: '.yc-dn' }, { timeout: 5000 });
    expect(screen.queryByRole('columnheader', { name: 'Pre-order' })).toBeNull();
    expect(screen.queryByRole('switch', { name: /can be pre-ordered/u })).toBeNull();
  });
});

describe('a booking waiting for an answer', () => {
  it('shows the pre-order the guest added: dishes, note, total and where it stands', async () => {
    const harness = createConsoleHarness({ gateway: gatewayWithPreOrders() });
    render(
      harness.wrap(
        <ToastProvider>
          <ApprovalsCard branchId={NORTH} timeZoneId="Asia/Yerevan" />
        </ToastProvider>,
        '/venue',
      ),
    );

    const preOrder = await screen.findByRole('region', { name: 'Pre-order' }, { timeout: 5000 });
    const dishes = within(preOrder).getByRole('list', { name: 'Pre-order dishes' });
    expect(within(dishes).getByText('Cappuccino')).toBeTruthy();
    expect(within(dishes).getByText('6×')).toBeTruthy();
    expect(within(dishes).getByText('With candles')).toBeTruthy();
    expect(within(preOrder).getByText('Coffee as soon as we sit down')).toBeTruthy();
    expect(
      within(preOrder).getByText(
        `Total ${formatDram(6 * 1200 + 2 * 2200, 'en')}`.replace(/\s+/gu, ' '),
      ),
    ).toBeTruthy();
    expect(within(preOrder).getByText('The guest can still change it')).toBeTruthy();
  });
});
