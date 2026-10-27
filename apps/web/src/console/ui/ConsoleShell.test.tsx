// @vitest-environment jsdom
import { createConsoleMockGateway } from '@yalla/api';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createConsoleHarness, initConsoleTestI18n } from '../venue/reports/testHarness';
import { ConsoleShell, type ShellGroup } from './ConsoleShell';
import { HomeIcon, VenuesIcon } from './icons';

/**
 * The shell on a phone (2026-10-27): the sidebar is a drawer behind a top bar.
 * jsdom has no `matchMedia`, which the shell reads as the phone layout, and no
 * stylesheet, so the drawer's open state is read from its markup.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

function groups(pending = 0): readonly ShellGroup[] {
  return [
    {
      id: 'main',
      links: [
        {
          to: '/home',
          labelKey: 'nav.home',
          icon: <HomeIcon />,
          end: true,
          badge: { count: pending, sayKey: 'nav.badge.pendingApprovals' },
        },
        { to: '/venues', labelKey: 'nav.venues', icon: <VenuesIcon /> },
      ],
    },
  ];
}

function renderShell({
  pending = 0,
  chip = null,
}: {
  readonly pending?: number;
  readonly chip?: { label: string; switchable: boolean } | null;
} = {}) {
  const harness = createConsoleHarness({
    gateway: createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' }),
  });
  const shell = (
    <ConsoleShell
      groups={groups(pending)}
      place={
        chip?.switchable ? (
          <select aria-label="Branch" data-drawer-focus="branch">
            <option>North</option>
          </select>
        ) : null
      }
      person={{ name: 'Grigor Avagyan', caption: 'Platform admin', accountTo: '/me' }}
      barChip={chip}
    >
      <h1>Page</h1>
      <Link to="/venues">Elsewhere</Link>
    </ConsoleShell>
  );
  render(
    harness.wrap(
      <Routes>
        <Route path="*" element={shell} />
      </Routes>,
      '/home',
    ),
  );
}

const menuButton = () => screen.getByRole('button', { name: /^Open navigation/u });
const drawer = () => screen.queryByRole('dialog', { name: 'Navigation' });

describe('the phone drawer', () => {
  it('opens from the menu button as a modal dialog, with the focus inside it', async () => {
    const user = userEvent.setup();
    renderShell();
    expect(menuButton().getAttribute('aria-expanded')).toBe('false');
    expect(drawer()).toBeNull();

    await user.click(menuButton());

    const open = drawer();
    expect(open).not.toBeNull();
    expect(open!.getAttribute('aria-modal')).toBe('true');
    expect(menuButton().getAttribute('aria-expanded')).toBe('true');
    expect(menuButton().getAttribute('aria-controls')).toBe(open!.id);
    expect(document.activeElement).toBe(
      within(open!).getByRole('button', { name: 'Close navigation' }),
    );
    // The page behind it is out of reach.
    expect(screen.getByRole('main', { hidden: true }).hasAttribute('inert')).toBe(true);
    // Everything the desktop sidebar holds is in it.
    expect(within(open!).getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
    expect(within(open!).getByRole('link', { name: /Grigor Avagyan/u })).toBeTruthy();
  });

  it('keeps Tab inside, and Escape closes it and gives the focus back', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(menuButton());
    const open = drawer()!;

    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(open.contains(document.activeElement)).toBe(true);
    }

    await user.keyboard('{Escape}');
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(menuButton());
    expect(screen.getByRole('main').hasAttribute('inert')).toBe(false);
  });

  it('closes on a tap on the scrim, on the close button, and on navigating', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(menuButton());
    fireEvent.click(screen.getByTestId('drawer-scrim'));
    expect(drawer()).toBeNull();

    await user.click(menuButton());
    await user.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(drawer()).toBeNull();

    await user.click(menuButton());
    await user.click(within(drawer()!).getByRole('link', { name: 'Venues' }));
    expect(drawer()).toBeNull();
    expect(menuButton().getAttribute('aria-expanded')).toBe('false');
  });

  it('puts a dot on the menu button while a link has a count', () => {
    renderShell({ pending: 3 });
    expect(menuButton().getAttribute('aria-label')).toBe(
      'Open navigation — something is waiting for you',
    );
    cleanup();
    renderShell({ pending: 0 });
    expect(menuButton().getAttribute('aria-label')).toBe('Open navigation');
  });

  it('opens on the branch switcher from the branch chip, and on the person from the avatar', async () => {
    const user = userEvent.setup();
    renderShell({ chip: { label: 'North', switchable: true } });

    await user.click(screen.getByRole('button', { name: 'Branch: North. Change branch' }));
    expect(document.activeElement).toBe(within(drawer()!).getByRole('combobox'));
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Your account: Grigor Avagyan' }));
    expect(document.activeElement).toBe(
      within(drawer()!).getByRole('link', { name: /Grigor Avagyan/u }),
    );
  });

  it('draws a branch nobody can switch as a plain chip, not a button', () => {
    renderShell({ chip: { label: 'North', switchable: false } });
    expect(screen.queryByRole('button', { name: /Change branch/u })).toBeNull();
    expect(screen.getByText('North')).toBeTruthy();
  });
});
