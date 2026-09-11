// @vitest-environment jsdom
import {
  StaffPermissionError,
  TooManyRequestsError,
  ValidationError,
  createConsoleMockGateway,
  type ConsoleGateway,
  type StaffMember,
} from '@yalla/api';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

type User = ReturnType<typeof userEvent.setup>;

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

  const branchCount = options.branchCount ?? (role === 'owner' ? 3 : 1);
  const context = {
    branchId: 'b-lumen-north',
    timeZoneId: 'Asia/Yerevan',
    branchCount,
    canRollUpVenue: role === 'owner' && branchCount > 1,
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

/** Waits for the list to arrive: the seeded owner is on every venue's list. */
async function waitForList() {
  await screen.findByText('Aram Sargsyan', undefined, { timeout: 5000 });
}

/** A person's card, found by the name on it. */
function cardOf(name: string): HTMLElement {
  return screen.getByText(name).closest('article')!;
}

/** Opens a card's overflow menu and returns it. */
async function openMenuOf(user: User, card: HTMLElement): Promise<HTMLElement> {
  await user.click(within(card).getByRole('button', { name: /^more actions for/i }));
  return screen.getByRole('menu');
}

/**
 * Runs an action on a card, wherever the card puts it: the one primary
 * button, or an item in the overflow menu.
 */
async function chooseAction(user: User, card: HTMLElement, name: RegExp) {
  const direct = within(card)
    .queryAllByRole('button')
    .find((button) => !button.hasAttribute('aria-haspopup') && name.test(button.textContent ?? ''));
  if (direct) {
    await user.click(direct);
    return;
  }
  const menu = await openMenuOf(user, card);
  await user.click(within(menu).getByRole('menuitem', { name }));
}

/**
 * Every action a card offers — the visible button and everything in its
 * menu — so "not offered" is checked in both places rather than only in the
 * one the card happens to show first.
 */
async function actionsOf(user: User, card: HTMLElement): Promise<string[]> {
  const buttons = within(card).queryAllByRole('button');
  const direct = buttons
    .filter((button) => !button.hasAttribute('aria-haspopup'))
    .map((button) => button.textContent ?? '');
  const trigger = buttons.find((button) => button.hasAttribute('aria-haspopup'));
  if (!trigger) return direct;
  await user.click(trigger);
  const items = within(screen.getByRole('menu'))
    .getAllByRole('menuitem')
    .map((item) => item.textContent ?? '');
  await user.keyboard('{Escape}');
  return [...direct, ...items];
}

/** The PIN or sign-in dialog — not the add dialog, which is a dialog too. */
function findCredentialDialog() {
  return screen.findByRole('dialog', { name: /^(sign-in for|pin for)/i });
}

function queryCredentialDialog() {
  return screen.queryByRole('dialog', { name: /^(sign-in for|pin for)/i });
}

/** The add dialog's form. */
function addForm() {
  return screen.getByRole('form', { name: /add someone/i });
}

/** Opens "Add someone" and fills the first step. */
async function startHire(user: User, name = 'Marine Sahakyan', phone = '+37477123456') {
  await user.click(screen.getByRole('button', { name: /add someone/i }));
  await user.type(within(addForm()).getByLabelText(/full name/i), name);
  await user.type(within(addForm()).getByLabelText(/phone/i), phone);
  await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
}

/** The values of the role choices on the add dialog's second step. */
function offeredRoles(): string[] {
  const group = within(addForm()).getByRole('group', { name: /what is their role/i });
  return within(group)
    .getAllByRole('radio')
    .map((radio) => (radio as HTMLInputElement).value);
}

function checkedRole(container: HTMLElement): string | undefined {
  return (
    within(container)
      .getAllByRole('radio')
      .find((radio) => (radio as HTMLInputElement).checked) as HTMLInputElement | undefined
  )?.value;
}

/** The steps the progress list shows, and which one is current. */
function progress() {
  const list = within(screen.getByRole('dialog', { name: /add someone/i })).getByRole('list', {
    name: /progress/i,
  });
  const steps = within(list).getAllByRole('listitem');
  return {
    count: steps.length,
    current: steps.findIndex((step) => step.getAttribute('aria-current') === 'step'),
    labels: steps.map((step) => step.textContent ?? ''),
  };
}

describe('the role picker', () => {
  it('offers a manager only waiter and kitchen', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'manager' });
    await waitForList();

    await startHire(user);

    // Not filtered by CSS and not validated on submit: Manager and Owner are
    // not in the document at all.
    const offered = offeredRoles();
    expect(offered).toEqual(['waiter', 'kitchen']);
    expect(offered).not.toContain('manager');
    expect(offered).not.toContain('owner');
  });

  it('offers an owner a co-owner as well as everyone below', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    await startHire(user);

    const offered = offeredRoles();
    // The server's rule: a co-owner is a normal thing for a family business.
    expect(offered).toEqual(['owner', 'manager', 'waiter', 'kitchen']);
    // Offered, not defaulted: the form opens on Manager, so a careless hire
    // does not mint a partner.
    expect(checkedRole(addForm())).toBe('manager');
    // And platform admin never, from inside a venue: they have no venue and no
    // branch, so creating one here is a category error.
    expect(offered).not.toContain('platformAdmin');
  });
});

