// @vitest-environment jsdom
import { StaffPinTakenError, createConsoleMockGateway, type ConsoleGateway } from '@yalla/api';
import { formatDate, formatTime } from '@yalla/format';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../ui/toast';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { StaffScreen } from './StaffScreen';

/**
 * The Staff page (venue console Staff artboard): people grouped by role at the
 * branch on screen, today's shift line, the "above your role" lock, the row's
 * one button and its ⋮ menu, the four-step add, PINs, links and enrolment
 * codes shown once, deactivate with undo, your own PIN, the tablets, and the
 * shift editor.
 *
 * Against the real console mock. At Northern Avenue: Nare Petrosyan runs the
 * branch, Ani Hakobyan's PIN is locked, Davit Manukyan left, Sona Vardanyan is
 * in the kitchen; Aram Sargsyan (owner) and Hasmik Karapetyan (general
 * manager) work at every branch. The mock seeds Nare on today 10:00–19:00, Ani
 * on today 16:00–00:00 and Sona on tomorrow 11:00–19:00.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

type User = ReturnType<typeof userEvent.setup>;
type Role = 'owner' | 'generalManager' | 'manager';

const NORTH = 'b-lumen-north';
const ANI = 'Ani Hakobyan (Northern Avenue)';
const SONA = 'Sona Vardanyan (Northern Avenue)';
const DAVIT = 'Davit Manukyan (Northern Avenue)';
const PIN_TAKEN = 'Somebody who signs in on this tablet already uses that PIN. Choose another.';

function renderStaff(options: { readonly role?: Role; readonly gateway?: ConsoleGateway } = {}) {
  const role = options.role ?? 'owner';
  const gateway = options.gateway ?? createConsoleMockGateway({ latencyMs: 0, role });
  const harness = createConsoleHarness({ gateway });
  const context = {
    branchId: NORTH,
    branchName: 'Northern Avenue',
    timeZoneId: 'Asia/Yerevan',
    branchCount: role === 'manager' ? 1 : 3,
    canRollUpVenue: role !== 'manager',
    canRelocate: role === 'owner',
  };
  render(
    harness.wrap(
      <ToastProvider>
        <Routes>
          <Route path="/venue" element={<Outlet context={context} />}>
            <Route path="staff" element={<StaffScreen />} />
          </Route>
        </Routes>
      </ToastProvider>,
      '/venue/staff',
    ),
  );
  return gateway;
}

async function waitForList() {
  await screen.findByText(SONA, undefined, { timeout: 5000 });
}

/** A person's row, by the name on it. */
function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('li')!;
}

async function choose(user: User, name: string, item: RegExp) {
  await user.click(within(rowOf(name)).getByRole('button', { name: /^More actions for/u }));
  await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: item }));
}

