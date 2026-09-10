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

    // A waiter: the one hire that carries no sign-in, so this stays the test
    // of the plain create path.
    await user.selectOptions(within(screen.getByRole('form')).getByLabelText(/^role$/i), 'waiter');
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
    expect(create.mock.calls[0]?.[0].staff).not.toHaveProperty('email');
  });
});

/** Fills the hire form for a manager with an address, and submits. */
async function hireManager(user: ReturnType<typeof userEvent.setup>, email = 'marine@lumen.am') {
  await user.click(screen.getByRole('button', { name: /add someone/i }));
  await user.type(screen.getByLabelText(/full name/i), 'Marine Sahakyan');
  await user.type(screen.getByLabelText(/phone/i), '+37477123456');
  await user.type(screen.getByLabelText(/^email$/i), email);
  await user.type(screen.getByLabelText(/pin/i), '2941');
  await user.click(screen.getByRole('button', { name: /^add$/i }));
}

/** The mock's opaque token, read off the dialog so its absence can be asserted later. */
function tokenIn(text: string | null | undefined): string {
  const token = text?.match(/#token=([a-z0-9]{32})/u)?.[1];
  expect(token).toBeTruthy();
  return token!;
}

/** Everything the query and mutation caches hold, as one string. */
function cachedText(harness: ReturnType<typeof renderStaff>): string {
  const queries = harness.queryClient.getQueryCache().getAll();
  const mutations = harness.queryClient.getMutationCache().getAll();
  return JSON.stringify([...queries.map((q) => q.state), ...mutations.map((m) => m.state)]);
}

describe('the PIN', () => {
  it('is shown exactly once and never again, beside the sign-in link', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    await hireManager(user);

    // Once, in one dialog: the PIN is read aloud across a counter and the
    // link is pasted into a chat, and both exist only here.
    const dialog = await screen.findByRole('dialog');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(within(dialog).getByText('2941')).toBeTruthy();
    const token = tokenIn(dialog.textContent);

    await user.click(within(dialog).getByRole('button', { name: /^done$/i }));

    // And gone. Not in the list, not in a toast that outlives the moment, not
    // anywhere in the document — a PIN that can be looked up later is a PIN
    // that gets written on the till, and a link that can be looked up later
    // is somebody else's password.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.textContent).not.toContain('2941');
    expect(document.body.textContent).not.toContain(token);
  });

  it('never touches storage of any kind, and neither does the link', async () => {
    const user = userEvent.setup();
    const harness = renderStaff({ role: 'owner' });
    await waitForList();

    await hireManager(user);

    const dialog = await screen.findByRole('dialog');
    const token = tokenIn(dialog.textContent);

    // The console stores nothing anyway; this is specifically about the two
    // values that must never reach a disk.
    const stored = [
      ...Object.values({ ...window.localStorage }),
      ...Object.values({ ...window.sessionStorage }),
    ].join(' ');
    expect(stored).not.toContain('2941');
    expect(stored).not.toContain(token);

    // Nor a cache. The mutation's own result is reset the moment the dialog
    // holds the link, so no later render of any screen can read it back.
    await waitFor(() => expect(cachedText(harness)).not.toContain(token));
  });
});

