// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { createConsoleMockGateway } from '@yalla/api';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as AuthSessionModule from '../../../auth/authSession';
import type { VenueLayout as VenueLayoutComponent } from '../VenueLayout';
import type { AccountScreen as AccountScreenComponent } from './AccountScreen';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';

/**
 * Signing out from My account (Account artboard): a confirm that says what
 * is lost and what is not, "Stay" focused, Escape and Stay closing it with
 * the focus back on the button that opened it, and "Sign out" ending the
 * session. Against a real backend only — the mock has no session to end,
 * so the button is not offered there.
 */

const signOut = vi.fn(async () => {});
vi.mock('../../../auth/authSession', async (original) => ({
  ...(await original<typeof AuthSessionModule>()),
  signOut: () => signOut(),
}));

let VenueLayout: typeof VenueLayoutComponent;
let AccountScreen: typeof AccountScreenComponent;

beforeAll(async () => {
  vi.stubEnv('VITE_DATA_SOURCE', 'real');
  vi.stubEnv('VITE_API_URL', 'http://localhost:5199');
  await initConsoleTestI18n();
  ({ VenueLayout } = await import('../VenueLayout'));
  ({ AccountScreen } = await import('./AccountScreen'));
});

afterEach(() => {
  cleanup();
  signOut.mockClear();
});

async function renderAccount() {
  const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
  const user = await gateway.getCurrentUser();
  const harness = createConsoleHarness({ gateway });
  render(
    harness.wrap(
      <Routes>
        <Route path="/venue" element={<VenueLayout user={user} />}>
          <Route path="account" element={<AccountScreen />} />
        </Route>
      </Routes>,
      '/venue/account',
    ),
  );
  return screen.findByRole('button', { name: 'Sign out' });
}

describe('signing out from My account', () => {
  it('asks first, with Stay focused, and Stay or Escape keep them signed in', async () => {
    const actor = userEvent.setup();
    const opener = await renderAccount();
    await actor.click(opener);
    const dialog = screen.getByRole('alertdialog', { name: 'Sign out of the console?' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(
      screen.getByText('Unsaved changes will be lost. Your tablet PIN does not change.'),
    ).toBeTruthy();
    const stay = screen.getByRole('button', { name: 'Stay' });
    await waitFor(() => expect(document.activeElement).toBe(stay));

    await actor.click(stay);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));

    await actor.click(opener);
    await actor.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('ends the session on "Sign out"', async () => {
    const actor = userEvent.setup();
    await actor.click(await renderAccount());
    const confirm = screen
      .getAllByRole('button', { name: 'Sign out' })
      .find((button) => button.closest('[role="alertdialog"]'));
    await actor.click(confirm!);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
