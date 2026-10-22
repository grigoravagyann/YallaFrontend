// @vitest-environment jsdom
import { ValidationError, createConsoleMockGateway, type ConsoleGateway } from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui/toast';
import { MenuEditorScreen } from './menu/MenuEditorScreen';
import { ReservationPolicyScreen } from './policy/ReservationPolicyScreen';
import { createConsoleHarness, initConsoleTestI18n } from './reports/testHarness';

/**
 * Takeaway in the venue console (2026-10-22, the Policy artboard).
 *
 * - Policy: a "Takeaway orders" card — "We take takeaway orders" and "Accept
 *   without us", the preparation time, the last order and how many at once
 *   within the server's bounds, what the guest will see, and a note linking to
 *   the Menu. Saved on its own, and by the page's bar with the rest.
 * - Menu: a dish is switched to "only in the hall" on its row, while the
 *   branch takes takeaway.
 *
 * The console mock's `seedTakeaway`: Northern Avenue takes takeaway (staff
 * accept, 20 min, 30 min, 5 at once), its matnakash eggs only in the hall.
 * Cascade has never switched it on.
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

function gatewayWithTakeaway(): ConsoleGateway {
  return createConsoleMockGateway({ latencyMs: 0, role: 'owner', seedTakeaway: true });
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

async function takeawayCard(): Promise<HTMLElement> {
  const card = await screen.findByRole('region', { name: 'Takeaway orders' }, { timeout: 5000 });
  await within(card).findByRole('textbox', { name: 'Preparation time' });
  return card;
}

const field = (card: HTMLElement, name: string) =>
  within(card).getByRole('textbox', { name }) as HTMLInputElement;

describe('the policy card', () => {
  it('is off by default, with the defaults, and says what the guest will see', async () => {
    renderAt('policy', <ReservationPolicyScreen />, CASCADE, gatewayWithTakeaway());
    const card = await takeawayCard();

    const on = within(card).getByRole('switch', { name: 'We take takeaway orders' });
    expect(on.getAttribute('aria-checked')).toBe('false');
    const auto = within(card).getByRole('switch', { name: 'Accept without us' });
    expect(auto.getAttribute('aria-checked')).toBe('false');
    // The five minutes the tablet has, said in the switch's help.
    expect(auto.getAttribute('aria-describedby')).toBeTruthy();
    expect(within(card).getByText(/within 5 minutes, the order is declined/u)).toBeTruthy();

    expect(field(card, 'Preparation time').value).toBe('20');
    expect(field(card, 'Last order').value).toBe('30');
    expect(field(card, 'At most at once').value).toBe('5');
    expect(within(card).getByText('No takeaway on the venue’s page.')).toBeTruthy();
    // The dishes are the Menu's, linked from here.
    expect(within(card).getByRole('link', { name: 'Open the menu' }).getAttribute('href')).toBe(
      '/venue/menu',
    );
    // In the policy's contents.
    expect(
      within(screen.getByRole('navigation', { name: 'Policy groups' })).getByRole('link', {
        name: 'Takeaway orders',
      }),
    ).toBeTruthy();
  });

  it('shows the guest’s line as the settings stand', async () => {
    const user = userEvent.setup();
    renderAt('policy', <ReservationPolicyScreen />, CASCADE, gatewayWithTakeaway());
    const card = await takeawayCard();

    await user.click(within(card).getByRole('switch', { name: 'We take takeaway orders' }));
    expect(
      within(card).getByText(
        '“Order to take away · ready in about 20 minutes · you pay when you pick it up”',
      ),
    ).toBeTruthy();
    await user.click(within(card).getByRole('button', { name: 'Increase: Preparation time' }));
    expect(field(card, 'Preparation time').value).toBe('25');
    expect(within(card).getByText(/ready in about 25 minutes/u)).toBeTruthy();
  });

  it('steps each number by its own step, and stops at its bounds', async () => {
    const user = userEvent.setup();
    renderAt('policy', <ReservationPolicyScreen />, NORTH, gatewayWithTakeaway());
    const card = await takeawayCard();

    // The last order moves in quarter hours, down to none.
    await user.click(within(card).getByRole('button', { name: 'Decrease: Last order' }));
    expect(field(card, 'Last order').value).toBe('15');
    await user.click(within(card).getByRole('button', { name: 'Decrease: Last order' }));
    expect(field(card, 'Last order').value).toBe('0');
    expect(
      (within(card).getByRole('button', { name: 'Decrease: Last order' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    // How many at once moves by one.
    await user.click(within(card).getByRole('button', { name: 'Increase: At most at once' }));
    expect(field(card, 'At most at once').value).toBe('6');
  });

  it('marks a number off its bounds or its step and sends nothing', async () => {
    const user = userEvent.setup();
    const gateway = gatewayWithTakeaway();
    const save = vi.spyOn(gateway, 'saveTakeawaySettings');
    renderAt('policy', <ReservationPolicyScreen />, NORTH, gateway);
    const card = await takeawayCard();

    const prep = field(card, 'Preparation time');
    await user.clear(prep);
    await user.type(prep, '7');
    expect(prep.getAttribute('aria-invalid')).toBe('true');
    expect(within(card).getByText('Must be between 5 and 90, in steps of 5')).toBeTruthy();

    await user.click(within(card).getByRole('button', { name: 'Save takeaway settings' }));
    expect(await screen.findByText('First fix the fields that are out of bounds')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole('region', { name: 'Saving' })).getByText(
        'The fields marked in red are out of bounds',
      ),
    ).toBeTruthy();
  });

  it('saves all five on its own', async () => {
    const user = userEvent.setup();
    const gateway = gatewayWithTakeaway();
    const save = vi.spyOn(gateway, 'saveTakeawaySettings');
    renderAt('policy', <ReservationPolicyScreen />, NORTH, gateway);
    const card = await takeawayCard();

    await user.click(within(card).getByRole('switch', { name: 'Accept without us' }));
    await user.click(within(card).getByRole('button', { name: 'Increase: Preparation time' }));
    expect(within(card).getByText('Unsaved changes')).toBeTruthy();
    await user.click(within(card).getByRole('button', { name: 'Save takeaway settings' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![0]).toEqual({
      branchId: NORTH,
      settings: {
        enabled: true,
        autoAccept: true,
        prepMinutes: 25,
        lastOrderMinutes: 30,
        maxInProgress: 5,
      },
    });
    expect(await screen.findByText('Takeaway settings saved')).toBeTruthy();
    expect((await gateway.getTakeawaySettings(NORTH)).prepMinutes).toBe(25);
    await waitFor(() => expect(within(card).queryByText('Unsaved changes')).toBeNull());
  });

  it('marks the field the server refused', async () => {
    const user = userEvent.setup();
    const gateway = gatewayWithTakeaway();
    vi.spyOn(gateway, 'saveTakeawaySettings').mockRejectedValue(
      new ValidationError({
        url: 'x',
        status: 422,
        problem: {
          type: '',
          title: 'Invalid',
          status: 422,
          detail: 'maxInProgress must be between 1 and 30.',
          code: 'validation-failed',
          traceId: 't',
          context: { fields: [{ field: 'maxInProgress', message: 'out of range' }] },
        },
      }),
    );
    renderAt('policy', <ReservationPolicyScreen />, NORTH, gateway);
    const card = await takeawayCard();

    await user.click(within(card).getByRole('button', { name: 'Increase: At most at once' }));
    await user.click(within(card).getByRole('button', { name: 'Save takeaway settings' }));
    expect(
      await screen.findByText('Could not save the takeaway settings. Try again.'),
    ).toBeTruthy();
    expect(
      await within(card).findByText(
        'The server did not accept this value. Check it and save again.',
      ),
    ).toBeTruthy();
    expect(field(card, 'At most at once').getAttribute('aria-invalid')).toBe('true');
  });

  describe("the page's save bar", () => {
    it('names the takeaway card while it holds changes, and saves it', async () => {
      const user = userEvent.setup();
      const gateway = gatewayWithTakeaway();
      const save = vi.spyOn(gateway, 'saveTakeawaySettings');
      renderAt('policy', <ReservationPolicyScreen />, NORTH, gateway);
      const card = await takeawayCard();
      const bar = screen.getByRole('region', { name: 'Saving' });

      await user.click(within(card).getByRole('button', { name: 'Increase: At most at once' }));
      expect(within(bar).getByText('Unsaved changes in Takeaway orders')).toBeTruthy();

      await user.click(within(bar).getByRole('button', { name: 'Save the policy' }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      expect(save.mock.calls[0]![0].settings.maxInProgress).toBe(6);
      await waitFor(() => expect(within(bar).queryByText(/Takeaway/u)).toBeNull());
    });

    it("discards the card's changes with the page's", async () => {
      const user = userEvent.setup();
      const gateway = gatewayWithTakeaway();
      const save = vi.spyOn(gateway, 'saveTakeawaySettings');
      renderAt('policy', <ReservationPolicyScreen />, NORTH, gateway);
      const card = await takeawayCard();
      const bar = screen.getByRole('region', { name: 'Saving' });

      await user.click(within(card).getByRole('switch', { name: 'We take takeaway orders' }));
      await user.click(within(bar).getByRole('button', { name: 'Discard changes' }));
      expect(
        within(card)
          .getByRole('switch', { name: 'We take takeaway orders' })
          .getAttribute('aria-checked'),
      ).toBe('true');
      expect(within(bar).queryByText(/Takeaway/u)).toBeNull();
      expect(save).not.toHaveBeenCalled();
    });
  });
});

describe('the menu', () => {
  it('switches a dish to "only in the hall" on its row', async () => {
    const user = userEvent.setup();
    const gateway = gatewayWithTakeaway();
    const update = vi.spyOn(gateway, 'updateMenuItem');
    renderAt('menu', <MenuEditorScreen />, NORTH, gateway);

    const row = (
      await screen.findByText('Cappuccino', { selector: '.yc-dn' }, { timeout: 5000 })
    ).closest('tr')!;
    const toggle = await within(row).findByRole('switch', {
      name: 'Cappuccino: for takeaway',
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('columnheader', { name: 'Takeaway' })).toBeTruthy();

    await user.click(toggle);
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]![0]).toMatchObject({
      branchId: NORTH,
      itemId: 'cappuccino',
      patch: { availableForTakeaway: false },
    });
    expect(
      await screen.findByText(
        '“Cappuccino” is now only in the hall. Takeaway orders already sent keep it.',
      ),
    ).toBeTruthy();
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));

    await user.click(toggle);
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1]![0].patch).toEqual({ availableForTakeaway: true });
  });

  it('says it could not change a dish', async () => {
    const user = userEvent.setup();
    const gateway = gatewayWithTakeaway();
    vi.spyOn(gateway, 'updateMenuItem').mockRejectedValue(new Error('down'));
    renderAt('menu', <MenuEditorScreen />, NORTH, gateway);

    const row = (
      await screen.findByText('Cappuccino', { selector: '.yc-dn' }, { timeout: 5000 })
    ).closest('tr')!;
    await user.click(await within(row).findByRole('switch', { name: 'Cappuccino: for takeaway' }));
    expect(await screen.findByText('Could not change that. Try again.')).toBeTruthy();
  });

  it('has no takeaway column where the branch does not take takeaway', async () => {
    renderAt('menu', <MenuEditorScreen />, CASCADE, gatewayWithTakeaway());
    await screen.findByText('Cappuccino', { selector: '.yc-dn' }, { timeout: 5000 });
    expect(screen.queryByRole('switch', { name: 'Cappuccino: for takeaway' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Takeaway' })).toBeNull();
  });
});
