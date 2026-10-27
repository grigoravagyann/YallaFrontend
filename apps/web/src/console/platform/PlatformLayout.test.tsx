// @vitest-environment jsdom
import { createConsoleMockGateway, type ConsoleGateway, type ConsoleUser } from '@yalla/api';
import { cleanup, render, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createConsoleHarness, initConsoleTestI18n } from '../venue/reports/testHarness';
import { useToast } from '../ui/toast';
import { PlatformLayout } from './PlatformLayout';

/**
 * The platform admin's shell (Errors / Main artboards, `_side.html`): a dark
 * sidebar with exactly three destinations, who is signed in at its foot, and
 * the page in a `main` a skip link can reach. No language picker: that lives
 * in Settings and on sign-in only.
 */

const ADMIN: ConsoleUser = {
  id: 'u-platform',
  displayName: 'Grigor Avagyan',
  role: 'platformAdmin',
  scope: { venueId: null, branchIds: [] },
};

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

function ToastProbe() {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.say('Saved')}>
      probe
    </button>
  );
}

/** The mock, answering `/me` with the admin's current name. */
function gatewayNaming(fullName: string): ConsoleGateway {
  const mock = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
  return {
    ...mock,
    getPlatformProfile: async () => ({ ...(await mock.getPlatformProfile()), fullName }),
  };
}

function renderShell(path = '/platform/venues', gateway = gatewayNaming(ADMIN.displayName)) {
  const harness = createConsoleHarness({ gateway });
  render(
    harness.wrap(
      <Routes>
        <Route element={<PlatformLayout user={ADMIN} />}>
          <Route path="/platform" element={<h1>Home page</h1>} />
          <Route path="/platform/venues" element={<h1>Venues page</h1>} />
          <Route path="/platform/venues/:id" element={<ToastProbe />} />
          <Route path="/platform/settings" element={<h1>Settings page</h1>} />
        </Route>
      </Routes>,
      path,
    ),
  );
}

describe('the platform shell', () => {
  it('has exactly three destinations, in order: Home, Venues, Settings', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Home', 'Venues', 'Settings']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/platform',
      '/platform/venues',
      '/platform/settings',
    ]);
  });

  it('marks the section the page is in, venue pages included', () => {
    renderShell('/platform/venues/v-lumen');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const current = within(nav)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.textContent);
    expect(current).toEqual(['Venues']);
  });

  it('says who is signed in, as what, with initials that are not read out', () => {
    renderShell();
    expect(screen.getByText('Grigor Avagyan')).toBeTruthy();
    expect(screen.getByText('Platform admin')).toBeTruthy();
    // At the sidebar's foot, and on the phone's top bar.
    for (const initials of screen.getAllByText('GA')) {
      expect(initials.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('names the admin by their name now, not the one the token was issued with', async () => {
    renderShell('/platform/venues', gatewayNaming('Grigor A.'));
    expect(await screen.findByText('Grigor A.')).toBeTruthy();
    expect(screen.queryByText('Grigor Avagyan')).toBeNull();
  });

  it('puts the page in a main a skip link reaches', () => {
    renderShell();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { name: 'Venues page' })).toBeTruthy();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip.getAttribute('href')).toBe(`#${main.id}`);
  });

  it('has no language picker: it lives in Settings and on sign-in', () => {
    renderShell();
    expect(screen.queryByRole('combobox', { name: /language/i })).toBeNull();
  });

  it('gives every page under it the toast', () => {
    renderShell('/platform/venues/v-lumen');
    screen.getByRole('button', { name: 'probe' }).click();
    return screen.findByText('Saved');
  });
});
