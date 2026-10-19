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
  type TabStaffParticipant,
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
import { resetCommandStore } from './testCommandStore';
import type * as CurrentUserModule from '../auth/useCurrentUser';
import { ParticipantAvatar } from './TabPanel';

/**
 * People at a table who asked for the bill from the app's pay sheet: the
 * whole bill or their own share, with a tip. The waiter should walk over
 * knowing who wants to pay what — on the request card, on the tab, and
 * already in the cash keypad — take cash for exactly one of them, and the tip
 * must stay outside the balance everywhere it appears.
 *
 * The staff mock seeds one tab with both: Anahit (the host) the whole bill
 * with 5%, then Karen her own share with 10%.
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
  renderedClient = queryClient;
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

/** The last floor's query client, to make it read again as a poll would. */
let renderedClient: ReturnType<typeof createQueryClient> | null = null;

/** As the text matchers read it: the formatter's no-break space is a space to them. */
const dram = (amount: number) => formatDram(amount, 'en').replace(/\s/gu, ' ');

/** The seeded requests: Anahit's whole bill and Karen's share, on one tab. */
async function seededBills(gateway: StaffGateway) {
  const requests = await gateway.listServiceRequests(BRANCH);
  const whole = requests.find((request) => request.bill?.scope === 'whole');
  const mine = requests.find((request) => request.bill?.scope === 'mine');
  expect(whole, 'the staff mock seeds a whole-bill request').toBeTruthy();
  expect(mine, 'the staff mock seeds a my-share request').toBeTruthy();
  expect(mine!.tabId).toBe(whole!.tabId);
  const tab = (await gateway.getStaffTab(whole!.tabId))!;
  return { whole: whole!, mine: mine!, tableLabel: whole!.tableLabel, tab };
}

const wantsWhole = (request: ServiceRequest) =>
  `Wants to pay the whole bill: ${dram(request.bill!.amountDram)} · tip ${request.bill!.tipPercent}% · ${dram(request.bill!.tipDram)}`;
const wantsMine = (request: ServiceRequest) =>
  `Wants to pay their share: ${dram(request.bill!.amountDram)} · tip ${request.bill!.tipPercent}% · ${dram(request.bill!.tipDram)}`;

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

async function openKeypad(user: ReturnType<typeof userEvent.setup>, tab: HTMLElement) {
  await user.click(within(tab).getByRole('button', { name: 'Take cash' }));
  const keypad = screen.getByRole('dialog', { name: 'Take cash' });
  return {
    keypad,
    amount: within(keypad).getByRole('button', { name: /^Amount/u }),
    tip: within(keypad).getByRole('button', { name: /^Tip/u }),
    press: async (...keys: string[]) => {
      for (const key of keys) await user.click(within(keypad).getByRole('button', { name: key }));
    },
  };
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
  resetCommandStore();
});

