import { MutationObserver, QueryClient, onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import type { Booking } from '../contracts/booking';
import type {
  DuePreOrder,
  DuePreOrders,
  PreOrder,
  PreOrderSettings,
  PreOrderSettingsInput,
} from '../contracts/preOrder';
import type { ConsoleGateway } from '../consoleGateway';
import { ValidationError } from '../errors';
import type { ManagedBooking } from '../contracts/publicBranch';
import { MANAGE_LINK_SLOW_POLL_MS, manageLinkPollMs, queryKeys } from './index';
import {
  afterManagedOnMyWay,
  afterManagedPreOrderSaved,
  afterOnMyWay,
  afterPreOrderAction,
  afterPreOrderSaved,
  afterPreOrderSettingsSaved,
  duePreOrdersPollMs,
  preOrderActionOptions,
  savePreOrderSettingsFresh,
} from './preOrders';

/**
 * What every pre-order mutation does to the cache (PO wire, 2026-10-21): the
 * answer goes straight onto what is on screen, and every read that shows the
 * pre-order — or the kitchen ticket, the floor and the tab it became — is
 * read again. Tested on a real `QueryClient` against the exported keys, so an
 * invalidation that misses a cache entry fails here rather than on a tablet.
 */

const BRANCH = 'b-1';
const RESERVATION = 'r-1';

const PRE_ORDER: PreOrder = {
  id: 'po-1',
  reservationId: RESERVATION,
  state: 'editable',
  lines: [],
  note: null,
  totalDram: 0,
  editableUntilUtc: '2026-10-22T13:30:00Z',
  dueAtUtc: '2026-10-22T15:00:00Z',
  sentAtUtc: null,
  kitchenStatus: null,
  onTab: false,
  notComingAtUtc: null,
  updatedAtUtc: '2026-10-21T09:00:00Z',
};

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

function seed(queryClient: QueryClient, key: readonly unknown[], data: unknown): void {
  queryClient.setQueryData(key, data);
}

const invalidated = (queryClient: QueryClient, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated === true;

describe('the guest saving or clearing', () => {
  it('puts the answer on the cached booking and reads the bookings again', () => {
    const queryClient = client();
    seed(queryClient, queryKeys.booking(RESERVATION), {
      id: RESERVATION,
      preOrder: null,
    } as unknown as Booking);
    seed(queryClient, queryKeys.bookings, { upcoming: [], past: [] });
    seed(queryClient, queryKeys.reservationState(RESERVATION), { reservationId: RESERVATION });

    afterPreOrderSaved(queryClient, {
      reservationId: RESERVATION,
      preOrder: PRE_ORDER,
      wasReplay: false,
    });

    expect(queryClient.getQueryData<Booking>(queryKeys.booking(RESERVATION))?.preOrder).toEqual(
      PRE_ORDER,
    );
    expect(invalidated(queryClient, queryKeys.booking(RESERVATION))).toBe(true);
    expect(invalidated(queryClient, queryKeys.bookings)).toBe(true);
    expect(invalidated(queryClient, queryKeys.reservationState(RESERVATION))).toBe(true);
  });

  it('a clear leaves no pre-order on the cached booking', () => {
    const queryClient = client();
    seed(queryClient, queryKeys.booking(RESERVATION), {
      id: RESERVATION,
      preOrder: PRE_ORDER,
    } as unknown as Booking);
    afterPreOrderSaved(queryClient, {
      reservationId: RESERVATION,
      preOrder: null,
      wasReplay: false,
    });
    expect(queryClient.getQueryData<Booking>(queryKeys.booking(RESERVATION))?.preOrder).toBeNull();
  });

  it('"on my way" lands on the booking at once', () => {
    const queryClient = client();
    seed(queryClient, queryKeys.booking(RESERVATION), { id: RESERVATION } as unknown as Booking);
    seed(queryClient, queryKeys.bookings, { upcoming: [], past: [] });
    afterOnMyWay(queryClient, {
      reservationId: RESERVATION,
      guestConfirmedOnWayAtUtc: '2026-10-22T14:50:00Z',
      wasReplay: false,
    });
    expect(
      queryClient.getQueryData<Booking>(queryKeys.booking(RESERVATION))?.guestConfirmedOnWayAtUtc,
    ).toBe('2026-10-22T14:50:00Z');
    expect(invalidated(queryClient, queryKeys.bookings)).toBe(true);
  });
});

describe('the manage link', () => {
  it('puts the answer on the cached link and reads it again', () => {
    const queryClient = client();
    seed(queryClient, queryKeys.managedBooking('tok'), {
      reservationId: RESERVATION,
    } as ManagedBooking);

    afterManagedPreOrderSaved(queryClient, 'tok', {
      reservationId: RESERVATION,
      preOrder: PRE_ORDER,
      wasReplay: false,
    });
    expect(
      queryClient.getQueryData<ManagedBooking>(queryKeys.managedBooking('tok'))?.preOrder,
    ).toEqual(PRE_ORDER);
    expect(invalidated(queryClient, queryKeys.managedBooking('tok'))).toBe(true);

    afterManagedOnMyWay(queryClient, 'tok', {
      reservationId: RESERVATION,
      guestConfirmedOnWayAtUtc: '2026-10-22T14:50:00Z',
      wasReplay: false,
    });
    expect(queryClient.getQueryData<ManagedBooking>(queryKeys.managedBooking('tok'))).toMatchObject(
      {
        guestConfirmedOnWayAtUtc: '2026-10-22T14:50:00Z',
        onYourWayAsked: false,
      },
    );
  });

  it('keeps reading while "on your way" is near, and stops when nothing is to come', () => {
    const start = '2026-10-22T15:30:00Z';
    const at = (minutesBefore: number) => Date.parse(start) - minutesBefore * 60_000;
    const link = {
      status: 'confirmed',
      approvalExpiresAtUtc: null,
      slotUtc: start,
      preOrder: PRE_ORDER,
      guestConfirmedOnWayAtUtc: null,
    };
    expect(manageLinkPollMs(link, at(200))).toBe(false);
    expect(manageLinkPollMs(link, at(100))).toBe(MANAGE_LINK_SLOW_POLL_MS);
    expect(manageLinkPollMs(link, at(30))).toBe(MANAGE_LINK_SLOW_POLL_MS);
    expect(manageLinkPollMs({ ...link, guestConfirmedOnWayAtUtc: 'x' }, at(30))).toBe(false);
    expect(manageLinkPollMs({ ...link, preOrder: { ...PRE_ORDER, state: 'sent' } }, at(30))).toBe(
      false,
    );
    // Every booking is asked (2026-10-21): without a pre-order, from 30 minutes before.
    expect(manageLinkPollMs({ ...link, preOrder: null }, at(30))).toBe(MANAGE_LINK_SLOW_POLL_MS);
    expect(manageLinkPollMs({ ...link, preOrder: null }, at(200))).toBe(false);
    expect(manageLinkPollMs(link, at(-1))).toBe(false);
  });
});

describe("the waiter's two actions", () => {
  const card: DuePreOrder = {
    reservationId: RESERVATION,
    code: 'K7Q2LM',
    tableId: 't-4',
    tableLabel: '4',
    roomName: null,
    startUtc: '2026-10-22T15:30:00Z',
    localStartTime: '19:30',
    partySize: 4,
    status: 'confirmed',
    guestName: 'Anna',
    guestPhone: null,
    guestConfirmedOnWayAtUtc: null,
    guestRecord: null,
    dueAtUtc: '2026-10-22T15:00:00Z',
    preOrder: PRE_ORDER,
    sentByName: null,
    notComingByName: null,
    tabId: null,
    wasReplay: false,
  };

  it('puts the card on the rail and reads the rail, floor, kitchen and the tab again', () => {
    const queryClient = client();
    const rail: DuePreOrders = {
      items: [card, { ...card, reservationId: 'r-2' }],
      nextDueAtUtc: null,
    };
    seed(queryClient, queryKeys.duePreOrders(BRANCH), rail);
    seed(queryClient, queryKeys.staffFloor(BRANCH), {});
    seed(queryClient, queryKeys.orderQueue(BRANCH), []);
    seed(queryClient, queryKeys.tabLines('tab-9'), []);
    seed(queryClient, queryKeys.staffTab('tab-9'), {});
    seed(queryClient, queryKeys.awaitingApproval(BRANCH), []);

    const sent = { ...card, tabId: 'tab-9', preOrder: { ...PRE_ORDER, state: 'sent' as const } };
    afterPreOrderAction(queryClient, BRANCH, sent);

    const patched = queryClient.getQueryData<DuePreOrders>(queryKeys.duePreOrders(BRANCH));
    expect(patched?.items.map((item) => item.preOrder.state)).toEqual(['sent', 'editable']);
    for (const key of [
      queryKeys.duePreOrders(BRANCH),
      queryKeys.staffFloor(BRANCH),
      queryKeys.orderQueue(BRANCH),
      queryKeys.tabLines('tab-9'),
      queryKeys.staffTab('tab-9'),
    ]) {
      expect(invalidated(queryClient, key)).toBe(true);
    }
    expect(invalidated(queryClient, queryKeys.awaitingApproval(BRANCH))).toBe(false);
  });

  it('on a refusal, still reads the rail and the kitchen again', () => {
    const queryClient = client();
    seed(queryClient, queryKeys.duePreOrders(BRANCH), { items: [card], nextDueAtUtc: null });
    seed(queryClient, queryKeys.orderQueue(BRANCH), []);
    afterPreOrderAction(queryClient, BRANCH, null);
    expect(invalidated(queryClient, queryKeys.duePreOrders(BRANCH))).toBe(true);
    expect(invalidated(queryClient, queryKeys.orderQueue(BRANCH))).toBe(true);
  });

  describe('with the connection gone between the render and the tap', () => {
    afterEach(() => onlineManager.setOnline(true));

    // The tablet's client pauses an offline write and sends it on reconnect.
    // A pre-order is online only, never queued: the tap fails there and then
    // instead of turning into a kitchen ticket minutes later.
    it('fails the tap at once, never pausing it to send later', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { mutations: { networkMode: 'online', retry: false } },
      });
      onlineManager.setOnline(false);
      let attempts = 0;
      const observer = new MutationObserver(
        queryClient,
        preOrderActionOptions(queryClient, BRANCH, () => {
          attempts += 1;
          return Promise.reject(new Error('Network request failed'));
        }),
      );
      const settled = observer
        .mutate({ reservationId: RESERVATION, clientCommandId: 'c-1' })
        .catch(() => undefined);
      await Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 50))]);
      expect(observer.getCurrentResult().isPaused).toBe(false);
      expect(attempts).toBe(1);
      expect(observer.getCurrentResult().status).toBe('error');
    });
  });

  it('reads the rail again when the next card is due, and every minute at most', () => {
    const now = Date.parse('2026-10-22T14:00:00Z');
    expect(duePreOrdersPollMs({ items: [], nextDueAtUtc: '2026-10-22T14:00:20Z' }, now)).toBe(
      20_500,
    );
    expect(duePreOrdersPollMs({ items: [], nextDueAtUtc: '2026-10-22T16:00:00Z' }, now)).toBe(
      60_000,
    );
    // Past due — a tablet clock running ahead of the server's — or a moment
    // away: never faster than every five seconds, or a skewed clock loops.
    expect(duePreOrdersPollMs({ items: [], nextDueAtUtc: '2026-10-22T13:00:00Z' }, now)).toBe(
      5_000,
    );
    expect(duePreOrdersPollMs({ items: [], nextDueAtUtc: '2026-10-22T13:59:59Z' }, now)).toBe(
      5_000,
    );
    expect(duePreOrdersPollMs({ items: [], nextDueAtUtc: '2026-10-22T14:00:01Z' }, now)).toBe(
      5_000,
    );
    expect(duePreOrdersPollMs({ items: [], nextDueAtUtc: null }, now)).toBe(60_000);
    expect(duePreOrdersPollMs(undefined, now)).toBe(60_000);
  });
});