/** Everything a row offers: its button and every item in its menu. */
async function offered(user: User, name: string): Promise<string[]> {
  const buttons = within(rowOf(name)).queryAllByRole('button');
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

function wizard() {
  return screen.getByRole('dialog', { name: 'New staff member' });
}

function offeredRoles(): string[] {
  return within(wizard())
    .getAllByRole('radio')
    .map((radio) => (radio as HTMLInputElement).value);
}

async function personStep(user: User, name = 'Marine Sahakyan') {
  await user.click(screen.getByRole('button', { name: 'Add staff' }));
  await user.type(within(wizard()).getByLabelText(/^Full name/u), name);
  await user.type(within(wizard()).getByLabelText(/^Phone/u), '+37477123456');
  await user.click(within(wizard()).getByRole('button', { name: 'Continue →' }));
}

async function walkToPin(user: User, role: string) {
  await personStep(user);
  await user.click(within(wizard()).getByRole('radio', { name: new RegExp(`^${role}`, 'u') }));
  await user.click(within(wizard()).getByRole('button', { name: 'Continue →' }));
}

function pinTaken() {
  return new StaffPinTakenError({
    url: 'mock://yalla',
    detail: PIN_TAKEN,
    problem: {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: PIN_TAKEN,
      code: 'pin-taken',
      traceId: 'mock',
      context: { field: 'pin' },
    },
  });
}

describe('the list', () => {
  it("groups the branch's people by role, with the venue-wide ones, and marks you", async () => {
    renderStaff();
    await waitForList();

    for (const heading of [/^Owners\s*1$/u, /^General managers\s*1$/u, /^Branch managers\s*1$/u]) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    }
    expect(within(rowOf('Aram Sargsyan')).getByText('You')).toBeTruthy();
    expect(within(rowOf('Aram Sargsyan')).getByText('All branches')).toBeTruthy();
    // Another branch's people are on that branch's page.
    expect(screen.queryByText('Ani Hakobyan (Cascade)')).toBeNull();
    // Somebody who left is listed only on request.
    expect(screen.queryByText(DAVIT)).toBeNull();
  });

  it("says who is on today's shift, and each person's next one", async () => {
    renderStaff();
    await waitForList();

    expect(await screen.findByText(/on shift today: 2 people/u)).toBeTruthy();
    expect(within(rowOf('Nare Petrosyan')).getByText('Today 10:00–19:00')).toBeTruthy();
    expect(within(rowOf(ANI)).getByText('Today 16:00–00:00')).toBeTruthy();
    expect(within(rowOf(SONA)).getByText('Tomorrow 11:00–19:00')).toBeTruthy();
    expect(within(rowOf('Hasmik Karapetyan')).getByText('No shift set')).toBeTruthy();
  });

  it('says each state in a pill, and offers a deactivated person only the way back', async () => {
    const user = userEvent.setup();
    renderStaff();
    await waitForList();

    expect(within(rowOf('Aram Sargsyan')).getByText('Active')).toBeTruthy();
    expect(within(rowOf('Nare Petrosyan')).getByText('No sign-in')).toBeTruthy();
    expect(within(rowOf(ANI)).getByText('PIN locked')).toBeTruthy();

    await user.click(screen.getByLabelText('Show deactivated'));
    expect(within(rowOf(DAVIT)).getByText('Deactivated')).toBeTruthy();
    expect(await offered(user, DAVIT)).toEqual(['Reactivate']);
  });

  it('finds somebody by phone as well as by name, and narrows to a role', async () => {
    const user = userEvent.setup();
    renderStaff();
    await waitForList();

    await user.type(screen.getByLabelText('Search'), '+37477400333');
    await waitFor(() => expect(screen.queryByText('Aram Sargsyan')).toBeNull());
    expect(screen.getByText(SONA)).toBeTruthy();

    await user.clear(screen.getByLabelText('Search'));
    await user.selectOptions(screen.getByLabelText('Role'), 'waiter');
    expect(screen.getByText(ANI)).toBeTruthy();
    expect(screen.queryByText(SONA)).toBeNull();

    await user.type(screen.getByLabelText('Search'), 'nobody at all');
    expect(screen.getByRole('heading', { name: 'Nobody found' })).toBeTruthy();
  });
});

describe('what each role may do', () => {
  it('gives a branch manager their own branch, their own PIN and shifts, and floor staff', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'manager' });
    await waitForList();

    expect(screen.queryByText('Aram Sargsyan')).toBeNull();
    expect(within(rowOf('Nare Petrosyan')).getByText('You')).toBeTruthy();
    expect(await offered(user, 'Nare Petrosyan')).toEqual(['Change my PIN', 'Shifts']);
    expect(await offered(user, SONA)).toEqual(['New PIN', 'Edit', 'Shifts', 'Deactivate']);
  });

  it('locks a general manager out of an owner, and lets them run a branch manager', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'generalManager' });
    await waitForList();

    expect(within(rowOf('Aram Sargsyan')).getByText('Above your role')).toBeTruthy();
    expect(await offered(user, 'Aram Sargsyan')).toEqual([]);
    expect(await offered(user, 'Nare Petrosyan')).toEqual([
      'Give sign-in',
      'New PIN',
      'Edit',
      'Shifts',
      'Issue sign-in',
      'Deactivate',
    ]);
  });

  it('offers an owner every role, a general manager branch managers and floor staff', async () => {
    const user = userEvent.setup();
    renderStaff();
    await waitForList();
    await personStep(user);
    expect(offeredRoles()).toEqual(['owner', 'generalManager', 'manager', 'waiter', 'kitchen']);
    cleanup();

    renderStaff({ role: 'generalManager' });
    await waitForList();
    await personStep(user);
    expect(offeredRoles()).toEqual(['manager', 'waiter', 'kitchen']);
    // A general manager works everywhere: no branch to pick for one.
    await user.click(within(wizard()).getByRole('radio', { name: /^Branch manager/u }));
    expect(within(wizard()).getByLabelText('At which branch')).toBeTruthy();
  });
});