describe('the sign-in email', () => {
  it('is asked for a manager and never for a waiter', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    await user.click(screen.getByRole('button', { name: /add someone/i }));
    const form = screen.getByRole('form');
    // Manager is the owner's default, and a manager signs in to this console.
    expect(within(form).getByLabelText(/^email$/i)).toBeTruthy();

    // A waiter taps a PIN on a tablet; offering an address would be offering
    // something the server refuses.
    await user.selectOptions(within(form).getByLabelText(/^role$/i), 'waiter');
    expect(within(form).queryByLabelText(/^email$/i)).toBeNull();
  });

  it('is not asked when editing, where it could not be sent', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    const managerRow = screen
      .getAllByRole('row')
      .find((row) => /Nare Petrosyan/.test(row.textContent ?? ''))!;
    await user.click(within(managerRow).getByRole('button', { name: /^edit$/i }));

    const form = screen.getByRole('form');
    expect(within(form).getByLabelText(/full name/i)).toBeTruthy();
    expect(within(form).queryByLabelText(/^email$/i)).toBeNull();
  });

  it('refuses something that is not an address before anything is sent', async () => {
    // Same idiom as the PIN: the answer is known, so the server is not asked,
    // and the sentence is the app's own rather than the browser's.
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const create = vi.spyOn(gateway, 'createStaff');
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    await hireManager(user, 'not-an-address');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/address they will sign in with/i);
    expect(screen.getByLabelText(/^email$/i).getAttribute('aria-describedby')).toBe(alert.id);
    expect(create).not.toHaveBeenCalled();
  });

  it('travels on the issue call, never inside the create call', async () => {
    /*
     * The server answers 400 to an email without a password on create, and
     * nobody types a password for somebody else here. The address goes on a
     * second call after the person exists, with the same email — and the
     * create input has no `email` key at all, not even an undefined one.
     */
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const create = vi.spyOn(gateway, 'createStaff');
    const issue = vi.spyOn(gateway, 'issueStaffSignIn');
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    await hireManager(user, 'Marine@Lumen.am');

    await waitFor(() => expect(issue).toHaveBeenCalled());
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0].staff).not.toHaveProperty('email');

    const created = await create.mock.results[0]!.value;
    expect(issue.mock.calls[0]?.[0]).toEqual({
      venueId: created.venueId,
      staffMemberId: created.id,
      email: 'Marine@Lumen.am',
    });
  });

  it('still shows the PIN when the link was refused, with the reason and a way back', async () => {
    /*
     * The person exists the moment create answers; their PIN lives in the
     * form and nowhere else. A refused second call must not lose it — and the
     * server's sentence ("that address already has an account") needs a place
     * to land now that the form has closed.
     */
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const { ConcurrencyConflictError } = await import('@yalla/api');
    const issue = vi.spyOn(gateway, 'issueStaffSignIn').mockRejectedValueOnce(
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
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    await hireManager(user, 'owner@lumen-coffee.am');

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('2941')).toBeTruthy();
    expect(within(dialog).getByRole('alert').textContent).toContain('already has an account');
    expect(dialog.textContent).not.toContain('#token=');

    // Try again goes to the row's own prompt, with the address to correct.
    await user.click(within(dialog).getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const row = (await screen.findByText('Marine Sahakyan')).closest('tr')!;
    // Still without a sign-in: the badge and the action say so.
    expect(within(row).getByText(/no sign-in/i)).toBeTruthy();
    expect(within(row).getByRole('button', { name: /issue sign-in/i })).toBeTruthy();

    const prompt = screen.getByRole('form', { name: /sign-in for marine/i });
    const field = within(prompt).getByLabelText(/^email$/i) as HTMLInputElement;
    expect(field.value).toBe('owner@lumen-coffee.am');

    await user.clear(field);
    await user.type(field, 'marine@lumen.am');
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));

    await waitFor(() => expect(issue).toHaveBeenCalledTimes(2));
    expect(issue.mock.calls[1]?.[0].email).toBe('marine@lumen.am');
    tokenIn((await screen.findByRole('dialog')).textContent);
  });
});

