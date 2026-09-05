import type { DerivedTableState, FloorPlanData } from '@yalla/floorplan/types';
import { cafeFloorPlan } from '@yalla/floorplan/mocks';
import type { Menu } from '../contracts/menu';
import { ConcurrencyConflictError, InvalidTransitionError, NotFoundError } from '../errors';
import type {
  AbandonTabCommand,
  AbandonTabResult,
  AcknowledgeServiceRequestCommand,
  CompCommand,
  FloorChange,
  FloorChangePage,
  OrderQueueEntry,
  OrderStatus,
  PaymentResult,
  PlaceOrderCommand,
  RecordCashPaymentCommand,
  ServiceRequest,
  SetOrderStatusCommand,
  StaffFloor,
  StaffTab,
  StaffTableDetail,
  TabEvent,
  TabEventPage,
  TabLine,
  TableActionCommand,
  TableActionKind,
  TableActionResult,
  TableStatus,
  TableWarning,
} from '../contracts/service';
import type { StaffGateway } from '../staffGateway';
import { mockMenuFor } from './menu';

/**
 * A whole service, in memory.
 *
 * This is not a stub that returns fixed rows. It is a small simulation with the
 * properties the counter screen is built against and would otherwise have no
 * way to exercise: transitions that genuinely refuse an illegal move, an
 * idempotency log that replays a repeated `clientCommandId` rather than
 * applying it twice, warnings that fire on the cases a waiter actually hits,
 * and a per-branch sequence counter so the polling stream has real gaps to
 * find.
 *
 * Everything here is behind the same `StaffGateway` interface as the HTTP
 * implementation, and no component ever sees these types. A screen typed
 * against a mock shape is a screen that stops compiling the day the backend
 * ships, which is the moment it is least affordable.
 */

export interface StaffMockOptions {
  readonly latencyMs?: number;
  /** Frozen clock for tests. Real time in the app. */
  readonly now?: () => Date;
  /**
   * Fail the next N sends with a network error, to exercise the queue without
   * touching the browser's own offline flag.
   */
  readonly failSends?: number;
  /** Which branch this room belongs to. Defaults to the first one that asks. */
  readonly branchId?: string;
  /**
   * Tables where the next transition is refused as though another waiter got
   * there first — a 409 naming them, exactly as the server sends it.
   *
   * A single device cannot produce a race with itself, so without this the two
   * most important branches of the counter screen (the live-race message and the
   * conflict list) can only be exercised by unit test. Same idea as the diner
   * mock's `simulateTableTaken`, and it fires once per table.
   */
  readonly raceOnTables?: readonly string[];
}

interface MockTableState {
  readonly tableId: string;
  physicalStatus: TableStatus;
  derived: DerivedTableState;
  sessionId: string | null;
  seatedAtUtc: string | null;
  partySize: number | null;
  tabId: string | null;
  nextReservationId: string | null;
  nextReservationStartUtc: string | null;
  nextReservationPartySize: number | null;
  freeUntilUtc: string | null;
}

interface MockOrder {
  readonly id: string;
  readonly tabId: string;
  readonly tableId: string;
  readonly tableLabel: string;
  status: OrderStatus;
  readonly placedAtUtc: string;
  readonly placedByName: string | null;
  readonly source: 'staff' | 'diner';
  readonly lineIds: string[];
}

interface MockTab {
  readonly id: string;
  readonly tableId: string;
  readonly tableLabel: string;
  status: StaffTab['status'];
  readonly openedAtUtc: string;
  closedAtUtc: string | null;
  paidDram: number;
  tipDram: number;
  readonly lines: TabLine[];
  readonly participants: { id: string; displayName: string | null; isHost: boolean }[];
  sequence: number;
  readonly events: TabEvent[];
}

const SERVICE_CHARGE_RATE = 0;

/** Which physical status each action is legal from, and what it produces. */
const TRANSITIONS: Readonly<
  Record<TableActionKind, { readonly from: readonly TableStatus[]; readonly to: TableStatus }>
