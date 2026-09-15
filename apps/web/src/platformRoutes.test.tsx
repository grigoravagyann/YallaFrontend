// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { createConsoleMockGateway, type ConsoleUser, type UserRole } from '@yalla/api';
import { cleanup, render, screen } from '@testing-library/react';
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
    expect(await screen.findByRole('heading', { name: /^reviews$/i })).toBeTruthy();
    expect(await screen.findByText(/hidden by the platform/i)).toBeTruthy();
  });

  it('give a platform admin the branch public page, with the pin editable', async () => {
    renderAt('platformAdmin', `${BASE}/public`);
    expect(await screen.findByRole('heading', { name: /^public page$/i })).toBeTruthy();
    const form = await screen.findByRole('form', { name: /in the yalla app/i });
    expect(
      (form.querySelector('input[autocomplete="street-address"]') as HTMLInputElement).disabled,
    ).toBe(false);
  });

  it('give a platform admin the branch floor plan editor', async () => {
    renderAt('platformAdmin', `${BASE}/floorplan`);
    expect(await screen.findByRole('button', { name: /save the plan/i })).toBeTruthy();
  });

  it.each(['waiter', 'kitchen', 'owner', 'manager'] as const)(
    'do not exist for a %s',
    async (role) => {
      for (const page of ['public', 'floorplan', 'reviews']) {
        renderAt(role, `${BASE}/${page}`);
        expect(
          await screen.findByRole('heading', { name: /you don't have access to this/i }),
        ).toBeTruthy();
        expect(screen.queryByRole('heading', { name: /^reviews$/i })).toBeNull();
        cleanup();
      }
    },
  );
});
