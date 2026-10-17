// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  createQueryClient,
  createStaffMockGateway,
  tableDetail,
  type EnrolledDevice,
  type ServiceRequest,
  type StaffGateway,
  type StaffSessionSnapshot,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { formatDram, formatDramAmount } from '@yalla/format';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import type * as CurrentUserModule from '../auth/useCurrentUser';

/**
 * A table that asked for the bill from the app's pay sheet: the whole bill or
 * one person's share, with a tip. The waiter should walk over knowing the
 * amount — on the request card, on the tab, and already in the cash keypad —
 * and the tip must stay outside the balance everywhere it appears.
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
  deviceName: 'Counter',
  branchId: BRANCH,
  branchName: 'Lumen North',
  venueName: 'Lumen',
  enrolledAtUtc: '2026-09-01T00:00:00Z',
  lastSeenAtUtc: null,
};

function signIn(): void {
  const next: StaffSessionSnapshot = {
    state: 'signedIn',
    device,
    identity: { staffMemberId: 's1', fullName: 'Sona Vardanyan', role: 'waiter', branchId: BRANCH },
    lastSignOut: null,
  };
  snapshot.current = next;
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

/** As the text matchers read it: the formatter's no-break space is a space to them. */
const dram = (amount: number) => formatDram(amount, 'en').replace(/\s/gu, ' ');

/** The seeded "The bill" request: the whole bill, with a 5% tip. */
async function seededBillRequest(gateway: StaffGateway): Promise<ServiceRequest> {
  const requests = await gateway.listServiceRequests(BRANCH);
  const request = requests.find((candidate) => candidate.reason === 'bill');
  expect(request?.bill, 'the staff mock seeds a bill request with amounts').toBeTruthy();
  return request!;
}

async function openTabOf(user: ReturnType<typeof userEvent.setup>, tableLabel: string) {
  await user.click(
    await screen.findByRole('button', { name: new RegExp(`^Table ${tableLabel},`, 'u') }),
  );
  const actions = await screen.findByRole('dialog', { name: `Actions for table ${tableLabel}` });
  await user.click(within(actions).getByRole('button', { name: 'View the tab' }));
  const tab = await screen.findByRole('dialog', { name: `Tab · table ${tableLabel}` });
  // The tab itself, not its loading line.
  await within(tab).findByText('Still owed');
  return tab;
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
});

