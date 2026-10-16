// @vitest-environment jsdom
import { createConsoleMockGateway, type ConsoleGateway } from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { MenuEditorScreen } from './MenuEditorScreen';

/**
 * Categories are named in a dialog of the console's own.
 *
 * They were named through `window.prompt()`, which embedded webviews and some
 * kiosk browsers refuse: the click then threw and did nothing visible, and the
 * person entering eighty dishes in an afternoon was left clicking "Add a
 * category" with no idea why nothing happened.
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
    timeZoneId: 'Asia/Yerevan',
    branchCount: 3,
    canRollUpVenue: true,
    canRelocate: true,
  };
  render(
    harness.wrap(
      <Routes>
        <Route path="/venue" element={<Outlet context={context} />}>
          <Route path="menu" element={<MenuEditorScreen />} />
        </Route>
      </Routes>,
      '/venue/menu',
    ),
  );
  return harness;
}

/** The seeded first category's row; its name also heads the dish table. */
async function waitForCategories() {
  await screen.findByRole('button', { name: /^coffee/i }, { timeout: 5000 });
}

const rowOf = (name: RegExp) => screen.getByRole('button', { name }).closest('li')!;

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
    expect(await screen.findByRole('button', { name: /^desserts/i })).toBeTruthy();
  });

  it('renames one with the current name filled in, and Cancel changes nothing', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const update = vi.spyOn(gateway, 'updateCategory');
    const user = userEvent.setup();
    renderMenu(gateway);
    await waitForCategories();

    const row = rowOf(/^coffee/i);
    await user.click(within(row).getByRole('button', { name: /^edit$/i }));
    const dialog = screen.getByRole('dialog', { name: /rename/i });
    const field = within(dialog).getByLabelText(/category name/i) as HTMLInputElement;
    expect(field.value).toBe('Coffee');

    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(update).not.toHaveBeenCalled();

    await user.click(within(row).getByRole('button', { name: /^edit$/i }));
    const again = screen.getByRole('dialog', { name: /rename/i });
    await user.clear(within(again).getByLabelText(/category name/i));
    await user.type(within(again).getByLabelText(/category name/i), 'Hot drinks');
    await user.click(within(again).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]![0]).toMatchObject({ name: 'Hot drinks' });
    expect(await screen.findByRole('button', { name: /^hot drinks/i })).toBeTruthy();
  });

  it('refuses a blank name without a round trip', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const create = vi.spyOn(gateway, 'createCategory');
    const user = userEvent.setup();
    renderMenu(gateway);
    await waitForCategories();

    await user.click(screen.getByRole('button', { name: /add a category/i }));
    const dialog = screen.getByRole('dialog', { name: /new category/i });
    await user.type(within(dialog).getByLabelText(/category name/i), '   ');
    await user.click(within(dialog).getByRole('button', { name: /^add$/i }));

    expect(within(dialog).getByRole('alert').textContent).toMatch(/name/i);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('the dish table', () => {
  it('sits inside a container that scrolls sideways, so a wide table never moves the page', async () => {
    renderMenu();
    await waitForCategories();
    const table = await screen.findByRole('table');
    expect(table.parentElement?.classList.contains('table-scroll')).toBe(true);
  });
});
