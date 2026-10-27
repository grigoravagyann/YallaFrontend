// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  FULL_FEATURES,
  createQueryClient,
  createStaffMockGateway,
  type BranchFeature,
  type EnrolledDevice,
  type StaffGateway,
  type StaffSessionSnapshot,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { resetCommandStore } from './testCommandStore';
import type * as CurrentUserModule from '../auth/useCurrentUser';

/**
 * The floor, the kitchen and the phone where the platform has switched a
 * feature off (2026-10-27): the session's features decide what is drawn, a
 * kitchen with no kitchen screen is told so, and a lock for that reason says
 * why on the keypad.
 *
 * Through the real `StaffRoute` and the real staff mock, with the session as
 * the only double.
 */

const session = vi.hoisted(() => {
  let current: unknown = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (next: unknown) => {
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

// The queue's store in memory: see `testCommandStore.ts`.
vi.mock('../offline/commandStore', async (importOriginal) =>
  (await import('./testCommandStore')).withMemoryStore(await importOriginal()),
);

const refreshDevice = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('./auth/staffSession', () => ({
  staffAuthAvailable: true,
  staffSession: {
    restore: async () => undefined,
    refreshDevice,
    roster: async () => [],
    signOut: async () => {
      const now = session.get() as StaffSessionSnapshot;
      session.set({ ...now, state: 'locked', lastSignOut: 'signedOut' });
    },
  },
}));
vi.mock('./auth/useStaffSession', () => ({
  useStaffSessionSnapshot: () => useSyncExternalStore(session.subscribe, session.get),
  useTouchOnInteraction: () => undefined,
}));
vi.mock('../auth/useCurrentUser', async () => {
  const actual = await vi.importActual<typeof CurrentUserModule>('../auth/useCurrentUser');
  return { ...actual, useCurrentUser: () => ({ user: null }) };
});

const { StaffRoute } = await import('./StaffRoute');
const { floorFeatures } = await import('./floor/floorFeatures');

const BRANCH = 'b1';

const device: EnrolledDevice = {
  deviceId: 'd1',
  deviceName: 'Counter',
  branchId: BRANCH,
  branchName: 'Lumen North',
  venueName: 'Lumen',
  enrolledAtUtc: '2026-09-01T00:00:00Z',
  lastSeenAtUtc: null,
};

function signIn(
  features: readonly BranchFeature[],
  role: 'waiter' | 'kitchen' = 'waiter',
  state: 'signedIn' | 'locked' = 'signedIn',
  lastSignOut: StaffSessionSnapshot['lastSignOut'] = null,
): void {
  session.set({
    state,
    device,
    identity: { staffMemberId: 's1', fullName: 'Sona Vardanyan', role, branchId: BRANCH, features },
    lastSignOut,
  } satisfies StaffSessionSnapshot);
}

const without = (...off: BranchFeature[]) => FULL_FEATURES.filter((f) => !off.includes(f));

function gatewayWith(overrides: Partial<StaffGateway> = {}): StaffGateway {
  return { ...createStaffMockGateway({ latencyMs: 0, branchId: BRANCH }), ...overrides };
}

function renderFloor(gateway: StaffGateway) {
  const queryClient = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
  render(
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <GatewayProvider staffGateway={gateway}>
          <MemoryRouter>
            <StaffRoute />
          </MemoryRouter>
        </GatewayProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeAll(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  await initConsoleTestI18n();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refreshDevice.mockClear();
  resetCommandStore();
});

describe('what the floor offers', () => {
  it('reads the features from the session, offering everything where it does not say', () => {
    expect(floorFeatures({ features: without('takeaway', 'kitchenDisplay') })).toEqual({
      takeaway: false,
      messages: true,
      kitchen: false,
      tableService: true,
    });
    expect(floorFeatures({} as never).tableService).toBe(true);
  });

  it('draws no Kitchen and no Messages view where the platform has them off', async () => {
    signIn(without('kitchenDisplay', 'guestMessages'));
    renderFloor(gatewayWith());

    await screen.findByRole('heading', { level: 1, name: 'Floor' });
    const views = screen.getByRole('navigation', { name: 'Screens' });
    expect(within(views).getByRole('button', { name: /^Floor/u })).toBeTruthy();
    expect(within(views).queryByRole('button', { name: /^Kitchen/u })).toBeNull();
    expect(within(views).queryByRole('button', { name: /^Messages/u })).toBeNull();
  });

  it('keeps both where they are on', async () => {
    signIn(FULL_FEATURES);
    renderFloor(gatewayWith());

    await screen.findByRole('heading', { level: 1, name: 'Floor' });
    const views = screen.getByRole('navigation', { name: 'Screens' });
    expect(within(views).getByRole('button', { name: /^Kitchen/u })).toBeTruthy();
    expect(within(views).getByRole('button', { name: /^Messages/u })).toBeTruthy();
  });
});

describe('the kitchen with its screen switched off', () => {
  it('says so, with the way out, instead of a board that cannot load', async () => {
    signIn(without('kitchenDisplay'), 'kitchen');
    renderFloor(gatewayWith());

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('heading', { name: 'No kitchen screen here' })).toBeTruthy();
    expect(alert.textContent).toContain("The kitchen screen isn't enabled for this branch.");
    expect(within(alert).getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('says why on the keypad once the session was locked for it', async () => {
    signIn(without('kitchenDisplay'), 'kitchen', 'locked', 'kitchenOff');
    renderFloor(gatewayWith());

    const notes = await screen.findAllByText(
      /The kitchen screen isn't enabled for this branch\. Ask your manager/u,
    );
    // The keypad's own line, above the PIN, says it.
    expect(notes.some((note) => note.closest('.ft-pin-note'))).toBe(true);
  });
});
