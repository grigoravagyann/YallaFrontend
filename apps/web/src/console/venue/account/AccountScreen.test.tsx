// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  createConsoleMockGateway,
  MOCK_VENUE_PASSWORD,
  StaffPinTakenError,
  type ConsoleGateway,
  type UserRole,
} from '@yalla/api';
import { i18next } from '@yalla/i18n';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppRoutes as AppRoutesComponent } from '../../../App';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';

/**
 * My account (venue-console Account artboard), as an owner, a general manager
 * or a branch manager opens it from the person at the sidebar's foot: their
 * name (the email is not theirs to change), the console password, their own
 * tablet PIN, the console's language, and where they are signed in. Its
 * logic is the artboard's `DCLogic`: the validation sentences, where the
 * focus goes, and what each toast says.
 */

let AppRoutes: typeof AppRoutesComponent;

beforeAll(async () => {
  vi.stubEnv('VITE_DATA_SOURCE', 'mock');
  await initConsoleTestI18n();
  ({ AppRoutes } = await import('../../../App'));
});

afterEach(async () => {
  cleanup();
  await i18next.changeLanguage('en');
});

async function renderAccount(role: UserRole = 'owner', gateway?: ConsoleGateway) {
  const source = gateway ?? createConsoleMockGateway({ latencyMs: 0, role });
  const user = await source.getCurrentUser();
  const harness = createConsoleHarness({ gateway: source });
  render(harness.wrap(<AppRoutes user={user} />, '/venue/account'));
  await screen.findByRole('heading', { level: 1, name: 'My account' });
  return { gateway: source, user };
}

describe('My account', () => {
  it('says whose account it is, as what, at which venue, and has every card', async () => {
    const { gateway, user } = await renderAccount('generalManager');
    const venue = await gateway.getManagedVenue(user.scope.venueId!);
    expect(await screen.findByText(`General manager · ${venue.name}`)).toBeTruthy();
    for (const card of [
      'Personal details',
      'Console password',
      'Tablet PIN',
      'Console language',
      "Where you're signed in",
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: card })).toBeTruthy();
    }
  });

  it('shows the email as fixed, and says who changes it', async () => {
    await renderAccount('owner');
    const email = (await screen.findByLabelText('Email')) as HTMLInputElement;
    expect(email.readOnly).toBe(true);
    expect(email.value).toMatch(/@/u);
    expect(screen.getByText('The Time to Eat team changes the email')).toBeTruthy();
    cleanup();
    await renderAccount('manager');
    expect(
      await screen.findByText('The owner changes the email, with a new sign-in link'),
    ).toBeTruthy();
  });

  it('renames them, refusing a blank name, and the sidebar follows', async () => {
    const actor = userEvent.setup();
    const { user } = await renderAccount('manager');
    const name = (await screen.findByLabelText(/^Full name/u)) as HTMLInputElement;
    await waitFor(() => expect(name.value).toBe(user.displayName));

    await actor.clear(name);
    await actor.click(screen.getByRole('button', { name: 'Save the name' }));
    expect(screen.getByText("The name can't be empty")).toBeTruthy();
    expect(document.activeElement).toBe(name);
    expect(name.getAttribute('aria-invalid')).toBe('true');

    await actor.type(name, 'Davit Grigoryan');
    expect(screen.getByText('Unsaved change')).toBeTruthy();
    await actor.click(screen.getByRole('button', { name: 'Save the name' }));
    expect(await screen.findByText('Saved')).toBeTruthy();
    const me = screen.getByRole('link', { name: /my account/i });
    await waitFor(() => expect(within(me).getByText('Davit Grigoryan')).toBeTruthy());
  });

  it('checks the password form first, and puts a wrong current password under its field', async () => {
    const actor = userEvent.setup();
    await renderAccount();
    const change = await screen.findByRole('button', { name: 'Change the password' });
    await actor.click(change);
    const current = screen.getByLabelText(/^Current password/u);
    expect(screen.getByText('Write your current password')).toBeTruthy();
    expect(document.activeElement).toBe(current);

    await actor.type(current, 'not-the-password');
    await actor.type(screen.getByLabelText(/^New password/u), 'long-enough-password');
    await actor.type(screen.getByLabelText(/^Repeat the new password/u), 'long-enough-password');
    await actor.click(change);
    expect(await screen.findByText('The current password is wrong')).toBeTruthy();
    expect(current.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(current);
  });

  it('changes the password, says the other devices were signed out, and lists only this one', async () => {
    const actor = userEvent.setup();
    await renderAccount();
    expect(await screen.findByRole('button', { name: 'Sign out everywhere else' })).toBeTruthy();
    const current = (await screen.findByLabelText(/^Current password/u)) as HTMLInputElement;
    await actor.type(current, MOCK_VENUE_PASSWORD);
    await actor.type(screen.getByLabelText(/^New password/u), 'a-brand-new-password');
    await actor.type(screen.getByLabelText(/^Repeat the new password/u), 'a-brand-new-password');
    await actor.click(screen.getByRole('button', { name: 'Change the password' }));
    expect(
      await screen.findByText('Password changed · you were signed out on your other devices'),
    ).toBeTruthy();
    expect(current.value).toBe('');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Sign out everywhere else' })).toBeNull(),
    );
    expect(sessionRows()).toHaveLength(1);
  });
});

