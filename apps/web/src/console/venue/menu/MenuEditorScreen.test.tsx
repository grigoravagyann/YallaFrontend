// @vitest-environment jsdom
import { createConsoleMockGateway, type ConsoleGateway } from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../ui/toast';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { MenuEditorScreen } from './MenuEditorScreen';

/**
 * The menu (Menu artboard) against the console mock.
 *
 * Categories are named in a dialog of the console's own — they were named
 * through `window.prompt()`, which kiosk browsers refuse — dishes are edited
 * in a drawer that saves a half-entered dish as a draft, and every delete has
 * an undo.
 */

vi.mock('./BulkPhotoDrop', () => ({ BulkPhotoDrop: () => null }));

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

function renderMenu(gateway?: ConsoleGateway) {
  const harness = createConsoleHarness({
    gateway: gateway ?? createConsoleMockGateway({ latencyMs: 0, role: 'owner' }),
  });
  const context = {
    branchId: 'b-lumen-cascade',
    branchName: 'Cascade',
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
            <Route path="menu" element={<MenuEditorScreen />} />
          </Route>
        </Routes>
      </ToastProvider>,
      '/venue/menu',
    ),
  );
  return harness;
}

/** The seeded first category's row; its name also heads the dish table. */
async function waitForCategories() {
  await screen.findByRole('button', { name: /^coffee(?!:)/i }, { timeout: 5000 });
}

const rowOfDish = (name: string) => screen.getByText(name, { selector: '.yc-dn' }).closest('tr')!;