describe('a co-owner', () => {
  it('can be hired and then edited by an owner', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const update = vi.spyOn(gateway, 'updateStaff');
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    await startHire(user, 'Hasmik Sargsyan', '+37477555555');
    await user.click(within(addForm()).getByRole('radio', { name: /^owner/i }));
    // No address asked for: the server refuses an owner a sign-in for a peer,
    // so the partner is hired PIN-only and a platform admin issues theirs.
    expect(progress().count).toBe(3);
    expect(within(addForm()).getByText(/issued by the yalla team/i)).toBeTruthy();
    await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
    expect(within(addForm()).queryByLabelText(/^email$/i)).toBeNull();
    await user.type(within(addForm()).getByLabelText(/pin/i), '4821');
    await user.click(within(addForm()).getByRole('button', { name: /^add$/i }));

    // The PIN dialog — with exactly one button — then the list.
    const dialog = await screen.findByRole('dialog', { name: /pin for/i });
    await user.click(within(dialog).getByRole('button'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Hired, and listed among the owners with the actions an owner may take
    // on a co-owner — edit, but never a sign-in, which is the server's Outranks.
    await screen.findByText('Hasmik Sargsyan');
    const card = cardOf('Hasmik Sargsyan');
    expect(
      within(card.closest('section')!).getByRole('heading', { name: /^owners/i }),
    ).toBeTruthy();
    expect((await actionsOf(user, card)).join('|')).not.toMatch(/issue sign-in|send new link/i);

    await chooseAction(user, card, /^edit$/i);
    const edit = screen.getByRole('form', { name: /edit hasmik sargsyan/i });
    expect(checkedRole(edit)).toBe('owner');
    await user.clear(within(edit).getByLabelText(/full name/i));
    await user.type(within(edit).getByLabelText(/full name/i), 'Hasmik Sargsyan-Avagyan');
    await user.click(within(edit).getByRole('button', { name: /save/i }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(await screen.findByText('Hasmik Sargsyan-Avagyan')).toBeTruthy();
  });
});

describe('the branch field', () => {
  it('is fixed for a manager, with no selector at all', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'manager', branchCount: 1 });
    await waitForList();

    await startHire(user);

    // A control with one option invites somebody to go looking for the others.
    expect(within(addForm()).queryByLabelText(/which branch/i)).toBeNull();
    expect(within(addForm()).queryByRole('combobox')).toBeNull();
    expect(within(addForm()).getByText(/works at/i)).toBeTruthy();
  });

  it('offers an owner every branch plus all branches', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    await startHire(user);

    const select = within(addForm()).getByLabelText(/which branch/i) as HTMLSelectElement;
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
    await startHire(user);

    // A waiter: the one hire that carries no sign-in, so this stays the test
    // of the plain create path.
    await user.click(within(addForm()).getByRole('radio', { name: /^waiter/i }));
    await user.selectOptions(within(addForm()).getByLabelText(/which branch/i), '__all__');
    await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
    await user.type(within(addForm()).getByLabelText(/pin/i), '2941');
    await user.click(within(addForm()).getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]?.[0].staff.branchId).toBeNull();
    expect(create.mock.calls[0]?.[0].staff).not.toHaveProperty('email');
  });
});

