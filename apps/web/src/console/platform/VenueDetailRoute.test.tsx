// @vitest-environment jsdom
import { createConsoleMockGateway, type ConsoleGateway } from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { VenueDetailRoute } from './VenueDetailRoute';
import { createConsoleHarness, initConsoleTestI18n } from '../venue/reports/testHarness';

/**
 * The venue bootstrap path.
 *
 * A new venue has nobody in it, an owner cannot create another owner, and the
 * only actor above an owner is the platform admin — so this page is where the
 * first owner is made and the only place an owner's sign-in can be issued or
 * repaired. Before this, a hire here produced an owner nobody could ever sign
 * in as, and nobody could fix it afterwards.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

function renderVenue(gateway?: ConsoleGateway) {
  const harness = createConsoleHarness({
    gateway: gateway ?? createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' }),
  });
  render(
    harness.wrap(
      <Routes>
        <Route path="/platform/venues/:venueId" element={<VenueDetailRoute />} />
      </Routes>,
      '/platform/venues/v-lumen',
    ),
  );
  return harness;
}

/** Waits for the staff card's list, which arrives after the venue itself. */
async function waitForStaff() {
  await waitFor(() => expect(screen.getByText('Aram Sargsyan')).toBeTruthy(), { timeout: 5000 });
}

const rowOf = (name: string) => screen.getByText(name).closest('li')!;

describe('hiring the first owner', () => {
  it('creates the owner and issues their sign-in in one go, showing PIN and link once', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const create = vi.spyOn(gateway, 'createStaff');
    const issue = vi.spyOn(gateway, 'issueStaffSignIn');
    const user = userEvent.setup();
    renderVenue(gateway);
    await waitForStaff();

    await user.click(screen.getByRole('button', { name: /add someone/i }));
    const form = screen.getByRole('form');
    // Owner is the platform admin's default: the one hire nobody else can make.
    expect((within(form).getByLabelText(/^role$/i) as HTMLSelectElement).value).toBe('owner');

    await user.type(within(form).getByLabelText(/full name/i), 'Hasmik Sargsyan');
    await user.type(within(form).getByLabelText(/phone/i), '+37477999999');
    await user.type(within(form).getByLabelText(/^email$/i), 'hasmik@lumen.am');
    await user.type(within(form).getByLabelText(/pin/i), '7315');
    await user.click(within(form).getByRole('button', { name: /^add$/i }));

    // Two calls, one address, and no email anywhere near the create call: the
    // server refuses an email without a password there.
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0].staff).not.toHaveProperty('email');
    expect(create.mock.calls[0]?.[0].staff.role).toBe('owner');
    const created = await create.mock.results[0]!.value;
    expect(issue.mock.calls[0]?.[0]).toEqual({
      venueId: 'v-lumen',
      staffMemberId: created.id,
      email: 'hasmik@lumen.am',
    });

    const dialog = await screen.findByRole('dialog');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(within(dialog).getByText('7315')).toBeTruthy();
    const token = dialog.textContent?.match(/#token=([a-z0-9]{32})/u)?.[1];
    expect(token).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: /^done$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.textContent).not.toContain('7315');
    expect(document.body.textContent).not.toContain(token!);

    // The new owner is listed as awaiting their password, address shown.
    await waitFor(() => {
      const row = rowOf('Hasmik Sargsyan');
      expect(within(row).getByText(/awaiting password/i)).toBeTruthy();
      expect(within(row).getByText('hasmik@lumen.am')).toBeTruthy();
    });
  });

  it('still shows the PIN when the sign-in was refused, and leaves the row repairable', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const { ConcurrencyConflictError } = await import('@yalla/api');
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
    const user = userEvent.setup();
    renderVenue(gateway);
    await waitForStaff();

    await user.click(screen.getByRole('button', { name: /add someone/i }));
    const form = screen.getByRole('form');
    await user.type(within(form).getByLabelText(/full name/i), 'Hasmik Sargsyan');
    await user.type(within(form).getByLabelText(/phone/i), '+37477999999');
    await user.type(within(form).getByLabelText(/^email$/i), 'owner@lumen-coffee.am');
    await user.type(within(form).getByLabelText(/pin/i), '7315');
    await user.click(within(form).getByRole('button', { name: /^add$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('7315')).toBeTruthy();
    expect(within(dialog).getByRole('alert').textContent).toContain('already has an account');
    await user.click(within(dialog).getByRole('button', { name: /^done$/i }));

    await waitFor(() => {
      const row = rowOf('Hasmik Sargsyan');
      expect(within(row).getByText(/no sign-in/i)).toBeTruthy();
      expect(within(row).getByRole('button', { name: /issue sign-in/i })).toBeTruthy();
    });
  });
});

