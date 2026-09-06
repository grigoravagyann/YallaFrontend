// @vitest-environment jsdom
import { createConsoleMockGateway, type ConsoleGateway, type StaffMember } from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { StaffScreen } from './StaffScreen';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';

/**
 * Staff accounts and devices.
 *
 * The two assertions worth the most are about things that are invisible when
 * they work: a role a manager must never be *offered*, and a PIN that must
 * exist on screen exactly once and nowhere else afterwards. Both are the kind
 * of rule that is easy to satisfy on submit and wrong in the UI, which is the
 * shape the spec is explicit about.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

function renderStaff(
  options: {
    readonly role?: 'owner' | 'manager';
    readonly gateway?: ConsoleGateway;
    readonly branchCount?: number;
  } = {},
) {
  const role = options.role ?? 'owner';
  const harness = createConsoleHarness({
    gateway: options.gateway ?? createConsoleMockGateway({ latencyMs: 0, role }),
  });

  const context = {
    branchId: 'b-lumen-north',
    timeZoneId: 'Asia/Yerevan',
    branchCount: options.branchCount ?? (role === 'owner' ? 3 : 1),
  };

  render(
    harness.wrap(
      <Routes>
        <Route path="/venue" element={<Outlet context={context} />}>
          <Route path="staff" element={<StaffScreen />} />
        </Route>
      </Routes>,
      '/venue/staff',
    ),
  );

  return harness;
}

/** Waits for the list to arrive. */
async function waitForList() {
  await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 5000 });
}

describe('the role picker', () => {
  it('offers a manager only waiter and kitchen', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'manager' });
    await waitForList();

    await user.click(screen.getByRole('button', { name: /add someone/i }));

    // Scoped to the form: the page also has a role *filter*, and the two would
    // otherwise be indistinguishable to the query.
    const form = screen.getByRole('form');
    const select = within(form).getByLabelText(/^role$/i) as HTMLSelectElement;
    const offered = [...select.options].map((option) => option.value);

    // Not filtered by CSS and not validated on submit: Manager and Owner are
    // not in the document at all.
    expect(offered).toEqual(['waiter', 'kitchen']);
    expect(offered).not.toContain('manager');
    expect(offered).not.toContain('owner');
  });

  it('offers an owner manager as well, and never their own role', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    await user.click(screen.getByRole('button', { name: /add someone/i }));

    const form = screen.getByRole('form');
    const select = within(form).getByLabelText(/^role$/i) as HTMLSelectElement;
    const offered = [...select.options].map((option) => option.value);

    expect(offered).toEqual(['manager', 'waiter', 'kitchen']);
    expect(offered).not.toContain('owner');
    // And platform admin never, from inside a venue: they have no venue and no
    // branch, so creating one here is a category error.
    expect(offered).not.toContain('platformAdmin');
  });
});

describe('the branch field', () => {
  it('is fixed for a manager, with no selector at all', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'manager', branchCount: 1 });
    await waitForList();

    await user.click(screen.getByRole('button', { name: /add someone/i }));

    // A control with one option invites somebody to go looking for the others.
    expect(within(screen.getByRole('form')).queryByLabelText(/^branch$/i)).toBeNull();
    expect(screen.getByText(/works at/i)).toBeTruthy();
  });

  it('offers an owner every branch plus all branches', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    await user.click(screen.getByRole('button', { name: /add someone/i }));

    const select = within(screen.getByRole('form')).getByLabelText(
      /^branch$/i,
    ) as HTMLSelectElement;
    const labels = [...select.options].map((option) => option.textContent);

    expect(labels[0]).toBe('All branches');
    expect(labels.length).toBeGreaterThan(1);
  });

  it('sends a null branch id for "all branches"', async () => {
    /*
     * The assignment that was unreachable before this screen. `branchId` is
     * nullable and null means every branch of the venue — how a floating
     * manager or an owner who works the floor is represented.
     */
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const create = vi.spyOn(gateway, 'createStaff');
    const user = userEvent.setup();

    renderStaff({ role: 'owner', gateway });
    await waitForList();
    await user.click(screen.getByRole('button', { name: /add someone/i }));

    await user.type(screen.getByLabelText(/full name/i), 'Marine Sahakyan');
    await user.type(screen.getByLabelText(/phone/i), '+37477123456');
    await user.selectOptions(
      within(screen.getByRole('form')).getByLabelText(/^branch$/i),
      '__all__',
    );
    await user.type(screen.getByLabelText(/pin/i), '2941');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]?.[0].staff.branchId).toBeNull();
  });
});