/** Walks the add dialog for a manager with an address, and submits. */
async function hireManager(user: User, email = 'marine@lumen.am') {
  await startHire(user);
  // Manager is the owner's default.
  await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
  await user.type(within(addForm()).getByLabelText(/pin/i), '2941');
  await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
  await user.type(within(addForm()).getByLabelText(/^email$/i), email);
  await user.click(within(addForm()).getByRole('button', { name: /^add$/i }));
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

/**
 * Holds the issue call open until `release`, so the moment between the
 * person existing and the link arriving can be looked at. On a slow
 * connection that moment is seconds long.
 */
function withDeferredIssue(gateway: ConsoleGateway) {
  const real = gateway.issueStaffSignIn.bind(gateway);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const issue = vi.spyOn(gateway, 'issueStaffSignIn').mockImplementation(async (input) => {
    await gate;
    return real(input);
  });
  return { issue, release: () => release() };
}

/** The sign-in prompt for a seeded manager, opened from their card. */
async function openPromptFor(user: User, name: string) {
  await chooseAction(user, cardOf(name), /issue sign-in|send new link/i);
  const first = name.split(' ')[0]!;
  return screen.getByRole('form', { name: new RegExp(`sign-in for ${first}`, 'i') });
}

describe('the PIN', () => {
  it('is shown exactly once and never again, beside the sign-in link', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    await hireManager(user);

    // Once, in one dialog: the PIN is read aloud across a counter and the
    // link is pasted into a chat, and both exist only here. The add dialog is
    // gone in the same render.
    const dialog = await findCredentialDialog();
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

    const dialog = await findCredentialDialog();
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

    await startHire(user);
    // Manager is the owner's default, and a manager signs in to this console:
    // a fourth step, and the address on it.
    expect(progress().count).toBe(4);
    await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
    await user.type(within(addForm()).getByLabelText(/pin/i), '2941');
    await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
    expect(within(addForm()).getByLabelText(/^email$/i)).toBeTruthy();

    // A waiter taps a PIN on a tablet; offering an address would be offering
    // something the server refuses.
    await user.click(within(addForm()).getByRole('button', { name: /^back$/i }));
    await user.click(within(addForm()).getByRole('button', { name: /^back$/i }));
    await user.click(within(addForm()).getByRole('radio', { name: /^waiter/i }));
    await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
    expect(within(addForm()).queryByLabelText(/^email$/i)).toBeNull();
    expect(within(addForm()).queryByRole('button', { name: /^next$/i })).toBeNull();
    expect(within(addForm()).getByRole('button', { name: /^add$/i })).toBeTruthy();
  });

  it('is not asked when editing, where it could not be sent', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    await chooseAction(user, cardOf('Nare Petrosyan'), /^edit$/i);

    const form = screen.getByRole('form', { name: /edit nare petrosyan/i });
    expect(within(form).getByLabelText(/full name/i)).toBeTruthy();
    expect(within(form).queryByLabelText(/^email$/i)).toBeNull();
  });

  it('shows the staff id in the edit dialog, and Copy puts it on the clipboard', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    await chooseAction(user, cardOf('Nare Petrosyan'), /^edit$/i);
    const form = screen.getByRole('form', { name: /edit nare petrosyan/i });
    const id = within(form).getByText(/-manager$/);
    const staffId = id.textContent!;

    await user.click(within(form).getByRole('button', { name: /copy staff id/i }));

    expect(await navigator.clipboard.readText()).toBe(staffId);
    expect(within(form).getByRole('status').textContent).toMatch(/copied/i);
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

    const dialog = await findCredentialDialog();
    expect(within(dialog).getByText('2941')).toBeTruthy();
    expect(within(dialog).getByRole('alert').textContent).toContain('already has an account');
    expect(dialog.textContent).not.toContain('#token=');

    // Try again goes to the card's own prompt, with the address to correct.
    await user.click(within(dialog).getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await screen.findByText('Marine Sahakyan');
    const card = cardOf('Marine Sahakyan');
    // Still without a sign-in: the badge and the action say so.
    expect(within(card).getByText(/no sign-in/i)).toBeTruthy();
    expect(within(card).getByRole('button', { name: /issue sign-in/i })).toBeTruthy();

    const prompt = screen.getByRole('form', { name: /sign-in for marine/i });
    const field = within(prompt).getByLabelText(/^email$/i) as HTMLInputElement;
    expect(field.value).toBe('owner@lumen-coffee.am');
    // The reason travels with the address: the sentence the person is meant
    // to act on is under the field, not lost with the dialog it arrived in.
    expect(within(prompt).getByRole('alert').textContent).toContain('already has an account');
    // And the cursor is in the field, since the button it came from is gone.
    expect(document.activeElement).toBe(field);

    await user.clear(field);
    await user.type(field, 'marine@lumen.am');
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));

    await waitFor(() => expect(issue).toHaveBeenCalledTimes(2));
    expect(issue.mock.calls[1]?.[0].email).toBe('marine@lumen.am');
    tokenIn((await findCredentialDialog()).textContent);
  });

  it('keeps the form saving until the dialog is ready', async () => {
    /*
     * Between the create answering and the issue answering, the person
     * exists and nothing is on screen yet. Closing the form in that gap left
     * the list with a new card and no dialog, and the button live to open a
     * second form — on a slow connection, for seconds.
     */
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const { issue, release } = withDeferredIssue(gateway);
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    await hireManager(user);
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));

    const submit = within(addForm()).getByRole('button', { name: /saving/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(queryCredentialDialog()).toBeNull();
    // The add dialog is the only dialog, and it stays until the next is ready.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    release();
    await findCredentialDialog();
    expect(screen.queryByRole('form', { name: /add someone/i })).toBeNull();
  });

  it('caps the address at the 320 characters the server stores, on both forms', async () => {
    // `FieldLengths.Email`, mirrored so the keyboard stops where the server would.
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    await startHire(user);
    await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
    await user.type(within(addForm()).getByLabelText(/pin/i), '2941');
    await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
    expect(
      within(addForm())
        .getByLabelText(/^email$/i)
        .getAttribute('maxlength'),
    ).toBe('320');
    await user.click(within(addForm()).getByRole('button', { name: /cancel/i }));

    const prompt = await openPromptFor(user, 'Nare Petrosyan');
    expect(
      within(prompt)
        .getByLabelText(/^email$/i)
        .getAttribute('maxlength'),
    ).toBe('320');
  });

  it('refuses an address over 320 characters on the hire form before anything is sent', async () => {
    /*
     * `maxLength` stops the keyboard, not a paste a browser lets through or a
     * value set by script — so the check is made on submit as well, with the
     * app's own sentence rather than the server's developer-facing one.
     */
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const create = vi.spyOn(gateway, 'createStaff');
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    await startHire(user);
    await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
    await user.type(within(addForm()).getByLabelText(/pin/i), '2941');
    await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
    fireEvent.change(within(addForm()).getByLabelText(/^email$/i), {
      target: { value: `${'a'.repeat(315)}@lumen.am` },
    });
    await user.click(within(addForm()).getByRole('button', { name: /^add$/i }));

    const alert = await screen.findByRole('alert');
    expect(create).not.toHaveBeenCalled();
    expect(alert.textContent).toMatch(/at most 320 characters/i);
  });

  it('refuses an address over 320 characters from the card before anything is sent', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const issue = vi.spyOn(gateway, 'issueStaffSignIn');
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    const prompt = await openPromptFor(user, 'Nare Petrosyan');
    fireEvent.change(within(prompt).getByLabelText(/^email$/i), {
      target: { value: `${'a'.repeat(315)}@lumen.am` },
    });
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));

    const alert = await within(prompt).findByRole('alert');
    expect(issue).not.toHaveBeenCalled();
    expect(alert.textContent).toMatch(/at most 320 characters/i);
  });
});

