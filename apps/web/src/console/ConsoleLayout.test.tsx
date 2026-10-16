// @vitest-environment jsdom
import type { ConsoleUser } from '@yalla/api';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ConsoleLayout } from './ConsoleLayout';
import { createConsoleHarness, initConsoleTestI18n } from './venue/reports/testHarness';

/**
 * The shell on a phone.
 *
 * The sidebar was a fixed 240px column at every width, which left 135px for
 * the content on a 375px phone: every console screen wrapped one word per line
 * and the floor-plan canvas was unreachable. Below the breakpoint the sidebar
 * is a drawer behind a menu button; these tests cover the semantics the CSS
 * hangs off — jsdom draws nothing, so the width itself is checked by eye.
 */

const OWNER: ConsoleUser = {
  id: 's-owner',
  displayName: 'Hasmik Sargsyan',
  role: 'owner',
  scope: { venueId: 'v-lumen', branchIds: [] },
};

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

function renderShell(path = '/venue') {
  const harness = createConsoleHarness();
  render(
    harness.wrap(
      <Routes>
        <Route element={<ConsoleLayout user={OWNER} />}>
          <Route path="/venue" element={<h2>Overview page</h2>} />
          <Route path="/venue/menu" element={<h2>Menu page</h2>} />
        </Route>
      </Routes>,
      path,
    ),
  );
}

describe('the console shell on a narrow screen', () => {
  it('starts with the drawer closed behind a menu button that says so', () => {
    renderShell();
    const button = screen.getByRole('button', { name: /^menu$/i });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const nav = screen.getByRole('navigation', { name: /yalla console/i });
    expect(button.getAttribute('aria-controls')).toBe(nav.id);
    expect(nav.classList.contains('is-open')).toBe(false);
  });

  it('opens on the button and closes again when a destination is chosen', async () => {
    const user = userEvent.setup();
    renderShell();
    const button = screen.getByRole('button', { name: /^menu$/i });
    const nav = screen.getByRole('navigation', { name: /yalla console/i });

    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(nav.classList.contains('is-open')).toBe(true);

    await user.click(screen.getByRole('link', { name: /^menu$/i }));
    expect(await screen.findByText('Menu page')).toBeTruthy();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(nav.classList.contains('is-open')).toBe(false);
  });

  it('closes on Escape and on the scrim behind it', async () => {
    const user = userEvent.setup();
    renderShell();
    const button = screen.getByRole('button', { name: /^menu$/i });

    await user.click(button);
    await user.keyboard('{Escape}');
    expect(button.getAttribute('aria-expanded')).toBe('false');

    await user.click(button);
    await user.click(screen.getByRole('button', { name: /close the menu/i }));
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('the current page in the nav (QA 2026-10-16)', () => {
  it('marks only the page shown, not Overview on every venue page', () => {
    renderShell('/venue/menu');
    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.textContent);
    expect(current).toEqual(['Menu']);
  });
});
