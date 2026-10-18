// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  createConsoleMockGateway,
  type ConsoleGateway,
  type ConsoleUser,
  type UserRole,
} from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppRoutes as AppRoutesComponent } from '../../App';
import { createConsoleHarness, initConsoleTestI18n } from '../venue/reports/testHarness';

/**
 * The platform venues list (Venues artboard, HANDOFF section 8 step 2): search,
 * a status filter with deleted venues hidden by default, a tier filter,
 * sortable columns, the tier button with its confirm, the ⋮ menu on arrow
 * keys, the three-step create, and an undo on everything destructive.
 *
 * Against the real console mock, whose demo world is the artboard's: Mountain
 * View is refused Paid, Sunset Lounge may go Paid, Cascade Cafe's open tabs
 * block its delete.
 */

let AppRoutes: typeof AppRoutesComponent;

beforeAll(async () => {
  vi.stubEnv('VITE_DATA_SOURCE', 'mock');
  await initConsoleTestI18n();
  ({ AppRoutes } = await import('../../App'));
});

afterEach(cleanup);

const ADMIN: ConsoleUser = {
  id: 'u-platform',
  displayName: 'Grigor Avagyan',
  role: 'platformAdmin',
  scope: { venueId: null, branchIds: [] },
};

function renderList(path = '/platform/venues', gateway?: ConsoleGateway) {
  const harness = createConsoleHarness({
    gateway:
      gateway ?? createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' as UserRole }),
  });
  render(harness.wrap(<AppRoutes user={ADMIN} />, path));
  return harness;
}

async function loaded() {
  await screen.findByRole('link', { name: 'Sunset Lounge' }, { timeout: 5000 });
}

const rowOf = (name: string) => screen.getByRole('link', { name }).closest('tr')!;
const names = () =>
  within(screen.getByRole('table'))
    .queryAllByRole('link')
    .map((link) => link.textContent);