describe('what a refusal from the card says', () => {
  /** A rejection the server could send, as the gateway would raise it. */
  function refusing(gateway: ConsoleGateway, error: Error) {
    return vi.spyOn(gateway, 'issueStaffSignIn').mockRejectedValue(error);
  }

  async function sendFor(user: User, name: string, email: string) {
    const prompt = await openPromptFor(user, name);
    await user.type(within(prompt).getByLabelText(/^email$/i), email);
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));
    return within(prompt).findByRole('alert');
  }

  it("shows the server's sentence when the refusal is about rank", async () => {
    /*
     * A 403 on this route is a StaffPermissionError, not a ForbiddenError,
     * and the two used to be told apart badly enough that the sentence was
     * dropped for the generic copy. Reachable when the actor's own row was
     * demoted or deactivated after the list loaded.
     */
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    refusing(
      gateway,
      new StaffPermissionError({
        url: 'mock://yalla',
        detail:
          'Issuing a sign-in for a Owner requires the PlatformAdmin role; the caller is a Owner.',
      }),
    );
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    const alert = await sendFor(user, 'Nare Petrosyan', 'nare@lumen.am');
    expect(alert.textContent).toContain('requires the PlatformAdmin role');
  });

  it('reports the ten-a-minute limit as a wait, not a fault', async () => {
    // The route spends the sign-in budget; a 429 is the limiter, not a bug.
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    refusing(
      gateway,
      new TooManyRequestsError({
        url: 'mock://yalla',
        problem: {
          type: 'about:blank',
          title: 'Too many requests',
          status: 429,
          detail: 'Too many sign-ins issued in the last minute. Wait, then retry.',
          code: 'rate-limited',
          traceId: 'mock',
        },
      }),
    );
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    const alert = await sendFor(user, 'Nare Petrosyan', 'nare@lumen.am');
    expect(alert.textContent).toMatch(/wait a moment, then try again/i);
  });

  it("translates a 422 naming the address rather than showing the server's own sentence", async () => {
    // What .NET's DataAnnotations write is for a developer, in English.
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    refusing(
      gateway,
      new ValidationError({
        url: 'mock://yalla',
        status: 422,
        problem: {
          type: 'about:blank',
          title: 'Validation failed',
          status: 422,
          detail: 'The field email must be a string with a maximum length of 320.',
          code: 'validation-failed',
          traceId: 'mock',
          context: { field: 'email' },
        },
      }),
    );
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    const alert = await sendFor(user, 'Nare Petrosyan', 'nare@lumen.am');
    expect(alert.textContent).toBe('Enter the address they will sign in with.');
  });
});

describe('the sign-in badge', () => {
  it('tells apart no address, an address without a password, and a working sign-in', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    // Every seeded manager: no address at all, and the action to fix it.
    const managerCard = cardOf('Nare Petrosyan');
    expect(within(managerCard).getByText(/no sign-in/i)).toBeTruthy();
    expect(within(managerCard).getByRole('button', { name: /issue sign-in/i })).toBeTruthy();

    // The seeded owner signs in already: nothing to say.
    const ownerCard = cardOf('Aram Sargsyan');
    expect(within(ownerCard).queryByText(/no sign-in/i)).toBeNull();
    expect(within(ownerCard).queryByText(/awaiting password/i)).toBeNull();
    expect(within(ownerCard).getByText('owner@lumen-coffee.am')).toBeTruthy();

    await user.click(within(managerCard).getByRole('button', { name: /issue sign-in/i }));
    const prompt = screen.getByRole('form', { name: /sign-in for nare/i });
    // The address is the one thing to type, so the cursor is already there.
    expect(document.activeElement).toBe(within(prompt).getByLabelText(/^email$/i));
    await user.type(within(prompt).getByLabelText(/^email$/i), 'nare@lumen.am');
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));

    const dialog = await findCredentialDialog();
    expect(dialog.textContent).toMatch(/good until/i);
    await user.click(within(dialog).getByRole('button', { name: /^done$/i }));

    // Now an address and no password: true whether or not the link is still
    // alive, and the address is on the card for the "which email did I send
    // it to" question weeks later.
    await waitFor(() => {
      const card = cardOf('Nare Petrosyan');
      expect(within(card).getByText(/awaiting password/i)).toBeTruthy();
      expect(within(card).getByText('nare@lumen.am')).toBeTruthy();
      expect(within(card).queryByText(/no sign-in/i)).toBeNull();
    });
    expect((await actionsOf(user, cardOf('Nare Petrosyan'))).join('|')).toMatch(/send new link/i);
  });

  it('keeps the badge and the action when the issue was refused from the card', async () => {
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

    const managerCard = cardOf('Nare Petrosyan');
    await user.click(within(managerCard).getByRole('button', { name: /issue sign-in/i }));
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
    expect(within(managerCard).getByText(/no sign-in/i)).toBeTruthy();
    expect(within(managerCard).getByRole('button', { name: /issue sign-in/i })).toBeTruthy();
  });
});