describe('the staff card', () => {
  it('shows every sign-in state and offers the platform admin the action on each admin row', async () => {
    renderVenue();
    await waitForStaff();

    // The seeded owner signs in already: no badge, but a new link can be sent.
    const owner = rowOf('Aram Sargsyan');
    expect(within(owner).queryByText(/no sign-in/i)).toBeNull();
    expect(within(owner).queryByText(/awaiting password/i)).toBeNull();
    expect(within(owner).getByText('owner@lumen-coffee.am')).toBeTruthy();
    expect(within(owner).getByRole('button', { name: /send new link/i })).toBeTruthy();

    // Every seeded manager has no address.
    const manager = rowOf('Nare Petrosyan');
    expect(within(manager).getByText(/no sign-in/i)).toBeTruthy();
    expect(within(manager).getByRole('button', { name: /issue sign-in/i })).toBeTruthy();

    // A waiter never signs in here: no badge, no action.
    const waiter = rowOf('Ani Hakobyan (Northern Avenue)');
    expect(within(waiter).queryByText(/sign-in/i)).toBeNull();
    expect(within(waiter).queryByRole('button')).toBeNull();
  });
});

describe('repairing an existing owner', () => {
  it('re-points their address after a second click and hands over one link', async () => {
    /*
     * The only path that reaches an owner: an owner cannot act on a peer. The
     * owner already signs in, so a different address is read back before it
     * is sent — it changes the moment the server answers — and their
     * password keeps working until the link is used.
     */
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const issue = vi.spyOn(gateway, 'issueStaffSignIn');
    const user = userEvent.setup();
    renderVenue(gateway);
    await waitForStaff();

    await user.click(
      within(rowOf('Aram Sargsyan')).getByRole('button', { name: /send new link/i }),
    );
    const prompt = screen.getByRole('form', { name: /sign-in for aram/i });
    const field = within(prompt).getByLabelText(/^email$/i) as HTMLInputElement;
    expect(field.value).toBe('owner@lumen-coffee.am');
    expect(within(prompt).getByText(/previous link stops working/i)).toBeTruthy();

    await user.clear(field);
    await user.type(field, 'aram@lumen.am');
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));
    expect(within(prompt).getByText(/changes to aram@lumen\.am/i)).toBeTruthy();
    expect(issue).not.toHaveBeenCalled();

    await user.click(within(prompt).getByRole('button', { name: /yes, send it/i }));
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    expect(issue.mock.calls[0]?.[0]).toEqual({
      venueId: 'v-lumen',
      staffMemberId: 'v-lumen-owner',
      email: 'aram@lumen.am',
    });

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/current password keeps working/i);
    expect(dialog.textContent).toMatch(/good until/i);
    await user.click(within(dialog).getByRole('button', { name: /^done$/i }));

    // Address changed, password untouched: no badge, new address on the row.
    await waitFor(() => {
      const row = rowOf('Aram Sargsyan');
      expect(within(row).getByText('aram@lumen.am')).toBeTruthy();
      expect(within(row).queryByText(/awaiting password/i)).toBeNull();
    });
  });
});
