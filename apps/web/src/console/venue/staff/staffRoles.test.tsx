// @vitest-environment jsdom
import {
  StaffPinTakenError,
  ValidationError,
  createConsoleMockGateway,
  type ConsoleGateway,
} from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { StaffScreen } from './StaffScreen';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';

/**
 * The general manager, the branch manager `manager` now means, and PINs that
 * are unique per tablet — on the staff screen.
 *
 * What is offered follows the server's `StaffRoleRules`; where somebody works
 * follows `StaffMember`'s branch invariants; and the server's refusals land
 * under the field they are about.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

type User = ReturnType<typeof userEvent.setup>;
type Role = 'owner' | 'generalManager' | 'manager';

const NEEDS_BRANCH = 'A branch manager works at one branch. Choose it.';
const PIN_TAKEN = 'Somebody who signs in on this tablet already uses that PIN. Choose another.';

function renderStaff(options: { readonly role?: Role; readonly gateway?: ConsoleGateway } = {}) {
  const role = options.role ?? 'owner';
  const gateway = options.gateway ?? createConsoleMockGateway({ latencyMs: 0, role });
  const harness = createConsoleHarness({ gateway });
  const branchCount = role === 'manager' ? 1 : 3;
  const context = {
    branchId: 'b-lumen-north',
    timeZoneId: 'Asia/Yerevan',
    branchCount,
    canRollUpVenue: role !== 'manager',
    canRelocate: role === 'owner',
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
  return gateway;
}

/** A branch manager sees their own branch's people; everyone else sees the owner too. */
async function waitForList(role: Role = 'owner') {
  await screen.findByText(role === 'manager' ? 'Nare Petrosyan' : 'Aram Sargsyan', undefined, {
    timeout: 5000,
  });
}

function cardOf(name: string): HTMLElement {
  return screen.getByText(name).closest('article')!;
}

/** Runs an action on a card: its one button, or an item in its "More" menu. */
async function chooseAction(user: User, card: HTMLElement, name: RegExp) {
  const direct = within(card)
    .queryAllByRole('button')
    .find((button) => !button.hasAttribute('aria-haspopup') && name.test(button.textContent ?? ''));
  if (direct) {
    await user.click(direct);
    return;
  }
  await user.click(within(card).getByRole('button', { name: /^more actions for/i }));
  await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name }));
}

function addForm() {
  return screen.getByRole('form', { name: /add someone/i });
}

async function startHire(user: User, name = 'Marine Sahakyan') {
  await user.click(screen.getByRole('button', { name: /add someone/i }));
  await user.type(within(addForm()).getByLabelText(/full name/i), name);
  await user.type(within(addForm()).getByLabelText(/phone/i), '+37477123456');
  await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
}

