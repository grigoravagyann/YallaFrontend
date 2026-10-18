// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  ConcurrencyConflictError,
  StaffPinTakenError,
  createConsoleMockGateway,
  type ConsoleGateway,
  type ConsoleUser,
} from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppRoutes as AppRoutesComponent } from '../../App';
import { createConsoleHarness, initConsoleTestI18n } from '../venue/reports/testHarness';

/**
 * One venue, for the platform admin (VenueDetail artboard; HANDOFF section 8
 * step 3): the suspended banner, edit, suspend and delete, the tabs Overview /
 * Staff / Bookings on a roving tabindex, the branch table with each branch's
 * own plan, adding a branch, the four-step add-staff wizard with its sign-in
 * shown once, and the bookings as aggregates only.
 *
 * Against the real console mock: Lumen Coffee has staff, Mountain View has a
 * branch whose menu refuses Paid, Cascade Cafe's open tabs block its delete.
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

function renderVenue(venueId = 'v-lumen', gateway?: ConsoleGateway, query = '') {
  const harness = createConsoleHarness({
    gateway: gateway ?? createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' }),
  });
  render(harness.wrap(<AppRoutes user={ADMIN} />, `/platform/venues/${venueId}${query}`));
  return harness;
}

const heading = (name: string) =>
  screen.findByRole('heading', { level: 1, name }, { timeout: 5000 });
const branchRow = (name: string) =>
  within(screen.getByRole('table', { name: 'Branches' }))
    .getByText(name)
    .closest('tr')!;
const staffRow = (name: string) => screen.getByText(name).closest('tr')!;

async function openTab(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole('tab', { name }));
}

describe('the venue page', () => {
  it('heads with the venue, its state, its actions and the way back', async () => {
    renderVenue('v-cascade');
    await heading('Cascade Cafe');
    const crumbs = screen.getByRole('navigation', { name: 'You are here' });
    expect(within(crumbs).getByRole('link', { name: 'Venues' }).getAttribute('href')).toBe(
      '/platform/venues',
    );
    expect(screen.getByText('Active')).toBeTruthy();
    // In the header and again in the details card.
    expect(screen.getAllByText('yalla.am/cascade-cafe')).toHaveLength(2);
    for (const name of ['Edit', 'Suspend', 'Delete']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('says a missing venue is not found, with the way back to the list', async () => {
    renderVenue('v-nowhere');
    expect(
      await screen.findByRole('heading', { name: 'This venue was not found' }, { timeout: 5000 }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Venues list' })).toBeTruthy();
  });

  it('moves between its tabs on the arrow keys, one Tab stop for all three', async () => {
    const user = userEvent.setup();
    renderVenue();
    await heading('Lumen Coffee');

    const list = screen.getByRole('tablist', { name: 'Venue sections' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent?.replace(/\d+/u, '').trim())).toEqual([
      'Overview',
      'Staff',
      'Bookings',
    ]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');

    tabs[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /^Staff/u }));
    expect(screen.getByRole('tab', { name: /^Staff/u }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: /^Staff/u })).toBeTruthy();
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Bookings' }));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Overview' }));
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Bookings' }));
  });
});

describe('the branch table', () => {
  it('links each branch to its public page, rooms and reviews', async () => {
    renderVenue();
    await heading('Lumen Coffee');
    const row = branchRow('Northern Avenue');
    expect(within(row).getByRole('link', { name: 'Public page' }).getAttribute('href')).toBe(
      '/platform/venues/v-lumen/branches/b-lumen-north/public',
    );
    expect(within(row).getByRole('link', { name: 'Rooms' }).getAttribute('href')).toBe(
      '/platform/venues/v-lumen/branches/b-lumen-north/floorplan',
    );
    expect(within(row).getByRole('link', { name: 'Reviews' }).getAttribute('href')).toBe(
      '/platform/venues/v-lumen/branches/b-lumen-north/reviews',
    );
  });

  it("refuses the unready branch's Paid before anything is sent, naming the dishes", async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const setTier = vi.spyOn(gateway, 'setBranchTier');
    renderVenue('v-mountain', gateway);
    await heading('Mountain View');

    await user.click(within(branchRow('Նոր Նորք')).getByRole('button', { name: /plan at/u }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'The Նոր Նորք branch cannot go paid yet',
    });
    expect(within(dialog).getByText(/4 dishes are not ready/u)).toBeTruthy();
    expect(setTier).not.toHaveBeenCalled();
  });

  it('moves one branch to Paid and leaves the other alone', async () => {
    const user = userEvent.setup();
    renderVenue('v-mountain');
    await heading('Mountain View');

    await user.click(within(branchRow('Քանաքեռ')).getByRole('button', { name: /plan at/u }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Make the Քանաքեռ branch paid?',
    });
    expect(within(dialog).getByText(/at this branch only/u)).toBeTruthy();
    await user.click(await within(dialog).findByRole('button', { name: 'Make paid' }));

    expect(await screen.findByText('Քանաքեռ is now on the Paid plan')).toBeTruthy();
    await waitFor(() =>
      expect(
        within(branchRow('Քանաքեռ')).getByRole('button', { name: /^Paid plan/u }),
      ).toBeTruthy(),
    );
    expect(within(branchRow('Նոր Նորք')).getByRole('button', { name: /^Free plan/u })).toBeTruthy();
  });

  it("refuses going Free while the branch's tabs are open", async () => {
    const user = userEvent.setup();
    renderVenue('v-cascade');
    await heading('Cascade Cafe');
    await user.click(within(branchRow('Կենտրոն')).getByRole('button', { name: /plan at/u }));
    await user.click(
      within(
        await screen.findByRole('alertdialog', { name: 'Make the Կենտրոն branch free?' }),
      ).getByRole('button', { name: 'Make free' }),
    );
    expect(
      await screen.findByRole('alertdialog', { name: 'The Կենտրոն branch cannot go free yet' }),
    ).toBeTruthy();
  });

  it('adds a branch, with errors under the fields first', async () => {
    const user = userEvent.setup();
    renderVenue();
    await heading('Lumen Coffee');

    await user.click(screen.getByRole('button', { name: 'Add a branch' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a branch' });
    await user.type(within(dialog).getByLabelText(/^Name/u), 'Կոնդ');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    const slug = within(dialog).getByLabelText(/^Web address/u);
    expect(within(dialog).getByText(/does not make one by itself/u)).toBeTruthy();
    expect(within(dialog).getByText('Write the street address')).toBeTruthy();
    expect(document.activeElement).toBe(slug);
    expect(slug.getAttribute('aria-invalid')).toBe('true');

    await user.type(slug, 'kond');
    await user.type(within(dialog).getByLabelText(/^Address/u), '3 Paronyan Street');
    await user.type(within(dialog).getByLabelText(/^Latitude/u), '40.18');
    await user.type(within(dialog).getByLabelText(/^Longitude/u), '44.50');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Branch Կոնդ was added')).toBeTruthy();
    await waitFor(() => expect(branchRow('Կոնդ')).toBeTruthy());
    expect(within(branchRow('Կոնդ')).getByText('No rooms or menu yet')).toBeTruthy();
  });
});

describe('the overview', () => {
  it('says what is not ready yet, amber, and counts what is', async () => {
    renderVenue('v-mountain');
    await heading('Mountain View');
    const card = screen.getByRole('region', { name: 'Readiness' });
    expect(await within(card).findByText('4 dishes unfinished')).toBeTruthy();
    expect(within(card).getByText(/\d \/ 5/u)).toBeTruthy();
  });

  it('shows the bookings of the last 30 days and how many wait for approval', async () => {
    renderVenue('v-cascade');
    await heading('Cascade Cafe');
    const kpi = screen.getByText('Bookings in 30 days').closest('.yc-kpi')!;
    await waitFor(() =>
      expect(within(kpi as HTMLElement).getByText(/waiting for approval/u)).toBeTruthy(),
    );
  });
});

describe('suspending and resuming', () => {
  it('suspends after a confirm, shows the banner, and undoes from the toast', async () => {
    const user = userEvent.setup();
    renderVenue('v-luna');
    await heading('Luna Cafe');

    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Suspend Luna Cafe?' });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));

    expect(await screen.findByText('Luna Cafe was suspended')).toBeTruthy();
    const resume = await screen.findByRole('button', { name: 'Resume' });
    expect(screen.getByText(/Guests do not see the venue/u)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(resume));

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull());
    expect(await screen.findByText('Luna Cafe is active again')).toBeTruthy();
  });

  it('resumes from the banner of a suspended venue', async () => {
    const user = userEvent.setup();
    renderVenue('v-garden');
    await heading('Garden Bistro');
    await user.click(await screen.findByRole('button', { name: 'Resume' }));
    expect(await screen.findByText('Garden Bistro is active again')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Suspend' })).toBeTruthy());
  });
});

describe('editing the venue', () => {
  it('saves a new name, warns before the web address moves, and undoes', async () => {
    const user = userEvent.setup();
    renderVenue('v-luna');
    await heading('Luna Cafe');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit the venue' });
    const name = within(dialog).getByLabelText(/^Name/u);
    expect(document.activeElement).toBe(name);
    await user.clear(name);
    await user.type(name, 'Luna Caffè');
    const slug = within(dialog).getByLabelText(/^Web address/u);
    await user.clear(slug);
    await user.type(slug, 'luna-caffe');
    expect(within(dialog).getByText(/old link yalla\.am\/luna-cafe stops working/u)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await heading('Luna Caffè');
    expect(await screen.findByText('Venue saved')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await heading('Luna Cafe');
  });

  it('puts a web address another venue has under the field', async () => {
    const user = userEvent.setup();
    renderVenue('v-luna');
    await heading('Luna Cafe');
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit the venue' });
    const slug = within(dialog).getByLabelText(/^Web address/u);
    await user.clear(slug);
    await user.type(slug, 'cascade-cafe');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText('"cascade-cafe" is taken. Choose another.'),
    ).toBeTruthy();
    expect(slug.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('deleting the venue', () => {
  it('is refused while tabs are open, and suspends instead', async () => {
    const user = userEvent.setup();
    renderVenue('v-cascade');
    await heading('Cascade Cafe');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Cascade Cafe?' });
    await user.type(within(dialog).getByLabelText('Type Cascade Cafe to confirm'), 'Cascade Cafe');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    const blocked = await screen.findByRole('alertdialog', {
      name: 'Cascade Cafe is still in use',
    });
    await user.click(within(blocked).getByRole('button', { name: 'Suspend instead' }));
    expect(await screen.findByRole('button', { name: 'Resume' })).toBeTruthy();
  });

  it('goes back to the list once deleted, with an undo', async () => {
    const user = userEvent.setup();
    renderVenue('v-sunset');
    await heading('Sunset Lounge');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Sunset Lounge?' });
    await user.type(
      within(dialog).getByLabelText('Type Sunset Lounge to confirm'),
      'Sunset Lounge',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Venues' })).toBeTruthy();
    expect(await screen.findByText('Sunset Lounge was deleted')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
  });
});

describe('the staff tab', () => {
  it('shows every sign-in state and offers the action on each admin row', async () => {
    const user = userEvent.setup();
    renderVenue();
    await heading('Lumen Coffee');
    await openTab(user, /^Staff/u);
    await screen.findByText('Aram Sargsyan');

    const owner = staffRow('Aram Sargsyan');
    expect(within(owner).getByText('owner@lumen-coffee.am')).toBeTruthy();
    expect(within(owner).getByText('Active')).toBeTruthy();
    expect(within(owner).getByRole('button', { name: 'New link: Aram Sargsyan' })).toBeTruthy();

    const manager = staffRow('Nare Petrosyan');
    expect(within(manager).getByText('No sign-in')).toBeTruthy();
    expect(
      within(manager).getByRole('button', { name: 'Give sign-in: Nare Petrosyan' }),
    ).toBeTruthy();

    const waiter = staffRow('Ani Hakobyan (Northern Avenue)');
    expect(within(waiter).queryByRole('button')).toBeNull();
    expect(within(waiter).getByText('By PIN')).toBeTruthy();
  });

  it('narrows to a branch, venue-wide people included', async () => {
    const user = userEvent.setup();
    renderVenue();
    await heading('Lumen Coffee');
    await openTab(user, /^Staff/u);
    await screen.findByText('Aram Sargsyan');
    await user.selectOptions(screen.getByLabelText('Branch'), 'b-lumen-north');
    expect(screen.getByText('Aram Sargsyan')).toBeTruthy();
    expect(screen.getByText('Nare Petrosyan')).toBeTruthy();
    expect(screen.queryByText('Tigran Avetisyan')).toBeNull();
  });

  it('gives a manager a sign-in from their row, shown once', async () => {
    const user = userEvent.setup();
    renderVenue();
    await heading('Lumen Coffee');
    await openTab(user, /^Staff/u);
    await user.click(await screen.findByRole('button', { name: 'Give sign-in: Nare Petrosyan' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign-in link: Nare Petrosyan' });
    await user.click(within(dialog).getByRole('button', { name: 'Make the link' }));
    expect(within(dialog).getByText('Write the address they will sign in with')).toBeTruthy();
    await user.type(within(dialog).getByLabelText(/^Email/u), 'nare@lumen.am');
    await user.click(within(dialog).getByRole('button', { name: 'Make the link' }));

    const once = await screen.findByRole('dialog', { name: 'Sign-in: Nare Petrosyan' });
    expect((within(once).getByLabelText('Sign-in link') as HTMLInputElement).value).toMatch(
      /token=/u,
    );
  });

  it('says what a new link does to an owner who already signs in', async () => {
    const user = userEvent.setup();
    renderVenue();
    await heading('Lumen Coffee');
    await openTab(user, /^Staff/u);
    await user.click(await screen.findByRole('button', { name: 'New link: Aram Sargsyan' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign-in link: Aram Sargsyan' });
    expect(within(dialog).getByText(/current password keeps working/u)).toBeTruthy();
    const field = within(dialog).getByLabelText(/^Email/u);
    await user.clear(field);
    await user.type(field, 'aram@lumen.am');
    expect(
      within(dialog).getByText(/sign in with aram@lumen\.am instead of owner@lumen-coffee\.am/u),
    ).toBeTruthy();
  });
});

describe('adding staff', () => {
  async function walkToStepFour(
    user: ReturnType<typeof userEvent.setup>,
    role: string,
    pin = '7315',
  ) {
    await user.click(screen.getByRole('button', { name: 'Add staff' }));
    const dialog = screen.getByRole('dialog', { name: 'New staff member' });
    await user.type(within(dialog).getByLabelText(/^Full name/u), 'Hasmik Sargsyan');
    await user.type(within(dialog).getByLabelText(/^Phone/u), '+37477999999');
    await user.click(within(dialog).getByRole('button', { name: 'Continue →' }));
    await user.click(within(dialog).getByRole('radio', { name: new RegExp(`^${role}`, 'u') }));
    await user.click(within(dialog).getByRole('button', { name: 'Continue →' }));
    await user.type(within(dialog).getByLabelText(/^Tablet PIN/u), pin);
    await user.click(within(dialog).getByRole('button', { name: 'Continue →' }));
    return dialog;
  }

  it('walks four steps and shows the PIN and the link once', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const create = vi.spyOn(gateway, 'createStaff');
    const issue = vi.spyOn(gateway, 'issueStaffSignIn');
    renderVenue('v-lumen', gateway);
    await heading('Lumen Coffee');
    await openTab(user, /^Staff/u);
    await screen.findByText('Aram Sargsyan');

    await user.click(screen.getByRole('button', { name: 'Add staff' }));
    const dialog = screen.getByRole('dialog', { name: 'New staff member' });
    expect(within(dialog).getByText('Step 1 of 4')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Continue →' }));
    const name = within(dialog).getByLabelText(/^Full name/u);
    expect(within(dialog).getByText('Write their name')).toBeTruthy();
    expect(within(dialog).getByText('Write their phone number')).toBeTruthy();
    expect(document.activeElement).toBe(name);

    await user.type(name, 'Hasmik Sargsyan');
    await user.type(within(dialog).getByLabelText(/^Phone/u), '+37477999999');
    await user.click(within(dialog).getByRole('button', { name: 'Continue →' }));

    // Owner and general manager work everywhere: no branch to pick.
    await user.click(within(dialog).getByRole('radio', { name: /^Owner/u }));
    expect(within(dialog).queryByLabelText('At which branch')).toBeNull();
    expect(within(dialog).getByText(/An owner works at every branch/u)).toBeTruthy();
    await user.click(within(dialog).getByRole('radio', { name: /^Branch manager/u }));
    expect(within(dialog).getByLabelText('At which branch')).toBeTruthy();
    await user.click(within(dialog).getByRole('radio', { name: /^Owner/u }));
    await user.click(within(dialog).getByRole('button', { name: 'Continue →' }));

    await user.click(within(dialog).getByRole('button', { name: 'Continue →' }));
    expect(within(dialog).getByText('A PIN is exactly 4 digits')).toBeTruthy();
    await user.type(within(dialog).getByLabelText(/^Tablet PIN/u), '73a15');
    expect((within(dialog).getByLabelText(/^Tablet PIN/u) as HTMLInputElement).value).toBe('7315');
    await user.click(within(dialog).getByRole('button', { name: 'Continue →' }));

    await user.type(within(dialog).getByLabelText(/^Email for the console/u), 'hasmik@lumen.am');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    // No email on the create call: the server refuses one without a password.
    expect(create.mock.calls[0]?.[0].staff).not.toHaveProperty('email');
    expect(create.mock.calls[0]?.[0].staff).toMatchObject({
      role: 'owner',
      branchId: null,
      pin: '7315',
    });

    const once = await screen.findByRole('dialog', { name: 'Sign-in: Hasmik Sargsyan' });
    expect(within(once).getByText('7315')).toBeTruthy();
    await user.click(within(once).getByRole('button', { name: 'Done' }));
    expect(within(once).getByRole('alert').textContent).toMatch(/Copy the link first/u);
    await user.click(within(once).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.textContent).not.toContain('7315');

    await waitFor(() =>
      expect(within(staffRow('Hasmik Sargsyan')).getByText('Awaiting password')).toBeTruthy(),
    );
  });

  it('adds a waiter with a PIN alone, and asks for no copy', async () => {
    const user = userEvent.setup();
    renderVenue();
    await heading('Lumen Coffee');
    await openTab(user, /^Staff/u);
    await screen.findByText('Aram Sargsyan');
    const dialog = await walkToStepFour(user, 'Waiter');
    expect(within(dialog).getByText(/works on the tablet only/u)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    const once = await screen.findByRole('dialog', { name: 'PIN: Hasmik Sargsyan' });
    expect(within(once).queryByLabelText('Sign-in link')).toBeNull();
    await user.click(within(once).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Staff member added')).toBeTruthy();
  });

  it('puts a PIN somebody already uses under the PIN field', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    vi.spyOn(gateway, 'createStaff').mockRejectedValueOnce(
      new StaffPinTakenError({
        url: 'mock://yalla',
        detail: 'Somebody who signs in on this tablet already uses that PIN. Choose another.',
        problem: {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          detail: 'Somebody who signs in on this tablet already uses that PIN. Choose another.',
          code: 'pin-taken',
          traceId: 'mock',
          context: { field: 'pin' },
        },
      }),
    );
    renderVenue('v-lumen', gateway);
    await heading('Lumen Coffee');
    await openTab(user, /^Staff/u);
    await screen.findByText('Aram Sargsyan');
    const dialog = await walkToStepFour(user, 'Waiter');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    expect(await within(dialog).findByText(/already uses that PIN/u)).toBeTruthy();
    const pin = within(dialog).getByLabelText(/^Tablet PIN/u);
    expect(pin.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(pin);
  });

  it('still shows the PIN when the link was refused, and asks for the address again', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    vi.spyOn(gateway, 'issueStaffSignIn').mockRejectedValueOnce(
      new ConcurrencyConflictError({
        url: 'mock://yalla',
        problem: {
          type: 'about:blank',
          title: 'Conflicting state',
          status: 409,
          detail: 'That email address already has an account.',
          code: 'conflicting-state',
          traceId: 'mock',
        },
      }),
    );
    renderVenue('v-lumen', gateway);
    await heading('Lumen Coffee');
    await openTab(user, /^Staff/u);
    await screen.findByText('Aram Sargsyan');
    const dialog = await walkToStepFour(user, 'Owner');
    await user.type(within(dialog).getByLabelText(/^Email for the console/u), 'taken@lumen.am');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    const once = await screen.findByRole('dialog', { name: 'PIN: Hasmik Sargsyan' });
    expect(within(once).getByText('7315')).toBeTruthy();
    expect(within(once).getByRole('alert').textContent).toMatch(/already has an account/u);
    await user.click(within(once).getByRole('button', { name: 'Try again' }));

    const issue = await screen.findByRole('dialog', { name: 'Sign-in link: Hasmik Sargsyan' });
    const field = within(issue).getByLabelText(/^Email/u) as HTMLInputElement;
    expect(field.value).toBe('taken@lumen.am');
    expect(within(issue).getByText(/already has an account/u)).toBeTruthy();
  });
});

describe('the bookings tab', () => {
  it('shows totals only: by status, by weekday and by branch, for 30 or 7 days', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const month = await gateway.getVenueBookingsSummary({ venueId: 'v-yalla-demo', days: 30 });
    const week = await gateway.getVenueBookingsSummary({ venueId: 'v-yalla-demo', days: 7 });
    renderVenue('v-yalla-demo', gateway);
    await heading('Yalla Demo Cafe');
    await openTab(user, /^Bookings/u);

    const panel = screen.getByRole('tabpanel', { name: 'Bookings' });
    expect(within(panel).getByText(/Only totals here/u)).toBeTruthy();
    expect(await within(panel).findByText(String(month.total))).toBeTruthy();
    expect(
      within(panel).getByRole('img', { name: /Bookings by day of the week: Mon \d+/u }),
    ).toBeTruthy();
    const byBranch = within(panel).getByRole('table', { name: 'By branch' });
    expect(within(byBranch).getByText('Կոմիտաս')).toBeTruthy();

    await user.selectOptions(within(panel).getByLabelText('Period'), '7');
    expect(await within(panel).findByText(String(week.total))).toBeTruthy();
  });

  it('says so when the period has no bookings', async () => {
    const user = userEvent.setup();
    renderVenue('v-sunset');
    await heading('Sunset Lounge');
    await openTab(user, /^Bookings/u);
    expect(await screen.findByText('No bookings in this period.')).toBeTruthy();
  });
});