describe('sending a new link', () => {
  /**
   * A manager who already signs in. Made through the mock's one path that
   * sets a password — the email-and-password create the server also allows —
   * so the mock's own state, not a stub, says `hasPasswordSignIn`.
   */
  async function withSigningInManager(
    gateway: ConsoleGateway,
    person: { readonly fullName: string; readonly email: string } = {
      fullName: 'Karen Hovhannisyan',
      email: 'karen@lumen.am',
    },
  ) {
    await gateway.createStaff({
      venueId: 'v-lumen',
      staff: {
        fullName: person.fullName,
        phone: '+37477555555',
        role: 'manager',
        pin: '1111',
        branchId: 'b-lumen-north',
        email: person.email,
        password: 'correct horse battery',
      },
    });
  }

  /** Karen's prompt, with her current address in the field. */
  async function openKarensPrompt(user: User) {
    const prompt = await openPromptFor(user, 'Karen Hovhannisyan');
    const field = within(prompt).getByLabelText(/^email$/i) as HTMLInputElement;
    expect(field.value).toBe('karen@lumen.am');
    return { prompt, field };
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

    const { prompt, field } = await openKarensPrompt(user);
    // What is at stake for somebody who signs in is the working password, so
    // that is what the help text says — before the send, not after it. "The
    // previous link stops working" is for somebody still holding a link.
    expect(within(prompt).getByText(/current password keeps working/i)).toBeTruthy();
    expect(within(prompt).queryByText(/previous link stops working/i)).toBeNull();

    await user.clear(field);
    await user.type(field, 'karen.h@lumen.am');
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));

    // Stated back, not sent.
    expect(within(prompt).getByText(/karen\.h@lumen\.am instead of/i)).toBeTruthy();
    expect(issue).not.toHaveBeenCalled();

    await user.click(within(prompt).getByRole('button', { name: /yes, send it/i }));
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    expect(issue.mock.calls[0]?.[0].email).toBe('karen.h@lumen.am');

    // Somebody who already had a password is told it keeps working until then.
    const dialog = await findCredentialDialog();
    expect(dialog.textContent).toMatch(/current password keeps working/i);
  });

  it('names both addresses and says the password is unchanged, before the second click', async () => {
    /*
     * The three facts the owner needs before clicking again: the old address
     * stops working the moment the server answers, which one it was, and
     * that the password is untouched. A sentence naming only the new address
     * cannot tell a corrected typo from a second one.
     */
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    await withSigningInManager(gateway);
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    const { prompt, field } = await openKarensPrompt(user);
    await user.clear(field);
    await user.type(field, 'karen.h@lumen.am');
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));

    expect(
      within(prompt).getByText(/sign in with karen\.h@lumen\.am instead of karen@lumen\.am/i),
    ).toBeTruthy();
    expect(within(prompt).getByText(/password stays the same/i)).toBeTruthy();
  });

  it('announces the read-back, since focus stays on the button that did not send', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    await withSigningInManager(gateway);
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    const { prompt, field } = await openKarensPrompt(user);
    await user.clear(field);
    await user.type(field, 'karen.h@lumen.am');
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));

    // A polite live region: a screen-reader user who pressed Enter and got no
    // send hears why, rather than nothing.
    expect(within(prompt).getByRole('status').textContent).toContain('karen.h@lumen.am');
  });

  it('sends straight away for the same address', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    await withSigningInManager(gateway);
    const issue = vi.spyOn(gateway, 'issueStaffSignIn');
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    const { prompt } = await openKarensPrompt(user);
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));

    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/instead of/i)).toBeNull();
  });

  it('compares the address without the host locale, so a change of case is not a change', async () => {
    /*
     * The server stores `ToLowerInvariant`. In a Turkish-locale browser
     * `'I'.toLocaleLowerCase()` is dotless ı, so a comparison made with the
     * locale would read IRINA as a different address from irina and demand
     * the second click. Emulated: the runner's own locale is not Turkish.
     */
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    await withSigningInManager(gateway, { fullName: 'Irina Petrosyan', email: 'irina@lumen.am' });
    const issue = vi.spyOn(gateway, 'issueStaffSignIn');
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    const prompt = await openPromptFor(user, 'Irina Petrosyan');
    const field = within(prompt).getByLabelText(/^email$/i) as HTMLInputElement;
    const turkish = vi.spyOn(String.prototype, 'toLocaleLowerCase').mockImplementation(function (
      this: string,
    ) {
      return this.replaceAll('I', 'ı').toLowerCase();
    });
    try {
      await user.clear(field);
      await user.type(field, 'IRINA@LUMEN.AM');
      await user.click(within(prompt).getByRole('button', { name: /send link/i }));
      await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
      expect(screen.queryByText(/instead of/i)).toBeNull();
    } finally {
      turkish.mockRestore();
    }
  });

  it('says it is sending while the link is on its way', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const { issue, release } = withDeferredIssue(gateway);
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    const prompt = await openPromptFor(user, 'Nare Petrosyan');
    await user.type(within(prompt).getByLabelText(/^email$/i), 'nare@lumen.am');
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));

    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    // Nothing is being saved. The button says what is happening.
    const pending = within(prompt).getByRole('button', { name: /sending…/i }) as HTMLButtonElement;
    expect(pending.disabled).toBe(true);

    release();
    await findCredentialDialog();
  });

  it('warns about the previous link only for somebody still waiting to open one', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    // Issue once, so Nare has an address and no password.
    const first = await openPromptFor(user, 'Nare Petrosyan');
    await user.type(within(first).getByLabelText(/^email$/i), 'nare@lumen.am');
    await user.click(within(first).getByRole('button', { name: /send link/i }));
    const dialog = await findCredentialDialog();
    await user.click(within(dialog).getByRole('button', { name: /^done$/i }));
    await waitFor(() =>
      expect(within(cardOf('Nare Petrosyan')).getByText(/awaiting password/i)).toBeTruthy(),
    );

    const again = await openPromptFor(user, 'Nare Petrosyan');
    expect(within(again).getByText(/previous link stops working/i)).toBeTruthy();
    expect(within(again).queryByText(/current password keeps working/i)).toBeNull();
  });
});

describe('the sign-in link dialog', () => {
  async function openLinkDialog(user: User) {
    renderStaff({ role: 'owner' });
    await waitForList();
    await user.click(
      within(cardOf('Nare Petrosyan')).getByRole('button', { name: /issue sign-in/i }),
    );
    const prompt = screen.getByRole('form', { name: /sign-in for nare/i });
    await user.type(within(prompt).getByLabelText(/^email$/i), 'nare@lumen.am');
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));
    return findCredentialDialog();
  }

  it('copies the link, because a link exists to be pasted', async () => {
    // After `setup()`, which installs user-event's own clipboard.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    const dialog = await openLinkDialog(user);
    const token = tokenIn(dialog.textContent);
    const copy = within(dialog).getByRole('button', { name: /copy link/i });
    // The one filled button is the one that does what the dialog is for. A
    // mouse user clicks the filled button; "Done" filled meant the link was
    // gone before it was copied.
    expect(copy.className).toContain('button-primary');
    expect(within(dialog).getByRole('button', { name: /^done$/i }).className).not.toContain(
      'button-primary',
    );
    await user.click(copy);

    await within(dialog).findByText(/^copied$/i);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(token));
  });

  it('does not close on Escape until the link has been copied', async () => {
    /*
     * One keypress used to discard the only copy of a credential the server
     * can never reproduce. Escape now says what to do first, and works once
     * the link is on the clipboard.
     */
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    const dialog = await openLinkDialog(user);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(within(dialog).getByRole('status').textContent).toMatch(/copy the link first/i);

    await user.click(within(dialog).getByRole('button', { name: /copy link/i }));
    await within(dialog).findByText(/^copied$/i);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
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
    const name = 'Ani Hakobyan (Northern Avenue)';
    await chooseAction(user, cardOf(name), /^deactivate$/i);
    await waitFor(() => expect(screen.queryByText(name)).toBeNull());

    // Still there under the switch, with a working way back. Somebody who
    // left in March and returns in June is a reactivation, not a second record.
    await user.click(screen.getByLabelText(/show deactivated/i));
    await screen.findByText(name);
    const inactiveCard = cardOf(name);
    expect(within(inactiveCard).getByRole('button', { name: /reactivate/i })).toBeTruthy();

    await user.click(within(inactiveCard).getByRole('button', { name: /reactivate/i }));
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

    // Back on the step that holds the role, under the role choices — not above
    // the form, where it reads as a refusal of the whole thing. Described by
    // the error, not renamed by it, so the group still announces as the
    // question it asks.
    expect(progress().current).toBe(1);
    const roleGroup = within(addForm()).getByRole('group', { name: /what is their role/i });
    expect(roleGroup.getAttribute('aria-describedby')?.split(' ')).toContain(alert.id);
    expect(roleGroup.contains(alert)).toBe(true);
    expect(roleGroup.contains(document.activeElement)).toBe(true);
  });
});