describe('the sign-in badge', () => {
  it('tells apart no address, an address without a password, and a working sign-in', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    // Every seeded manager: no address at all, and the action to fix it.
    const managerRow = screen
      .getAllByRole('row')
      .find((row) => /Nare Petrosyan/.test(row.textContent ?? ''))!;
    expect(within(managerRow).getByText(/no sign-in/i)).toBeTruthy();
    expect(within(managerRow).getByRole('button', { name: /issue sign-in/i })).toBeTruthy();

    // The seeded owner signs in already: nothing to say.
    const ownerRow = screen
      .getAllByRole('row')
      .find((row) => /Aram Sargsyan/.test(row.textContent ?? ''))!;
    expect(within(ownerRow).queryByText(/no sign-in/i)).toBeNull();
    expect(within(ownerRow).queryByText(/awaiting password/i)).toBeNull();
    expect(within(ownerRow).getByText('owner@lumen-coffee.am')).toBeTruthy();

    await user.click(within(managerRow).getByRole('button', { name: /issue sign-in/i }));
    const prompt = screen.getByRole('form', { name: /sign-in for nare/i });
    await user.type(within(prompt).getByLabelText(/^email$/i), 'nare@lumen.am');
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/good until/i);
    await user.click(within(dialog).getByRole('button', { name: /^done$/i }));

    // Now an address and no password: true whether or not the link is still
    // alive, and the address is on the row for the "which email did I send
    // it to" question weeks later.
    await waitFor(() => {
      const row = screen.getByText('Nare Petrosyan').closest('tr')!;
      expect(within(row).getByText(/awaiting password/i)).toBeTruthy();
      expect(within(row).getByText('nare@lumen.am')).toBeTruthy();
      expect(within(row).queryByText(/no sign-in/i)).toBeNull();
      expect(within(row).getByRole('button', { name: /send new link/i })).toBeTruthy();
    });
  });

  it('keeps the badge and the action when the issue was refused from the row', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const { ConcurrencyConflictError } = await import('@yalla/api');
    vi.spyOn(gateway, 'issueStaffSignIn').mockRejectedValue(
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
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    const managerRow = screen
      .getAllByRole('row')
      .find((row) => /Nare Petrosyan/.test(row.textContent ?? ''))!;
    await user.click(within(managerRow).getByRole('button', { name: /issue sign-in/i }));
    const prompt = screen.getByRole('form', { name: /sign-in for nare/i });
    await user.type(within(prompt).getByLabelText(/^email$/i), 'owner@lumen-coffee.am');
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));

    // The sentence under the field, and nothing else changed.
    const alert = await within(prompt).findByRole('alert');
    expect(alert.textContent).toContain('already has an account');
    expect(
      within(prompt)
        .getByLabelText(/^email$/i)
        .getAttribute('aria-describedby'),
    ).toBe(alert.id);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(managerRow).getByText(/no sign-in/i)).toBeTruthy();
    expect(within(managerRow).getByRole('button', { name: /issue sign-in/i })).toBeTruthy();
  });
});

describe('sending a new link', () => {
  /**
   * A manager who already signs in. Made through the mock's one path that
   * sets a password — the email-and-password create the server also allows —
   * so the mock's own state, not a stub, says `hasPasswordSignIn`.
   */
  async function withSigningInManager(gateway: ConsoleGateway) {
    await gateway.createStaff({
      venueId: 'v-lumen',
      staff: {
        fullName: 'Karen Hovhannisyan',
        phone: '+37477555555',
        role: 'manager',
        pin: '1111',
        branchId: 'b-lumen-north',
        email: 'karen@lumen.am',
        password: 'correct horse battery',
      },
    });
  }

  it('asks twice before re-pointing a working sign-in to a different address', async () => {
    /*
     * The address changes the moment the server answers; the password only
     * when the link is used. For somebody who already signs in, a typo here
     * locks them out with no notice — so a changed address is read back and
     * needs a second click.
     */
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    await withSigningInManager(gateway);
    const issue = vi.spyOn(gateway, 'issueStaffSignIn');
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    const row = screen.getByText('Karen Hovhannisyan').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /send new link/i }));

    const prompt = screen.getByRole('form', { name: /sign-in for karen/i });
    expect(within(prompt).getByText(/previous link stops working/i)).toBeTruthy();
    const field = within(prompt).getByLabelText(/^email$/i) as HTMLInputElement;
    expect(field.value).toBe('karen@lumen.am');

    await user.clear(field);
    await user.type(field, 'karen.h@lumen.am');
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));

    // Stated back, not sent.
    expect(within(prompt).getByText(/changes to karen\.h@lumen\.am/i)).toBeTruthy();
    expect(issue).not.toHaveBeenCalled();

    await user.click(within(prompt).getByRole('button', { name: /yes, send it/i }));
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    expect(issue.mock.calls[0]?.[0].email).toBe('karen.h@lumen.am');

    // Somebody who already had a password is told it keeps working until then.
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/current password keeps working/i);
  });

  it('sends straight away for the same address', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    await withSigningInManager(gateway);
    const issue = vi.spyOn(gateway, 'issueStaffSignIn');
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    const row = screen.getByText('Karen Hovhannisyan').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /send new link/i }));
    const prompt = screen.getByRole('form', { name: /sign-in for karen/i });
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));

    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/changes to/i)).toBeNull();
  });
});