describe("the console's settings", () => {
  it('caches the answer and reads the menu again, whose dishes carry the flag', () => {
    const queryClient = client();
    seed(queryClient, queryKeys.adminMenu(BRANCH), []);
    const settings = {
      acceptsPreOrders: true,
      minutesBefore: 45,
      excludedMenuItemIds: ['gata'],
      bounds: { minutesBeforeMin: 5, minutesBeforeMax: 120 },
      editableUntilHoursBefore: 2,
      onYourWayMinutesBefore: 45,
    };
    afterPreOrderSettingsSaved(queryClient, BRANCH, settings);
    expect(queryClient.getQueryData(queryKeys.preOrderSettings(BRANCH))).toEqual(settings);
    expect(invalidated(queryClient, queryKeys.adminMenu(BRANCH))).toBe(true);
  });
});

describe("the console's save, read fresh first (review S5, S6)", () => {
  const SETTINGS: PreOrderSettings = {
    acceptsPreOrders: true,
    minutesBefore: 30,
    excludedMenuItemIds: ['gata'],
    bounds: { minutesBeforeMin: 5, minutesBeforeMax: 120 },
    editableUntilHoursBefore: 2,
    onYourWayMinutesBefore: 45,
  };

  const refused = () =>
    new ValidationError({
      url: 'x',
      status: 422,
      problem: {
        type: '',
        title: 'Invalid',
        status: 422,
        detail: '',
        code: 'validation-failed',
        traceId: 't',
        context: { fields: [{ field: 'excludedMenuItemIds', message: 'not on the menu' }] },
      },
    });

  /** The server: settings as another session left them, a menu, a PUT to watch. */
  function server(options: {
    readonly reads: readonly PreOrderSettings[];
    readonly menu?: readonly string[];
    readonly saves: readonly (Error | null)[];
  }) {
    let read = 0;
    let saved = 0;
    const puts: PreOrderSettingsInput[] = [];
    const gateway = {
      getPreOrderSettings: async () => options.reads[Math.min(read++, options.reads.length - 1)]!,
      getAdminMenu: async () => [{ id: 'c', items: (options.menu ?? []).map((id) => ({ id })) }],
      savePreOrderSettings: async ({ settings }: { settings: PreOrderSettingsInput }) => {
        puts.push(settings);
        const outcome = options.saves[saved++];
        if (outcome) throw outcome;
        return { ...SETTINGS, ...settings };
      },
    } as unknown as ConsoleGateway;
    return { gateway, puts, reads: () => read };
  }

  it("reads the settings fresh, past a cached copy, and changes only the surface's own field", async () => {
    const queryClient = client();
    // What this screen read minutes ago.
    seed(queryClient, queryKeys.preOrderSettings(BRANCH), SETTINGS);
    // What another manager has saved since.
    const { gateway, puts } = server({
      reads: [{ ...SETTINGS, minutesBefore: 60 }],
      saves: [null],
    });

    await savePreOrderSettingsFresh(queryClient, gateway, BRANCH, (fresh) => ({
      ...fresh,
      excludedMenuItemIds: [...fresh.excludedMenuItemIds, 'cappuccino'],
    }));

    expect(puts).toEqual([
      { acceptsPreOrders: true, minutesBefore: 60, excludedMenuItemIds: ['gata', 'cappuccino'] },
    ]);
  });

  it('on a refused dish list, reads again and retries once, with only dishes still on the menu', async () => {
    const queryClient = client();
    const { gateway, puts, reads } = server({
      reads: [SETTINGS, { ...SETTINGS, excludedMenuItemIds: ['gata', 'ghost'] }],
      menu: ['gata', 'cappuccino'],
      saves: [refused(), null],
    });

    await savePreOrderSettingsFresh(queryClient, gateway, BRANCH, (fresh) => ({
      ...fresh,
      excludedMenuItemIds: [...fresh.excludedMenuItemIds, 'cappuccino'],
    }));

    expect(reads()).toBe(2);
    expect(puts.at(-1)).toEqual({
      acceptsPreOrders: true,
      minutesBefore: 30,
      excludedMenuItemIds: ['gata', 'cappuccino'],
    });
  });

  it('retries once only: a second refusal is the answer', async () => {
    const queryClient = client();
    const { gateway, puts } = server({
      reads: [SETTINGS],
      menu: ['gata'],
      saves: [refused(), refused(), null],
    });

    await expect(
      savePreOrderSettingsFresh(queryClient, gateway, BRANCH, (fresh) => fresh),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(puts).toHaveLength(2);
  });

  it('does not retry any other refusal', async () => {
    const queryClient = client();
    const { gateway, puts } = server({ reads: [SETTINGS], saves: [new Error('500'), null] });

    await expect(
      savePreOrderSettingsFresh(queryClient, gateway, BRANCH, (fresh) => fresh),
    ).rejects.toThrow('500');
    expect(puts).toHaveLength(1);
  });
});