describe('the PIN lockout', () => {
  it('is visible in the list with a way to clear it', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const clear = vi.spyOn(gateway, 'clearPinLockout');
    const user = userEvent.setup();

    renderStaff({ role: 'owner', gateway });
    await waitForList();

    // The fixture keeps somebody locked out: it is the most time-critical card
    // on the screen and a fixture without one would never render it.
    const locked = await screen.findByText(/PIN locked/i);
    const card = locked.closest('article')!;

    // The card's one visible action, not tucked into the menu.
    await user.click(within(card).getByRole('button', { name: /unlock pin/i }));
    await waitFor(() => expect(clear).toHaveBeenCalled());
  });
});

describe('what a manager sees', () => {
  it('cannot act on another manager', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'manager', branchCount: 1 });
    await waitForList();

    const managerCard = cardOf('Tigran Avetisyan');

    // Not offered, rather than offered and refused — neither as the card's
    // button nor inside a menu.
    expect(within(managerCard).queryByRole('button', { name: /^more actions/i })).toBeNull();
    expect(await actionsOf(user, managerCard)).toEqual([]);
    expect(within(managerCard).getByText(/above your role/i)).toBeTruthy();
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

    const otherOwner = cardOf('Hasmik Sargsyan');
    expect(within(otherOwner).getByText(/no sign-in/i)).toBeTruthy();
    const ownerActions = await actionsOf(user, otherOwner);
    expect(ownerActions.join('|')).not.toMatch(/issue sign-in|send new link/i);
    // Editable all the same: a co-owner is a peer for the sign-in rule only.
    expect(ownerActions).toContain('Edit');
    expect(within(otherOwner).queryByText(/above your role/i)).toBeNull();

    await user.click(screen.getByLabelText(/show deactivated/i));
    await screen.findByText('Nare Petrosyan');
    const deactivated = cardOf('Nare Petrosyan');
    expect(within(deactivated).getByRole('button', { name: /reactivate/i })).toBeTruthy();
    expect((await actionsOf(user, deactivated)).join('|')).not.toMatch(
      /issue sign-in|send new link/i,
    );
    // No warning either: deactivation explains the state, and a badge nobody
    // can act on is noise. It comes back with the action, on reactivation.
    expect(within(deactivated).queryByText(/no sign-in/i)).toBeNull();
  });

  it('sees no branch on the cards, because there is one branch', async () => {
    renderStaff({ role: 'manager', branchCount: 1 });
    await waitForList();

    // Tigran works at Cascade; with one branch in view the name is noise.
    expect(cardOf('Tigran Avetisyan').textContent).not.toContain('Cascade');
    expect(screen.queryByText('Cascade')).toBeNull();
    cleanup();

    // The same person, seen by an owner who covers three branches, is labelled.
    renderStaff({ role: 'owner' });
    await waitForList();
    expect((await screen.findAllByText('Cascade')).length).toBeGreaterThan(0);
    expect(within(cardOf('Tigran Avetisyan')).getByText('Cascade')).toBeTruthy();
    expect(within(cardOf('Aram Sargsyan')).getByText('All branches')).toBeTruthy();
  });
});

