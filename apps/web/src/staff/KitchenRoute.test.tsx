// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  createQueryClient,
  createStaffMockGateway,
  type EnrolledDevice,
  type OrderQueueEntry,
  type StaffGateway,
  type StaffSessionIdentity,
  type StaffSessionSnapshot,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import type * as CurrentUserModule from '../auth/useCurrentUser';

/**
 * Who gets which screen once somebody has signed in on the tablet.
 *
 * The kitchen used to get the floor, which the server refuses it, so the
 * kitchen tablet showed "your account cannot see this" where the orders should
 * have been. These tests go through the real `StaffRoute`, with the session and
 * the gateway as the only doubles, and assert on what the gateway was asked:
 * a screen that renders the right thing while still firing refused reads at
 * the backend is not fixed.
 */

const snapshot = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('./auth/staffSession', () => ({
  staffAuthAvailable: true,
  staffSession: {
    restore: async () => undefined,
    refreshDevice: async () => undefined,
    signOut: async () => undefined,
  },
}));
vi.mock('./auth/useStaffSession', () => ({
  useStaffSessionSnapshot: () => snapshot.current,
  useTouchOnInteraction: () => undefined,
}));
vi.mock('../auth/useCurrentUser', async () => {
  const actual = await vi.importActual<typeof CurrentUserModule>('../auth/useCurrentUser');
  return { ...actual, useCurrentUser: () => ({ user: null }) };
});

const { StaffRoute } = await import('./StaffRoute');

const BRANCH = 'b1';

const device: EnrolledDevice = {
  deviceId: 'd1',
  deviceName: 'Pass',
  branchId: BRANCH,
  branchName: 'Lumen North',
  venueName: 'Lumen',
  enrolledAtUtc: '2026-09-01T00:00:00Z',
  lastSeenAtUtc: null,
};

const inKitchen: OrderQueueEntry = {
  orderId: 'o1',
  tabId: 'tab1',
  tableLabel: '4',
  status: 'inKitchen',
  placedAtUtc: '2026-09-11T12:00:00Z',
  estimatedReadyAtUtc: null,
  waitingMinutes: 3,
  lines: [{ lineId: 'l1', name: 'Khorovats', quantity: 2, note: null }],
};

type Method = keyof StaffGateway;

/** The real staff mock, with every call recorded by method name. */
function recordingGateway(): {
  gateway: StaffGateway;
  calls: Method[];
  statuses: Parameters<StaffGateway['setOrderStatus']>[0][];
} {
  const base = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
  const calls: Method[] = [];
  const statuses: Parameters<StaffGateway['setOrderStatus']>[0][] = [];
  const overrides: Partial<StaffGateway> = {
    listOrderQueue: async () => [inKitchen],
    setOrderStatus: async (command) => {
      statuses.push(command);
      return { ...inKitchen, status: command.status };
    },
  };
  const gateway = new Proxy(base, {
    get(target, key: string) {
      const method = (overrides[key as Method] ?? target[key as Method]) as unknown;
      if (typeof method !== 'function') return method;
      return (...args: unknown[]) => {
        calls.push(key as Method);
        return (method as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { gateway, calls, statuses };
}

function signIn(role: StaffSessionIdentity['role']): void {
  const next: StaffSessionSnapshot = {
    state: 'signedIn',
    device,
    identity: { staffMemberId: 's1', fullName: 'Sona Vardanyan', role, branchId: BRANCH },
    lastSignOut: null,
  };
  snapshot.current = next;
}

function renderStaff(gateway: StaffGateway) {
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
  // The floor measures its frame; jsdom has nothing to measure with.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  await initConsoleTestI18n();
});

afterEach(() => {
  cleanup();
});

describe('a kitchen account on the tablet', () => {
  it('sees the order queue full screen, and no floor, legend or refusal', async () => {
    const { gateway } = recordingGateway();
    signIn('kitchen');
    renderStaff(gateway);

    expect(await screen.findByRole('heading', { level: 1, name: 'Kitchen' })).toBeTruthy();
    expect(screen.getByText('Lumen · Lumen North')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sona Vardanyan/ })).toBeTruthy();
    expect(await screen.findByText('Khorovats')).toBeTruthy();

    expect(screen.queryByRole('heading', { level: 1, name: 'Floor' })).toBeNull();
    expect(screen.queryByText('Loading the floor…')).toBeNull();
    expect(screen.queryByText(/cannot see/i)).toBeNull();
    // The legend's staff entries, and the waiter-call half of the panel.
    expect(screen.queryByText('Waiting for a waiter')).toBeNull();
    expect(document.querySelector('.floor-plan-pane')).toBeNull();
  });

  it('never asks for the floor, its changes, tabs or service requests', async () => {
    const { gateway, calls } = recordingGateway();
    signIn('kitchen');
    renderStaff(gateway);

    await screen.findByText('Khorovats');
    await waitFor(() => expect(calls).toContain('listOrderQueue'));

    for (const refused of [
      'getFloor',
      'getFloorChanges',
      'getStaffTab',
      'getTabLines',
      'listServiceRequests',
      'getMenu',
    ] as const) {
      expect(calls, refused).not.toContain(refused);
    }
  });

  it('moves an order from the kitchen to ready', async () => {
    const { gateway, calls, statuses } = recordingGateway();
    signIn('kitchen');
    renderStaff(gateway);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Mark ready' }));

    await waitFor(() => expect(calls).toContain('setOrderStatus'));
    expect(statuses).toEqual([expect.objectContaining({ orderId: 'o1', status: 'ready' })]);
  });
});

describe('a waiter account on the tablet', () => {
  it('still gets the floor screen', async () => {
    const { gateway, calls } = recordingGateway();
    signIn('waiter');
    renderStaff(gateway);

    expect(await screen.findByRole('heading', { level: 1, name: 'Floor' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1, name: 'Kitchen' })).toBeNull();
    await waitFor(() => expect(calls).toContain('getFloor'));
    expect(screen.getByText('Waiting for a waiter')).toBeTruthy();
  });
});