describe('the row button', () => {
  it('unlocks a locked PIN in one press and says so', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const clear = vi.spyOn(gateway, 'clearPinLockout');
    renderStaff({ gateway });
    await waitForList();

    await user.click(within(rowOf(ANI)).getByRole('button', { name: `Unlock PIN: ${ANI}` }));
    await waitFor(() =>
      expect(clear).toHaveBeenCalledWith({ branchId: NORTH, staffMemberId: `${NORTH}-waiter-1` }),
    );
    expect(await screen.findByText(`PIN unlocked: ${ANI}`)).toBeTruthy();
    await waitFor(() => expect(within(rowOf(ANI)).getByText('Active')).toBeTruthy());
  });

  it('gives a branch manager a sign-in shown once, and warns once before closing uncopied', async () => {
    const user = userEvent.setup();
    renderStaff();
    await waitForList();

    await user.click(
      within(rowOf('Nare Petrosyan')).getByRole('button', { name: 'Give sign-in: Nare Petrosyan' }),
    );
    const issue = screen.getByRole('dialog', { name: 'Sign-in link: Nare Petrosyan' });
    await user.type(within(issue).getByLabelText(/^Email/u), 'nare@lumen.am');
    await user.click(within(issue).getByRole('button', { name: 'Make the link' }));

    const once = await screen.findByRole('dialog', { name: 'Sign-in: Nare Petrosyan' });
    const link = (within(once).getByLabelText('Sign-in link') as HTMLInputElement).value;
    expect(link).toMatch(/reset-password/u);
    await user.click(within(once).getByRole('button', { name: 'Done' }));
    expect(within(once).getByRole('alert').textContent).toMatch(/Copy the link first/u);
    await user.click(within(once).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByDisplayValue(link)).toBeNull();
    await waitFor(() =>
      expect(within(rowOf('Nare Petrosyan')).getByText('Awaiting password')).toBeTruthy(),
    );
  });

  it('refuses an address over 320 characters from the row before anything is sent', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const issue = vi.spyOn(gateway, 'issueStaffSignIn');
    renderStaff({ gateway });
    await waitForList();

    await user.click(
      within(rowOf('Nare Petrosyan')).getByRole('button', { name: 'Give sign-in: Nare Petrosyan' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Sign-in link: Nare Petrosyan' });
    const field = within(dialog).getByLabelText(/^Email/u) as HTMLInputElement;
    expect(field.maxLength).toBe(320);
    // `maxLength` binds typing, not a value an autofill sets: checked on submit too.
    fireEvent.change(field, { target: { value: `${'a'.repeat(312)}@lumen.am` } });
    await user.click(within(dialog).getByRole('button', { name: 'Make the link' }));
    expect(within(dialog).getByText('An email address is at most 320 characters.')).toBeTruthy();
    expect(issue).not.toHaveBeenCalled();
  });
});

describe('a new PIN', () => {
  it('is drawn, set, shown once to read out, and gone after "Written down"', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const setPin = vi.spyOn(gateway, 'setStaffPin');
    renderStaff({ gateway });
    await waitForList();

    await choose(user, SONA, /^New PIN$/u);
    const once = await screen.findByRole('dialog', { name: `PIN for ${SONA}` });
    const pin = setPin.mock.calls[0]?.[0].pin ?? '';
    expect(pin).toMatch(/^\d{4}$/u);
    expect(within(once).getByLabelText(pin.split('').join(' ')).textContent).toBe(pin);
    // A PIN has nothing to copy: one press closes it.
    await user.click(within(once).getByRole('button', { name: 'Written down' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByLabelText(pin.split('').join(' '))).toBeNull();
  });

  it('draws again when the first one is somebody else’s on the same tablet', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const real = gateway.setStaffPin.bind(gateway);
    const setPin = vi
      .spyOn(gateway, 'setStaffPin')
      .mockRejectedValueOnce(pinTaken())
      .mockImplementation(real);
    renderStaff({ gateway });
    await waitForList();

    await choose(user, SONA, /^New PIN$/u);
    const once = await screen.findByRole('dialog', { name: `PIN for ${SONA}` });
    expect(setPin).toHaveBeenCalledTimes(2);
    const shown = setPin.mock.calls[1]?.[0].pin ?? '';
    expect(within(once).getByLabelText(shown.split('').join(' '))).toBeTruthy();
  });
});

describe('adding somebody', () => {
  it('offers a branch manager floor roles at their own branch, and shows the PIN once', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'manager' });
    const create = vi.spyOn(gateway, 'createStaff');
    renderStaff({ role: 'manager', gateway });
    await waitForList();

    await personStep(user);
    expect(offeredRoles()).toEqual(['waiter', 'kitchen']);
    expect(within(wizard()).queryByLabelText('At which branch')).toBeNull();
    expect(within(wizard()).getByText(/Northern Avenue · a branch manager adds/u)).toBeTruthy();
    await user.click(within(wizard()).getByRole('button', { name: 'Continue →' }));
    await user.type(within(wizard()).getByLabelText(/^Tablet PIN/u), '4821');
    await user.click(within(wizard()).getByRole('button', { name: 'Continue →' }));
    expect(within(wizard()).getByText(/works on the tablet only/u)).toBeTruthy();
    await user.click(within(wizard()).getByRole('button', { name: 'Add' }));

    const once = await screen.findByRole('dialog', { name: 'Marine Sahakyan was added' });
    expect(within(once).getByText('4821')).toBeTruthy();
    expect(create.mock.calls[0]?.[0].staff).toMatchObject({ role: 'waiter', branchId: NORTH });
    await user.click(within(once).getByRole('button', { name: 'Written down' }));
    expect(await screen.findByText('Staff member added')).toBeTruthy();
    expect(screen.queryByText('4821')).toBeNull();
    expect(screen.getByText('Marine Sahakyan')).toBeTruthy();
  });

  it('issues a manager’s sign-in on its own call, never inside the create', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const create = vi.spyOn(gateway, 'createStaff');
    const issue = vi.spyOn(gateway, 'issueStaffSignIn');
    renderStaff({ gateway });
    await waitForList();

    await walkToPin(user, 'Branch manager');
    await user.type(within(wizard()).getByLabelText(/^Tablet PIN/u), '4821');
    await user.click(within(wizard()).getByRole('button', { name: 'Continue →' }));
    const email = within(wizard()).getByLabelText(/^Email for the console/u) as HTMLInputElement;
    expect(email.maxLength).toBe(320);
    await user.type(email, 'marine@lumen.am');
    await user.click(within(wizard()).getByRole('button', { name: 'Add' }));

    const once = await screen.findByRole('dialog', { name: 'Marine Sahakyan was added' });
    expect(create.mock.calls[0]?.[0].staff).not.toHaveProperty('email');
    expect(issue).toHaveBeenCalledWith(expect.objectContaining({ email: 'marine@lumen.am' }));
    expect(within(once).getByText('4821')).toBeTruthy();
    expect(within(once).getByLabelText('Sign-in link')).toBeTruthy();
  });

  it('tells an owner a co-owner’s sign-in is not theirs to issue', async () => {
    const user = userEvent.setup();
    renderStaff();
    await waitForList();

    await walkToPin(user, 'Owner');
    await user.type(within(wizard()).getByLabelText(/^Tablet PIN/u), '4821');
    await user.click(within(wizard()).getByRole('button', { name: 'Continue →' }));
    expect(within(wizard()).queryByLabelText(/^Email for the console/u)).toBeNull();
    expect(within(wizard()).getByText(/issued by the Yalla team/u)).toBeTruthy();
  });

  it('takes a PIN somebody on the tablet uses back to the PIN, under the field', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    vi.spyOn(gateway, 'createStaff').mockRejectedValueOnce(pinTaken());
    renderStaff({ gateway });
    await waitForList();

    await walkToPin(user, 'Waiter');
    await user.type(within(wizard()).getByLabelText(/^Tablet PIN/u), '4821');
    await user.click(within(wizard()).getByRole('button', { name: 'Continue →' }));
    await user.click(within(wizard()).getByRole('button', { name: 'Add' }));

    expect(await within(wizard()).findByText(/already uses that PIN/u)).toBeTruthy();
    const pin = within(wizard()).getByLabelText(/^Tablet PIN/u);
    expect(pin.getAttribute('aria-invalid')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(pin));
  });
});