describe('the roster', () => {
  it('groups people by role, with a count on each group', async () => {
    renderStaff({ role: 'owner' });
    await waitForList();

    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    // Owners first, then down the ranks; the counts are the active people.
    expect(headings.slice(0, 4)).toEqual([
      'Owners 1',
      'Branch managers 4',
      'Waiters 3',
      'Kitchen 3',
    ]);
    const waiters = screen.getByRole('heading', { name: /^waiters/i }).closest('section')!;
    expect(within(waiters).getAllByRole('article')).toHaveLength(3);
  });

  it('marks your own card, and offers no action on it', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    const own = cardOf('Aram Sargsyan');
    expect(within(own).getByText('You')).toBeTruthy();
    expect(await actionsOf(user, own)).toEqual([]);
    // "Above your role" is about somebody else; on your own card it is wrong.
    expect(within(own).queryByText(/above your role/i)).toBeNull();
    expect(screen.getAllByText('You')).toHaveLength(1);
  });

  it('counts each role chip from what search and the switch leave', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    const chips = screen.getByRole('group', { name: /^role$/i });
    expect(within(chips).getByRole('radio', { name: 'All 11' })).toBeTruthy();
    expect(within(chips).getByRole('radio', { name: 'Waiters 3' })).toBeTruthy();
    expect((within(chips).getByRole('radio', { name: 'All 11' }) as HTMLInputElement).checked).toBe(
      true,
    );

    await user.type(screen.getByLabelText(/^search$/i), 'Ani');
    expect(within(chips).getByRole('radio', { name: 'All 3' })).toBeTruthy();
    expect(within(chips).getByRole('radio', { name: 'Waiters 3' })).toBeTruthy();
    expect(within(chips).getByRole('radio', { name: 'Owners 0' })).toBeTruthy();

    await user.clear(screen.getByLabelText(/^search$/i));
    await user.click(within(chips).getByRole('radio', { name: /^kitchen/i }));
    expect(screen.queryByText('Aram Sargsyan')).toBeNull();
    expect(screen.getAllByRole('article')).toHaveLength(3 + 2 /* the two tablets */);
    expect(screen.getAllByText(/^Sona Vardanyan/)).toHaveLength(3);
  });

  it('finds somebody by their phone number as well as their name', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    await user.type(screen.getByLabelText(/^search$/i), '37477101010');
    expect(screen.getByText('Aram Sargsyan')).toBeTruthy();
    expect(screen.queryByText('Nare Petrosyan')).toBeNull();
  });

  it('has a real switch for deactivated people, which swaps the list', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    const toggle = screen.getByRole('switch', { name: /show deactivated/i }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.queryByText(/^Davit Manukyan/)).toBeNull();

    await user.click(toggle);
    expect(toggle.checked).toBe(true);
    expect(await screen.findAllByText(/^Davit Manukyan/)).toHaveLength(3);
    expect(screen.queryByText('Aram Sargsyan')).toBeNull();
    // The chips count what the switch shows.
    const chips = screen.getByRole('group', { name: /^role$/i });
    expect(within(chips).getByRole('radio', { name: 'All 3' })).toBeTruthy();

    // Space toggles it back, as a switch should.
    toggle.focus();
    await user.keyboard(' ');
    expect(toggle.checked).toBe(false);
    expect(await screen.findByText('Aram Sargsyan')).toBeTruthy();
  });
});

describe('the overflow menu', () => {
  it('opens from the keyboard, moves with the arrows and gives focus back on Escape', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    const card = cardOf('Sona Vardanyan (Northern Avenue)');
    const trigger = within(card).getByRole('button', {
      name: 'More actions for Sona Vardanyan (Northern Avenue)',
    });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    // Visible words beside the icon, never an icon on its own.
    expect(trigger.textContent).toBe('More');

    trigger.focus();
    await user.keyboard('{Enter}');
    const menu = screen.getByRole('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['New PIN', 'Deactivate']);
    expect(document.activeElement).toBe(items[0]);

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[1]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(items[1]);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(items[1]);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    // ArrowUp on the trigger opens on the last item.
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(
      within(screen.getByRole('menu')).getAllByRole('menuitem')[1],
    );
    await user.keyboard('{Escape}');
  });

  it('runs the item chosen and closes', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const setPin = vi.spyOn(gateway, 'setStaffPin');
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    const menu = await openMenuOf(user, cardOf('Sona Vardanyan (Northern Avenue)'));
    await user.click(within(menu).getByRole('menuitem', { name: /new pin/i }));
    expect(screen.queryByRole('menu')).toBeNull();
    await waitFor(() => expect(setPin).toHaveBeenCalledTimes(1));
    const dialog = await screen.findByRole('dialog', { name: /pin for sona/i });
    const pin = setPin.mock.calls[0]![0].pin;
    expect(within(dialog).getByText(pin)).toBeTruthy();
  });
});