function offeredRoles(container: HTMLElement): string[] {
  const group = within(container).getByRole('group', { name: /what is their role/i });
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

function branchOptions(container: HTMLElement): string[] {
  const select = within(container).getByLabelText(/which branch/i) as HTMLSelectElement;
  return [...select.options].map((option) => option.value);
}

/** Through the PIN step to the end, for a hire that needs no address. */
async function finishWithPin(user: User, pin: string) {
  await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
  await user.type(within(addForm()).getByLabelText(/^pin \(/i), pin);
  await user.click(within(addForm()).getByRole('button', { name: /^(add|next)$/i }));
}

async function dismissPin(user: User) {
  const dialog = await screen.findByRole('dialog', { name: /pin for/i });
  await user.click(within(dialog).getByRole('button'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('who is offered which role', () => {
  it('offers an owner the general manager, and opens on the branch manager', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();
    await startHire(user);

    expect(offeredRoles(addForm())).toEqual([
      'owner',
      'generalManager',
      'manager',
      'waiter',
      'kitchen',
    ]);
    // Neither a partner nor a venue-wide manager out of a careless hire.
    expect(checkedRole(addForm())).toBe('manager');
    expect(within(addForm()).getByRole('radio', { name: /^general manager/i })).toBeTruthy();
    expect(within(addForm()).getByRole('radio', { name: /^branch manager/i })).toBeTruthy();
  });

  it('offers a general manager branch managers and floor staff, at any branch', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'generalManager' });
    await waitForList('generalManager');
    await startHire(user);

    expect(offeredRoles(addForm())).toEqual(['manager', 'waiter', 'kitchen']);
    // A branch picker, as an owner has.
    expect(branchOptions(addForm())).toEqual(
      expect.arrayContaining(['b-lumen-north', 'b-lumen-cascade', 'b-lumen-saryan']),
    );
  });

  it('groups general managers under their own heading', async () => {
    renderStaff({ role: 'owner' });
    await waitForList();
    const card = cardOf('Hasmik Karapetyan');
    expect(
      within(card.closest('section')!).getByRole('heading', { name: /^general managers/i }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^branch managers/i })).toBeTruthy();
  });

  it('shows a branch manager only their own branch, and nothing they may not touch', async () => {
    renderStaff({ role: 'manager' });
    await waitForList('manager');
    // The owner and the general manager are not in a branch manager's list.
    expect(screen.queryByText('Aram Sargsyan')).toBeNull();
    expect(screen.queryByText('Hasmik Karapetyan')).toBeNull();
    // Their own kitchen hand is theirs to edit.
    const card = cardOf('Sona Vardanyan (Northern Avenue)');
    expect(within(card).queryByText(/above your role/i)).toBeNull();
  });
});

describe('where each role works', () => {
  it('gives a branch manager a branch, with no "All branches" to choose', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();
    await startHire(user);
    // The branch manager is the default.
    expect(branchOptions(addForm())).not.toContain('__all__');
    expect(branchOptions(addForm())).toContain('b-lumen-north');

    // A waiter may still be venue-wide.
    await user.click(within(addForm()).getByRole('radio', { name: /^waiter/i }));
    expect(branchOptions(addForm())).toContain('__all__');
  });

  it('gives a general manager no branch picker, and sends no branch', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const create = vi.spyOn(gateway, 'createStaff');
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();
    await startHire(user);

    await user.click(within(addForm()).getByRole('radio', { name: /^general manager/i }));
    expect(within(addForm()).queryByLabelText(/which branch/i)).toBeNull();
    expect(within(addForm()).getByText(/every branch of the venue/i)).toBeTruthy();

    await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
    await user.type(within(addForm()).getByLabelText(/^pin \(/i), '6150');
    // The sign-in step: an owner outranks a general manager.
    await user.click(within(addForm()).getByRole('button', { name: /^next$/i }));
    await user.type(within(addForm()).getByLabelText(/^email$/i), 'gm@lumen.am');
    await user.click(within(addForm()).getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]?.[0].staff).toMatchObject({
      role: 'generalManager',
      branchId: null,
    });
  });

  it("puts the server's branch refusal under the branch field", async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    vi.spyOn(gateway, 'createStaff').mockRejectedValue(
      new ValidationError({
        url: 'test',
        status: 422,
        problem: {
          type: 'about:blank',
          title: 'Validation failed',
          status: 422,
          detail: NEEDS_BRANCH,
          code: 'validation-failed',
          traceId: 'test',
          context: {
            field: 'branchId',
            fields: [{ field: 'branchId', message: NEEDS_BRANCH, bound: 'required' }],
          },
        },
      }),
    );
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();
    await startHire(user);
    await user.click(within(addForm()).getByRole('radio', { name: /^waiter/i }));
    await finishWithPin(user, '3804');

    // Back on the step that holds the field, with the sentence under it.
    const select = await within(addForm()).findByLabelText(/which branch/i);
    const alert = within(addForm()).getByRole('alert');
    expect(alert.textContent).toBe(NEEDS_BRANCH);
    expect(select.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('moves a branch manager to general manager with the branch cleared in one save', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const update = vi.spyOn(gateway, 'updateStaff');
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    await chooseAction(user, cardOf('Tigran Avetisyan'), /^edit$/i);
    const edit = screen.getByRole('form', { name: /edit tigran avetisyan/i });
    expect(branchOptions(edit)).not.toContain('__all__');

    await user.click(within(edit).getByRole('radio', { name: /^general manager/i }));
    expect(within(edit).queryByLabelText(/which branch/i)).toBeNull();
    await user.click(within(edit).getByRole('button', { name: /save/i }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0]?.[0].patch).toMatchObject({
      role: 'generalManager',
      setBranch: true,
      branchId: null,
    });
    await waitFor(() => expect(screen.queryByRole('form', { name: /edit tigran/i })).toBeNull());
  });
});