describe('deactivating', () => {
  it('asks first, takes the person off the list, and the toast brings them back', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const update = vi.spyOn(gateway, 'updateStaff');
    renderStaff({ gateway });
    await waitForList();

    await choose(user, SONA, /^Deactivate$/u);
    const confirm = screen.getByRole('alertdialog', { name: `Deactivate ${SONA}?` });
    // Cancel has the focus: the safe choice.
    await waitFor(() =>
      expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Cancel' })),
    );
    await user.click(within(confirm).getByRole('button', { name: 'Deactivate' }));

    expect(await screen.findByText(`${SONA} was deactivated`)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(SONA)).toBeNull());
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ patch: { isActive: false } }),
    );

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText(SONA)).toBeTruthy();
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ patch: { isActive: true } }));
  });
});

describe('editing somebody', () => {
  it('saves a patch from one page, with the staff id to copy', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const update = vi.spyOn(gateway, 'updateStaff');
    renderStaff({ gateway });
    await waitForList();

    await choose(user, SONA, /^Edit$/u);
    const dialog = screen.getByRole('dialog', { name: `Edit ${SONA}` });
    expect(within(dialog).getByText(`${NORTH}-kitchen`)).toBeTruthy();
    const phone = within(dialog).getByLabelText('Phone');
    await user.clear(phone);
    await user.type(phone, '+37477000111');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(update.mock.calls[0]?.[0].patch).toMatchObject({ phone: '+37477000111' }),
    );
    expect(await screen.findByText(`Saved: ${SONA}`)).toBeTruthy();
  });

  it('promotes somebody to general manager with no branch to pick or send', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    renderStaff({ gateway });
    await waitForList();

    await choose(user, SONA, /^Edit$/u);
    const dialog = screen.getByRole('dialog', { name: `Edit ${SONA}` });
    await user.click(within(dialog).getByRole('radio', { name: /^General manager/u }));
    // A general manager has no branch: the form says so and sends none.
    expect(within(dialog).queryByLabelText('Which branch?')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText(`Saved: ${SONA}`)).toBeTruthy();
  });
});

