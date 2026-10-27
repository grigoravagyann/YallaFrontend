// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  FULL_FEATURES,
  LineAlreadyPaidError,
  OrderNotVoidableError,
  createQueryClient,
  createStaffMockGateway,
  tableDetail,
  type EnrolledDevice,
  type StaffGateway,
  type StaffSessionSnapshot,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { formatDram } from '@yalla/format';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import type * as CurrentUserModule from '../auth/useCurrentUser';

/**
 * Voiding a whole order from the tab (2026-10-26), on the floor tablet against
 * the staff mock: the line menu offers it for an order still new or in the
 * kitchen, a confirm says what comes off, and the tab is read again once the
 * server answers — as for one line. A refusal says why: the tab was paid
 * against meanwhile (`line-already-paid`), or the order was voided or moved on
 * elsewhere (409 `conflicting-state`).
 */

const snapshot = vi.hoisted(() => ({ current: null as unknown }));

// The queue's store in memory: see `testCommandStore.ts`.
vi.mock('../offline/commandStore', async (importOriginal) =>
  (await import('./testCommandStore')).withMemoryStore(await importOriginal()),
);
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
  deviceName: 'Counter',
  branchId: BRANCH,
  branchName: 'Lumen North',
  venueName: 'Lumen',
  enrolledAtUtc: '2026-09-01T00:00:00Z',
  lastSeenAtUtc: null,
};

function signIn(): void {
  snapshot.current = {
    state: 'signedIn',
    device,
    identity: {
      staffMemberId: 's1',
      fullName: 'Sona Vardanyan',
      role: 'waiter',
      branchId: BRANCH,
      features: FULL_FEATURES,
    },
    lastSignOut: null,
  } satisfies StaffSessionSnapshot;
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

const dram = (amount: number) => formatDram(amount, 'en').replace(/\s/gu, ' ');
const spaced = (element: Element | null) => (element?.textContent ?? '').replace(/\s/gu, ' ');

const ORDER_ID = '99999999-9999-4999-8999-999999999999';

/**
 * A fresh order of two dishes on an open tab: new, so the rail still lets it
 * go. One dish nothing else on the tab is called, so its line menu is the only
 * one by that name.
 */
async function freshOrder(gateway: StaffGateway) {
  const floor = (await gateway.getFloor(BRANCH))!;
  const table = floor.plan.tables.find((one) => tableDetail(floor, one.id)?.openTabId)!;
  const tabId = tableDetail(floor, table.id)!.openTabId!;
  const tab = (await gateway.getStaffTab(tabId))!;
  const menu = (await gateway.getMenu(BRANCH))!;
  const dish = menu.sections
    .flatMap((section) => section.items)
    .find(
      (item) =>
        item.isAvailable && item.priceDram > 0 && !tab.lines.some((l) => l.name === item.name),
    )!;
  await gateway.placeOrder({
    tabId,
    clientCommandId: ORDER_ID,
    lines: [{ menuItemId: dish.id, quantity: 2, isShared: true, participantId: null }],
  });
  return { tableLabel: table.label, tabId, dish };
}

async function openTabOf(user: ReturnType<typeof userEvent.setup>, tableLabel: string) {
  await user.click(
    await screen.findByRole('button', { name: new RegExp(`^Table ${tableLabel},`, 'u') }),
  );
  const actions = await screen.findByRole('dialog', { name: `Actions for table ${tableLabel}` });
  await user.click(within(actions).getByRole('button', { name: 'View the tab' }));
  const tab = await screen.findByRole('dialog', { name: `Tab · table ${tableLabel}` });
  await within(tab).findAllByText('Still to pay');
  return tab;
}

/** The line menu of `name`, then the whole-order confirm. */
async function confirmVoidOrder(
  user: ReturnType<typeof userEvent.setup>,
  tab: HTMLElement,
  name: string,
) {
  await user.click(await within(tab).findByRole('button', { name: `${name}, actions` }));
  const menu = screen.getByRole('dialog', { name: new RegExp(name, 'u') });
  await user.click(within(menu).getByRole('button', { name: 'Void the whole order' }));
  return screen.getByRole('alertdialog', { name: 'Void the whole order?' });
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
  snapshot.current = null;
});

