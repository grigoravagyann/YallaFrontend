// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  createConsoleMockGateway,
  ForbiddenError,
  SignInUnknownError,
  type ConsoleGateway,
} from '@yalla/api';
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

async function renderAt(path: string, gateway?: ConsoleGateway) {
  const source = gateway ?? createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
  const user = await source.getCurrentUser();
  const harness = createConsoleHarness({ gateway: source });
  render(
    harness.wrap(
      <Routes>
        <Route path="/venue" element={<VenueLayout user={user} />}>
          <Route index element={<h1>Overview page</h1>} />
          <Route path="account" element={<AccountScreen />} />
        </Route>
      </Routes>,
      path,
    ),
  );
}

async function renderAccount() {
  await renderAt('/venue/account');
  return screen.findByRole('button', { name: 'Sign out' });
}

/** A venue user whose venue read is refused: a deactivated account, say. */
function refusedVenueRead(): ConsoleGateway {
  const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
  return {
    ...base,
    getManagedVenue: (venueId) =>
      Promise.reject(new ForbiddenError({ url: `/api/venues/${venueId}/manage` })),
  };
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

describe('when the venue read is refused (review, phase 1)', () => {
  /*
   * The screens wait for `GET /api/venues/{id}/manage`; a refusal (a
   * deactivated account answers 403, and retrying changes nothing) used to
   * leave a person with no way out but clearing the site's data, because
   * sign-out lived only on My account behind the same gate.
   */
  it('offers sign-out beside the refusal', async () => {
    const actor = userEvent.setup();
    await renderAt('/venue', refusedVenueRead());
    await screen.findByText('Your account cannot see this.');
    await actor.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('still opens My account, whose sign-out works', async () => {
    const actor = userEvent.setup();
    await renderAt('/venue/account', refusedVenueRead());
    expect(await screen.findByRole('heading', { level: 1, name: 'My account' })).toBeTruthy();
    await actor.click(screen.getByRole('button', { name: 'Sign out' }));
    const confirm = screen
      .getAllByRole('button', { name: 'Sign out' })
      .find((button) => button.closest('[role="alertdialog"]'));
    await actor.click(confirm!);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('"Sign out everywhere else" from a sign-in the server cannot name', () => {
  /*
   * A token from before tokens carried their sign-in is answered 409
   * `sign-in-unknown`, and nothing is ended. The card says so plainly and
   * offers the one thing that helps: signing in again.
   */
  it('says nothing was ended, asks them to sign in again, and offers it', async () => {
    const actor = userEvent.setup();
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    await renderAt('/venue/account', {
      ...base,
      signOutOtherVenueSessions: () =>
        Promise.reject(new SignInUnknownError({ url: '/api/venue/me/sessions/sign-out-others' })),
    });
    await actor.click(await screen.findByRole('button', { name: 'Sign out everywhere else' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'This sign-in is too old to tell apart from the others, so nothing was signed out. Sign in again, then try once more.',
    );
    // The other sign-ins are still there: nothing changed.
    expect(screen.getByRole('button', { name: 'Sign out everywhere else' })).toBeTruthy();
    await actor.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
