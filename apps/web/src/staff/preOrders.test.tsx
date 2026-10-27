// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  FULL_FEATURES,
  NetworkError,
  PreOrderNotSendableError,
  TableBusyError,
  createQueryClient,
  createStaffMockGateway,
  newCommandId,
  type DuePreOrder,
  type EnrolledDevice,
  type FloorChange,
  type StaffGateway,
  type StaffSessionSnapshot,
} from '@yalla/api';
import { formatDram } from '@yalla/format';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { applyFloorChanges } from './live/sequence';
import { preOrderForTable } from './PreOrderPanel';
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
    identity: {
      staffMemberId: 's1',
      fullName: 'Sona Vardanyan',
      role,
      branchId: BRANCH,
      features: FULL_FEATURES,
    },
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
  it('lists the cards waiting for a waiter first, then the sent ones, and counts the ones to act on', async () => {
    signIn();
    renderFloor(floorGateway());

    const preOrders = await section();
    const rail = screen.getByRole('complementary', { name: 'Needs attention' });
    const regions = within(rail).getAllByRole('region');
    // The bookings first, then the pre-orders: both have a clock on them.
    expect(regions.indexOf(preOrders)).toBe(1);

    const cards = within(preOrders).getAllByRole('listitem', { name: /^Table \d+/u });
    // Live QA 2026-10-21: the ones still waiting for a tap first, by start;
    // table 11 is in the kitchen already, so it goes after them.
    expect(cards.map((entry) => within(entry).getByText(/^Table \d+$/u).textContent)).toEqual([
      'Table 9',
      'Table 2',
      'Table 11',
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
    // Her answer, in the Ask block's words (2026-10-22): nobody need call.
    expect(within(two).getByText(/^Coming · said at \d\d:\d\d$/u)).toBeTruthy();
    expect(within(two).getByText('Time to send the pre-order to the kitchen.')).toBeTruthy();
    expect(within(two).queryByRole('button', { name: 'Ask: are you coming?' })).toBeNull();
    expect(within(two).queryByRole('link')).toBeNull();
  });

  it('says the guest is running late, and flags a dish sold out since', async () => {
    signIn();
    renderFloor(floorGateway());

    const nine = await card('9');
    // She said "running late 15" in the app (2026-10-22): when to expect her,
    // and when to send the pre-order — no "ask" and no call.
    expect(within(nine).getByText(/^Running late 15 min · \d\d:\d\d$/u)).toBeTruthy();
    expect(
      within(nine).getByText(
        /^Expected around \d\d:\d\d\. Send the pre-order at about \d\d:\d\d\.$/u,
      ),
    ).toBeTruthy();
    expect(within(nine).queryByRole('button', { name: 'Ask: are you coming?' })).toBeNull();
    expect(within(nine).queryByRole('link')).toBeNull();

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
    // Both taps in one frame, before a render can disable the button: only
    // the card's own guard stands between them and a second ticket.
    act(() => {
      button.click();
      button.click();
    });

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

describe('a failure on the card', () => {
  it('goes once the card has moved on: another tablet acted on it since', async () => {
    const user = setupUser();
    signIn();
    const gateway = floorGateway();
    const mark = gateway.markPreOrderNotComing.bind(gateway);
    // The other tablet marks it while this one's send is refused.
    vi.spyOn(gateway, 'sendPreOrder').mockImplementation(async (command) => {
      await mark({ reservationId: command.reservationId, clientCommandId: newCommandId() });
      throw new TableBusyError({ url: 'x' });
    });
    renderFloor(gateway);

    const nine = await card('9');
    await user.click(
      within(nine).getByRole('button', { name: 'Coming → Send to kitchen, table 9' }),
    );
    // The rail is read again after the refusal, and the card is another one.
    await waitFor(async () =>
      expect(
        within(await card('9')).getByText(/^Marked not coming at \d\d:\d\d by Ani Hakobyan$/u),
      ).toBeTruthy(),
    );
    expect(within(await card('9')).queryByRole('alert')).toBeNull();
  });

  it('stays while the card is as it was', async () => {
    const user = setupUser();
    signIn();
    const gateway = floorGateway();
    const read = vi.spyOn(gateway, 'listDuePreOrders');
    vi.spyOn(gateway, 'sendPreOrder').mockRejectedValue(new TableBusyError({ url: 'x' }));
    renderFloor(gateway);

    const nine = await card('9');
    const before = read.mock.calls.length;
    await user.click(
      within(nine).getByRole('button', { name: 'Coming → Send to kitchen, table 9' }),
    );
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(before));
    expect((await within(await card('9')).findByRole('alert')).textContent).toBe(
      'The table is busy with another change. Tap again.',
    );
  });
});

describe('a rail that could not be read again', () => {
  it('keeps the cards it has, and says they may be out of date', async () => {
    const user = setupUser();
    signIn();
    const gateway = floorGateway();
    const read = vi.spyOn(gateway, 'listDuePreOrders');
    vi.spyOn(gateway, 'sendPreOrder').mockRejectedValue(new TableBusyError({ url: 'x' }));
    renderFloor(gateway);

    const nine = await card('9');
    expect(
      within(await section()).queryByText(
        'The pre-orders could not be read again. These may be out of date.',
      ),
    ).toBeNull();
    read.mockRejectedValue(new NetworkError({ url: 'x' }));
    // A refusal reads the rail again; that read fails.
    await user.click(
      within(nine).getByRole('button', { name: 'Coming → Send to kitchen, table 9' }),
    );

    expect(
      await within(await section()).findByText(
        'The pre-orders could not be read again. These may be out of date.',
      ),
    ).toBeTruthy();
    expect(await card('9')).toBeTruthy();
  });
});

describe('a held ticket the kitchen voided', () => {
  it('says so in a pill that is not the green of "in the kitchen", and no bill line', async () => {
    signIn();
    const gateway = floorGateway();
    const list = gateway.listDuePreOrders.bind(gateway);
    vi.spyOn(gateway, 'listDuePreOrders').mockImplementation(async (branchId) => {
      const rail = await list(branchId);
      return {
        ...rail,
        items: rail.items.map((item) =>
          item.tableLabel === '11'
            ? { ...item, preOrder: { ...item.preOrder, kitchenStatus: 'voided' as const } }
            : item,
        ),
      };
    });
    renderFloor(gateway);

    const eleven = await card('11');
    const pill = within(eleven).getByText('Voided in the kitchen');
    expect(pill.classList.contains('is-voided')).toBe(true);
    expect(within(eleven).queryByText('It goes on their bill when they are seated.')).toBeNull();
  });

  it('still says a ticket in the kitchen goes on the bill', async () => {
    signIn();
    renderFloor(floorGateway());

    const eleven = await card('11');
    expect(within(eleven).getByText('In the kitchen').classList.contains('is-voided')).toBe(false);
    expect(within(eleven).getByText('It goes on their bill when they are seated.')).toBeTruthy();
  });
});

describe('Not coming / no answer', () => {
  it('gives focus back to the button that asked, when the question closes', async () => {
    const user = setupUser();
    signIn();
    renderFloor(floorGateway());

    const nine = await card('9');
    await user.click(within(nine).getByRole('button', { name: 'Not coming / no answer, table 9' }));
    await user.click(within(nine).getByRole('button', { name: 'No' }));
    expect(document.activeElement).toBe(
      within(nine).getByRole('button', { name: 'Not coming / no answer, table 9' }),
    );

    await user.click(within(nine).getByRole('button', { name: 'Not coming / no answer, table 9' }));
    await user.click(within(nine).getByRole('button', { name: 'Yes, not coming' }));
    // Marked: the asking button is gone, and Send is what is left to tap.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(nine).getByRole('button', { name: 'Coming → Send to kitchen, table 9' }),
      ),
    );
  });

  it('asks first, keeps the card on No, and once marked leaves it quieter but sendable', async () => {
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

    // "No", never "Cancel": beside a booking that reads as cancelling it (live QA).
    expect(within(question).queryByRole('button', { name: 'Cancel' })).toBeNull();
    await user.click(within(question).getByRole('button', { name: 'No' }));
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
    // Nobody is asked about a party already marked (live QA): the number stays.
    expect(within(marked).queryByRole('button', { name: 'Ask: are you coming?' })).toBeNull();
    expect(within(marked).getByRole('link', { name: /^Call Мария Петрова/u })).toBeTruthy();
    // And it goes after the cards still waiting for a tap.
    const order = within(await section())
      .getAllByRole('listitem', { name: /^Table \d+/u })
      .map((entry) => within(entry).getByText(/^Table \d+$/u).textContent);
    expect(order).toEqual(['Table 2', 'Table 11', 'Table 9']);
    // Not counted any more: only table 2 is left to act on.
    expect(within(await section()).getByText('1', { selector: '.ft-badge' })).toBeTruthy();

    await user.click(
      within(marked).getByRole('button', { name: 'Coming → Send to kitchen, table 9' }),
    );
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });
});

/**
 * Live QA 2026-10-21, bug 4: with the card up 120 minutes before, it told the
 * waiter to call a guest who had not been asked yet — "on your way?" goes out
 * 45 minutes before the start.
 */
describe('before the guest is asked', () => {
  /** Table 4's booking 100 minutes out, its card up from 120 minutes before. */
  function earlyGateway(): StaffGateway {
    return createStaffMockGateway({
      latencyMs: 0,
      branchId: BRANCH,
      preOrderMinutesBefore: 120,
      preOrderSeeds: [
        {
          tableId: 't4',
          code: 'H2K7QX',
          startsInMinutes: 100,
          guestName: 'Նարե Պետրոսյան',
          guestPhone: '+37493112233',
          partySize: 3,
          lines: [{ menuItemId: 'granola', quantity: 3 }],
        },
      ],
    });
  }

  it('says nobody has asked yet and when it will be asked, with the number to hand', async () => {
    signIn();
    renderFloor(earlyGateway());

    const four = await card('4');
    expect(within(four).getByText('Not asked yet')).toBeTruthy();
    expect(
      within(four).getByText(/^You can ask now, without waiting for \d\d:\d\d\.$/u),
    ).toBeTruthy();
    expect(within(four).getByRole('button', { name: 'Ask: are you coming?' })).toBeTruthy();
    const call = within(four).getByRole('link', { name: 'Call Նարե Պետրոսյան, +374 93 11 22 33' });
    expect(call.getAttribute('href')).toBe('tel:+37493112233');
  });

  // Bug 3: a party 60–120 minutes early could only be seated as a walk-in,
  // and their pre-order, already cooking, never reached their tab.
  it("offers to seat the party on its booking from the table's panel, early", async () => {
    const user = setupUser();
    signIn();
    const gateway = earlyGateway();
    const act = vi.spyOn(gateway, 'applyTableAction');
    renderFloor(gateway);

    await card('4');
    await user.click(await screen.findByRole('button', { name: /^Table 4, /u }));
    const panel = screen.getByRole('dialog', { name: 'Actions for table 4' });
    await user.click(
      within(panel).getByRole('button', {
        name: /^Seat the booking · Նարե Պետրոսյան · \d\d:\d\d$/u,
      }),
    );
    await waitFor(() => expect(act).toHaveBeenCalledTimes(1));
    expect(act.mock.calls[0]![0]).toMatchObject({
      kind: 'seatReservation',
      tableId: 't4',
      reservationId: await reservationAt(gateway, '4'),
    });
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
    expect(within(preOrder).getByText(/^Coming · said at \d\d:\d\d$/u)).toBeTruthy();

    await user.click(
      within(preOrder).getByRole('button', { name: 'Coming → Send to kitchen, table 2' }),
    );
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  describe("which booking's card a table shows (review S7)", () => {
    // The rail's order: soonest first. A (19:00) sat with its pre-order unsent;
    // B (20:30) is the table's next booking and due already.
    const due = (reservationId: string, startUtc: string, status: DuePreOrder['status']) =>
      ({ reservationId, tableId: 't5', startUtc, status }) as DuePreOrder;
    const seatedA = due('r-a', '2026-10-21T15:00:00Z', 'seated');
    const nextB = due('r-b', '2026-10-21T16:30:00Z', 'confirmed');
    const items = [seatedA, nextB];

    it("an occupied table shows the seated booking's card, never the next booking's", () => {
      expect(preOrderForTable(items, 't5', 'r-b', true)).toBe(seatedA);
    });

    it("an occupied table with nobody seated on a booking (a walk-in) shows the next booking's", () => {
      expect(preOrderForTable([nextB], 't5', 'r-b', true)).toBe(nextB);
    });

    it("a free table shows its next booking's card, then the earliest", () => {
      const later = due('r-c', '2026-10-21T18:00:00Z', 'confirmed');
      expect(preOrderForTable([nextB, later], 't5', 'r-c', false)).toBe(later);
      expect(preOrderForTable([nextB, later], 't5', null, false)).toBe(nextB);
      expect(preOrderForTable([nextB, later], 't9', null, false)).toBeNull();
    });
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
  const MARKER = /^Pre-order · Table 11 · \d\d:\d\d · \d+ · \S+$/u;

  it('marks a pre-order ticket with its table and time, and moves it on with the one action', async () => {
    const user = setupUser();
    signIn('kitchen');
    const gateway = floorGateway();
    const status = vi.spyOn(gateway, 'setOrderStatus');
    renderFloor(gateway);

    // The wire's marker: the table, the time, the party and the guest's first name.
    const ticket = (await screen.findByText(MARKER, undefined, { timeout: 5000 })).closest('li')!;
    expect(ticket.getAttribute('aria-label')).toMatch(
      /^Pre-order · Table 11 · \d\d:\d\d · \d+ · \S+\. /u,
    );
    expect(within(ticket).getByText('Eggs on matnakash')).toBeTruthy();
    // Cooked for the booking: counted to its start, and not late before it.
    const due = within(ticket).getByRole('timer').textContent!;
    expect(due).toMatch(/^in 1\d min$/u);
    // A screen reader hears the same "in N" the timer shows, not the minutes
    // since it was sent.
    const minutes = /^in (\d+) min$/u.exec(due)![1]!;
    expect(ticket.getAttribute('aria-label')).toContain(`Table 11, in ${minutes} minutes, new, `);
    expect(ticket.classList.contains('is-fresh')).toBe(true);

    await user.click(within(ticket).getByRole('button', { name: 'Ready · table 11' }));
    await waitFor(() => expect(status).toHaveBeenCalledTimes(1));
    expect(status.mock.calls[0]![0]).toMatchObject({ status: 'ready' });
  });

  // Live QA 2026-10-21, bug 2: seated, the ticket still counted down to the
  // booking's start. On their tab it is timed from its send, as any order.
  it('times a seated party’s pre-order from its send, never "in N min"', async () => {
    signIn('kitchen');
    const gateway = floorGateway();
    const reservationId = await reservationAt(gateway, '11');
    await gateway.applyTableAction({
      kind: 'seatReservation',
      branchId: BRANCH,
      tableId: 't11',
      reservationId,
      clientCommandId: newCommandId(),
    });
    renderFloor(gateway);

    const ticket = (await screen.findByText(MARKER, undefined, { timeout: 5000 })).closest('li')!;
    const timer = within(ticket).getByRole('timer').textContent!;
    expect(timer).not.toMatch(/^in /u);
    expect(ticket.getAttribute('aria-label')).not.toMatch(/, in \d+ minutes, /u);
  });

  it("marks it the same on the waiter's Kitchen tab", async () => {
    const user = setupUser();
    signIn();
    renderFloor(floorGateway());

    await section();
    await user.click(screen.getByRole('button', { name: /^Kitchen/u }));
    expect(await screen.findByText(MARKER, undefined, { timeout: 5000 })).toBeTruthy();
  });
});