describe('a bill request from the app', () => {
  it('shows the amount and the tip on each request card', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const { whole, mine, tableLabel } = await seededBills(gateway);
    renderFloor(gateway);

    const line = await screen.findByText(
      `Whole bill: ${dram(whole.bill!.amountDram)} · tip 5% · ${dram(whole.bill!.tipDram)}`,
    );
    const card = line.closest('li')!;
    expect(within(card).getByText(`Table ${tableLabel}`)).toBeTruthy();
    expect(within(card).getByText('asks for the bill')).toBeTruthy();
    expect(
      screen.getByText(
        `Their share: ${dram(mine.bill!.amountDram)} · tip 10% · ${dram(mine.bill!.tipDram)}`,
      ),
    ).toBeTruthy();
    // The water request beside them has no amounts to show.
    expect(screen.getAllByText(/^Whole bill:/u)).toHaveLength(1);
  });

  it('lists every bill request on the tab by name, the newest picked', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const { whole, mine, tableLabel } = await seededBills(gateway);
    const user = userEvent.setup({ delay: null });
    renderFloor(gateway);

    const tab = await openTabOf(user, tableLabel);
    const karen = within(tab).getByRole<HTMLInputElement>('radio', { name: 'Karen' });
    const anahit = within(tab).getByRole<HTMLInputElement>('radio', { name: 'Anahit' });
    const none = within(tab).getByRole<HTMLInputElement>('radio', { name: 'None of these' });
    // Karen asked last.
    expect(karen.checked).toBe(true);
    expect(anahit.checked).toBe(false);
    expect(none.checked).toBe(false);
    // Each says what they asked for.
    expect(within(tab).getByText(wantsMine(mine))).toBeTruthy();
    expect(within(tab).getByText(wantsWhole(whole))).toBeTruthy();
    expect(karen.getAttribute('aria-describedby')).toBeTruthy();
    const described = document.getElementById(karen.getAttribute('aria-describedby')!);
    expect(described?.textContent?.replace(/\s/gu, ' ')).toBe(wantsMine(mine));
    // No tip has been taken yet, so there is no tips line to misread.
    expect(within(tab).queryByText(/^Tips taken/u)).toBeNull();
  });

  it('opens the keypad on the picked request and takes the whole bill from nobody in particular', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const { whole, mine, tableLabel } = await seededBills(gateway);
    const record = vi.spyOn(gateway, 'recordCashPayment');
    const acknowledge = vi.spyOn(gateway, 'acknowledgeServiceRequest');
    const user = userEvent.setup({ delay: null });
    renderFloor(gateway);

    const tab = await openTabOf(user, tableLabel);
    await user.click(within(tab).getByRole('radio', { name: 'Anahit' }));

    const { keypad, amount, tip, press } = await openKeypad(user, tab);
    expect(amount.textContent).toContain(formatDramAmount(whole.bill!.amountDram, 'en'));
    expect(tip.textContent).toContain(formatDramAmount(whole.bill!.tipDram, 'en'));
    expect(within(keypad).getByText(/filled in from what the table asked for/iu)).toBeTruthy();

    // They round the tip up at the table: the waiter types over it.
    await user.click(tip);
    await press(...Array.from(String(whole.bill!.tipDram), () => 'Delete'), '1', '00');
    await press('Record it');

    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    const sent = record.mock.calls[0]![0];
    expect(sent).toMatchObject({ amountDram: whole.bill!.amountDram, tipDram: 100 });
    // The whole bill is the table's: nobody's share is credited with it.
    expect(sent.participantId).toBeUndefined();

    // Answered on the server too, so the other tablet stops showing it.
    await waitFor(() =>
      expect(acknowledge).toHaveBeenCalledWith(expect.objectContaining({ requestId: whole.id })),
    );
    expect(acknowledge).toHaveBeenCalledTimes(1);
    // Paid in full, so the tab closes and the tip shows outside the balance.
    expect(
      await within(tab).findByText(`Tips taken: ${dram(100)} · on top of the bill`),
    ).toBeTruthy();
    expect(within(tab).queryByText(wantsWhole(whole))).toBeNull();
    // Karen's request was not touched: still open on the server.
    const open = await gateway.listServiceRequests(BRANCH);
    expect(open.map((request) => request.id)).toContain(mine.id);
    expect(open.map((request) => request.id)).not.toContain(whole.id);
  });

  it('credits a "my share" payment to the person who asked, and clears only their request', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const { whole, mine, tableLabel } = await seededBills(gateway);
    const record = vi.spyOn(gateway, 'recordCashPayment');
    const acknowledge = vi.spyOn(gateway, 'acknowledgeServiceRequest');
    const user = userEvent.setup({ delay: null });
    renderFloor(gateway);

    const tab = await openTabOf(user, tableLabel);
    // Karen is the default: the newest.
    const { amount, tip, press } = await openKeypad(user, tab);
    expect(amount.textContent).toContain(formatDramAmount(mine.bill!.amountDram, 'en'));
    expect(tip.textContent).toContain(formatDramAmount(mine.bill!.tipDram, 'en'));
    await press('Record it');

    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0]![0]).toMatchObject({
      amountDram: mine.bill!.amountDram,
      tipDram: mine.bill!.tipDram,
      participantId: mine.requestedByParticipantId,
    });

    await waitFor(() => expect(within(tab).queryByRole('radio', { name: 'Karen' })).toBeNull());
    // Anahit still wants to pay what is left, and is now the one picked.
    const anahit = within(tab).getByRole<HTMLInputElement>('radio', { name: 'Anahit' });
    expect(anahit.checked).toBe(true);
    expect(within(tab).getByText(wantsWhole(whole))).toBeTruthy();

    await waitFor(() =>
      expect(acknowledge).toHaveBeenCalledWith(expect.objectContaining({ requestId: mine.id })),
    );
    expect(acknowledge).toHaveBeenCalledTimes(1);
    const open = await gateway.listServiceRequests(BRANCH);
    expect(open.map((request) => request.id)).toContain(whole.id);
    expect(open.map((request) => request.id)).not.toContain(mine.id);
  });

  it('credits the person whose request the keypad opened on, even if it leaves the list while the waiter types', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const { mine, tableLabel } = await seededBills(gateway);
    const record = vi.spyOn(gateway, 'recordCashPayment');
    const user = userEvent.setup({ delay: null });
    renderFloor(gateway);

    const tab = await openTabOf(user, tableLabel);
    // Karen is the default: the newest.
    const { press } = await openKeypad(user, tab);
    // Another tablet answers her request meanwhile, and the next poll drops it.
    await gateway.acknowledgeServiceRequest({
      requestId: mine.id,
      clientCommandId: 'other-tablet',
    });
    await renderedClient!.invalidateQueries();
    await waitFor(() => expect(within(tab).queryByRole('radio', { name: 'Karen' })).toBeNull());
    await press('Record it');

    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0]![0]).toMatchObject({
      amountDram: mine.bill!.amountDram,
      tipDram: mine.bill!.tipDram,
      participantId: mine.requestedByParticipantId,
    });
  });

  it('caps the prefilled amount at what the tab still owes', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const { mine, tableLabel, tab: staffTab } = await seededBills(gateway);
    const record = vi.spyOn(gateway, 'recordCashPayment');
    const acknowledge = vi.spyOn(gateway, 'acknowledgeServiceRequest');
    const user = userEvent.setup({ delay: null });
    renderFloor(gateway);

    const tab = await openTabOf(user, tableLabel);
    // Somebody pays most of the bill without having asked in the app.
    await user.click(within(tab).getByRole('radio', { name: 'None of these' }));
    const first = await openKeypad(user, tab);
    expect(first.amount.textContent).toContain(
      formatDramAmount(staffTab.totals.remainingDram, 'en'),
    );
    expect(
      within(first.keypad).queryByText(/filled in from what the table asked for/iu),
    ).toBeNull();
    await first.press(...Array.from(String(staffTab.totals.remainingDram), () => 'Delete'));
    await first.press('4', '00', '0', 'Record it');

    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0]![0]).toMatchObject({ amountDram: 4000, tipDram: 0 });
    expect(record.mock.calls[0]![0].participantId).toBeUndefined();
    const left = staffTab.totals.remainingDram - 4000;
    expect(left).toBeLessThan(mine.bill!.amountDram);
    await within(tab).findByText(`Take cash starts from the balance: ${dram(left)}`);
    // Nobody's request was answered by it.
    expect(within(tab).getByRole('radio', { name: 'Karen' })).toBeTruthy();
    expect(within(tab).getByRole('radio', { name: 'Anahit' })).toBeTruthy();
    expect(acknowledge).not.toHaveBeenCalled();

    // Karen's share was priced before that payment: more than is left now.
    await user.click(within(tab).getByRole('radio', { name: 'Karen' }));
    const second = await openKeypad(user, tab);
    expect(second.amount.textContent).toContain(formatDramAmount(left, 'en'));
    expect(second.tip.textContent).toContain(formatDramAmount(mine.bill!.tipDram, 'en'));
    expect(within(second.keypad).queryByText(/more than this tab owes/iu)).toBeNull();
  });

  it('keeps a request on the tab after "On my way", and does not answer it twice', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const { whole, mine, tableLabel } = await seededBills(gateway);
    const record = vi.spyOn(gateway, 'recordCashPayment');
    const acknowledge = vi.spyOn(gateway, 'acknowledgeServiceRequest');
    const user = userEvent.setup({ delay: null });
    renderFloor(gateway);

    const line = await screen.findByText(/^Whole bill:/u);
    await user.click(within(line.closest('li')!).getByRole('button', { name: 'On my way' }));
    await waitFor(() => expect(screen.queryByText(/^Whole bill:/u)).toBeNull());
    expect(acknowledge).toHaveBeenCalledTimes(1);

    const tab = await openTabOf(user, tableLabel);
    expect(within(tab).getByText(wantsWhole(whole))).toBeTruthy();
    expect(within(tab).getByText(wantsMine(mine))).toBeTruthy();

    await user.click(within(tab).getByRole('radio', { name: 'Anahit' }));
    const { press } = await openKeypad(user, tab);
    await press('Record it');
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(within(tab).queryByText(wantsWhole(whole))).toBeNull());
    // Already answered from here: no second acknowledgement.
    expect(acknowledge).toHaveBeenCalledTimes(1);
  });

  it('opens the keypad on the balance when nobody asked for the bill', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const floor = await gateway.getFloor(BRANCH);
    expect(floor).toBeTruthy();
    const { tableLabel } = await seededBills(gateway);
    // The other occupied table has a tab and no bill request.
    const other = floor!.plan.tables.find(
      (table) => table.label !== tableLabel && tableDetail(floor, table.id)?.openTabId,
    );
    expect(other, 'the fixture has a second table with a tab').toBeTruthy();
    const user = userEvent.setup({ delay: null });
    renderFloor(gateway);

    const tab = await openTabOf(user, other!.label);
    expect(within(tab).queryByText(/^Wants to pay/u)).toBeNull();
    expect(within(tab).queryByRole('radio')).toBeNull();
    const { keypad, tip } = await openKeypad(user, tab);
    expect(within(keypad).queryByText(/filled in from what the table asked for/iu)).toBeNull();
    expect(tip.textContent).toContain('0');
  });
});

