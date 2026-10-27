// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  FULL_FEATURES,
  TakeawayNoShowTooEarlyError,
  TakeawayStatusConflictError,
  createQueryClient,
  createStaffMockGateway,
  type EnrolledDevice,
  type StaffGateway,
  type StaffSessionSnapshot,
  type StaffTakeawaySeed,
} from '@yalla/api';
import { formatDram } from '@yalla/format';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { answerCountdown } from './takeaway/takeawayText';
import { TakeawayCounter } from './takeaway/TakeawayCounter';
import { resetCommandStore } from './testCommandStore';
import type * as CurrentUserModule from '../auth/useCurrentUser';

/**
 * Takeaway on the floor tablet (2026-10-22, the Rail, Counter and Kitchen
 * artboards).
 *
 * - The top bar's Takeaway tab, once the branch has an order today, counting
 *   the orders to answer and the ones waiting at the counter.
 * - The Now rail's "Takeaway · accept" card: code, the answer countdown, who
 *   and their number, the dishes, the note, when they want it, the ready time
 *   ±5 minutes, Decline (asks first) and Accept.
 * - The Takeaway page: Ready · waiting (Hand over → cash or card → "Paid,
 *   handed over"; No-show only thirty minutes after ready, with a confirm),
 *   Being prepared, Handed over today.
 * - The kitchen's tickets with the TAKEAWAY band, and its Ready.
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

/** Sent a minute ago, as soon as possible: the rail's card. */
const SENT: StaffTakeawaySeed = {
  id: 'tk-sent',
  code: 'T-482',
  status: 'sent',
  guestName: 'Ani M.',
  guestPhone: '+37491000008',
  lines: [
    { menuItemId: 'cappuccino', quantity: 2 },
    { menuItemId: 'croissant', quantity: 1 },
  ],
  note: 'No sugar, separate bag',
  sentMinutesAgo: 1,
  pickupInMinutes: 19,
  pickupAsap: true,
};

/** Accepted, in the kitchen, ready in 15 minutes. */
const PREPARING: StaffTakeawaySeed = {
  id: 'tk-cooking',
  code: 'T-485',
  status: 'accepted',
  guestName: 'Karen S.',
  guestPhone: '+37491223344',
  lines: [{ menuItemId: 'napoleon', quantity: 2 }],
  sentMinutesAgo: 9,
  pickupInMinutes: 15,
};

/** Ready four minutes ago: Hand over, no No-show yet. */
const READY: StaffTakeawaySeed = {
  id: 'tk-ready',
  code: 'T-205',
  status: 'ready',
  guestName: 'Мария П.',
  guestPhone: '+37477445566',
  lines: [
    { menuItemId: 'flat-white', quantity: 1 },
    { menuItemId: 'gata', quantity: 2 },
  ],
  sentMinutesAgo: 30,
  pickupInMinutes: -2,
  readyMarkedMinutesAgo: 4,
};

/** Ready forty-two minutes ago: No-show is offered, beside Call. */
const OVERDUE: StaffTakeawaySeed = {
  id: 'tk-overdue',
  code: 'T-639',
  status: 'ready',
  guestName: 'Gohar M.',
  guestPhone: '+37498765432',
  lines: [{ menuItemId: 'espresso', quantity: 3 }],
  sentMinutesAgo: 70,
  pickupInMinutes: -40,
  readyMarkedMinutesAgo: 42,
};

const COLLECTED: StaffTakeawaySeed = {
  id: 'tk-collected',
  code: 'T-118',
  status: 'collected',
  guestName: 'Tigran H.',
  lines: [{ menuItemId: 'espresso', quantity: 2 }],
  sentMinutesAgo: 95,
  pickupInMinutes: -70,
  readyMarkedMinutesAgo: 72,
  collectedMinutesAgo: 66,
  paymentMethod: 'card',
};

