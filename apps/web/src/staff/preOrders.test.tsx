// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  PreOrderNotSendableError,
  createQueryClient,
  createStaffMockGateway,
  newCommandId,
  type EnrolledDevice,
  type FloorChange,
  type StaffGateway,
  type StaffSessionSnapshot,
} from '@yalla/api';
import { formatDram } from '@yalla/format';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { applyFloorChanges } from './live/sequence';
import { resetCommandStore } from './testCommandStore';
import type * as CurrentUserModule from '../auth/useCurrentUser';

/**
 * Pre-orders on a booking, on the floor tablet (2026-10-21).
 *
 * The branch's `minutesBefore` (30 here) before a booking with a pre-order, a
 * card on the "Now" rail: the table, the time, the guest, their record, the
 * dishes (a dish sold out since flagged), the booking's note, the total, and
 * either "the guest confirmed they are on the way" or their number to call.
 * "Coming → Send to kitchen" sends it at once; "Not coming / no answer" asks
 * first and leaves the card, quieter, still sendable. Both online only. The
 * table's own panel shows its booking's pre-order with the same actions, and
 * the kitchen's tickets say which came from a pre-order.
 *
 * The staff mock's `seedPreOrders`: table 2 (Anna, on her way, in 25 min),
 * table 9 (Мария, to call, a cold brew sold out since, in 20 min), table 11
 * (Davit, sent five minutes ago — a held ticket in the kitchen, in 15 min),
 * and table 4 in 75 min (not due yet).
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

vi.mock('../offline/commandStore', async (importOriginal) =>
  (await import('./testCommandStore')).withMemoryStore(await importOriginal()),
);
vi.mock('./auth/staffSession', () => ({
  staffAuthAvailable: true,
  staffSession: {
    restore: async () => undefined,
    refreshDevice: async () => undefined,
    roster: async () => [],
    signOut: async () => undefined,
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
vi.mock('./chime', () => ({ primeChime: () => undefined, playChime: async () => true }));

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

function signIn(role: 'waiter' | 'kitchen' = 'waiter'): void {
  session.set({
    state: 'signedIn',
    device,
    identity: { staffMemberId: 's1', fullName: 'Sona Vardanyan', role, branchId: BRANCH },
    lastSignOut: null,
  } satisfies StaffSessionSnapshot);
}

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

function floorGateway(): StaffGateway {
  return createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, seedPreOrders: true });
}

function renderFloor(gateway: StaffGateway): void {
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

const setupUser = () => userEvent.setup({ delay: null });
const dram = (amount: number) => formatDram(amount, 'en');
/** The money's no-break space, as the matcher's normalised text has it: a plain one. */
const spaced = (text: string) => text.replace(/\s+/gu, ' ');

async function section(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: /^Pre-orders/u }, { timeout: 5000 });
}

async function card(table: string): Promise<HTMLElement> {
  const label = await within(await section()).findByText(new RegExp(`^Table ${table}$`, 'u'));
  return label.closest('li')!;
}

async function reservationAt(gateway: StaffGateway, table: string): Promise<string> {
  const rail = await gateway.listDuePreOrders(BRANCH);
  return rail.items.find((item) => item.tableLabel === table)!.reservationId;
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
  act(() => setOnline(true));
  cleanup();
  vi.restoreAllMocks();
  resetCommandStore();
});