describe('the tablet PIN', () => {
  it('takes digits only, four of them, the same twice — and says which is wrong', async () => {
    const actor = userEvent.setup();
    await renderAccount();
    const first = (await screen.findByLabelText('New PIN')) as HTMLInputElement;
    const second = screen.getByLabelText('Repeat the PIN') as HTMLInputElement;
    const save = screen.getByRole('button', { name: 'Change the PIN' });

    await actor.type(first, '1a2');
    expect(first.value).toBe('12');
    await actor.click(save);
    expect(screen.getByText('The PIN is exactly 4 digits')).toBeTruthy();
    expect(document.activeElement).toBe(first);
    expect(first.getAttribute('aria-invalid')).toBe('true');

    await actor.type(first, '34');
    await actor.type(second, '1235');
    await actor.click(save);
    expect(screen.getByText("The two PINs don't match")).toBeTruthy();
    expect(document.activeElement).toBe(second);
    expect(second.getAttribute('aria-invalid')).toBe('true');
  });

  it('sets their own PIN, says when to use it, and forgets it', async () => {
    const actor = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'manager' });
    const setPin = vi.spyOn(gateway, 'setStaffPin');
    const { user } = await renderAccount('manager', gateway);
    const first = (await screen.findByLabelText('New PIN')) as HTMLInputElement;
    const second = screen.getByLabelText('Repeat the PIN') as HTMLInputElement;
    await actor.type(first, '4826');
    await actor.type(second, '4826');
    await actor.click(screen.getByRole('button', { name: 'Change the PIN' }));
    expect(
      await screen.findByText('PIN changed · use it the next time you sign in on a tablet'),
    ).toBeTruthy();
    expect(setPin).toHaveBeenCalledWith({
      venueId: user.scope.venueId,
      staffMemberId: user.id,
      pin: '4826',
    });
    expect(first.value).toBe('');
    expect(second.value).toBe('');
  });

  it('says so under the field when somebody on the same tablet has that PIN', async () => {
    const actor = userEvent.setup();
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    await renderAccount('owner', {
      ...base,
      setStaffPin: () => Promise.reject(new StaffPinTakenError({ url: 'x', detail: 'taken' })),
    });
    const first = await screen.findByLabelText('New PIN');
    await actor.type(first, '1111');
    await actor.type(screen.getByLabelText('Repeat the PIN'), '1111');
    await actor.click(screen.getByRole('button', { name: 'Change the PIN' }));
    expect(
      await screen.findByText('Somebody on the same tablet already uses this PIN. Choose another.'),
    ).toBeTruthy();
    expect(document.activeElement).toBe(first);
  });
});

describe('the language', () => {
  it('switches the console at once and says so in the language chosen', async () => {
    const actor = userEvent.setup();
    await renderAccount();
    const group = await screen.findByRole('radiogroup', { name: 'Console language' });
    await actor.click(within(group).getByRole('radio', { name: 'Русский' }));
    expect(await screen.findByText('Панель теперь на русском')).toBeTruthy();
  });
});

describe('where they are signed in', () => {
  it('lists this device first, the others after, and signs out everywhere else', async () => {
    const actor = userEvent.setup();
    await renderAccount();
    await waitFor(() => expect(sessionRows().length).toBeGreaterThan(1));
    const rows = sessionRows();
    expect(within(rows[0]!).getByText('This device')).toBeTruthy();
    expect(within(rows[1]!).getByText('Another sign-in')).toBeTruthy();
    expect(within(rows[1]!).queryByText('This device')).toBeNull();

    const others = rows.length - 1;
    await actor.click(screen.getByRole('button', { name: 'Sign out everywhere else' }));
    expect(await screen.findByText(`You were signed out on ${others} other devices`)).toBeTruthy();
    await waitFor(() => expect(sessionRows()).toHaveLength(1));
    expect(screen.queryByRole('button', { name: 'Sign out everywhere else' })).toBeNull();
    // The button went with the others; the focus does not fall to the page.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { level: 2, name: "Where you're signed in" }),
      ),
    );
  });
});

/** The rows of "Where you're signed in". */
function sessionRows(): HTMLElement[] {
  const card = screen.getByRole('region', { name: "Where you're signed in" });
  return within(card).queryAllByRole('listitem');
}