describe('the people on a tab', () => {
  it('shows an account photo where there is one, and initials otherwise or when it fails', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const { tableLabel } = await seededBills(gateway);
    const user = userEvent.setup({ delay: null });
    renderFloor(gateway);

    const tab = await openTabOf(user, tableLabel);
    const people = tab.querySelector<HTMLElement>('.tab-shares')!;
    const anahit = within(people)
      .getByText(/^Anahit/u)
      .closest('li')!;
    const karen = within(people)
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

  it('tries a new photo after the old one failed', () => {
    const person = (thumbnailUrl: string | null): TabStaffParticipant => ({
      id: 'p1',
      displayName: 'Anahit',
      isHost: true,
      status: 'approved',
      canOrder: true,
      canOrderNow: true,
      canSeeTableTotal: true,
      photo: thumbnailUrl
        ? ({ thumbnailUrl } as unknown as NonNullable<TabStaffParticipant['photo']>)
        : null,
    });

    const { container, rerender } = render(
      <ParticipantAvatar person={person('https://cdn.test/old.jpg')} name="Anahit" />,
    );
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('A');

    // The same photo again: still the initials, it already failed.
    rerender(<ParticipantAvatar person={person('https://cdn.test/old.jpg')} name="Anahit" />);
    expect(container.querySelector('img')).toBeNull();

    // A new link gets its own try.
    rerender(<ParticipantAvatar person={person('https://cdn.test/new.jpg')} name="Anahit" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/new.jpg');

    // And no photo at all is the initials, not a broken image.
    rerender(<ParticipantAvatar person={person(null)} name="Anahit" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('A');
  });
});