describe('changing your own PIN', () => {
  it('refuses two that differ without a call, then sets it and never shows the digits', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const setPin = vi.spyOn(gateway, 'setStaffPin');
    renderStaff({ gateway });
    await waitForList();

    await user.click(screen.getByRole('button', { name: 'Change my PIN' }));
    const dialog = screen.getByRole('dialog', { name: 'Change my PIN' });
    await user.type(within(dialog).getByLabelText('New PIN'), '2468');
    await user.type(within(dialog).getByLabelText('New PIN again'), '2469');
    await user.click(within(dialog).getByRole('button', { name: 'Change PIN' }));
    expect(within(dialog).getByRole('alert').textContent).toMatch(/do not match/u);
    expect(setPin).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText('New PIN again'));
    await user.type(within(dialog).getByLabelText('New PIN again'), '2468');
    await user.click(within(dialog).getByRole('button', { name: 'Change PIN' }));
    expect(await screen.findByText(/Your PIN is changed/u)).toBeTruthy();
    expect(setPin).toHaveBeenCalledWith(
      expect.objectContaining({ staffMemberId: 'v-lumen-owner', pin: '2468' }),
    );
    expect(screen.queryByText('2468')).toBeNull();
  });

  it('puts a PIN somebody on the tablet uses under the new PIN', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    vi.spyOn(gateway, 'setStaffPin').mockRejectedValueOnce(pinTaken());
    renderStaff({ gateway });
    await waitForList();

    await user.click(screen.getByRole('button', { name: 'Change my PIN' }));
    const dialog = screen.getByRole('dialog', { name: 'Change my PIN' });
    await user.type(within(dialog).getByLabelText('New PIN'), '2468');
    await user.type(within(dialog).getByLabelText('New PIN again'), '2468');
    await user.click(within(dialog).getByRole('button', { name: 'Change PIN' }));

    expect(await within(dialog).findByText(PIN_TAKEN)).toBeTruthy();
    expect(within(dialog).getByLabelText('New PIN').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('the tablets', () => {
  it('revokes one after a confirm naming it, and keeps it listed as revoked', async () => {
    const user = userEvent.setup();
    renderStaff();
    await screen.findByText('Counter tablet');

    await user.click(screen.getByRole('button', { name: 'Revoke Counter tablet' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Revoke Counter tablet?' });
    await user.click(within(confirm).getByRole('button', { name: 'Yes, revoke it' }));
    expect(await screen.findByText('Counter tablet was revoked')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('Revoked')).toHaveLength(2));
  });

  it('shows an enrolment code once, and says a tablet grants nothing alone', async () => {
    const user = userEvent.setup();
    renderStaff();
    await screen.findByText('Counter tablet');
    expect(screen.getByText(/A device grants nothing on its own/u)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Generate a code' }));
    const once = await screen.findByRole('dialog', { name: 'Tablet enrolment code' });
    expect(within(once).getByText(/connect it to Northern Avenue/u)).toBeTruthy();
    // Two groups of five, as the tablet's field shows what is typed.
    expect(within(once).getByText(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/u)).toBeTruthy();
    await user.click(within(once).getByRole('button', { name: 'Written down' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('shifts', () => {
  async function openShifts(user: User, name: string) {
    await choose(user, name, /^Shifts$/u);
    return screen.getByRole('dialog', { name: `Shifts: ${name}` });
  }

  it("plans a day off, and the row's line says so", async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const create = vi.spyOn(gateway, 'createShift');
    renderStaff({ gateway });
    await waitForList();

    const dialog = await openShifts(user, 'Hasmik Karapetyan');
    expect(within(dialog).getByText('No shifts planned yet.')).toBeTruthy();
    await user.click(within(dialog).getByRole('radio', { name: 'Day off' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(create.mock.calls[0]?.[0]).toMatchObject({
        branchId: NORTH,
        staffMemberId: 'v-lumen-general-manager',
        shift: { dayOff: true, startsAt: null, endsAt: null },
      }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(await within(rowOf('Hasmik Karapetyan')).findByText('Today: day off')).toBeTruthy();
  });

  it('puts an overlap with another of their shifts under the start, in its own words', async () => {
    const user = userEvent.setup();
    renderStaff();
    await waitForList();
    await screen.findByText('Today 16:00–00:00');

    const dialog = await openShifts(user, ANI);
    const from = within(dialog).getByLabelText('From');
    await user.clear(from);
    await user.type(from, '12:00');
    const to = within(dialog).getByLabelText('To');
    await user.clear(to);
    await user.type(to, '17:00');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    expect(await within(dialog).findByText(/overlaps another of their shifts/u)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(from));
    expect(from.getAttribute('aria-invalid')).toBe('true');
  });

  it('refuses a shift with no length before anything is sent', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const create = vi.spyOn(gateway, 'createShift');
    renderStaff({ gateway });
    await waitForList();

    const dialog = await openShifts(user, SONA);
    const to = within(dialog).getByLabelText('To');
    await user.clear(to);
    await user.type(to, '10:00');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByText('The end has to differ from the start')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it('removes one, and the toast plans it again', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const create = vi.spyOn(gateway, 'createShift');
    renderStaff({ gateway });
    await waitForList();
    await screen.findByText('Tomorrow 11:00–19:00');

    const dialog = await openShifts(user, SONA);
    await user.click(within(dialog).getByRole('button', { name: 'Remove Tomorrow' }));
    expect(await screen.findByText('Removed: Tomorrow')).toBeTruthy();
    expect(await within(dialog).findByText('No shifts planned yet.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(create.mock.calls[0]?.[0].shift).toMatchObject({
        dayOff: false,
        startsAt: '11:00',
        endsAt: '19:00',
      }),
    );
    expect(await within(dialog).findByText('11:00–19:00')).toBeTruthy();
  });
});

describe('shifts, round 1', () => {
  async function openShifts(user: User, name: string) {
    await user.click(within(rowOf(name)).getByRole('button', { name: /^More actions for/u }));
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /^Shifts$/u }));
    return screen.getByRole('dialog', { name: `Shifts: ${name}` });
  }

  it('lists a shift planned weeks ahead, past the page’s two weeks, to change or remove', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const { serviceDate } = await gateway.listBranchShifts({ branchId: NORTH });
    const far = new Date(Date.parse(`${serviceDate}T00:00:00Z`) + 80 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await gateway.createShift({
      branchId: NORTH,
      staffMemberId: `${NORTH}-kitchen`,
      shift: { date: far, dayOff: false, startsAt: '09:00', endsAt: '15:00' },
    });
    renderStaff({ gateway });
    await waitForList();

    const dialog = await openShifts(user, SONA);
    expect(await within(dialog).findByText('09:00–15:00')).toBeTruthy();
    expect(within(dialog).getAllByRole('button', { name: /^Remove / })).toHaveLength(2);
  });

  it('plans the same shift again from the toast after the dialog has closed', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const create = vi.spyOn(gateway, 'createShift');
    renderStaff({ gateway });
    await waitForList();
    await screen.findByText('Tomorrow 11:00–19:00');

    const dialog = await openShifts(user, SONA);
    const removed = (await within(dialog).findAllByRole('button', { name: /^Remove / }))[0]!;
    await user.click(removed);
    expect(await screen.findByText('Removed: Tomorrow')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(within(rowOf(SONA)).getByText('No shift set')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('The shift is back')).toBeTruthy();
    const again = create.mock.calls[0]?.[0];
    const { serviceDate } = await gateway.listBranchShifts({ branchId: NORTH });
    const tomorrow = new Date(Date.parse(`${serviceDate}T00:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(again?.shift).toEqual({
      date: tomorrow,
      dayOff: false,
      startsAt: '11:00',
      endsAt: '19:00',
    });
    await waitFor(() => expect(within(rowOf(SONA)).getByText('Tomorrow 11:00–19:00')).toBeTruthy());
  });

  it('refreshes the shift lines when somebody is deactivated', async () => {
    const user = userEvent.setup();
    renderStaff();
    await waitForList();
    expect(await screen.findByText(/on shift today: 2 people/u)).toBeTruthy();

    await user.click(within(rowOf(ANI)).getByRole('button', { name: /^More actions for/u }));
    await user.click(
      within(screen.getByRole('menu')).getByRole('menuitem', { name: /^Deactivate$/u }),
    );
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Deactivate' }),
    );
    expect(await screen.findByText(/on shift today: 1 person/u)).toBeTruthy();
  });

  it("opens on the branch's date, not the device's UTC one", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
    // 01:30 on Tuesday the 20th at the branch; still Monday the 19th in UTC.
    vi.setSystemTime(new Date('2026-10-19T21:30:00Z'));
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderStaff();
      await waitForList();
      const dialog = await openShifts(user, SONA);
      expect((within(dialog).getByLabelText('Date') as HTMLInputElement).value).toBe('2026-10-20');
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets a shift still running from last night be corrected, on its own date', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
    let clock = new Date('2026-10-19T10:00:00Z');
    vi.setSystemTime(clock);
    try {
      const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner', now: () => clock });
      await gateway.createShift({
        branchId: NORTH,
        staffMemberId: 'v-lumen-general-manager',
        shift: { date: '2026-10-19', dayOff: false, startsAt: '18:00', endsAt: '02:00' },
      });
      // 00:30 at the branch: a new day, and the shift still running.
      clock = new Date('2026-10-19T20:30:00Z');
      vi.setSystemTime(clock);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderStaff({ gateway });
      await waitForList();

      const dialog = await openShifts(user, 'Hasmik Karapetyan');
      expect(await within(dialog).findByText('18:00–02:00 (next day)')).toBeTruthy();
      await user.click(within(dialog).getByRole('button', { name: /^Change / }));
      expect((within(dialog).getByLabelText('Date') as HTMLInputElement).min).toBe('2026-10-19');
    } finally {
      vi.useRealTimers();
    }
  });

  it('warns once before "Try again" takes away the PIN of a hire whose link was refused', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    vi.spyOn(gateway, 'issueStaffSignIn').mockRejectedValueOnce(new Error('down'));
    renderStaff({ gateway });
    await waitForList();

    await user.click(screen.getByRole('button', { name: 'Add staff' }));
    await user.type(within(wizard()).getByLabelText(/^Full name/u), 'Marine Sahakyan');
    await user.type(within(wizard()).getByLabelText(/^Phone/u), '+37477123456');
    await user.click(within(wizard()).getByRole('button', { name: 'Continue →' }));
    await user.click(within(wizard()).getByRole('radio', { name: /^Branch manager/u }));
    await user.click(within(wizard()).getByRole('button', { name: 'Continue →' }));
    await user.type(within(wizard()).getByLabelText(/^Tablet PIN/u), '4821');
    await user.click(within(wizard()).getByRole('button', { name: 'Continue →' }));
    await user.type(within(wizard()).getByLabelText(/^Email for the console/u), 'm@lumen.am');
    await user.click(within(wizard()).getByRole('button', { name: 'Add' }));

    const once = await screen.findByRole('dialog', { name: 'Marine Sahakyan was added' });
    await user.click(within(once).getByRole('button', { name: 'Try again' }));
    expect(within(once).getByText(/Write the PIN down first/u)).toBeTruthy();
    expect(within(once).getByText('4821')).toBeTruthy();
    await user.click(within(once).getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('dialog', { name: 'Sign-in link: Marine Sahakyan' }),
    ).toBeTruthy();
  });

  it('shows when an enrolment code stops working, date and time', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const make = vi.spyOn(gateway, 'createEnrolmentCode');
    renderStaff({ gateway });
    await screen.findByText('Counter tablet');

    await user.click(screen.getByRole('button', { name: 'Generate a code' }));
    const once = await screen.findByRole('dialog', { name: 'Tablet enrolment code' });
    const code = await make.mock.results[0]!.value;
    const day = formatDate(code.expiresAtUtc, 'Asia/Yerevan', 'en');
    const time = formatTime(code.expiresAtUtc, 'Asia/Yerevan', 'en');
    expect(within(once).getByText(new RegExp(`until ${day} ${time}`, 'u'))).toBeTruthy();
  });
});