const NO_SHOW: StaffTakeawaySeed = {
  id: 'tk-noshow',
  code: 'T-471',
  status: 'noShow',
  guestName: 'Arsen K.',
  lines: [{ menuItemId: 'americano', quantity: 1 }],
  sentMinutesAgo: 150,
  pickupInMinutes: -110,
  readyMarkedMinutesAgo: 110,
};

const ALL = [SENT, PREPARING, READY, OVERDUE, COLLECTED, NO_SHOW];

function gatewayWith(seeds: readonly StaffTakeawaySeed[] = ALL): StaffGateway {
  return createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, takeawaySeeds: seeds });
}

function wrap(gateway: StaffGateway, children: ReactNode) {
  const queryClient = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
  return (
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <GatewayProvider staffGateway={gateway}>
          <MemoryRouter>{children}</MemoryRouter>
        </GatewayProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

function renderFloor(gateway: StaffGateway): void {
  render(wrap(gateway, <StaffRoute />));
}

const setupUser = () => userEvent.setup({ delay: null });
const dram = (amount: number) => formatDram(amount, 'en');
/** The money's no-break space, as the matcher's normalised text has it: a plain one. */
const spaced = (text: string) => text.replace(/\s+/gu, ' ');

async function railSection(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: /^Takeaway · accept/u }, { timeout: 5000 });
}

async function railCard(code: string): Promise<HTMLElement> {
  return within(await railSection()).findByRole('listitem', { name: `Takeaway order ${code}` });
}

async function openCounter(user: ReturnType<typeof setupUser>): Promise<HTMLElement> {
  const views = await screen.findByRole('navigation', { name: 'Screens' }, { timeout: 5000 });
  await user.click(await within(views).findByRole('button', { name: /^Takeaway/u }));
  return screen.findByRole('region', { name: 'Takeaway' });
}

const column = (page: HTMLElement, name: RegExp) => within(page).getByRole('region', { name });

beforeAll(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  await initConsoleTestI18n();
});