describe('the add dialog', () => {
  it('walks four steps for a manager, marking the current one', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    await user.click(screen.getByRole('button', { name: /add someone/i }));
    const dialog = screen.getByRole('dialog', { name: /add someone/i });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(progress()).toMatchObject({ count: 4, current: 0 });
    expect(within(dialog).getByText('Step 1 of 4: Person')).toBeTruthy();
    // Back is not offered on the first step.
    expect(within(dialog).queryByRole('button', { name: /^back$/i })).toBeNull();

    await user.type(within(dialog).getByLabelText(/full name/i), 'Marine Sahakyan');
    await user.type(within(dialog).getByLabelText(/phone/i), '+37477123456');
    // Enter in a field is Next.
    await user.keyboard('{Enter}');
    expect(progress().current).toBe(1);
    expect(progress().labels[0]).toMatch(/person, done/i);
    expect(within(dialog).getByText('Step 2 of 4: Role and branch')).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: /^next$/i }));
    expect(within(dialog).getByText('Step 3 of 4: Tablet PIN')).toBeTruthy();
    // A PIN is checked before the next step, not at the end.
    await user.type(within(dialog).getByLabelText(/pin/i), '29');
    await user.click(within(dialog).getByRole('button', { name: /^next$/i }));
    expect(within(dialog).getByRole('alert').textContent).toMatch(/exactly 4 digits/i);
    expect(progress().current).toBe(2);
    await user.type(within(dialog).getByLabelText(/pin/i), '41');
    await user.click(within(dialog).getByRole('button', { name: /^next$/i }));
    expect(within(dialog).getByText('Step 4 of 4: Console sign-in')).toBeTruthy();
    expect(progress().current).toBe(3);

    // Back keeps what was typed.
    await user.click(within(dialog).getByRole('button', { name: /^back$/i }));
    expect((within(dialog).getByLabelText(/pin/i) as HTMLInputElement).value).toBe('2941');
    await user.click(within(dialog).getByRole('button', { name: /^back$/i }));
    await user.click(within(dialog).getByRole('button', { name: /^back$/i }));
    expect((within(dialog).getByLabelText(/full name/i) as HTMLInputElement).value).toBe(
      'Marine Sahakyan',
    );
  });

  it('skips the sign-in step for waiters and kitchen staff', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'manager' });
    await waitForList();

    await startHire(user);
    // A manager's only roles use a PIN, so there are three steps from the start.
    expect(progress().count).toBe(3);
    expect(progress().labels.join('|')).not.toMatch(/console sign-in/i);
    await user.click(within(addForm()).getByRole('radio', { name: /^kitchen/i }));
    expect(progress().count).toBe(3);
    await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
    expect(
      within(screen.getByRole('dialog', { name: /add someone/i })).getByText(
        'Step 3 of 3: Tablet PIN',
      ),
    ).toBeTruthy();
    expect(within(addForm()).getByRole('button', { name: /^add$/i })).toBeTruthy();
    expect(within(addForm()).queryByLabelText(/^email$/i)).toBeNull();
  });

  it('creates a waiter from the last step and shows their PIN once', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'manager' });
    const create = vi.spyOn(gateway, 'createStaff');
    const issue = vi.spyOn(gateway, 'issueStaffSignIn');
    const user = userEvent.setup();
    renderStaff({ role: 'manager', gateway });
    await waitForList();

    await startHire(user, 'Gor Mkrtchyan', '+37477999999');
    await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
    await user.type(within(addForm()).getByLabelText(/pin/i), '7315');
    await user.click(within(addForm()).getByRole('button', { name: /^add$/i }));

    const dialog = await screen.findByRole('dialog', { name: /pin for gor/i });
    expect(within(dialog).getByText('7315')).toBeTruthy();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(create.mock.calls[0]?.[0].staff).toEqual({
      fullName: 'Gor Mkrtchyan',
      phone: '+37477999999',
      role: 'waiter',
      pin: '7315',
      // A manager hires for the branch they are looking at.
      branchId: 'b-lumen-north',
    });
    expect(issue).not.toHaveBeenCalled();
  });

  it('keeps focus inside, closes on Escape and gives focus back to the button', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    const opener = screen.getByRole('button', { name: /add someone/i });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: /add someone/i });
    const name = within(dialog).getByLabelText(/full name/i);
    expect(document.activeElement).toBe(name);

    // Backwards off the first control wraps to the last, and forwards back.
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: /^next$/i }));
    await user.tab();
    expect(document.activeElement).toBe(name);
    for (let press = 0; press < 6; press += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('editing somebody', () => {
  it('opens one page with their details, and saves a patch', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const update = vi.spyOn(gateway, 'updateStaff');
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    const name = 'Sona Vardanyan (Cascade)';
    await chooseAction(user, cardOf(name), /^edit$/i);
    const dialog = screen.getByRole('dialog', { name: `Edit ${name}` });
    const form = within(dialog).getByRole('form');
    // No stepper: an edit is a correction to one field.
    expect(within(dialog).queryByRole('list', { name: /progress/i })).toBeNull();
    expect((within(form).getByLabelText(/full name/i) as HTMLInputElement).value).toBe(name);
    expect(document.activeElement).toBe(within(form).getByLabelText(/full name/i));
    expect(checkedRole(form)).toBe('kitchen');
    expect((within(form).getByLabelText(/which branch/i) as HTMLSelectElement).value).toBe(
      'b-lumen-cascade',
    );
    // No PIN and no address here: both have their own actions.
    expect(within(form).queryByLabelText(/^pin/i)).toBeNull();
    expect(within(form).queryByLabelText(/^email$/i)).toBeNull();

    await user.click(within(form).getByRole('radio', { name: /^waiter/i }));
    await user.click(within(form).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[0].patch).toEqual({
      fullName: name,
      phone: expect.any(String),
      role: 'waiter',
      setBranch: true,
      branchId: 'b-lumen-cascade',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const waiters = screen.getByRole('heading', { name: /^waiters/i }).closest('section')!;
    expect(within(waiters).getByText(name)).toBeTruthy();
  });

  it('closes on Escape without saving', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const update = vi.spyOn(gateway, 'updateStaff');
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    await chooseAction(user, cardOf('Nare Petrosyan'), /^edit$/i);
    await user.type(screen.getByLabelText(/full name/i), ' typo');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText('Nare Petrosyan')).toBeTruthy();
  });
});

/** Type-only guard: the list never grows a shape that could hold a PIN. */
export type StaffMemberHasNoPin = StaffMember extends { pin: unknown } ? never : true;

describe('devices', () => {
  it('asks for confirmation naming the device, then updates the list', async () => {
    /*
     * Named, because revoking the wrong one takes a venue's counter offline
     * mid-service — and the two cards most likely to be confused are the
     * tablet in use and the one it replaced.
     */
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    const deviceCard = (await screen.findByText('Counter tablet')).closest('article')!;
    await user.click(within(deviceCard).getByRole('button', { name: /^revoke$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Counter tablet');

    await user.click(within(dialog).getByRole('button', { name: /yes, revoke it/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Revoked and still listed: the list is an audit trail, not a roster.
    await waitFor(() => {
      const card = screen.getByText('Counter tablet').closest('article')!;
      expect(within(card).getByText(/revoked/i)).toBeTruthy();
      expect(within(card).queryByRole('button', { name: /^revoke$/i })).toBeNull();
    });
  });

  it('says when each tablet enrolled and was last seen, and claims no live status', async () => {
    renderStaff({ role: 'owner' });
    await waitForList();

    const card = (await screen.findByText('Counter tablet')).closest('article')!;
    expect(within(card).getByText(/^enrolled /i)).toBeTruthy();
    expect(within(card).getByText(/^seen |never connected/i)).toBeTruthy();
    // The API has a last-seen time and no presence, so nothing says "online".
    expect(card.textContent).not.toMatch(/online|offline/i);
    expect(screen.getByRole('heading', { name: /^tablets$/i })).toBeTruthy();
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
    const note = await screen.findByText(/stolen tablet is not a stolen till/i);
    // As a note, announced as one.
    expect(note.closest('[role="note"]')).toBeTruthy();
  });
});