describe('the PIN', () => {
  it('is shown exactly once and never again', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    await user.click(screen.getByRole('button', { name: /add someone/i }));
    await user.type(screen.getByLabelText(/full name/i), 'Marine Sahakyan');
    await user.type(screen.getByLabelText(/phone/i), '+37477123456');
    await user.type(screen.getByLabelText(/pin/i), '2941');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    // Once, on a screen built to be read aloud across a counter.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('2941')).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: /written down/i }));

    // And gone. Not in the list, not in a toast that outlives the moment, not
    // anywhere in the document — a PIN that can be looked up later is a PIN
    // that gets written on the till.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.textContent).not.toContain('2941');
  });

  it('never touches storage of any kind', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    await user.click(screen.getByRole('button', { name: /add someone/i }));
    await user.type(screen.getByLabelText(/full name/i), 'Marine Sahakyan');
    await user.type(screen.getByLabelText(/phone/i), '+37477123456');
    await user.type(screen.getByLabelText(/pin/i), '2941');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await screen.findByRole('dialog');

    // The console stores nothing anyway; this is specifically about the one
    // value that must never reach a disk.
    const stored = [
      ...Object.values({ ...window.localStorage }),
      ...Object.values({ ...window.sessionStorage }),
    ].join(' ');
    expect(stored).not.toContain('2941');
  });
});

describe('deactivating somebody', () => {
  it('takes them off the default list and leaves them reactivatable', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    // A waiter the owner may act on.
    const row = screen
      .getAllByRole('row')
      .find((entry) => /Ani Hakobyan/.test(entry.textContent ?? ''))!;
    await user.click(within(row).getByRole('button', { name: /deactivate/i }));

    const name = row.textContent?.match(/Ani Hakobyan \([^)]*\)/u)?.[0] ?? 'Ani Hakobyan';
    await waitFor(() => expect(screen.queryByText(name)).toBeNull());

    // Still there under the filter, with a working way back. Somebody who left
    // in March and returns in June is a reactivation, not a second record.
    await user.click(screen.getByLabelText(/show deactivated/i));
    const inactiveRow = (await screen.findByText(name)).closest('tr')!;
    expect(within(inactiveRow).getByRole('button', { name: /reactivate/i })).toBeTruthy();

    await user.click(within(inactiveRow).getByRole('button', { name: /reactivate/i }));
    await waitFor(() => expect(screen.queryByText(name)).toBeNull());

    await user.click(screen.getByLabelText(/show deactivated/i));
    expect(await screen.findByText(name)).toBeTruthy();
  });
});

describe('a server refusal', () => {
  it('lands against the field the server named, not on the form', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const { StaffPermissionError } = await import('@yalla/api');
    vi.spyOn(gateway, 'createStaff').mockRejectedValue(
      new StaffPermissionError({
        url: 'mock://yalla',
        detail: 'An owner cannot assign that role.',
        field: 'role',
      }),
    );

    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    await user.click(screen.getByRole('button', { name: /add someone/i }));
    await user.type(screen.getByLabelText(/full name/i), 'Marine Sahakyan');
    await user.type(screen.getByLabelText(/phone/i), '+37477123456');
    await user.type(screen.getByLabelText(/pin/i), '2941');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('cannot assign that role');

    // Under the role control, where the next action is obvious — not above the
    // form, where it reads as a refusal of the whole thing.
    // Described by the error, not renamed by it — so the field still announces
    // as "Role" and the message is attached to it rather than floating above
    // the form.
    const roleField = within(screen.getByRole('form')).getByLabelText(/^role$/i);
    expect(roleField.getAttribute('aria-describedby')).toBe(alert.id);
    expect(roleField.closest('.labelled')?.contains(alert)).toBe(true);
  });
});

