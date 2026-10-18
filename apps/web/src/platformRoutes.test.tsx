// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { createConsoleMockGateway, type ConsoleUser, type UserRole } from '@yalla/api';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppRoutes as AppRoutesComponent } from './App';
import { createConsoleHarness, initConsoleTestI18n } from './console/venue/reports/testHarness';

/**
 * The platform's branch pages exist only in a platform admin's router.
 *
 * A route a role cannot use is not registered (see `AppRoutes`), so a waiter
 * or a kitchen account typing one of these addresses reaches the plain
 * refusal page, not a hidden screen.
 */

vi.mock('./console/venue/floorplan/EditorCanvas', () => ({ EditorCanvas: () => null }));
vi.mock('./console/venue/floorplan/EditorPreview', () => ({ EditorPreview: () => null }));
vi.mock('./console/venue/floorplan/PropertiesPanel', () => ({ PropertiesPanel: () => null }));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let AppRoutes: typeof AppRoutesComponent;

beforeAll(async () => {
  vi.stubEnv('VITE_DATA_SOURCE', 'mock');
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  await initConsoleTestI18n();
  ({ AppRoutes } = await import('./App'));
});

afterEach(cleanup);

const USERS: Record<'platformAdmin' | 'owner' | 'manager' | 'waiter' | 'kitchen', ConsoleUser> = {
  platformAdmin: {
    id: 'u-platform',
    displayName: 'Platform',
    role: 'platformAdmin',
    scope: { venueId: null, branchIds: [] },
  },
  owner: {
    id: 'v-lumen-owner',
    displayName: 'Aram Sargsyan',
    role: 'owner',
    scope: { venueId: 'v-lumen', branchIds: [] },
  },
  manager: {
    id: 'b-lumen-north-manager',
    displayName: 'Nare Petrosyan',
    role: 'manager',
    scope: { venueId: 'v-lumen', branchIds: ['b-lumen-north'] },
  },
  waiter: {
    id: 'u-waiter',
    displayName: 'Gor Hakobyan',
    role: 'waiter',
    scope: { venueId: 'v-lumen', branchIds: ['b-lumen-north'] },
  },
  kitchen: {
    id: 'u-kitchen',
    displayName: 'Kitchen',
    role: 'kitchen',
    scope: { venueId: 'v-lumen', branchIds: ['b-lumen-north'] },
  },
};

const BASE = '/platform/venues/v-lumen/branches/b-lumen-cascade';

function renderAt(role: keyof typeof USERS, path: string) {
  const gateway = createConsoleMockGateway({ latencyMs: 0, role: role as UserRole });
  const harness = createConsoleHarness({ gateway });
  render(harness.wrap(<AppRoutes user={USERS[role]} />, path));
}

describe('the platform branch routes', () => {
  it('give a platform admin the branch reviews', async () => {
    renderAt('platformAdmin', `${BASE}/reviews`);
    // The branch's page (Reviews artboard): its name is the title, Reviews the current sub-tab.
    const tab = await screen.findByRole('link', { name: /^reviews/i });
    expect(tab.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('group', { name: /^filter$/i })).toBeTruthy();
    expect((await screen.findAllByText(/hidden by the platform/i)).length).toBeGreaterThan(0);
  });

  it('give a platform admin the branch public page, with the pin editable', async () => {
    renderAt('platformAdmin', `${BASE}/public`);
    expect(await screen.findByRole('heading', { name: /^public page$/i })).toBeTruthy();
    const form = await screen.findByRole('form', { name: /in the yalla app/i });
    expect(
      (form.querySelector('input[autocomplete="street-address"]') as HTMLInputElement).disabled,
    ).toBe(false);
  });

  it('give a platform admin the branch rooms editor', async () => {
    renderAt('platformAdmin', `${BASE}/floorplan`);
    expect(await screen.findByRole('button', { name: /save rooms/i })).toBeTruthy();
  });

  it.each(['waiter', 'kitchen', 'owner', 'manager'] as const)(
    'do not exist for a %s',
    async (role) => {
      for (const page of ['public', 'floorplan', 'reviews']) {
        renderAt(role, `${BASE}/${page}`);
        expect(
          await screen.findByRole('heading', { name: /this page isn't for you/i }),
        ).toBeTruthy();
        expect(screen.queryByRole('navigation', { name: /^branch sections$/i })).toBeNull();
        cleanup();
      }
    },
  );
});

describe('the platform shell routes', () => {
  it('give a platform admin a Settings page with the console language', async () => {
    renderAt('platformAdmin', '/platform/settings');
    expect(await screen.findByRole('heading', { level: 1, name: /^settings$/i })).toBeTruthy();
    // My account opens first (Settings artboard); the language is the second section.
    fireEvent.click(screen.getByRole('button', { name: /^language$/i }));
    expect(screen.getByRole('radiogroup', { name: /console language/i })).toBeTruthy();
  });

  it('keep an unknown platform address inside the shell, as a refusal', async () => {
    renderAt('platformAdmin', '/platform/nothing-here');
    expect(await screen.findByRole('heading', { name: /this page isn't for you/i })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeTruthy();
  });

  it.each(['waiter', 'kitchen', 'owner', 'manager'] as const)(
    'give a %s no platform Settings page',
    async (role) => {
      renderAt(role, '/platform/settings');
      expect(await screen.findByRole('heading', { name: /this page isn't for you/i })).toBeTruthy();
      expect(screen.queryByRole('radiogroup', { name: /console language/i })).toBeNull();
    },
  );
});