describe('voiding a whole order from the tab', () => {
  it('says what comes off, voids it on the server, and reads the tab again', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const { tableLabel, tabId, dish } = await freshOrder(gateway);
    const move = vi.spyOn(gateway, 'setOrderStatus');
    renderFloor(gateway);
    const user = userEvent.setup({ delay: null });

    const tab = await openTabOf(user, tableLabel);
    const confirm = await confirmVoidOrder(user, tab, dish.name);
    expect(spaced(confirm)).toContain(`${dram(dish.priceDram * 2)} comes off the bill`);
    expect(within(confirm).getByText(`2× ${dish.name}`)).toBeTruthy();

    // Cancel changes nothing.
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(move).not.toHaveBeenCalled();

    const again = await confirmVoidOrder(user, tab, dish.name);
    await user.click(within(again).getByRole('button', { name: 'Void the order' }));

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    expect(move.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ orderId: ORDER_ID, status: 'voided' }),
    );
    expect(
      await screen.findByText(
        (_, element) =>
          element?.classList.contains('floor-notice') === true &&
          spaced(element) ===
            `Order voided · ${dram(dish.priceDram * 2)} off the bill, the guest sees it`,
      ),
    ).toBeTruthy();
    // Read again: the line is struck through with the server's reason, and
    // offers no menu any more.
    await waitFor(() =>
      expect(within(tab).getByText(/Voided · The whole order was voided\./u)).toBeTruthy(),
    );
    expect(within(tab).queryByRole('button', { name: `${dish.name}, actions` })).toBeNull();
    expect((await gateway.getStaffTab(tabId))!.lines.some((l) => l.status === 'voided')).toBe(true);
  });

  it('is not offered for an order that has gone on to ready', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const { tableLabel, dish } = await freshOrder(gateway);
    await gateway.setOrderStatus({ orderId: ORDER_ID, status: 'inKitchen', clientCommandId: 'k' });
    await gateway.setOrderStatus({ orderId: ORDER_ID, status: 'ready', clientCommandId: 'r' });
    renderFloor(gateway);
    const user = userEvent.setup({ delay: null });

    const tab = await openTabOf(user, tableLabel);
    await user.click(await within(tab).findByRole('button', { name: `${dish.name}, actions` }));
    const menu = screen.getByRole('dialog', { name: new RegExp(dish.name, 'u') });
    expect(within(menu).getByRole('button', { name: 'Void the line' })).toBeTruthy();
    expect(within(menu).queryByRole('button', { name: 'Void the whole order' })).toBeNull();
  });

  it('says the tab was paid against meanwhile, and nothing changed', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const { tableLabel, dish } = await freshOrder(gateway);
    vi.spyOn(gateway, 'setOrderStatus').mockRejectedValue(
      new LineAlreadyPaidError({ url: `/api/orders/${ORDER_ID}/status`, lineId: 'l' }),
    );
    renderFloor(gateway);
    const user = userEvent.setup({ delay: null });

    const tab = await openTabOf(user, tableLabel);
    const confirm = await confirmVoidOrder(user, tab, dish.name);
    await user.click(within(confirm).getByRole('button', { name: 'Void the order' }));

    expect(
      await screen.findByText(
        'This tab has been paid against, so the order cannot be voided now. Nothing changed.',
      ),
    ).toBeTruthy();
  });

  it('says the order was already voided or left the kitchen, and nothing changed', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const { tableLabel, dish } = await freshOrder(gateway);
    vi.spyOn(gateway, 'setOrderStatus').mockRejectedValue(
      new OrderNotVoidableError({ url: `/api/orders/${ORDER_ID}/status`, orderId: ORDER_ID }),
    );
    renderFloor(gateway);
    const user = userEvent.setup({ delay: null });

    const tab = await openTabOf(user, tableLabel);
    const confirm = await confirmVoidOrder(user, tab, dish.name);
    await user.click(within(confirm).getByRole('button', { name: 'Void the order' }));

    expect(
      await screen.findByText(
        'This order was already voided or has left the kitchen. Nothing changed.',
      ),
    ).toBeTruthy();
  });
});