describe('the PIN lockout', () => {
  it('is visible in the list with a way to clear it', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const clear = vi.spyOn(gateway, 'clearPinLockout');
    const user = userEvent.setup();

    renderStaff({ role: 'owner', gateway });
    await waitForList();

    // The fixture keeps somebody locked out: it is the most time-critical row
    // on the screen and a fixture without one would never render it.
    const locked = await screen.findByText(/PIN locked/i);
    const row = locked.closest('tr')!;

    await user.click(within(row).getByRole('button', { name: /unlock pin/i }));
    await waitFor(() => expect(clear).toHaveBeenCalled());
  });
});

describe('what a manager sees', () => {
  it('cannot act on another manager', async () => {
    renderStaff({ role: 'manager', branchCount: 1 });
    await waitForList();

    const managerRow = screen
      .getAllByRole('row')
      .find((row) => /Nare Petrosyan|Tigran Avetisyan|Lilit Grigoryan/.test(row.textContent ?? ''));
    expect(managerRow).toBeDefined();

    // Not offered, rather than offered and refused.
    expect(within(managerRow!).queryByRole('button', { name: /^edit$/i })).toBeNull();
    expect(within(managerRow!).getByText(/above your role/i)).toBeTruthy();
  });

  it('sees no branch column, because there is one branch', async () => {
    renderStaff({ role: 'manager', branchCount: 1 });
    await waitForList();

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).not.toContain('Branch');
  });
});

/** Type-only guard: the list never grows a shape that could hold a PIN. */
export type StaffMemberHasNoPin = StaffMember extends { pin: unknown } ? never : true;

describe('devices', () => {
  it('asks for confirmation naming the device, then updates the list', async () => {
    /*
     * Named, because revoking the wrong one takes a venue's counter offline
     * mid-service — and the two rows most likely to be confused are the tablet
     * in use and the one it replaced.
     */
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    const deviceRow = (await screen.findByText('Counter tablet')).closest('tr')!;
    await user.click(within(deviceRow).getByRole('button', { name: /^revoke$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Counter tablet');

    await user.click(within(dialog).getByRole('button', { name: /yes, revoke it/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Revoked and still listed: the list is an audit trail, not a roster.
    await waitFor(() => {
      const row = screen.getByText('Counter tablet').closest('tr')!;
      expect(within(row).getByText(/revoked/i)).toBeTruthy();
      expect(within(row).queryByRole('button', { name: /^revoke$/i })).toBeNull();
    });
  });

  it('shows a code with its expiry, and regenerates a different one', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    await user.click(screen.getByRole('button', { name: /generate a code/i }));

    // Ten characters of the server's readable alphabet — no I, L, O or U, and
    // no digits that look like them.
    const first = await screen.findByText(/^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{10}$/u);
    const code = first.textContent!;
    expect(screen.getByText(/good until/i)).toBeTruthy();
    // Single use, said out loud: it gets read across a bar and will be
    // overheard, and that is only survivable because it works once.
    expect(screen.getByText(/one use only/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /generate a new one/i }));

    // A genuinely new code. Only the hash is stored, so "regenerate" cannot be
    // a second look at the old one.
    await waitFor(() => {
      expect(screen.getByText(/^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{10}$/u).textContent).not.toBe(
        code,
      );
    });
  });

  it('says what a device grants, which is nothing on its own', async () => {
    renderStaff({ role: 'owner' });
    await waitForList();

    // An owner who does not know this cannot reason about a lost tablet.
    expect(await screen.findByText(/stolen tablet is not a stolen till/i)).toBeTruthy();
  });
});