describe('the sign-in link dialog', () => {
  async function openLinkDialog(user: ReturnType<typeof userEvent.setup>) {
    renderStaff({ role: 'owner' });
    await waitForList();
    const row = screen.getByText('Nare Petrosyan').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /issue sign-in/i }));
    const prompt = screen.getByRole('form', { name: /sign-in for nare/i });
    await user.type(within(prompt).getByLabelText(/^email$/i), 'nare@lumen.am');
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));
    return screen.findByRole('dialog');
  }

  it('copies the link, because a link exists to be pasted', async () => {
    // After `setup()`, which installs user-event's own clipboard.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    const dialog = await openLinkDialog(user);
    const token = tokenIn(dialog.textContent);
    await user.click(within(dialog).getByRole('button', { name: /copy link/i }));

    await within(dialog).findByText(/^copied$/i);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(token));
  });

  it('falls back to selecting the link where the clipboard is out of reach', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('insecure origin'));

    const dialog = await openLinkDialog(user);
    await user.click(within(dialog).getByRole('button', { name: /copy link/i }));

    await within(dialog).findByText(/select and copy/i);
    expect(window.getSelection()?.toString()).toContain('#token=');
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

    await hireManager(user);

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
    // And no sign-in for a peer either: the server refuses it as rank.
    expect(within(managerRow!).queryByRole('button', { name: /issue sign-in/i })).toBeNull();
    expect(within(managerRow!).queryByRole('button', { name: /send new link/i })).toBeNull();
  });

  it('is not offered a sign-in for another owner, nor for a deactivated manager', async () => {
    /*
     * Owner on owner is a peer, which the server refuses; only a platform
     * admin repairs an owner. A deactivated person is refused too, and
     * reactivating them is the action offered instead.
     */
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const list = gateway.listStaff.bind(gateway);
    vi.spyOn(gateway, 'listStaff').mockImplementation(async (venueId) => {
      const seeded = await list(venueId);
      return [
        ...seeded.map((member) =>
          member.id === 'b-lumen-north-manager' ? { ...member, isActive: false } : member,
        ),
        {
          ...seeded.find((member) => member.role === 'owner')!,
          id: 'v-lumen-owner-2',
          fullName: 'Hasmik Sargsyan',
          email: null,
          hasPasswordSignIn: false,
        },
      ];
    });
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    const otherOwner = screen.getByText('Hasmik Sargsyan').closest('tr')!;
    expect(within(otherOwner).getByText(/no sign-in/i)).toBeTruthy();
    expect(within(otherOwner).queryByRole('button', { name: /issue sign-in/i })).toBeNull();
    expect(within(otherOwner).getByText(/above your role/i)).toBeTruthy();

    await user.click(screen.getByLabelText(/show deactivated/i));
    const deactivated = (await screen.findByText('Nare Petrosyan')).closest('tr')!;
    expect(within(deactivated).getByRole('button', { name: /reactivate/i })).toBeTruthy();
    expect(within(deactivated).queryByRole('button', { name: /issue sign-in/i })).toBeNull();
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