describe('the venues list', () => {
  it('lists the venues, deleted ones hidden and counted', async () => {
    renderList();
    await loaded();

    expect(screen.getByRole('heading', { level: 1, name: 'Venues' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Old Town Pub' })).toBeNull();
    expect(screen.getByText(/15 venues · 1 deleted/u)).toBeTruthy();
    expect(screen.getByText(/deleted ones are hidden/u)).toBeTruthy();

    const mountain = rowOf('Mountain View');
    // The readiness line, amber and named for its branch; the tier summary.
    expect(within(mountain).getByText('4 dishes unfinished · Նոր Նորք')).toBeTruthy();
    expect(within(rowOf('Yalla Demo Cafe')).getByText('Mixed · 1/2')).toBeTruthy();
    expect(within(rowOf('Cascade Cafe')).getByText('Paid')).toBeTruthy();
    expect(within(rowOf('Garden Bistro')).getByText('Suspended')).toBeTruthy();
  });

  it('shows the deleted ones under their own filter, and everything under All', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();

    await user.selectOptions(screen.getByLabelText('Status'), 'deleted');
    expect(names()).toEqual(['Old Town Pub']);
    // A deleted venue's tier is a word, not a button: there is nothing to change.
    expect(within(rowOf('Old Town Pub')).queryByRole('button', { name: /plan/u })).toBeNull();

    await user.selectOptions(screen.getByLabelText('Status'), 'all');
    expect(names()).toContain('Old Town Pub');
    expect(names()).toContain('Sunset Lounge');
  });

  it('filters by the tier summary, mixed venues included', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();

    await user.selectOptions(screen.getByLabelText('Plan'), 'mixed');
    expect(names()).toContain('Yalla Demo Cafe');
    expect(names()).not.toContain('Sunset Lounge');
    expect(names()).not.toContain('Cascade Cafe');

    await user.selectOptions(screen.getByLabelText('Plan'), 'free');
    expect(names()).toContain('Sunset Lounge');
    expect(names()).not.toContain('Yalla Demo Cafe');
  });

  it('searches the name, the web address and the district', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();

    await user.type(screen.getByLabelText('Search'), 'mount');
    expect(names()).toEqual(['Mountain View']);
    await user.clear(screen.getByLabelText('Search'));
    await user.type(screen.getByLabelText('Search'), 'Քանաքեռ');
    expect(names()).toEqual(['Mountain View']);
    await user.clear(screen.getByLabelText('Search'));
    await user.type(screen.getByLabelText('Search'), 'riverside-rest');
    expect(names()).toEqual(['Riverside Restaurant']);
  });

  it('says when nothing matches, and clears the filters in one press', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();

    await user.type(screen.getByLabelText('Search'), 'zzzz');
    expect(screen.getByRole('heading', { name: 'No venue matches that search' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('');
    expect(names()).toContain('Sunset Lounge');
  });

  it('sorts by name, rating and tables, and says which way in aria-sort', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();

    const header = (name: string) => screen.getByRole('button', { name }).closest('th')!;
    expect(header('Venue').getAttribute('aria-sort')).toBe('ascending');
    expect(header('Rating').getAttribute('aria-sort')).toBe('none');

    await user.click(screen.getByRole('button', { name: 'Rating' }));
    expect(header('Rating').getAttribute('aria-sort')).toBe('descending');
    expect(header('Venue').getAttribute('aria-sort')).toBe('none');
    expect(names()[0]).toBe('Riverside Restaurant');
    // No rating yet sorts after every rating, whichever way.
    expect(names().at(-1)).not.toBe('Riverside Restaurant');

    await user.click(screen.getByRole('button', { name: 'Tables' }));
    // Three branches' tables together.
    expect(names()[0]).toBe('Lumen Coffee');
    await user.click(screen.getByRole('button', { name: 'Tables' }));
    expect(header('Tables').getAttribute('aria-sort')).toBe('ascending');
  });
});

describe('the tier button', () => {
  it('refuses Mountain View before anything is sent, naming the branch', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const setTier = vi.spyOn(gateway, 'setBranchTier');
    renderList('/platform/venues', gateway);
    await loaded();

    await user.click(within(rowOf('Mountain View')).getByRole('button', { name: /plan, press/u }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Mountain View cannot go paid yet',
    });
    expect(
      within(dialog).getByText('Նոր Նորք: 4 dishes are not ready to show a guest'),
    ).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Make paid' })).toBeNull();
    expect(setTier).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(
      within(rowOf('Mountain View')).getByRole('button', { name: /plan, press/u }),
    );
  });

  it('moves Sunset Lounge to Paid after a confirm that says what changes', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();

    await user.click(within(rowOf('Sunset Lounge')).getByRole('button', { name: /plan, press/u }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Make Sunset Lounge paid?' });
    expect(within(dialog).getByText(/at every branch of the venue/u)).toBeTruthy();
    expect(within(dialog).getByText(/order from their phones/u)).toBeTruthy();
    // The safe choice holds the focus.
    await waitFor(() =>
      expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' })),
    );

    await user.click(await within(dialog).findByRole('button', { name: 'Make paid' }));
    expect(await screen.findByText('Sunset Lounge is now on the Paid plan')).toBeTruthy();
    await waitFor(() => expect(within(rowOf('Sunset Lounge')).getByText('Paid')).toBeTruthy());
  });

  it('finishes a mixed venue: every branch to the plan chosen', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();

    await user.click(
      within(rowOf('Yalla Demo Cafe')).getByRole('button', { name: /plan, press/u }),
    );
    const dialog = await screen.findByRole('alertdialog', { name: "Yalla Demo Cafe's plan" });
    expect(within(dialog).getByRole('radio', { name: 'Paid' })).toBeTruthy();
    await user.click(await within(dialog).findByRole('button', { name: 'Make paid' }));
    await waitFor(() => expect(within(rowOf('Yalla Demo Cafe')).getByText('Paid')).toBeTruthy());
  });

  it("says the server's refusal going Free: Cascade Cafe's tabs are open", async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();

    await user.click(within(rowOf('Cascade Cafe')).getByRole('button', { name: /plan, press/u }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Make Cascade Cafe free?' });
    await user.click(within(dialog).getByRole('button', { name: 'Make free' }));
    expect(
      await screen.findByRole('alertdialog', { name: 'Cascade Cafe cannot go free yet' }),
    ).toBeTruthy();
    expect(screen.getByText(/Կենտրոն: Tabs are open/u)).toBeTruthy();
    expect(within(rowOf('Cascade Cafe')).getByText('Paid')).toBeTruthy();
  });
});

describe('the ⋮ menu', () => {
  it('opens on the first item, moves on the arrow keys, and closes on Escape', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();

    const kebab = within(rowOf('Sunset Lounge')).getByRole('button', {
      name: 'Actions for Sunset Lounge',
    });
    expect(kebab.getAttribute('aria-haspopup')).toBe('menu');
    await user.click(kebab);
    expect(kebab.getAttribute('aria-expanded')).toBe('true');

    const menu = screen.getByRole('menu', { name: 'Actions for Sunset Lounge' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Make paid', 'Suspend', 'Delete']);
    expect(document.activeElement).toBe(items[0]);

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[1]);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(items[2]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(items[2]);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(items[0]);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(kebab);
  });

  it('suspends at once, with an undo that brings it back', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();

    await user.click(
      within(rowOf('Sunset Lounge')).getByRole('button', { name: 'Actions for Sunset Lounge' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Suspend' }));
    expect(await screen.findByText('Sunset Lounge was suspended')).toBeTruthy();
    await waitFor(() => expect(within(rowOf('Sunset Lounge')).getByText('Suspended')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Sunset Lounge is active again')).toBeTruthy();
    await waitFor(() => expect(within(rowOf('Sunset Lounge')).getByText('Active')).toBeTruthy());
  });

  it('restores a deleted venue from the Deleted filter', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();

    await user.selectOptions(screen.getByLabelText('Status'), 'deleted');
    await user.click(
      within(rowOf('Old Town Pub')).getByRole('button', { name: 'Actions for Old Town Pub' }),
    );
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Restore']);
    await user.click(items[0]!);
    expect(await screen.findByText('Old Town Pub was restored')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Status'), 'live');
    await waitFor(() => expect(names()).toContain('Old Town Pub'));
  });
});

describe('deleting a venue', () => {
  it('asks for the name typed exactly, then deletes with an undo that takes the focus', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();

    await user.click(
      within(rowOf('Sunset Lounge')).getByRole('button', { name: 'Actions for Sunset Lounge' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Sunset Lounge?' });
    const field = within(dialog).getByLabelText('Type Sunset Lounge to confirm');
    const confirm = within(dialog).getByRole('button', { name: 'Delete' });
    expect(document.activeElement).toBe(field);
    expect(confirm.getAttribute('aria-disabled')).toBe('true');

    await user.type(field, 'sunset lounge');
    expect(within(dialog).getByText('The name does not match yet')).toBeTruthy();
    await user.click(confirm);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(document.activeElement).toBe(field);

    await user.clear(field);
    await user.type(field, 'Sunset Lounge');
    expect(confirm.getAttribute('aria-disabled')).toBe('false');
    await user.click(confirm);

    expect(await screen.findByText('Sunset Lounge was deleted')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Sunset Lounge' })).toBeNull();
    const undo = screen.getByRole('button', { name: 'Undo' });
    await waitFor(() => expect(document.activeElement).toBe(undo));

    await user.click(undo);
    expect(await screen.findByText('Sunset Lounge is back')).toBeTruthy();
    await screen.findByRole('link', { name: 'Sunset Lounge' });
  });

  it('is refused while tabs are open, and offers to suspend instead', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();

    await user.click(
      within(rowOf('Cascade Cafe')).getByRole('button', { name: 'Actions for Cascade Cafe' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Cascade Cafe?' });
    await user.type(within(dialog).getByLabelText('Type Cascade Cafe to confirm'), 'Cascade Cafe');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    const blocked = await screen.findByRole('alertdialog', {
      name: 'Cascade Cafe is still in use',
    });
    expect(within(blocked).getByText('Tables with an open tab · 15')).toBeTruthy();
    expect(within(blocked).getByText('Table 7')).toBeTruthy();
    expect(within(blocked).getByText('+12')).toBeTruthy();

    await user.click(within(blocked).getByRole('button', { name: 'Suspend instead' }));
    expect(await screen.findByText('Cascade Cafe was suspended instead of deleted')).toBeTruthy();
    await waitFor(() => expect(within(rowOf('Cascade Cafe')).getByText('Suspended')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
  });
});

describe('adding a venue', () => {
  it('walks three steps, with errors under the fields and the focus on the first', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();

    await user.click(screen.getByRole('button', { name: 'Add a venue' }));
    const dialog = screen.getByRole('dialog', { name: 'New venue' });
    expect(within(dialog).getByText('Step 1 of 3')).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: 'Continue →' }));
    const name = within(dialog).getByLabelText(/Venue's name/u);
    expect(within(dialog).getByText('Give the venue a name')).toBeTruthy();
    expect(within(dialog).getByText('Give it a web address')).toBeTruthy();
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(name);
    // The error is the field's description.
    expect(name.getAttribute('aria-describedby')).toContain(
      within(dialog).getByText('Give the venue a name').id,
    );

    await user.type(name, 'Ani Garden');
    expect((within(dialog).getByLabelText(/^Web address/u) as HTMLInputElement).value).toBe(
      'ani-garden',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Continue →' }));
    expect(within(dialog).getByText('Step 2 of 3')).toBeTruthy();

    await user.type(within(dialog).getByLabelText(/Branch's name/u), 'Հյուսիս');
    await user.click(within(dialog).getByRole('button', { name: 'Continue →' }));
    expect(within(dialog).getByText(/does not make one by itself/u)).toBeTruthy();
    expect(within(dialog).getByText("Write the branch's street address")).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByLabelText(/Branch's web address/u));

    await user.type(within(dialog).getByLabelText(/Branch's web address/u), 'north');
    await user.type(within(dialog).getByLabelText(/^Address/u), '12 Abovyan Street');
    await user.type(within(dialog).getByLabelText(/^Latitude/u), '40.18');
    await user.type(within(dialog).getByLabelText(/^Longitude/u), '200');
    await user.click(within(dialog).getByRole('button', { name: 'Continue →' }));
    expect(within(dialog).getByText(/That is not a real place/u)).toBeTruthy();
    await user.clear(within(dialog).getByLabelText(/^Longitude/u));
    await user.type(within(dialog).getByLabelText(/^Longitude/u), '44.51');
    await user.click(within(dialog).getByRole('button', { name: 'Continue →' }));
    expect(within(dialog).getByText('Step 3 of 3')).toBeTruthy();

    // Back keeps what was typed.
    await user.click(within(dialog).getByRole('button', { name: '← Back' }));
    expect((within(dialog).getByLabelText(/Branch's web address/u) as HTMLInputElement).value).toBe(
      'north',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Continue →' }));

    await user.type(within(dialog).getByLabelText(/^Full name/u), 'Ani Petrosyan');
    await user.type(within(dialog).getByLabelText(/^Phone/u), '+37491000000');
    await user.type(within(dialog).getByLabelText(/^Email/u), 'owner@anigarden.am');
    await user.click(within(dialog).getByRole('button', { name: 'Create and get the link' }));

    const once = await screen.findByRole('dialog', { name: 'Ani Garden was created' });
    expect((within(once).getByLabelText('Sign-in link') as HTMLInputElement).value).toMatch(
      /reset-password/u,
    );
    expect(within(once).getByText(/^\d{4}$/u)).toBeTruthy();

    // Closing without copying warns once; the second Done closes.
    await user.click(within(once).getByRole('button', { name: 'Done' }));
    expect(within(once).getByRole('alert').textContent).toMatch(/Copy the link first/u);
    await user.click(within(once).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('Ani Garden was added to the list')).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'Ani Garden' })).toBeTruthy();
  });

  it('creates a venue with no owner, and says where to add one', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();

    await user.click(screen.getByRole('button', { name: 'Add a venue' }));
    const dialog = screen.getByRole('dialog', { name: 'New venue' });
    await user.type(within(dialog).getByLabelText(/Venue's name/u), 'Kond Bakery');
    await user.click(within(dialog).getByRole('button', { name: 'Continue →' }));
    await user.type(within(dialog).getByLabelText(/Branch's name/u), 'Kond');
    await user.type(within(dialog).getByLabelText(/^Address/u), '3 Paronyan Street');
    await user.type(within(dialog).getByLabelText(/^Latitude/u), '40.18');
    await user.type(within(dialog).getByLabelText(/^Longitude/u), '44.50');
    await user.click(within(dialog).getByRole('button', { name: 'Continue →' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create the venue' }));

    expect(
      await screen.findByText(/Kond Bakery was created · you can give the owner/u),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('link', { name: 'Kond Bakery' })).toBeTruthy();
  });

  it('refuses a web address another venue has, before anything is sent', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const create = vi.spyOn(gateway, 'createVenue');
    renderList('/platform/venues', gateway);
    await loaded();

    await user.click(screen.getByRole('button', { name: 'Add a venue' }));
    const dialog = screen.getByRole('dialog', { name: 'New venue' });
    await user.type(within(dialog).getByLabelText(/Venue's name/u), 'Cascade Cafe');
    await user.click(within(dialog).getByRole('button', { name: 'Continue →' }));
    expect(within(dialog).getByText('"cascade-cafe" is taken. Choose another.')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it('opens from its old address', async () => {
    renderList('/platform/venues/new');
    expect(await screen.findByRole('dialog', { name: 'New venue' })).toBeTruthy();
  });
});