describe('naming a category', () => {
  it('adds one through a dialog, never through window.prompt', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const create = vi.spyOn(gateway, 'createCategory');
    const prompt = vi.fn(() => 'from the prompt');
    vi.stubGlobal('prompt', prompt);
    const user = userEvent.setup();
    renderMenu(gateway);
    await waitForCategories();

    await user.click(screen.getByRole('button', { name: /add a category/i }));
    const dialog = screen.getByRole('dialog', { name: /new category/i });
    await user.type(within(dialog).getByLabelText(/category name/i), '  Desserts ');
    await user.click(within(dialog).getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]![0]).toMatchObject({ name: 'Desserts' });
    expect(prompt).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByRole('button', { name: /^desserts(?!:)/i })).toBeTruthy();
    expect(await screen.findByText('“Desserts” added')).toBeTruthy();
  });

  it('renames the open one with its name filled in, and Cancel changes nothing', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const update = vi.spyOn(gateway, 'updateCategory');
    const user = userEvent.setup();
    renderMenu(gateway);
    await waitForCategories();

    await user.click(screen.getByRole('button', { name: /^rename$/i }));
    const dialog = screen.getByRole('dialog', { name: /rename/i });
    const field = within(dialog).getByLabelText(/category name/i) as HTMLInputElement;
    expect(field.value).toBe('Coffee');

    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(update).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^rename$/i }));
    const again = screen.getByRole('dialog', { name: /rename/i });
    await user.clear(within(again).getByLabelText(/category name/i));
    await user.type(within(again).getByLabelText(/category name/i), 'Hot drinks');
    await user.click(within(again).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]![0]).toMatchObject({ name: 'Hot drinks' });
    expect(await screen.findByRole('button', { name: /^hot drinks(?!:)/i })).toBeTruthy();
  });

  it('refuses a blank name without a round trip, saying so under the field', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const create = vi.spyOn(gateway, 'createCategory');
    const user = userEvent.setup();
    renderMenu(gateway);
    await waitForCategories();

    await user.click(screen.getByRole('button', { name: /add a category/i }));
    const dialog = screen.getByRole('dialog', { name: /new category/i });
    const field = within(dialog).getByLabelText(/category name/i);
    await user.type(field, '   ');
    await user.click(within(dialog).getByRole('button', { name: /^add$/i }));

    expect(within(dialog).getByText('Give the category a name')).toBeTruthy();
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('the dish table', () => {
  it('sits inside a container that scrolls sideways, so a wide table never moves the page', async () => {
    renderMenu();
    await waitForCategories();
    const table = await screen.findByRole('table');
    expect(table.parentElement?.classList.contains('yc-tscroll')).toBe(true);
  });

  it('searches every category, not only the open one', async () => {
    const user = userEvent.setup();
    renderMenu();
    await waitForCategories();
    expect(screen.queryByText('Napoleon slice')).toBeNull();

    await user.type(screen.getByLabelText('Search dishes'), 'napoleon');

    expect(screen.getByRole('heading', { name: 'Search results' })).toBeTruthy();
    expect(screen.getByText('Napoleon slice')).toBeTruthy();
    expect(screen.getByText('1 dish from every category')).toBeTruthy();
    // No reordering while the list is not one category's.
    expect(screen.queryByRole('button', { name: 'Napoleon slice: up' })).toBeNull();
  });

  it('marks a dish sold out from its row, and says what that means', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const set = vi.spyOn(gateway, 'setMenuItemAvailability');
    const user = userEvent.setup();
    renderMenu(gateway);
    await waitForCategories();

    const toggle = within(rowOfDish('Americano')).getByRole('switch', {
      name: 'Americano: in stock',
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await user.click(toggle);

    await waitFor(() => expect(set).toHaveBeenCalledTimes(1));
    expect(set.mock.calls[0]![0]).toMatchObject({ isAvailable: false });
    expect(
      await screen.findByText('“Americano” marked sold out: guests cannot order it'),
    ).toBeTruthy();
    await waitFor(() =>
      expect(within(rowOfDish('Americano')).getByRole('switch').getAttribute('aria-checked')).toBe(
        'false',
      ),
    );
  });

  it('moves a category a step with its arrow, sending the whole order in one call', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const reorder = vi.spyOn(gateway, 'reorderMenuCategories');
    const update = vi.spyOn(gateway, 'updateCategory');
    const user = userEvent.setup();
    renderMenu(gateway);
    await waitForCategories();
    const before = [...document.querySelectorAll('.yc-cat b')].map((b) => b.textContent);

    expect(screen.getByRole('button', { name: 'Coffee: up' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Coffee: down' }));

    await waitFor(() => expect(reorder).toHaveBeenCalledTimes(1));
    expect(reorder.mock.calls[0]![0].categoryIds).toHaveLength(before.length);
    expect(update).not.toHaveBeenCalled();
    expect(await screen.findByText('Category order saved')).toBeTruthy();
    await waitFor(() => {
      const names = [...document.querySelectorAll('.yc-cat b')].map((b) => b.textContent);
      expect(names).toEqual([before[1], before[0], ...before.slice(2)]);
    });
  });

  it("moves a dish a step within its category, the category's whole order in one call", async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const reorder = vi.spyOn(gateway, 'reorderMenuItems');
    const user = userEvent.setup();
    renderMenu(gateway);
    await waitForCategories();

    await user.click(screen.getByRole('button', { name: 'Americano: up' }));

    await waitFor(() => expect(reorder).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const names = [...document.querySelectorAll('.yc-dn')].map((cell) => cell.textContent);
      expect(names.indexOf('Americano')).toBe(0);
    });
  });
});

describe('the dish drawer', () => {
  it('saves a dish with only a name and a price as a draft, hidden from guests', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const create = vi.spyOn(gateway, 'createMenuItem');
    const user = userEvent.setup();
    renderMenu(gateway);
    await waitForCategories();

    await user.click(screen.getByRole('button', { name: /add a dish/i }));
    const drawer = screen.getByRole('dialog', { name: 'New dish' });
    expect(within(drawer).getByRole('status').textContent).toMatch(/fill in 6 fields/i);
    await user.type(within(drawer).getByLabelText(/^name/i), 'Doppio');
    await user.type(within(drawer).getByLabelText(/^price/i), '9x00');
    await user.click(within(drawer).getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]![0].item).toMatchObject({
      name: 'Doppio',
      priceDram: 900,
      photoId: null,
      prepMinutes: null,
    });
    expect(
      await screen.findByText('“Doppio” saved, but hidden from guests until you fill in 6 fields'),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('will not save without a name, and puts the focus on it', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const create = vi.spyOn(gateway, 'createMenuItem');
    const user = userEvent.setup();
    renderMenu(gateway);
    await waitForCategories();

    await user.click(screen.getByRole('button', { name: /add a dish/i }));
    const drawer = screen.getByRole('dialog', { name: 'New dish' });
    await user.type(within(drawer).getByLabelText(/^price/i), '900');
    await user.click(within(drawer).getByRole('button', { name: 'Save draft' }));

    const name = within(drawer).getByLabelText(/^name/i);
    expect(within(drawer).getByText("Write the dish's name")).toBeTruthy();
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(name);
    expect(create).not.toHaveBeenCalled();
  });

  it('answers "no allergens", which finishes that field', async () => {
    const user = userEvent.setup();
    renderMenu();
    await waitForCategories();

    await user.click(screen.getByRole('button', { name: /add a dish/i }));
    const drawer = screen.getByRole('dialog', { name: 'New dish' });
    expect(within(drawer).getByRole('status').textContent).toMatch(/allergens/i);
    await user.click(within(drawer).getByLabelText('No allergens'));
    expect(within(drawer).getByRole('status').textContent).not.toMatch(/allergens/i);
    expect(within(drawer).getByRole('status').textContent).toMatch(/fill in 5 fields/i);
  });

  it('deletes a dish with an undo that puts it back', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const remove = vi.spyOn(gateway, 'deleteMenuItem');
    const create = vi.spyOn(gateway, 'createMenuItem');
    const user = userEvent.setup();
    renderMenu(gateway);
    await waitForCategories();

    await user.click(within(rowOfDish('Americano')).getByRole('button', { name: /^edit$/i }));
    const drawer = screen.getByRole('dialog', { name: 'Edit: Americano' });
    await user.click(within(drawer).getByRole('button', { name: /^delete$/i }));

    const confirm = screen.getByRole('alertdialog', { name: 'Delete “Americano”?' });
    await user.click(within(confirm).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('“Americano” deleted')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Americano', { selector: '.yc-dn' })).toBeNull());

    await user.click(screen.getByRole('button', { name: /undo/i }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]![0].item).toMatchObject({ name: 'Americano', priceDram: 900 });
    expect(await screen.findByText('Americano', { selector: '.yc-dn' })).toBeTruthy();
  });

  it('goes back to the drawer, edits kept, when the delete is cancelled', async () => {
    const user = userEvent.setup();
    renderMenu();
    await waitForCategories();

    await user.click(within(rowOfDish('Americano')).getByRole('button', { name: /^edit$/i }));
    const drawer = screen.getByRole('dialog', { name: 'Edit: Americano' });
    await user.type(within(drawer).getByLabelText(/^name/i), ' large');
    await user.click(within(drawer).getByRole('button', { name: /^delete$/i }));
    await user.keyboard('{Escape}');

    const back = screen.getByRole('dialog', { name: 'Edit: Americano' });
    expect((within(back).getByLabelText(/^name/i) as HTMLInputElement).value).toBe(
      'Americano large',
    );
  });
});

describe('deleting a category', () => {
  it('says so in the dialog when one of its dishes is on an order, and deletes nothing', async () => {
    const user = userEvent.setup();
    renderMenu();
    await waitForCategories();

    await user.click(screen.getByRole('button', { name: /^pastry(?!:)/i }));
    await user.click(screen.getByRole('button', { name: 'Delete category' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Delete “Pastry”?' });
    expect(confirm.textContent).toMatch(/its 4 dishes go with it/i);
    await user.click(within(confirm).getByRole('button', { name: /^delete$/i }));

    expect((await within(confirm).findByRole('alert')).textContent).toMatch(/already on an order/i);
    expect(screen.getByRole('button', { name: /^pastry(?!:)/i })).toBeTruthy();
  });
});
