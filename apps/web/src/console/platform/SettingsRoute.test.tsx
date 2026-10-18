// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  createConsoleMockGateway,
  MOCK_PLATFORM_PASSWORD,
  type ConsoleGateway,
  type ConsoleUser,
} from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppRoutes as AppRoutesComponent } from '../../App';
import { createConsoleHarness, initConsoleTestI18n } from '../venue/reports/testHarness';

/**
 * Settings (Settings artboard): "My account" — the admin's own name, the
 * email they cannot change here, and the password — and "Language". A wrong
 * current password is a form error under its field, not a sign-out.
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
  displayName: 'Yalla team',
  role: 'platformAdmin',
  scope: { venueId: null, branchIds: [] },
};

function renderSettings(gateway?: ConsoleGateway) {
  const source = gateway ?? createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
  const harness = createConsoleHarness({ gateway: source });
  render(harness.wrap(<AppRoutes user={ADMIN} />, '/platform/settings'));
  return source;
}

describe('Settings', () => {
  it('opens on my account, with a second section for the language', async () => {
    const user = userEvent.setup();
    renderSettings();
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
    const sections = screen.getByRole('navigation', { name: 'Settings sections' });
    const mine = within(sections).getByRole('button', { name: 'My account' });
    expect(mine.getAttribute('aria-current')).toBe('page');
    expect(await screen.findByRole('heading', { name: 'Personal details' })).toBeTruthy();

    await user.click(within(sections).getByRole('button', { name: 'Language' }));
    expect(screen.getByRole('radiogroup', { name: 'Console language' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Personal details' })).toBeNull();
  });

  it('shows the email as fixed and renames the admin, the shell included', async () => {
    const user = userEvent.setup();
    renderSettings();
    const name = (await screen.findByLabelText(/^Full name/u)) as HTMLInputElement;
    await waitFor(() => expect(name.value).toBe('Yalla team'));
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    expect(email.readOnly).toBe(true);
    expect(email.value).toBe('admin@yalla.am');

    await user.clear(name);
    await user.click(screen.getByRole('button', { name: 'Save the name' }));
    expect(screen.getByText("The name can't be empty")).toBeTruthy();
    expect(document.activeElement).toBe(name);
    expect(name.getAttribute('aria-invalid')).toBe('true');

    await user.type(name, 'Grigor Avagyan');
    expect(screen.getByText('Unsaved change')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save the name' }));
    expect(await screen.findByText('Saved')).toBeTruthy();
    // The sidebar names whoever is signed in by the name they just gave.
    await waitFor(() =>
      expect(document.querySelector('.yc-me-n')?.textContent).toBe('Grigor Avagyan'),
    );
  });

  it('checks the password form before asking: required, 12 characters, the same twice', async () => {
    const user = userEvent.setup();
    renderSettings();
    const change = await screen.findByRole('button', { name: 'Change the password' });
    await user.click(change);
    const current = screen.getByLabelText(/^Current password/u);
    expect(screen.getByText('Write your current password')).toBeTruthy();
    expect(document.activeElement).toBe(current);

    await user.type(current, 'anything');
    await user.type(screen.getByLabelText(/^New password/u), 'short');
    await user.click(change);
    expect(screen.getByText('The new password is too short: at least 12 characters')).toBeTruthy();

    await user.clear(screen.getByLabelText(/^New password/u));
    await user.type(screen.getByLabelText(/^New password/u), 'long-enough-password');
    await user.type(screen.getByLabelText(/^Repeat the new password/u), 'something-else-entirely');
    await user.click(change);
    expect(screen.getByText("The passwords don't match")).toBeTruthy();
  });

  it('puts a wrong current password under its field, and stays signed in', async () => {
    const user = userEvent.setup();
    renderSettings();
    const current = await screen.findByLabelText(/^Current password/u);
    await user.type(current, 'not-the-password');
    await user.type(screen.getByLabelText(/^New password/u), 'long-enough-password');
    await user.type(screen.getByLabelText(/^Repeat the new password/u), 'long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Change the password' }));
    expect(await screen.findByText('The current password is wrong')).toBeTruthy();
    expect(current.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(current);
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
  });

  it('changes the password, says the other devices were signed out, and clears the form', async () => {
    const user = userEvent.setup();
    const gateway = renderSettings();
    const change = vi.spyOn(gateway, 'changePlatformPassword');
    const current = (await screen.findByLabelText(/^Current password/u)) as HTMLInputElement;
    await user.type(current, MOCK_PLATFORM_PASSWORD);
    await user.type(screen.getByLabelText(/^New password/u), 'a-brand-new-password');
    await user.type(screen.getByLabelText(/^Repeat the new password/u), 'a-brand-new-password');
    await user.click(screen.getByRole('button', { name: 'Change the password' }));
    expect(
      await screen.findByText('Password changed · you were signed out on your other devices'),
    ).toBeTruthy();
    expect(change).toHaveBeenCalledWith({
      currentPassword: MOCK_PLATFORM_PASSWORD,
      newPassword: 'a-brand-new-password',
    });
    expect(current.value).toBe('');
  });
});