describe('the rail', () => {
  it('lists the due pre-orders by start, after the bookings, and counts the ones to act on', async () => {
    signIn();
    renderFloor(floorGateway());

    const preOrders = await section();
    const rail = screen.getByRole('complementary', { name: 'Needs attention' });
    const regions = within(rail).getAllByRole('region');
    // The bookings first, then the pre-orders: both have a clock on them.
    expect(regions.indexOf(preOrders)).toBe(1);

    const cards = within(preOrders).getAllByRole('listitem', { name: /^Table \d+/u });
    expect(cards.map((entry) => within(entry).getByText(/^Table \d+$/u).textContent)).toEqual([
      'Table 11',
      'Table 9',
      'Table 2',
    ]);
    // Table 11 is in the kitchen already: two left to act on.
    expect(within(preOrders).getByText('2', { selector: '.ft-badge' })).toBeTruthy();
    // Not due yet: table 4's booking is 75 minutes away.
    expect(within(preOrders).queryByText('Table 4')).toBeNull();
  });

  it('says who, when, what, the note and the total, and that the guest is on the way', async () => {
    signIn();
    renderFloor(floorGateway());

    const two = await card('2');
    expect(within(two).getByText(/Աննա Մելիքյան · 2 guests/u)).toBeTruthy();
    expect(within(two).getByText(/^in 2\d min$/u)).toBeTruthy();
    // Her record, as on the bookings' cards.
    expect(two.querySelector('.guest-record')).not.toBeNull();
    const dishes = within(two).getByRole('list', { name: 'Dishes' });
    expect(within(dishes).getByText('Cappuccino')).toBeTruthy();
    expect(within(dishes).getByText('Oat milk')).toBeTruthy();
    expect(within(dishes).getByText('Butter croissant')).toBeTruthy();
    expect(within(dishes).getAllByText('2×')).toHaveLength(2);
    expect(within(two).getByText('A birthday: the cake comes with us')).toBeTruthy();
    expect(within(two).getByText(spaced(`Total ${dram(4600)}`))).toBeTruthy();
    expect(within(two).getByText('The guest confirmed they are on the way')).toBeTruthy();
    expect(within(two).queryByRole('link')).toBeNull();
  });

  it("gives the guest's number to call while they have not answered, and flags a dish sold out since", async () => {
    signIn();
    renderFloor(floorGateway());

    const nine = await card('9');
    const call = within(nine).getByRole('link', { name: 'Call Мария Петрова, +37477445566' });
    expect(call.getAttribute('href')).toBe('tel:+37477445566');
    expect(within(nine).getByText('Not confirmed they are on the way. Call:')).toBeTruthy();

    const coldBrew = within(nine).getByText('Cold brew').closest('li')!;
    expect(within(coldBrew).getByText('sold out now')).toBeTruthy();
    const cheesecake = within(nine).getByText('Cheesecake').closest('li')!;
    expect(within(cheesecake).queryByText('sold out now')).toBeNull();
    expect(within(nine).getByText(spaced(`Total ${dram(11_600)}`))).toBeTruthy();
  });

  it('shows a sent one as sent, with nothing left to tap', async () => {
    signIn();
    renderFloor(floorGateway());

    const eleven = await card('11');
    expect(
      within(eleven).getByText(/^Sent to the kitchen at \d\d:\d\d by Ani Hakobyan$/u),
    ).toBeTruthy();
    expect(within(eleven).getByText('In the kitchen')).toBeTruthy();
    expect(within(eleven).queryByRole('button')).toBeNull();
  });
});