describe('a PIN somebody on the same tablet already uses', () => {
  it('is refused on the PIN step, under the PIN field, with the rest kept', async () => {
    const user = userEvent.setup();
    renderStaff({ role: 'owner' });
    await waitForList();

    await startHire(user, 'Gor Melikyan');
    await user.click(within(addForm()).getByRole('radio', { name: /^waiter/i }));
    await finishWithPin(user, '5307');
    await dismissPin(user);

    // The same PIN for somebody at the same branch: one keypad, one PIN each.
    await startHire(user, 'Lusine Melikyan');
    await user.click(within(addForm()).getByRole('radio', { name: /^waiter/i }));
    await finishWithPin(user, '5307');

    const pin = await within(addForm()).findByLabelText(/^pin \(/i);
    const alert = within(addForm()).getByRole('alert');
    expect(alert.textContent).toBe(PIN_TAKEN);
    expect(pin.getAttribute('aria-describedby')).toContain(alert.id);
    // Nothing else was lost: back one step is still a waiter.
    await user.click(within(addForm()).getByRole('button', { name: /^back$/i }));
    expect(checkedRole(addForm())).toBe('waiter');
  });

  it('is refused on "Change my PIN", under the field', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    vi.spyOn(gateway, 'setStaffPin').mockRejectedValue(
      new StaffPinTakenError({ url: 'test', detail: PIN_TAKEN }),
    );
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    await chooseAction(user, cardOf('Aram Sargsyan'), /change my pin/i);
    const dialog = screen.getByRole('dialog', { name: /change my pin/i });
    const fields = within(dialog).getAllByLabelText(/^new pin/i);
    await user.type(fields[0]!, '2468');
    await user.type(fields[1]!, '2468');
    await user.click(within(dialog).getByRole('button', { name: /^change pin$/i }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toBe(PIN_TAKEN);
    expect(fields[0]!.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('draws another PIN for "New PIN" when the first is taken, and shows only that one', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const real = gateway.setStaffPin.bind(gateway);
    const setPin = vi
      .spyOn(gateway, 'setStaffPin')
      .mockRejectedValueOnce(new StaffPinTakenError({ url: 'test', detail: PIN_TAKEN }))
      .mockImplementation(real);
    const user = userEvent.setup();
    renderStaff({ role: 'owner', gateway });
    await waitForList();

    await chooseAction(user, cardOf('Sona Vardanyan (Northern Avenue)'), /^new pin$/i);

    const dialog = await screen.findByRole('dialog', { name: /pin for/i });
    await waitFor(() => expect(setPin).toHaveBeenCalledTimes(2));
    const [first, second] = setPin.mock.calls.map((call) => call[0].pin);
    expect(first).not.toBe(second);
    expect(within(dialog).getByText(second!)).toBeTruthy();
    // The refused PIN is shown nowhere as a PIN. Not a page-wide substring check:
    // a random four digits can sit inside a phone number on the list (CI drew one
    // that a fixture's number contains).
    expect(screen.queryByText(first!, { exact: true })).toBeNull();
  });
});