beforeEach(() => {
  // Five in the afternoon in Yerevan: "today" holds every seed, whenever the suite runs.
  vi.useFakeTimers({
    now: new Date('2026-10-22T13:00:00Z'),
    toFake: ['Date'],
    shouldAdvanceTime: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  act(() => setOnline(true));
  cleanup();
  vi.restoreAllMocks();
  resetCommandStore();
});

describe('the top bar', () => {
  it('has no Takeaway tab while the branch has no takeaway order today', async () => {
    signIn();
    renderFloor(gatewayWith([]));
    const views = await screen.findByRole('navigation', { name: 'Screens' }, { timeout: 5000 });
    await within(views).findByRole('button', { name: /^Floor/u });
    // Give the counter's read its turn: still no tab — Floor, Kitchen and Messages.
    await waitFor(() => expect(within(views).getAllByRole('button')).toHaveLength(3));
    expect(within(views).queryByRole('button', { name: /^Takeaway/u })).toBeNull();
  });

  it('counts the orders to answer and the ones waiting at the counter on its tab', async () => {
    signIn();
    renderFloor(gatewayWith());
    const views = await screen.findByRole('navigation', { name: 'Screens' }, { timeout: 5000 });
    // One to answer, two ready: three.
    const tab = await within(views).findByRole('button', {
      name: 'Takeaway, 3 takeaway orders waiting',
    });
    expect(tab.textContent).toBe('Takeaway3');
  });
});

describe('the rail’s "Takeaway · accept" card', () => {
  it('says the code, the clock, who, the dishes, the note and when they want it', async () => {
    signIn();
    renderFloor(gatewayWith());

    const card = await railCard('T-482');
    const rail = await screen.findByRole(
      'complementary',
      { name: 'Needs attention' },
      { timeout: 5000 },
    );
    // Right after the bookings: both have a clock on them.
    const regions = within(rail).getAllByRole('region');
    expect(regions.indexOf(await railSection())).toBe(1);

    const timer = within(card).getByRole('timer');
    expect(timer.textContent).toMatch(/^[34]:\d\d$/u);
    expect(timer.getAttribute('aria-label')).toMatch(/^[34]:\d\d left to answer$/u);
    const call = within(card).getByRole('link', { name: 'Call Ani M., +374 91 00 00 08' });
    expect(call.getAttribute('href')).toBe('tel:+37491000008');
    const dishes = within(card).getByRole('list', { name: 'Dishes' });
    expect(within(dishes).getByText('2 × Cappuccino')).toBeTruthy();
    expect(within(dishes).getByText('1 × Butter croissant')).toBeTruthy();
    expect(within(card).getByText('“No sugar, separate bag”')).toBeTruthy();
    expect(within(card).getByText('as soon as possible')).toBeTruthy();
    expect(
      within(card).getByText(
        'Once accepted, the order goes straight to the kitchen and the guest sees the time.',
      ),
    ).toBeTruthy();
    // Only the order to answer is on the rail; the ready ones are the counter's.
    expect(
      within(await railSection()).getAllByRole('listitem', { name: /^Takeaway order/u }),
    ).toHaveLength(1);
  });

  it('accepts with the ready time moved by five minutes', async () => {
    const user = setupUser();
    signIn();
    const gateway = gatewayWith();
    const accept = vi.spyOn(gateway, 'acceptTakeawayOrder');
    renderFloor(gateway);

    const card = await railCard('T-482');
    const ready = within(card).getByRole('group', { name: 'Ready at' });
    const shown = ready.querySelector('output')!.textContent!;
    await user.click(within(ready).getByRole('button', { name: '5 minutes later' }));
    await user.click(within(ready).getByRole('button', { name: '5 minutes later' }));
    await user.click(within(ready).getByRole('button', { name: '5 minutes earlier' }));
    const moved = ready.querySelector('output')!.textContent!;
    expect(moved).not.toBe(shown);

    await user.click(within(card).getByRole('button', { name: `Accept T-482, ready at ${moved}` }));
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
    const command = accept.mock.calls[0]![0];
    expect(command.orderId).toBe('tk-sent');
    // The guest asked for nineteen minutes from now; five later is twenty-four.
    const minutes = (Date.parse(command.readyAtUtc) - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(22);
    expect(minutes).toBeLessThan(25);

    const section = await railSection();
    expect(
      await within(section).findByText(`T-482 accepted · in the kitchen · ready at ${moved}`),
    ).toBeTruthy();
    await waitFor(() =>
      expect(within(section).queryByRole('listitem', { name: 'Takeaway order T-482' })).toBeNull(),
    );
  });

  it('never steps the ready time into the past', async () => {
    const user = setupUser();
    signIn();
    // The guest's slot is now: nothing earlier to offer.
    renderFloor(gatewayWith([{ ...SENT, pickupInMinutes: 0, pickupAsap: false }]));
    const card = await railCard('T-482');
    const earlier = within(card).getByRole('button', { name: '5 minutes earlier' });
    expect((earlier as HTMLButtonElement).disabled).toBe(true);
    // Ten minutes on, five back is still ahead of now.
    await user.click(within(card).getByRole('button', { name: '5 minutes later' }));
    await user.click(within(card).getByRole('button', { name: '5 minutes later' }));
    expect((earlier as HTMLButtonElement).disabled).toBe(false);
    // A slot, not as soon as possible: the guest's own time is said.
    expect(within(card).getByText(/^at \d\d:\d\d$/u)).toBeTruthy();
  });

  it('declines only after asking, with the reason the guest is shown', async () => {
    const user = setupUser();
    signIn();
    const gateway = gatewayWith();
    const decline = vi.spyOn(gateway, 'declineTakeawayOrder');
    renderFloor(gateway);

    const card = await railCard('T-482');
    await user.click(within(card).getByRole('button', { name: 'Decline T-482' }));
    const question = within(card).getByRole('group', { name: 'Decline T-482?' });
    expect(document.activeElement).toBe(question);

    // "No" goes back, with nothing sent.
    await user.click(within(question).getByRole('button', { name: 'No' }));
    expect(decline).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      within(card).getByRole('button', { name: 'Decline T-482' }),
    );

    await user.click(within(card).getByRole('button', { name: 'Decline T-482' }));
    await user.type(
      within(card).getByRole('textbox', { name: 'Why, for the guest (optional)' }),
      '  The oven is down  ',
    );
    await user.click(within(card).getByRole('button', { name: 'Yes, decline' }));
    await waitFor(() => expect(decline).toHaveBeenCalledTimes(1));
    expect(decline.mock.calls[0]![0]).toEqual({ orderId: 'tk-sent', reason: 'The oven is down' });
    expect(
      await within(await railSection()).findByText('T-482 declined · the guest has been told'),
    ).toBeTruthy();
  });

  it('says a refusal on the card: another tablet answered first', async () => {
    const user = setupUser();
    signIn();
    const gateway = gatewayWith();
    vi.spyOn(gateway, 'acceptTakeawayOrder').mockRejectedValue(
      new TakeawayStatusConflictError({ url: 'x', orderId: 'tk-sent', orderStatus: 'accepted' }),
    );
    renderFloor(gateway);

    const card = await railCard('T-482');
    await user.click(within(card).getByRole('button', { name: /^Accept T-482/u }));
    const alert = await within(card).findByRole('alert');
    expect(alert.textContent).toBe('This order has moved on. The list has been refreshed.');
  });

  it('is online only: offline its answers wait for the connection', async () => {
    signIn();
    renderFloor(gatewayWith());
    const card = await railCard('T-482');
    act(() => setOnline(false));
    await waitFor(() =>
      expect(
        (within(card).getByRole('button', { name: /^Accept T-482/u }) as HTMLButtonElement)
          .disabled,
      ).toBe(true),
    );
    expect(within(card).getByText('Takeaway needs a connection.')).toBeTruthy();
  });
});

describe('the answer countdown', () => {
  const now = new Date('2026-10-22T15:00:00Z');
  it('counts minutes and seconds to the deadline, urgent in the last minute', () => {
    expect(answerCountdown('2026-10-22T15:04:12Z', now)).toEqual({
      label: '4:12',
      urgent: false,
      expired: false,
    });
    expect(answerCountdown('2026-10-22T15:00:45Z', now)).toEqual({
      label: '0:45',
      urgent: true,
      expired: false,
    });
  });

  it('runs out at zero, and there is none with auto-accept', () => {
    expect(answerCountdown('2026-10-22T14:59:00Z', now)?.expired).toBe(true);
    expect(answerCountdown(null, now)).toBeNull();
  });
});

describe('the Takeaway page', () => {
  it('has three columns: ready, being prepared, handed over today', async () => {
    const user = setupUser();
    signIn();
    renderFloor(gatewayWith());
    const page = await openCounter(user);

    const ready = column(page, /^Ready · waiting$/u);
    const readyCards = within(ready).getAllByRole('listitem');
    // The one ready longest first.
    expect(readyCards.map((card) => within(card).getByText(/^T-\d+$/u).textContent)).toEqual([
      'T-639',
      'T-205',
    ]);
    const fresh = readyCards[1]!;
    expect(within(fresh).getByText(/^ready since \d\d:\d\d$/u)).toBeTruthy();
    expect(within(fresh).getByText('Мария П. · 3 items')).toBeTruthy();
    expect(within(fresh).getByText(spaced(`${dram(1400 + 2 * 850)} · to pay`))).toBeTruthy();

    const preparing = column(page, /^Being prepared$/u);
    // The order still to answer, with the rail's own card…
    expect(within(preparing).getByText('Waiting for an answer')).toBeTruthy();
    expect(within(preparing).getByRole('listitem', { name: 'Takeaway order T-482' })).toBeTruthy();
    // …then the ones in the kitchen, with their ready time.
    const cooking = within(preparing).getByRole('listitem', { name: 'T-485' });
    expect(within(cooking).getByText(/^ready at \d\d:\d\d$/u)).toBeTruthy();
    expect(
      within(cooking).getByText(spaced(`Karen S. · 2 items · ${dram(2 * 1650)}`)),
    ).toBeTruthy();

    const done = column(page, /^Handed over today · 1$/u);
    const rows = within(done).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(done).getByText(/^T-118 · \d\d:\d\d$/u)).toBeTruthy();
    expect(within(done).getByText(spaced(`${dram(1400)} · card`))).toBeTruthy();
    const noShow = within(done).getByText('T-471 · no-show').closest('li')!;
    expect(noShow.className).toContain('is-noshow');

    // The tab says which screen this is.
    expect(
      within(await screen.findByRole('navigation', { name: 'Screens' }, { timeout: 5000 }))
        .getByRole('button', { name: /^Takeaway/u })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('hands over: cash or card, then "Paid, handed over"', async () => {
    const user = setupUser();
    signIn();
    const gateway = gatewayWith();
    const collect = vi.spyOn(gateway, 'collectTakeawayOrder');
    renderFloor(gateway);
    const page = await openCounter(user);

    const handOver = within(column(page, /^Ready · waiting$/u)).getByRole('button', {
      name: 'Hand over T-205',
    });
    await user.click(handOver);
    const dialog = screen.getByRole('dialog', { name: 'T-205 · hand over' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByText(spaced(dram(3100)))).toBeTruthy();
    const methods = within(dialog).getByRole('radiogroup', { name: 'Paid with' });
    const cash = within(methods).getByRole('radio', { name: 'Cash' });
    // The focus starts on the payment, and cash is chosen until card is.
    expect(document.activeElement).toBe(cash);
    expect(cash.getAttribute('aria-checked')).toBe('true');

    // Escape goes back with nothing recorded, to the button that opened it.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(handOver);

    await user.click(handOver);
    const again = screen.getByRole('dialog', { name: 'T-205 · hand over' });
    await user.click(within(again).getByRole('radio', { name: 'Card (terminal)' }));
    expect(
      within(again).getByRole('radio', { name: 'Card (terminal)' }).getAttribute('aria-checked'),
    ).toBe('true');
    await user.click(within(again).getByRole('button', { name: 'Paid, handed over' }));
    await waitFor(() => expect(collect).toHaveBeenCalledTimes(1));
    expect(collect.mock.calls[0]![0]).toEqual({ orderId: 'tk-ready', method: 'card' });

    expect(
      await within(page).findByText(spaced(`T-205 handed over · ${dram(3100)} · card`)),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    // Into today's list, out of the ready column.
    await waitFor(() =>
      expect(within(column(page, /^Handed over today · 2$/u)).getByText(/^T-205 · /u)).toBeTruthy(),
    );
  });

  it('says a refusal in the dialog and keeps it open', async () => {
    const user = setupUser();
    signIn();
    const gateway = gatewayWith();
    vi.spyOn(gateway, 'collectTakeawayOrder').mockRejectedValue(
      new TakeawayStatusConflictError({ url: 'x', orderId: 'tk-ready', orderStatus: 'collected' }),
    );
    renderFloor(gateway);
    const page = await openCounter(user);

    await user.click(
      within(column(page, /^Ready · waiting$/u)).getByRole('button', { name: 'Hand over T-205' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'T-205 · hand over' });
    await user.click(within(dialog).getByRole('button', { name: 'Paid, handed over' }));
    expect(
      await within(dialog).findByText('This order has moved on. The list has been refreshed.'),
    ).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'T-205 · hand over' })).toBeTruthy();
  });

  it('offers No-show only thirty minutes after ready, beside Call, and asks first', async () => {
    const user = setupUser();
    signIn();
    const gateway = gatewayWith();
    const noShow = vi.spyOn(gateway, 'markTakeawayOrderNoShow');
    renderFloor(gateway);
    const page = await openCounter(user);
    const ready = column(page, /^Ready · waiting$/u);

    // Ready four minutes ago: not yet, and it says from when.
    const fresh = within(ready).getByRole('listitem', { name: 'T-205' });
    expect(within(fresh).queryByRole('button', { name: /^No-show/u })).toBeNull();
    expect(within(fresh).queryByRole('link')).toBeNull();
    expect(within(fresh).getByText(/^“No-show” can be marked from \d\d:\d\d\.$/u)).toBeTruthy();

    // Ready forty-two minutes ago: how long it has waited, Call and No-show.
    const overdue = within(ready).getByRole('listitem', { name: 'T-639' });
    expect(within(overdue).getByText('waiting 42 min')).toBeTruthy();
    const call = within(overdue).getByRole('link', { name: 'Call Gohar M., +374 98 76 54 32' });
    expect(call.getAttribute('href')).toBe('tel:+37498765432');
    // It can still be handed over: the guest may walk in now.
    expect(within(overdue).getByRole('button', { name: 'Hand over T-639' })).toBeTruthy();

    await user.click(within(overdue).getByRole('button', { name: 'No-show · T-639' }));
    const question = within(overdue).getByRole('group', { name: 'Mark T-639 as no-show?' });
    expect(within(question).getByText(/goes on the guest’s record/u)).toBeTruthy();
    await user.click(within(question).getByRole('button', { name: 'No' }));
    expect(noShow).not.toHaveBeenCalled();

    await user.click(within(overdue).getByRole('button', { name: 'No-show · T-639' }));
    await user.click(within(overdue).getByRole('button', { name: 'Yes, no-show' }));
    await waitFor(() => expect(noShow).toHaveBeenCalledWith('tk-overdue'));
    expect(await within(page).findByText('T-639 marked no-show')).toBeTruthy();
    await waitFor(() =>
      expect(within(column(page, /^Handed over today/u)).getByText('T-639 · no-show')).toBeTruthy(),
    );
  });

  it('says when the server finds No-show too early', async () => {
    const user = setupUser();
    signIn();
    const gateway = gatewayWith();
    vi.spyOn(gateway, 'markTakeawayOrderNoShow').mockRejectedValue(
      new TakeawayNoShowTooEarlyError({
        url: 'x',
        orderId: 'tk-overdue',
        noShowFromUtc: new Date(Date.now() + 5 * 60_000).toISOString(),
      }),
    );
    renderFloor(gateway);
    const page = await openCounter(user);
    const overdue = within(column(page, /^Ready · waiting$/u)).getByRole('listitem', {
      name: 'T-639',
    });
    await user.click(within(overdue).getByRole('button', { name: 'No-show · T-639' }));
    await user.click(within(overdue).getByRole('button', { name: 'Yes, no-show' }));
    expect(
      await within(overdue).findByText(
        /^Too early for no-show: it can be marked from \d\d:\d\d\.$/u,
      ),
    ).toBeTruthy();
  });

  it('says when a column is empty', async () => {
    const user = setupUser();
    signIn();
    renderFloor(gatewayWith([COLLECTED]));
    const page = await openCounter(user);
    expect(
      within(column(page, /^Ready · waiting$/u)).getByText('Nothing waiting at the counter.'),
    ).toBeTruthy();
    expect(
      within(column(page, /^Being prepared$/u)).getByText('Nothing being prepared.'),
    ).toBeTruthy();
  });

  it('is online only: offline the moves wait for the connection', async () => {
    const user = setupUser();
    signIn();
    renderFloor(gatewayWith());
    const page = await openCounter(user);
    act(() => setOnline(false));
    await waitFor(() =>
      expect(
        (
          within(column(page, /^Ready · waiting$/u)).getByRole('button', {
            name: 'Hand over T-205',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
    expect(within(page).getAllByText('Takeaway needs a connection.').length).toBeGreaterThan(0);
  });
});

describe('the counter before it is read', () => {
  it('says it could not be read, with a retry — not that nothing is waiting', async () => {
    const user = setupUser();
    const retry = vi.fn();
    render(
      wrap(
        gatewayWith([]),
        <TakeawayCounter
          branchId={BRANCH}
          counter={null}
          timeZoneId="Asia/Yerevan"
          online
          loading={false}
          failed
          onRetry={retry}
        />,
      ),
    );
    expect(
      screen.getByText(
        /^The takeaway orders could not be read\. That is not the same as none waiting\./u,
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('the kitchen', () => {
  async function ticket(code: string): Promise<HTMLElement> {
    const board = await screen.findByRole(
      'list',
      { name: 'Orders in the kitchen' },
      {
        timeout: 5000,
      },
    );
    return within(board).findByRole('listitem', { name: new RegExp(`^Takeaway ${code},`, 'u') });
  }

  it('shows the TAKEAWAY band: code, ready time, whose, the dishes and the note', async () => {
    signIn('kitchen');
    renderFloor(gatewayWith([{ ...PREPARING, note: 'Extra napkins' }]));

    const card = await ticket('T-485');
    expect(card.getAttribute('aria-label')).toMatch(
      /^Takeaway T-485, ready at \d\d:\d\d, Karen S\., 2 Napoleon slice$/u,
    );
    expect(within(card).getByText('TAKEAWAY')).toBeTruthy();
    expect(within(card).getByText('T-485')).toBeTruthy();
    expect(within(card).getByText(/^Ready at \d\d:\d\d · Karen S\.$/u)).toBeTruthy();
    expect(within(card).getByText('Napoleon slice')).toBeTruthy();
    expect(within(card).getByText('“Extra napkins”')).toBeTruthy();
  });

  it('marks it ready with the takeaway move, never the tab one', async () => {
    const user = setupUser();
    signIn('kitchen');
    const gateway = gatewayWith([PREPARING]);
    const ready = vi.spyOn(gateway, 'markTakeawayOrderReady');
    const move = vi.spyOn(gateway, 'setOrderStatus');
    renderFloor(gateway);

    const card = await ticket('T-485');
    await user.click(within(card).getByRole('button', { name: 'Ready · takeaway T-485' }));
    await waitFor(() => expect(ready).toHaveBeenCalledWith('tk-cooking'));
    expect(move).not.toHaveBeenCalled();
    expect(await screen.findByText('T-485 · ready, the guest has been told')).toBeTruthy();
    const done = await ticket('T-485');
    await waitFor(() =>
      expect(within(done).getByText('Ready · the guest has been told')).toBeTruthy(),
    );
    expect(within(done).getByText('Handed over at the counter')).toBeTruthy();
    expect(within(done).queryByRole('button')).toBeNull();
  });

  it("is on the waiter's Kitchen tab too, and never on the rail's Ready list", async () => {
    const user = setupUser();
    signIn();
    const gateway = gatewayWith([PREPARING, READY]);
    const ready = vi.spyOn(gateway, 'markTakeawayOrderReady');
    renderFloor(gateway);

    // The ready takeaway order is handed over at the counter, not served.
    const rail = await screen.findByRole(
      'complementary',
      { name: 'Needs attention' },
      { timeout: 5000 },
    );
    const readyList = await within(rail).findByRole('region', { name: /^Ready to serve/u });
    await waitFor(() => expect(within(readyList).queryByText(/T-205/u)).toBeNull());

    await user.click(
      within(
        await screen.findByRole('navigation', { name: 'Screens' }, { timeout: 5000 }),
      ).getByRole('button', {
        name: /^Kitchen/u,
      }),
    );
    const card = await ticket('T-485');
    await user.click(within(card).getByRole('button', { name: 'Ready · takeaway T-485' }));
    await waitFor(() => expect(ready).toHaveBeenCalledWith('tk-cooking'));
  });
});