describe('Coming → Send to kitchen', () => {
  it('sends once, however fast it is tapped, and the floor says so', async () => {
    signIn();
    const gateway = floorGateway();
    const send = vi.spyOn(gateway, 'sendPreOrder');
    renderFloor(gateway);

    const nine = await card('9');
    const button = within(nine).getByRole('button', { name: 'Coming → Send to kitchen, table 9' });
    expect(button.textContent).toBe('Coming → Send to kitchen');
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]![0]).toMatchObject({
      reservationId: expect.any(String),
      clientCommandId: expect.any(String),
    });
    expect(await screen.findByText('Table 9: pre-order sent to the kitchen.')).toBeTruthy();
    await waitFor(async () =>
      expect(
        within(await card('9')).getByText(/^Sent to the kitchen at \d\d:\d\d by Ani Hakobyan$/u),
      ).toBeTruthy(),
    );
    // Two left became one.
    expect(within(await section()).getByText('1', { selector: '.ft-badge' })).toBeTruthy();
  });

  it('is online only: offline, nothing is sent and the card says why', async () => {
    const user = setupUser();
    signIn();
    const gateway = floorGateway();
    const send = vi.spyOn(gateway, 'sendPreOrder');
    renderFloor(gateway);

    const nine = await card('9');
    act(() => setOnline(false));

    const button = within(nine).getByRole('button', { name: 'Coming → Send to kitchen, table 9' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    expect(
      (
        within(nine).getByRole('button', {
          name: 'Not coming / no answer, table 9',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(within(nine).getByText('Sending a pre-order needs a connection.')).toBeTruthy();
    await user.click(button);
    expect(send).not.toHaveBeenCalled();
  });

  it('words a refusal on the card', async () => {
    const user = setupUser();
    signIn();
    const gateway = floorGateway();
    vi.spyOn(gateway, 'sendPreOrder').mockRejectedValue(
      new PreOrderNotSendableError({ url: 'x', reservationId: 'r' }),
    );
    renderFloor(gateway);

    const nine = await card('9');
    await user.click(
      within(nine).getByRole('button', { name: 'Coming → Send to kitchen, table 9' }),
    );

    expect((await within(nine).findByRole('alert')).textContent).toBe(
      'This pre-order cannot be sent now. The list has been refreshed.',
    );
  });
});

describe('Not coming / no answer', () => {
  it('asks first, keeps the card on Cancel, and once marked leaves it quieter but sendable', async () => {
    const user = setupUser();
    signIn();
    const gateway = floorGateway();
    const notComing = vi.spyOn(gateway, 'markPreOrderNotComing');
    const send = vi.spyOn(gateway, 'sendPreOrder');
    renderFloor(gateway);

    const nine = await card('9');
    await user.click(within(nine).getByRole('button', { name: 'Not coming / no answer, table 9' }));
    const question = within(nine).getByRole('group', { name: 'Table 9: not coming?' });
    expect(
      within(question).getByText(
        'Nothing goes to the kitchen. If they arrive after all, you can still send it from here.',
      ),
    ).toBeTruthy();
    expect(notComing).not.toHaveBeenCalled();

    await user.click(within(question).getByRole('button', { name: 'Cancel' }));
    await user.click(within(nine).getByRole('button', { name: 'Not coming / no answer, table 9' }));
    await user.click(within(nine).getByRole('button', { name: 'Yes, not coming' }));

    await waitFor(() => expect(notComing).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(
        'Table 9: marked not coming. If they arrive, you can still send the pre-order.',
      ),
    ).toBeTruthy();

    const marked = await card('9');
    await waitFor(() =>
      expect(
        within(marked).getByText(/^Marked not coming at \d\d:\d\d by Ani Hakobyan$/u),
      ).toBeTruthy(),
    );
    expect(marked.classList.contains('is-quiet')).toBe(true);
    expect(within(marked).queryByRole('button', { name: /^Not coming \/ no answer/u })).toBeNull();
    // Not counted any more: only table 2 is left to act on.
    expect(within(await section()).getByText('1', { selector: '.ft-badge' })).toBeTruthy();

    await user.click(
      within(marked).getByRole('button', { name: 'Coming → Send to kitchen, table 9' }),
    );
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });
});

describe("the table's panel", () => {
  it("shows the pre-order of the table's booking, with the same actions", async () => {
    const user = setupUser();
    signIn();
    const gateway = floorGateway();
    const send = vi.spyOn(gateway, 'sendPreOrder');
    renderFloor(gateway);

    await section();
    await user.click(await screen.findByRole('button', { name: /^Table 2, /u }));
    const panel = screen.getByRole('dialog', { name: 'Actions for table 2' });
    const preOrder = within(panel).getByRole('region', { name: 'Pre-order' });
    expect(within(preOrder).getByText('Cappuccino')).toBeTruthy();
    expect(within(preOrder).getByText('The guest confirmed they are on the way')).toBeTruthy();

    await user.click(
      within(preOrder).getByRole('button', { name: 'Coming → Send to kitchen, table 2' }),
    );
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  it('shows none for a table whose booking has no pre-order due', async () => {
    const user = setupUser();
    signIn();
    renderFloor(floorGateway());

    await section();
    await user.click(await screen.findByRole('button', { name: /^Table 4, /u }));
    const panel = screen.getByRole('dialog', { name: 'Actions for table 4' });
    expect(within(panel).queryByRole('region', { name: 'Pre-order' })).toBeNull();
  });
});

/** Table 6 with a scan waiting to be let in, and a same-status row at it carrying `signal`. */
function signalledRow(signal: FloorChange['signal']) {
  const floor = {
    plan: { tables: [{ id: 't6', state: 'occupied' }] },
    details: [
      {
        tableId: 't6',
        physicalStatus: 'occupied',
        currentSessionId: 's',
        seatedAtUtc: '2026-10-21T14:00:00Z',
        partySize: 3,
        openTabId: 'tab-6',
        openTabAwaitingAdmission: true,
        nextReservationStartUtc: null,
      },
    ],
    lastSequence: 10,
    asOfUtc: '2026-10-21T14:00:00Z',
  };
  const change: FloorChange = {
    sequence: 11,
    tableId: 't6',
    tableLabel: '6',
    fromStatus: 'occupied',
    toStatus: 'occupied',
    atUtc: '2026-10-21T14:05:00Z',
    tableSessionId: null,
    reservationId: 'r1',
    actor: 'staff',
    actorId: null,
    reason: '',
    tabId: null,
    signal,
  };
  return { floor, change };
}

describe('the change stream', () => {
  it('reads the rail again when another tablet acts on a pre-order (signal 6)', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-21T15:00:00.000Z'), shouldAdvanceTime: true });
    try {
      signIn();
      const gateway = floorGateway();
      const rail = vi.spyOn(gateway, 'listDuePreOrders');
      renderFloor(gateway);
      await card('9');
      const before = rail.mock.calls.length;

      // The other tablet, straight through the gateway.
      await gateway.markPreOrderNotComing({
        reservationId: await reservationAt(gateway, '9'),
        clientCommandId: newCommandId(),
      });
      await act(() => vi.advanceTimersByTimeAsync(8_500));

      await waitFor(() => expect(rail.mock.calls.length).toBeGreaterThan(before + 1));
      expect(
        await within(await card('9')).findByText(/^Marked not coming at \d\d:\d\d/u),
      ).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never folds a pre-order's row into its table", () => {
    const { floor, change } = signalledRow('preOrderChanged');
    const result = applyFloorChanges(floor as never, [change]);
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') return;
    // The waiting flag and the tab are the admission rows' to change, not this one's.
    expect(result.floor.details[0]).toEqual(floor.details[0]);
    expect(result.floor.lastSequence).toBe(11);
  });

  it('reads the floor again on a signal this build does not know, rather than guessing', () => {
    const { floor, change } = signalledRow('unknown');
    expect(applyFloorChanges(floor as never, [change]).kind).toBe('gap');
  });
});

describe('the kitchen', () => {
  it('marks a pre-order ticket with its table and time, and moves it on with the one action', async () => {
    const user = setupUser();
    signIn('kitchen');
    const gateway = floorGateway();
    const status = vi.spyOn(gateway, 'setOrderStatus');
    renderFloor(gateway);

    const ticket = (
      await screen.findByText(/^Pre-order · Table 11 · \d\d:\d\d$/u, undefined, { timeout: 5000 })
    ).closest('li')!;
    expect(ticket.getAttribute('aria-label')).toMatch(/^Pre-order · Table 11 · \d\d:\d\d\. /u);
    expect(within(ticket).getByText('Eggs on matnakash')).toBeTruthy();
    // Cooked for the booking: counted to its start, and not late before it.
    expect(within(ticket).getByRole('timer').textContent).toMatch(/^in 1\d min$/u);
    expect(ticket.classList.contains('is-fresh')).toBe(true);

    await user.click(within(ticket).getByRole('button', { name: 'Ready · table 11' }));
    await waitFor(() => expect(status).toHaveBeenCalledTimes(1));
    expect(status.mock.calls[0]![0]).toMatchObject({ status: 'ready' });
  });

  it("marks it the same on the waiter's Kitchen tab", async () => {
    const user = setupUser();
    signIn();
    renderFloor(floorGateway());

    await section();
    await user.click(screen.getByRole('button', { name: /^Kitchen/u }));
    expect(
      await screen.findByText(/^Pre-order · Table 11 · \d\d:\d\d$/u, undefined, { timeout: 5000 }),
    ).toBeTruthy();
  });
});