describe('a bill request from the app', () => {
  it('shows the amount and the tip on the request card', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const { bill, tableLabel } = await seededBillRequest(gateway);
    renderFloor(gateway);

    const line = await screen.findByText(
      `Whole bill: ${dram(bill!.amountDram)} · tip 5% · ${dram(bill!.tipDram)}`,
    );
    const card = line.closest('li')!;
    expect(
      within(card).getByText(new RegExp(`^Table ${tableLabel} · asked for the bill`, 'u')),
    ).toBeTruthy();
    // The water request beside it has no amounts to show.
    expect(screen.getAllByText(/^Whole bill:/u)).toHaveLength(1);
  });

  it('puts the request on the tab and opens the keypad on its amount and tip, still editable', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const { bill, tableLabel } = await seededBillRequest(gateway);
    const record = vi.spyOn(gateway, 'recordCashPayment');
    const user = userEvent.setup();
    renderFloor(gateway);

    const tab = await openTabOf(user, tableLabel);
    const wants = `Wants to pay the whole bill: ${dram(bill!.amountDram)} · tip 5% · ${dram(bill!.tipDram)}`;
    expect(within(tab).getByText(wants)).toBeTruthy();
    // No tip has been taken yet, so there is no tips line to misread.
    expect(within(tab).queryByText(/^Tips taken/u)).toBeNull();

    await user.click(within(tab).getByRole('button', { name: 'Take cash' }));
    const keypad = screen.getByRole('dialog', { name: 'Take cash' });
    const amount = within(keypad).getByRole('button', { name: /^Amount/u });
    const tip = within(keypad).getByRole('button', { name: /^Tip/u });
    expect(amount.textContent).toContain(formatDramAmount(bill!.amountDram, 'en'));
    expect(tip.textContent).toContain(formatDramAmount(bill!.tipDram, 'en'));
    expect(within(keypad).getByText(/filled in from what the table asked for/iu)).toBeTruthy();

    // They round the tip up at the table: the waiter types over it.
    await user.click(tip);
    for (let i = 0; i < String(bill!.tipDram).length; i += 1) {
      await user.click(within(keypad).getByRole('button', { name: 'Delete' }));
    }
    await user.click(within(keypad).getByRole('button', { name: '1' }));
    await user.click(within(keypad).getByRole('button', { name: '00' }));
    await user.click(within(keypad).getByRole('button', { name: 'Record it' }));

    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0]![0]).toMatchObject({
      amountDram: bill!.amountDram,
      tipDram: 100,
    });

    // Paid against, so the request leaves the tab, and the tip shows outside
    // the balance.
    await waitFor(() => expect(within(tab).queryByText(wants)).toBeNull());
    expect(
      await within(tab).findByText(`Tips taken: ${dram(100)} · on top of the bill`),
    ).toBeTruthy();
  });

  it('keeps the request on the tab after "On my way", which drops it from the list', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const { bill, tableLabel } = await seededBillRequest(gateway);
    const user = userEvent.setup();
    renderFloor(gateway);

    const line = await screen.findByText(/^Whole bill:/u);
    await user.click(within(line.closest('li')!).getByRole('button', { name: 'On my way' }));
    await waitFor(() => expect(screen.queryByText(/^Whole bill:/u)).toBeNull());

    const tab = await openTabOf(user, tableLabel);
    expect(
      within(tab).getByText(
        `Wants to pay the whole bill: ${dram(bill!.amountDram)} · tip 5% · ${dram(bill!.tipDram)}`,
      ),
    ).toBeTruthy();
  });

  it('opens the keypad on the balance when nobody asked for the bill', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const floor = await gateway.getFloor(BRANCH);
    expect(floor).toBeTruthy();
    const { tableLabel } = await seededBillRequest(gateway);
    // The other occupied table has a tab and no bill request.
    const other = floor!.plan.tables.find(
      (table) => table.label !== tableLabel && tableDetail(floor, table.id)?.openTabId,
    );
    expect(other, 'the fixture has a second table with a tab').toBeTruthy();
    const user = userEvent.setup();
    renderFloor(gateway);

    const tab = await openTabOf(user, other!.label);
    expect(within(tab).queryByText(/^Wants to pay/u)).toBeNull();
    await user.click(within(tab).getByRole('button', { name: 'Take cash' }));
    const keypad = screen.getByRole('dialog', { name: 'Take cash' });
    expect(within(keypad).queryByText(/filled in from what the table asked for/iu)).toBeNull();
    expect(within(keypad).getByRole('button', { name: /^Tip/u }).textContent).toContain('0');
  });
});

describe('the people on a tab', () => {
  it('shows an account photo where there is one, and initials otherwise or when it fails', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const { tableLabel } = await seededBillRequest(gateway);
    const user = userEvent.setup();
    renderFloor(gateway);

    const tab = await openTabOf(user, tableLabel);
    const anahit = within(tab)
      .getByText(/^Anahit/u)
      .closest('li')!;
    const karen = within(tab)
      .getByText(/^Karen/u)
      .closest('li')!;

    const photo = anahit.querySelector('img');
    expect(photo?.getAttribute('src')).toMatch(/avatar-anahit/u);
    // Decorative: the name is right beside it.
    expect(photo?.getAttribute('alt')).toBe('');
    expect(karen.querySelector('img')).toBeNull();
    expect(karen.querySelector('.tab-avatar')?.textContent).toBe('K');

    fireEvent.error(photo!);
    expect(anahit.querySelector('img')).toBeNull();
    expect(anahit.querySelector('.tab-avatar')?.textContent).toBe('A');
  });
});