> = {
  seatWalkIn: { from: ['free'], to: 'occupied' },
  seatReservation: { from: ['free'], to: 'occupied' },
  seatHeldParty: { from: ['held'], to: 'occupied' },
  hold: { from: ['free'], to: 'held' },
  releaseHold: { from: ['held'], to: 'free' },
  freeTable: { from: ['occupied'], to: 'free' },
  outOfService: { from: ['free', 'held'], to: 'outOfService' },
  returnToService: { from: ['outOfService'], to: 'free' },
};

/** Minutes within which an upcoming booking is worth warning about. */
const RESERVATION_WARNING_MINUTES = 90;

function iso(date: Date): string {
  return date.toISOString();
}

function minutesFrom(now: Date, minutes: number): string {
  return iso(new Date(now.getTime() + minutes * 60_000));
}

export function createStaffMockGateway(options: StaffMockOptions = {}): StaffGateway {
  const latency = options.latencyMs ?? 0;
  const now = options.now ?? (() => new Date());
  let failSends = options.failSends ?? 0;
  const racing = new Set(options.raceOnTables ?? []);

  /**
   * The room this mock serves, adopted from the first branch that asks for it.
   *
   * Hard-coding the fixture's own branch id would tie this mock to whichever id
   * another mock happens to hand the signed-in waiter, and the two would drift
   * the first time either changed. The geometry is the cafe fixture either way;
   * only the id follows the caller.
   */
  let branchId = options.branchId ?? cafeFloorPlan.branchId;
  // The fixture has no branch name — it is a geometry fixture — and the floor
  // screen titles itself from one. Without it the header says "Loading…" for
  // the whole session, which is exactly the kind of small permanent lie this
  // screen must not tell.
  const plan: FloorPlanData = { ...cafeFloorPlan, branchId, branchName: 'Lumen · Northern Avenue' };
  const menu: Menu = mockMenuFor(branchId, 'cafe');
  const menuItems = new Map(menu.sections.flatMap((s) => s.items.map((i) => [i.id, i] as const)));

  let sequence = 0;
  const changes: FloorChange[] = [];
  const tabs = new Map<string, MockTab>();
  const orders = new Map<string, MockOrder>();
  const serviceRequests = new Map<string, ServiceRequest>();
  /** clientCommandId -> the original response. The idempotency log. */
  const applied = new Map<string, TableActionResult>();
  let counter = 0;

  const id = (prefix: string) => `${prefix}-${(counter += 1)}`;

  // --- Seed the room --------------------------------------------------------

  const tables = new Map<string, MockTableState>();
  const start = now();

  for (const [index, table] of plan.tables.entries()) {
    const physical: TableStatus =
      table.state === 'occupied'
        ? 'occupied'
        : table.state === 'held'
          ? 'held'
          : table.state === 'outOfService'
            ? 'outOfService'
            : 'free';

    tables.set(table.id, {
      tableId: table.id,
      physicalStatus: physical,
      derived: table.state,
      sessionId: physical === 'occupied' ? id('session') : null,
      // Seated relative to now, not to the fixture's frozen clock. A table the
      // panel says has been sitting for 1,800 minutes teaches whoever is
      // testing to ignore the number, and the duration is one of the two things
      // a waiter actually reads off this panel.
      seatedAtUtc: physical === 'occupied' ? minutesFrom(start, -(12 + index * 9)) : null,
      partySize: physical === 'occupied' ? Math.min(table.seats, 2) : null,
      tabId: null,
      nextReservationId: table.state === 'reservedSoon' ? id('res') : null,
      nextReservationStartUtc: table.nextReservationStartUtc ?? null,
      nextReservationPartySize: table.state === 'reservedSoon' ? 4 : null,
      freeUntilUtc: table.nextReservationStartUtc ?? null,
    });
  }

  /**
   * A booking nobody has turned up for.
   *
   * Table 6 is `reservedSoon` in the fixture; here its booking is twenty
   * minutes into the past, which is the case the floor screen has to surface as
   * *"nobody has arrived"* with Hold and Release. Without it that branch of the
   * UI is unreachable and therefore untested.
   */
  const lateTable = tables.get('t6');
  if (lateTable) {
    lateTable.nextReservationStartUtc = minutesFrom(start, -20);
    lateTable.freeUntilUtc = minutesFrom(start, -5);
  }

  function openTab(tableId: string, tableLabel: string, at: Date): MockTab {
    const tab: MockTab = {
      id: id('tab'),
      tableId,
      tableLabel,
      status: 'open',
      openedAtUtc: iso(at),
      closedAtUtc: null,
      paidDram: 0,
      tipDram: 0,
      lines: [],
      participants: [
        { id: id('p'), displayName: 'Table', isHost: true },
        { id: id('p'), displayName: 'Anahit', isHost: false },
      ],
      sequence: 1,
      events: [],
    };
    tabs.set(tab.id, tab);
    return tab;
  }

  // Both occupied tables in the fixture already have a tab, one of them with
  // items on it, so the tab panel has something real to draw on first load.
  for (const [tableId, state] of tables) {
    if (state.physicalStatus !== 'occupied') continue;
    const table = plan.tables.find((candidate) => candidate.id === tableId);
    const tab = openTab(tableId, table?.label ?? tableId, start);
    state.tabId = tab.id;
  }

  const seededTab = [...tabs.values()][0];
  if (seededTab) {
    const seedOrder: MockOrder = {
      id: id('order'),
      tabId: seededTab.id,
      tableId: seededTab.tableId,
      tableLabel: seededTab.tableLabel,
      status: 'inKitchen',
      placedAtUtc: minutesFrom(start, -12),
      placedByName: 'Aram',
      source: 'staff',
      lineIds: [],
    };
    for (const [itemId, quantity] of [
      ['cappuccino', 2],
      ['gata', 1],
    ] as const) {
      const item = menuItems.get(itemId);
      if (!item) continue;
      const lineId = id('line');
      seededTab.lines.push({
        id: lineId,
        orderId: seedOrder.id,
        menuItemId: item.id,
        name: item.name,
        quantity,
        unitPriceDram: item.priceDram,
        lineTotalDram: item.priceDram * quantity,
        note: null,
        isShared: false,
        participantId: null,
        status: 'active',
        adjustmentReason: null,
        placedAtUtc: seedOrder.placedAtUtc,
      });
      seedOrder.lineIds.push(lineId);
    }
    orders.set(seedOrder.id, seedOrder);

    // One service request already waiting, so ageing is visible immediately.
    const requestId = id('req');
    serviceRequests.set(requestId, {
      id: requestId,
      tabId: seededTab.id,
      tableId: seededTab.tableId,
      tableLabel: seededTab.tableLabel,
      reason: 'water',
      requestedAtUtc: minutesFrom(start, -3),
      acknowledgedAtUtc: null,
    });
  }

  // --- Helpers --------------------------------------------------------------

  async function settle<T>(value: T): Promise<T> {
    if (latency > 0) await new Promise((resolve) => setTimeout(resolve, latency));
    if (failSends > 0) {
      failSends -= 1;
      throw new TypeError('Failed to fetch');
    }
    return value;
  }

  function label(tableId: string): string {
    return plan.tables.find((table) => table.id === tableId)?.label ?? tableId;
  }

  function derive(state: MockTableState, at: Date): DerivedTableState {
    if (state.physicalStatus === 'occupied') return 'occupied';
    if (state.physicalStatus === 'held') return 'held';
    if (state.physicalStatus === 'outOfService') return 'outOfService';
    if (!state.nextReservationStartUtc) return 'free';
    const startsInMinutes =
      (new Date(state.nextReservationStartUtc).getTime() - at.getTime()) / 60_000;
    return startsInMinutes > -60 && startsInMinutes < RESERVATION_WARNING_MINUTES
      ? 'reservedSoon'
      : 'free';
  }

  function totalsFor(tab: MockTab) {
    const subtotal = tab.lines
      .filter((line) => line.status === 'active')
      .reduce((sum, line) => sum + line.lineTotalDram, 0);
    const serviceCharge = Math.round(subtotal * SERVICE_CHARGE_RATE);
    const total = subtotal + serviceCharge;
    return {
      subtotalDram: subtotal,
      serviceChargeDram: serviceCharge,
      totalDram: total,
      paidDram: tab.paidDram,
      remainingDram: Math.max(0, total - tab.paidDram),
    };
  }

  function viewTab(tab: MockTab): StaffTab {
    const totals = totalsFor(tab);
    const active = tab.lines.filter((line) => line.status === 'active');

    // Per-person shares, computed the way the server will: a shared line is
    // split across everyone, a personal line lands on its owner, and a line
    // charged to the table is shared by definition.
    const people = tab.participants;
    const owed = new Map(people.map((person) => [person.id, 0]));
    for (const line of active) {
      if (line.participantId && !line.isShared) {
        owed.set(line.participantId, (owed.get(line.participantId) ?? 0) + line.lineTotalDram);
        continue;
      }
      const each = people.length === 0 ? 0 : Math.round(line.lineTotalDram / people.length);
      for (const person of people) owed.set(person.id, (owed.get(person.id) ?? 0) + each);
    }

    return {
      id: tab.id,
      branchId,
      tableId: tab.tableId,
      tableLabel: tab.tableLabel,
      status: tab.status,
      settlementMode: 'everyonePaysOwnItems',
      openedAtUtc: tab.openedAtUtc,
      closedAtUtc: tab.closedAtUtc,
      participants: tab.participants.map((person) => ({
        id: person.id,
        displayName: person.displayName,
        isHost: person.isHost,
        status: 'approved' as const,
        canOrder: true,
      })),
      totals,
      lines: tab.lines,
      shares: people.map((person) => ({
        participantId: person.id,
        displayName: person.displayName,
        shareDram: owed.get(person.id) ?? 0,
        paidDram: 0,
        remainingDram: owed.get(person.id) ?? 0,
      })),
    };
  }

  function record(state: MockTableState, from: TableStatus, at: Date, actorName: string): void {
    sequence += 1;
    changes.push({
      sequence,
      branchId,
      tableId: state.tableId,
      fromStatus: from,
      toStatus: state.physicalStatus,
      state: state.derived,
      atUtc: iso(at),
      tabId: state.tabId,
      tableSessionId: state.sessionId,
      partySize: state.partySize,
      nextReservationStartUtc: state.nextReservationStartUtc,
      actorName,
    });
  }

  function orderEntry(order: MockOrder): OrderQueueEntry {
    const tab = tabs.get(order.tabId);
    const lines = (tab?.lines ?? []).filter((line) => order.lineIds.includes(line.id));
    return {
      orderId: order.id,
      tabId: order.tabId,
      tableId: order.tableId,
      tableLabel: order.tableLabel,
      status: order.status,
      placedAtUtc: order.placedAtUtc,
      placedByName: order.placedByName,
      source: order.source,
      estimatedReadyAtUtc: null,
      lines: lines.map((line) => ({
        name: line.name,
        quantity: line.quantity,
        note: line.note,
      })),
    };
  }

  function requireTab(tabId: string): MockTab {
    const tab = tabs.get(tabId);
    if (!tab) throw new NotFoundError({ url: `/api/tabs/${tabId}` });
    return tab;
  }

  function pushEvent(tab: MockTab, kind: TabEvent['kind'], at: Date): void {
    tab.sequence += 1;
    tab.events.push({ sequence: tab.sequence, tabId: tab.id, kind, atUtc: iso(at), data: null });
  }

  // --- The gateway ----------------------------------------------------------

  return {
    async getFloor(requested): Promise<StaffFloor | null> {
      if (!requested) return settle(null);
      branchId = requested;
      const at = now();

      const details: StaffTableDetail[] = [];
      const drawn = plan.tables.map((table) => {
        const state = tables.get(table.id);
        if (!state) return table;
        state.derived = derive(state, at);
        details.push({
          tableId: table.id,
          label: table.label,
          seats: table.seats,
          physicalStatus: state.physicalStatus,
          currentSessionId: state.sessionId,
          seatedAtUtc: state.seatedAtUtc,
          partySize: state.partySize,
          nextReservationId: state.nextReservationId,
          nextReservationStartUtc: state.nextReservationStartUtc,
          nextReservationPartySize: state.nextReservationPartySize,
          freeUntilUtc: state.freeUntilUtc,
          openTabId: state.tabId,
          rowVersion: null,
        });
        return {
          ...table,
          state: state.derived,
          occupiedSinceUtc: state.seatedAtUtc,
          nextReservationStartUtc: state.nextReservationStartUtc,
        };
      });

      return settle({
        plan: { ...plan, branchId, tables: drawn },
        details,
        lastSequence: sequence,
        asOfUtc: iso(at),
      });
    },

    async applyTableAction(command: TableActionCommand): Promise<TableActionResult> {
      const at = now();

      // The idempotency log first, exactly as the server does it: a repeated
      // command id replays the original answer and changes nothing.
      const previous = applied.get(command.clientCommandId);
      if (previous) return settle({ ...previous, wasReplay: true });

      const state = tables.get(command.tableId);
      if (!state) {
        throw new NotFoundError({
          url: `/api/branches/${branchId}/tables/${command.tableId}`,
        });
      }

      const transition = TRANSITIONS[command.kind];
      const from = state.physicalStatus;

      // Somebody else got there first. Fired once, before the legality check,
      // because a real race does not care whether the move would have been
      // legal in the world the waiter was looking at.
      if (racing.has(command.tableId)) {
        racing.delete(command.tableId);
        throw new ConcurrencyConflictError({
          url: `/api/branches/${branchId}/tables/${command.tableId}`,
          problem: {
            code: 'table-state-conflict',
            status: 409,
            title: 'Table already changed',
            detail: `Table ${label(command.tableId)} was changed by someone else.`,
            type: '',
            traceId: '',
            instance: null,
            errors: null,
            context: {
              tableId: command.tableId,
              tableLabel: label(command.tableId),
              attemptedFromStatus: from,
              currentStatus: 'occupied',
              currentSessionId: id('session'),
              changedByName: 'Aram',
            },
          },
        });
      }

      if (!transition.from.includes(from)) {
        const url = `/api/branches/${branchId}/tables/${command.tableId}`;
        // Two different refusals, and the difference is what the screen needs.
        // A seat action on a table someone else took is a race; marking an
        // occupied table out of service is simply not a legal move.
        const isRace = from === 'occupied' || from === 'held';
        if (isRace) {
          throw new ConcurrencyConflictError({
            url,
            problem: {
              code: 'table-state-conflict',
              status: 409,
              title: 'Table already changed',
              detail: `Table ${label(command.tableId)} is now ${from}.`,
              type: '',
              traceId: '',
              instance: null,
              errors: null,
              context: {
                tableId: command.tableId,
                tableLabel: label(command.tableId),
                attemptedFromStatus: transition.from[0] ?? 'free',
                currentStatus: from,
                currentSessionId: state.sessionId,
                changedByName: 'Aram',
              },
            },
          });
        }
        throw new InvalidTransitionError({
          url,
          problem: {
            code: 'invalid-table-transition',
            status: 422,
            title: 'Not a legal transition',
            detail: `Cannot ${command.kind} a table that is ${from}.`,
            type: '',
            traceId: '',
            instance: null,
            errors: null,
            context: { currentStatus: from, allowed: [] },
          },
        });
      }

      const warnings: TableWarning[] = [];
      let outstanding: number | null = null;

      if (transition.to === 'occupied' && state.nextReservationStartUtc) {
        const minutes = (new Date(state.nextReservationStartUtc).getTime() - at.getTime()) / 60_000;
        if (minutes > -120 && minutes < RESERVATION_WARNING_MINUTES) {
          warnings.push({
            code: 'upcoming-reservation',
            message: `Table ${label(command.tableId)} is booked at ${state.nextReservationStartUtc}`,
          });
        }
      }

      if (command.kind === 'freeTable' && state.tabId) {
        const tab = tabs.get(state.tabId);
        const remaining = tab ? totalsFor(tab).remainingDram : 0;
        if (remaining > 0) {
          outstanding = remaining;
          warnings.push({
            code: 'outstanding-balance',
            message: `${remaining} dram still owed on table ${label(command.tableId)}`,
          });
        } else if (tab) {
          tab.status = 'closed';
          tab.closedAtUtc = iso(at);
          pushEvent(tab, 'closed', at);
        }
      }

      state.physicalStatus = transition.to;

      if (transition.to === 'occupied') {
        state.sessionId = id('session');
        state.seatedAtUtc = iso(at);
        state.partySize = command.partySize ?? null;
        if (command.kind === 'seatReservation' || command.reservationId) {
          state.nextReservationId = null;
          state.nextReservationStartUtc = null;
        }
      } else if (command.kind === 'freeTable') {
        state.sessionId = null;
        state.seatedAtUtc = null;
        state.partySize = null;
        // The tab id survives a free with money owed: that tab is exactly what
        // the "needs resolving" list is for, and losing the id would lose it.
        if (outstanding === null) state.tabId = null;
      }

      state.derived = derive(state, at);
      record(state, from, at, 'you');

      const result: TableActionResult = {
        branchId,
        tableId: command.tableId,
        tableLabel: label(command.tableId),
        fromStatus: from,
        toStatus: state.physicalStatus,
        state: state.derived,
        tableSessionId: state.sessionId,
        reservationId: command.reservationId ?? null,
        tabId: state.tabId,
        nextReservationStartUtc: state.nextReservationStartUtc,
        freeUntilUtc: state.freeUntilUtc,
        atUtc: iso(at),
        clientCommandId: command.clientCommandId,
        wasReplay: false,
        outstandingDram: outstanding,
        warnings,
      };

      applied.set(command.clientCommandId, result);
      return settle(result);
    },

    async getFloorChanges({ afterSequence }): Promise<FloorChangePage> {
      const page = changes.filter((change) => change.sequence > afterSequence);
      return settle({
        branchId,
        lastSequence:
          page.length > 0 ? (page[page.length - 1]?.sequence ?? sequence) : afterSequence,
        changes: page,
      });
    },

    async getStaffTab(tabId): Promise<StaffTab | null> {
      const tab = tabs.get(tabId);
      return settle(tab ? viewTab(tab) : null);
    },

    async getTabEvents({ tabId, afterSequence }): Promise<TabEventPage> {
      const tab = requireTab(tabId);
      const page = tab.events.filter((event) => event.sequence > afterSequence);
      return settle({
        tabId,
        lastSequence:
          page.length > 0 ? (page[page.length - 1]?.sequence ?? tab.sequence) : afterSequence,
        events: page,
      });
    },

    async beginClosing({ tabId }): Promise<StaffTab> {
      const tab = requireTab(tabId);
      if (tab.status === 'open') tab.status = 'closing';
      return settle(viewTab(tab));
    },

    async openTabForTable({ tableId }): Promise<StaffTab> {
      const state = tables.get(tableId);
      if (!state) throw new NotFoundError({ url: `/api/tables/${tableId}` });
      const existing = state.tabId ? tabs.get(state.tabId) : undefined;
      if (existing && existing.status !== 'closed') return settle(viewTab(existing));
      const tab = openTab(tableId, label(tableId), now());
      state.tabId = tab.id;
      return settle(viewTab(tab));
    },

    async getMenu(): Promise<Menu | null> {
      return settle(menu);
    },

    async placeOrder(command: PlaceOrderCommand): Promise<{ orderId: string; wasReplay: boolean }> {
      const tab = requireTab(command.tabId);
      const at = now();

      const duplicate = [...orders.values()].find((order) => order.id === command.clientCommandId);
      if (duplicate) return settle({ orderId: duplicate.id, wasReplay: true });

      const order: MockOrder = {
        // The command id *is* the order id here, which is how the replay above
        // works without a second log. The server keys its own idempotency table
        // the same way.
        id: command.clientCommandId,
        tabId: tab.id,
        tableId: tab.tableId,
        tableLabel: tab.tableLabel,
        status: 'new',
        placedAtUtc: iso(at),
        placedByName: 'you',
        source: 'staff',
        lineIds: [],
      };

      for (const line of command.lines) {
        const item = menuItems.get(line.menuItemId);
        if (!item) continue;
        const lineId = id('line');
        tab.lines.push({
          id: lineId,
          orderId: order.id,
          menuItemId: item.id,
          name: item.name,
          quantity: line.quantity,
          unitPriceDram: item.priceDram,
          lineTotalDram: item.priceDram * line.quantity,
          note: line.note ?? null,
          isShared: line.isShared,
          participantId: line.participantId,
          status: 'active',
          adjustmentReason: null,
          placedAtUtc: iso(at),
        });
        order.lineIds.push(lineId);
      }

      orders.set(order.id, order);
      pushEvent(tab, 'orderPlaced', at);
      return settle({ orderId: order.id, wasReplay: false });
    },

    async listOrderQueue(): Promise<readonly OrderQueueEntry[]> {
      return settle(
        [...orders.values()]
          .filter((order) => order.status !== 'served')
          .sort((a, b) => b.placedAtUtc.localeCompare(a.placedAtUtc))
          .map(orderEntry),
      );
    },

    async setOrderStatus(command: SetOrderStatusCommand): Promise<OrderQueueEntry> {
      const order = orders.get(command.orderId);
      if (!order) throw new NotFoundError({ url: `/api/orders/${command.orderId}` });
      order.status = command.status;
      const tab = tabs.get(order.tabId);
      if (tab) pushEvent(tab, 'orderStatusChanged', now());
      return settle(orderEntry(order));
    },

    async listServiceRequests(): Promise<readonly ServiceRequest[]> {
      return settle(
        [...serviceRequests.values()]
          .filter((request) => request.acknowledgedAtUtc === null)
          .sort((a, b) => a.requestedAtUtc.localeCompare(b.requestedAtUtc)),
      );
    },

    async acknowledgeServiceRequest(
      command: AcknowledgeServiceRequestCommand,
    ): Promise<ServiceRequest> {
      const request = serviceRequests.get(command.requestId);
      if (!request) {
        throw new NotFoundError({ url: `/api/service-requests/${command.requestId}` });
      }
      const acknowledged = { ...request, acknowledgedAtUtc: iso(now()) };
      serviceRequests.set(request.id, acknowledged);
      return settle(acknowledged);
    },

    async voidLine(command): Promise<StaffTab> {
      const tab = requireTab(command.tabId);
      const index = tab.lines.findIndex((line) => line.id === command.lineId);
      const line = tab.lines[index];
      if (!line) throw new NotFoundError({ url: `/api/tabs/${command.tabId}` });
      tab.lines[index] = {
        ...line,
        status: 'voided',
        adjustmentReason: command.detail ?? command.reason,
      };
      pushEvent(tab, 'lineVoided', now());
      return settle(viewTab(tab));
    },

    async compLine(command: CompCommand): Promise<StaffTab> {
      const tab = requireTab(command.tabId);
      for (let index = 0; index < tab.lines.length; index += 1) {
        const line = tab.lines[index];
        if (!line) continue;
        if (command.lineId !== null && line.id !== command.lineId) continue;
        if (line.status !== 'active') continue;
        tab.lines[index] = { ...line, status: 'comped', adjustmentReason: command.reason };
      }
      pushEvent(tab, 'lineComped', now());
      return settle(viewTab(tab));
    },

    async recordCashPayment(command: RecordCashPaymentCommand): Promise<PaymentResult> {
      const tab = requireTab(command.tabId);
      const at = now();

      // The tip is added to what the venue holds, never to what the tab owes.
      tab.paidDram += command.amountDram;
      tab.tipDram += command.tipDram;
      const totals = totalsFor(tab);
      const closed = totals.remainingDram === 0;
      if (closed && tab.status !== 'closed') {
        tab.status = 'closed';
        tab.closedAtUtc = iso(at);
      }
      pushEvent(tab, 'paymentRecorded', at);

      return settle({
        paymentId: id('pay'),
        tabId: tab.id,
        amountDram: command.amountDram,
        tipDram: command.tipDram,
        totals,
        tabClosed: closed,
        wasReplay: false,
      });
    },

    async abandonTab(command: AbandonTabCommand): Promise<AbandonTabResult> {
      const tab = requireTab(command.tabId);
      const at = now();
      const written = totalsFor(tab).remainingDram;
      tab.status = 'abandoned';
      tab.closedAtUtc = iso(at);
      tab.paidDram = totalsFor(tab).totalDram;
      pushEvent(tab, 'closed', at);
      return settle({
        tabId: tab.id,
        writtenOffDram: written,
        atUtc: iso(at),
        wasReplay: false,
      });
    },
  };
}
