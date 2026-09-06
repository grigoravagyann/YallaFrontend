import type { DerivedTableState, FloorPlanData } from '@yalla/floorplan/types';
import { cafeFloorPlan } from '@yalla/floorplan/mocks';
import type { Menu } from '../contracts/menu';
import { ConcurrencyConflictError, InvalidTransitionError, NotFoundError } from '../errors';
import { PaymentExceedsRemainingError } from '../contracts/errors';
import type {
  AffectedReservation,
  StaffFloor,
  StaffTableDetail,
  TableActionCommand,
  TableActionKind,
  TableActionResult,
  TableStatus,
  TableWarning,
  TabTotals,
} from '../contracts/service';
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
  PlaceOrderResult,
  ReassignHostCommand,
  RecordCashPaymentCommand,
  ServiceRequest,
  SetOrderStatusCommand,
  StaffTab,
  TabAdjustment,
  TabEvent,
  TabLine,
  VoidLineCommand,
} from '../contracts/ordering';
import type {
  ReleaseReservationCommand,
  ReservationReleaseResult,
  StaffGateway,
} from '../staffGateway';
import { mockMenuFor } from './menu';
import { computeBill, type BillingLine } from './billing';

/**
 * A whole service, in memory.
 *
 * This is not a stub that returns fixed rows. It is a small simulation with the
 * properties the counter screen is built against and would otherwise have no
 * way to exercise: transitions that genuinely refuse an illegal move, an
 * idempotency log that replays a repeated `clientCommandId` rather than
 * applying it twice, **row versions that change on every transition**, warnings
 * that fire on the cases a waiter actually hits, and a per-branch sequence
 * counter so the polling stream has real gaps to find.
 *
 * The row versions are what make the two precondition failures reachable
 * without a backend. A table that goes free → occupied → free has the same
 * status and a different version, and that is the case a waiter cannot see and
 * the conflict list has to word differently — so the mock has to be able to
 * produce it.
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
  /**
   * Tables whose row version is bumped behind the caller's back before the next
   * transition, without the status changing.
   *
   * The one conflict a status check cannot catch: the table went out and came
   * back while a command sat in the queue. There is no way to stage it from one
   * device otherwise, and it is the whole reason the version is sent.
   */
  readonly churnOnTables?: readonly string[];
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
  /** Bumped on every change, including a churn nobody asked for. */
  version: number;
}

interface MockOrder {
  readonly id: string;
  readonly tabId: string;
  readonly tableLabel: string;
  status: OrderStatus;
  readonly placedAtUtc: string;
  readonly lineIds: string[];
}

/** A line, plus the owner the wire only carries as a share snapshot. */
type MockLine = TabLine & { readonly ownerParticipantId: string | null };

interface MockParticipant {
  readonly id: string;
  readonly displayName: string | null;
  readonly isHost: boolean;
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
  readonly lines: MockLine[];
  readonly adjustments: TabAdjustment[];
  participants: MockParticipant[];
  hostParticipantId: string | null;
  settlementModeLocked: boolean;
  sequence: number;
  readonly events: TabEvent[];
}

interface MockReservation {
  readonly id: string;
  readonly tableId: string;
  readonly code: string;
  readonly guestName: string;
  readonly guestPhone: string;
  readonly partySize: number;
  readonly startUtc: string;
  released: boolean;
}

/**
 * The branch percentage, snapshotted when a tab opens.
 *
 * Non-zero on purpose: a service charge of zero would let every screen be built
 * without ever rendering the line that has to be present from the first item,
 * and the first venue with a 10% charge would find out.
 */
const SERVICE_CHARGE_PERCENT = 10;

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

/** The wire sends base64. Shape matters more than content: it is opaque either way. */
function versionToken(tableId: string, version: number): string {
  return btoa(`${tableId}:${version}`);
}

export function createStaffMockGateway(options: StaffMockOptions = {}): StaffGateway {
  const latency = options.latencyMs ?? 0;
  const now = options.now ?? (() => new Date());
  let failSends = options.failSends ?? 0;
  const racing = new Set(options.raceOnTables ?? []);
  const churning = new Set(options.churnOnTables ?? []);

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
  const reservations = new Map<string, MockReservation>();
  /** clientCommandId -> the original response. The idempotency log. */
  const applied = new Map<string, TableActionResult>();
  const releasedCommands = new Map<string, ReservationReleaseResult>();
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
      nextReservationId: null,
      nextReservationStartUtc: table.nextReservationStartUtc ?? null,
      nextReservationPartySize: table.state === 'reservedSoon' ? 4 : null,
      freeUntilUtc: table.nextReservationStartUtc ?? null,
      version: 1,
    });

    if (table.state === 'reservedSoon') {
      const reservation: MockReservation = {
        id: id('res'),
        tableId: table.id,
        code: `Y${1000 + index}`,
        guestName: ['Անի Գրիգորյան', 'Davit Sargsyan', 'Мария Петрова'][index % 3] ?? 'Guest',
        guestPhone: `+3749${(1000000 + index * 13579).toString().slice(0, 7)}`,
        partySize: 4,
        startUtc: table.nextReservationStartUtc ?? minutesFrom(start, 45),
        released: false,
      };
      reservations.set(reservation.id, reservation);
      const state = tables.get(table.id);
      if (state) state.nextReservationId = reservation.id;
    }
  }

  /**
   * A booking nobody has turned up for.
   *
   * Table 6 is `reservedSoon` in the fixture; here its booking is twenty
   * minutes into the past, which is the case the floor screen has to surface as
   * *"nobody has arrived"* with Hold and the two release outcomes. Without it
   * that branch of the UI is unreachable and therefore untested.
   */
  const lateTable = tables.get('t6');
  if (lateTable) {
    lateTable.nextReservationStartUtc = minutesFrom(start, -20);
    lateTable.freeUntilUtc = minutesFrom(start, -5);
    if (!lateTable.nextReservationId) {
      const reservation: MockReservation = {
        id: id('res'),
        tableId: 't6',
        code: 'Y2040',
        guestName: 'Նարեկ Հակոբյան',
        guestPhone: '+37491234567',
        partySize: 3,
        startUtc: lateTable.nextReservationStartUtc,
        released: false,
      };
      reservations.set(reservation.id, reservation);
      lateTable.nextReservationId = reservation.id;
    } else {
      const existing = reservations.get(lateTable.nextReservationId);
      if (existing) {
        reservations.set(existing.id, { ...existing, startUtc: lateTable.nextReservationStartUtc });
      }
    }
  }

  function openTab(tableId: string, tableLabel: string, at: Date): MockTab {
    const host: MockParticipant = { id: id('p'), displayName: 'Anahit', isHost: true };
    const other: MockParticipant = { id: id('p'), displayName: 'Karen', isHost: false };
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
      adjustments: [],
      participants: [host, other],
      hostParticipantId: host.id,
      settlementModeLocked: false,
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
      tableLabel: seededTab.tableLabel,
      status: 'inKitchen',
      placedAtUtc: minutesFrom(start, -12),
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
        isTableAttributed: true,
        ownerParticipantId: null,
        participantId: null,
        orderedByName: null,
        // Zero, because this line is not shared. The wire's
        // `sharedWithParticipantIds` is "who it splits across, snapshotted at
        // order time", and an unshared line splits across nobody. This used to
        // report the roster size, which made every solo line claim to split
        // four ways the moment four people were on the tab.
        sharedWithCount: 0,
        status: 'active',
        voidReason: null,
        voidedByName: null,
        placedAtUtc: seedOrder.placedAtUtc,
        orderStatus: seedOrder.status,
      });
      seedOrder.lineIds.push(lineId);
    }
    orders.set(seedOrder.id, seedOrder);

    // One service request already waiting, so ageing is visible immediately.
    const requestId = id('req');
    serviceRequests.set(requestId, {
      id: requestId,
      tabId: seededTab.id,
      tableLabel: seededTab.tableLabel,
      reason: 'water',
      note: null,
      requestedAtUtc: minutesFrom(start, -3),
      waitingMinutes: 3,
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

  /**
   * The bill, through the shared port of the server's own arithmetic.
   *
   * Not summed here. A mock that adds up line totals and calls it a bill would
   * let every screen be demonstrated against arithmetic the server does not do,
   * and the disagreement would surface at a table.
   */
  function billFor(tab: MockTab) {
    return computeBill({
      lines: tab.lines.map((line): BillingLine => ({
        lineId: line.id,
        ownerParticipantId: line.ownerParticipantId,
        unitPriceDram: line.unitPriceDram,
        quantity: line.quantity,
        isVoided: line.status === 'voided',
        isSplitAcrossParticipants: line.isShared || line.isTableAttributed,
        shareParticipantIds:
          line.isShared || line.isTableAttributed
            ? tab.participants.slice(0, Math.max(1, line.sharedWithCount)).map((p) => p.id)
            : [],
      })),
      adjustments: tab.adjustments.map((adjustment) => ({
        lineId: adjustment.lineId,
        percent: adjustment.percent,
        amountDram: adjustment.amountDram,
      })),
      participants: tab.participants.map((person) => ({
        participantId: person.id,
        displayName: person.displayName,
        isHost: person.isHost,
        status: 'approved' as const,
        paidDram: 0,
      })),
      serviceChargePercent: SERVICE_CHARGE_PERCENT,
      paidDram: tab.paidDram,
    });
  }

  function totalsFor(tab: MockTab): TabTotals {
    return billFor(tab).bill;
  }

  /**
   * The tab as the staff endpoint answers it.
   *
   * `linesKnown` is false here for the same reason it is false against the real
   * backend: `GET /api/tabs/{id}/participants` carries participants and totals,
   * and the lines come from the order queue through `getTabLines`. A mock that
   * returned them anyway would let the panel be built against data the server
   * does not send.
   */
  function viewTab(tab: MockTab): StaffTab {
    const { bill } = billFor(tab);

    return {
      id: tab.id,
      branchId,
      tableId: tab.tableId,
      tableLabel: tab.tableLabel,
      status: tab.status,
      settlementMode: 'everyonePaysOwnItems',
      settlementModeLocked: tab.settlementModeLocked,
      openedAtUtc: tab.openedAtUtc,
      closedAtUtc: tab.closedAtUtc,
      hostParticipantId: tab.hostParticipantId,
      participants: tab.participants.map((person) => ({
        id: person.id,
        displayName: person.displayName,
        isHost: person.id === tab.hostParticipantId,
        status: 'approved' as const,
        canOrder: true,
        canOrderNow: tab.status === 'open',
        canSeeTableTotal: true,
      })),
      totals: bill,
      serviceChargePercent: SERVICE_CHARGE_PERCENT,
      lines: [],
      linesKnown: false,
      adjustments: [],
      adjustmentsKnown: false,
    };
  }

  /** The lines as `getTabLines` assembles them: void reasons are not on the wire. */
  function wireLines(tab: MockTab): readonly TabLine[] {
    return tab.lines.map((line) => ({
      ...line,
      lineTotalDram: line.status === 'voided' ? 0 : line.unitPriceDram * line.quantity,
      // Stored on the server and projected into nothing. The mock is the same
      // shape on purpose: a panel built against a reason the real API never
      // sends is a panel that goes blank on the tablet.
      voidReason: null,
      voidedByName: null,
    }));
  }

  function record(state: MockTableState, from: TableStatus, at: Date): void {
    sequence += 1;
    changes.push({
      sequence,
      tableId: state.tableId,
      tableLabel: label(state.tableId),
      fromStatus: from,
      toStatus: state.physicalStatus,
      atUtc: iso(at),
      tableSessionId: state.sessionId,
      reservationId: state.nextReservationId,
      actor: 'staff',
      actorId: null,
      reason: '',
    });
  }

  function orderEntry(order: MockOrder): OrderQueueEntry {
    const tab = tabs.get(order.tabId);
    const lines = (tab?.lines ?? []).filter((line) => order.lineIds.includes(line.id));
    return {
      orderId: order.id,
      tabId: order.tabId,
      tableLabel: order.tableLabel,
      status: order.status,
      placedAtUtc: order.placedAtUtc,
      estimatedReadyAtUtc: null,
      waitingMinutes: Math.max(
        0,
        Math.floor((now().getTime() - new Date(order.placedAtUtc).getTime()) / 60_000),
      ),
      lines: lines.map((line) => ({
        lineId: line.id,
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

  function pushEvent(
    tab: MockTab,
    type: TabEvent['type'],
    at: Date,
    actor: TabEvent['actor'] = 'staff',
  ): void {
    tab.sequence += 1;
    tab.events.push({
      sequence: tab.sequence,
      tabId: tab.id,
      type,
      actor,
      actorId: null,
      actorName: null,
      atUtc: iso(at),
      data: null,
    });
  }

  /** A 409 shaped exactly like the server's, for whichever half failed. */
  function preconditionFailed(
    state: MockTableState,
    command: TableActionCommand,
    failure: 1 | 2,
  ): ConcurrencyConflictError {
    const tableLabel = label(command.tableId);
    return new ConcurrencyConflictError({
      url: `/api/branches/${branchId}/tables/${command.tableId}`,
      problem: {
        code: 'precondition-failed',
        status: 409,
        title: 'The world moved on',
        detail:
          failure === 1
            ? `This change was queued while table ${tableLabel} was ${command.precondition?.expectedFromStatus}; it is ${state.physicalStatus} now.`
            : `Table ${tableLabel} is ${state.physicalStatus} again, but it has been used since this change was queued.`,
        type: '',
        traceId: '',
        instance: null,
        errors: null,
        context: {
          tableId: command.tableId,
          tableLabel,
          expectedFromStatus: command.precondition?.expectedFromStatus,
          currentStatus: state.physicalStatus,
          currentSessionId: state.sessionId,
          failure,
          clientCommandId: command.clientCommandId,
        },
      },
    });
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
          rowVersion: versionToken(table.id, state.version),
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

      // The table went out and came back while this sat in the queue. Staged
      // before the precondition check, because that is where it happens: the
      // status is unchanged and only the version says so.
      if (churning.has(command.tableId)) {
        churning.delete(command.tableId);
        state.version += 1;
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

      // Both halves, checked separately and reported separately. The server
      // does exactly this, and the difference is the only thing that can tell a
      // waiter their command landed on a sitting that has already ended.
      if (command.precondition) {
        if (command.precondition.expectedFromStatus !== from) {
          throw preconditionFailed(state, command, 1);
        }
        if (
          command.precondition.rowVersion !== null &&
          command.precondition.rowVersion !== versionToken(command.tableId, state.version)
        ) {
          throw preconditionFailed(state, command, 2);
        }
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
      const affected: AffectedReservation[] = [];
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

      // A broken table strands whoever booked it. The list is what the panel
      // shows so somebody can phone them; nothing is cancelled automatically.
      if (command.kind === 'outOfService') {
        for (const reservation of reservations.values()) {
          if (reservation.tableId !== command.tableId || reservation.released) continue;
          const local = new Date(reservation.startUtc);
          affected.push({
            reservationId: reservation.id,
            code: reservation.code,
            guestName: reservation.guestName,
            guestPhone: reservation.guestPhone,
            partySize: reservation.partySize,
            startUtc: reservation.startUtc,
            localDate: local.toISOString().slice(0, 10),
            localStartTime: local.toISOString().slice(11, 19),
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
          pushEvent(tab, 'tabClosed', at);
        }
      }

      state.physicalStatus = transition.to;
      state.version += 1;

      if (transition.to === 'occupied') {
        state.sessionId = id('session');
        state.seatedAtUtc = iso(at);
        state.partySize = command.partySize ?? null;
        if (command.kind === 'seatReservation' || command.reservationId) {
          state.nextReservationId = null;
          state.nextReservationStartUtc = null;
        }
        // A party the waiter sat down has no tab until somebody scans, which is
        // the real backend's behaviour too — a waiter cannot open one.
      } else if (command.kind === 'freeTable') {
        state.sessionId = null;
        state.seatedAtUtc = null;
        state.partySize = null;
        // The tab id survives a free with money owed: that tab is exactly what
        // the "needs resolving" list is for, and losing the id would lose it.
        if (outstanding === null) state.tabId = null;
      }

      state.derived = derive(state, at);
      record(state, from, at);

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
        affectedReservations: affected,
      };

      applied.set(command.clientCommandId, result);
      return settle(result);
    },

    async getFloorChanges({ afterSequence }): Promise<FloorChangePage> {
      const page = changes.filter((change) => change.sequence > afterSequence);
      return settle({
        branchId,
        lastSequence: sequence,
        hasMore: false,
        changes: page,
      });
    },

    async releaseReservation(
      command: ReleaseReservationCommand,
    ): Promise<ReservationReleaseResult> {
      const replay = releasedCommands.get(command.clientCommandId);
      if (replay) return settle({ ...replay, wasReplay: true });

      const reservation = reservations.get(command.reservationId);
      if (!reservation) {
        throw new NotFoundError({ url: `/api/reservations/${command.reservationId}` });
      }

      reservations.set(reservation.id, { ...reservation, released: true });

      const state = tables.get(reservation.tableId);
      let freed = false;
      if (state && state.physicalStatus === 'held') {
        const from = state.physicalStatus;
        state.physicalStatus = 'free';
        state.version += 1;
        state.derived = derive(state, now());
        record(state, from, now());
        freed = true;
      }
      if (state && state.nextReservationId === reservation.id) {
        state.nextReservationId = null;
        state.nextReservationStartUtc = null;
        state.version += 1;
      }

      const result: ReservationReleaseResult = {
        reservationId: reservation.id,
        outcome: command.outcome,
        // Stated by the server rather than inferred from the button, so the
        // confirmation can say which one actually happened.
        countsTowardNoShowThreshold: command.outcome === 'noShow',
        tableId: reservation.tableId,
        tableLabel: label(reservation.tableId),
        tableFreed: freed,
        wasReplay: false,
      };
      releasedCommands.set(command.clientCommandId, result);
      return settle(result);
    },

    async getStaffTab(tabId): Promise<StaffTab | null> {
      const tab = tabs.get(tabId);
      return settle(tab ? viewTab(tab) : null);
    },

    async getTabLines({ tabId }): Promise<readonly TabLine[]> {
      const tab = tabs.get(tabId);
      return settle(tab ? wireLines(tab) : []);
    },

    async beginClosing({ tabId }): Promise<StaffTab> {
      const tab = requireTab(tabId);
      if (tab.status === 'open') tab.status = 'closing';
      pushEvent(tab, 'tabClosing', now());
      return settle(viewTab(tab));
    },

    async reassignHost(command: ReassignHostCommand): Promise<StaffTab> {
      const tab = requireTab(command.tabId);
      if (!tab.participants.some((person) => person.id === command.newHostParticipantId)) {
        throw new NotFoundError({ url: `/api/tabs/${command.tabId}/reassign-host` });
      }
      tab.hostParticipantId = command.newHostParticipantId;
      tab.participants = tab.participants.map((person) => ({
        ...person,
        isHost: person.id === command.newHostParticipantId,
      }));
      pushEvent(tab, 'hostReassigned', now());
      return settle(viewTab(tab));
    },

    async getMenu(): Promise<Menu | null> {
      return settle(menu);
    },

    async placeOrder(command: PlaceOrderCommand): Promise<PlaceOrderResult> {
      const tab = requireTab(command.tabId);
      const at = now();

      const duplicate = orders.get(command.clientCommandId);
      if (duplicate) {
        return settle({
          orderId: duplicate.id,
          tabId: tab.id,
          status: duplicate.status,
          placedAtUtc: duplicate.placedAtUtc,
          estimatedReadyAtUtc: null,
          wasReplay: true,
          totals: totalsFor(tab),
        });
      }

      const order: MockOrder = {
        // The command id *is* the order id here, which is how the replay above
        // works without a second log. The server keys its own idempotency table
        // the same way.
        id: command.clientCommandId,
        tabId: tab.id,
        tableLabel: tab.tableLabel,
        status: 'new',
        placedAtUtc: iso(at),
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
          isTableAttributed: line.participantId === null,
          ownerParticipantId: line.participantId,
          // Null even here, because `OrderLineView` carries neither and the
          // panel must not be built against something the wire never sends.
          participantId: null,
          orderedByName: null,
          /*
           * Snapshotted now, and zero when the line is not shared.
           *
           * The count is `sharedWithParticipantIds.length` on the wire, so an
           * unshared line is 0 rather than "everyone currently here". Reporting
           * the roster size for every line was the mock's own version of the
           * bug its comment warns about — it just made the error on the
           * *unshared* lines instead of the late-arriving ones.
           */
          sharedWithCount: line.isShared ? tab.participants.length : 0,
          status: 'active',
          voidReason: null,
          voidedByName: null,
          placedAtUtc: iso(at),
          orderStatus: 'new',
        });
        order.lineIds.push(lineId);
      }

      orders.set(order.id, order);
      pushEvent(tab, 'orderPlaced', at);

      return settle({
        orderId: order.id,
        tabId: tab.id,
        status: 'new',
        placedAtUtc: order.placedAtUtc,
        estimatedReadyAtUtc: minutesFrom(at, 15),
        wasReplay: false,
        totals: totalsFor(tab),
      });
    },

    async listOrderQueue(): Promise<readonly OrderQueueEntry[]> {
      return settle(
        [...orders.values()]
          .filter((order) => order.status !== 'served' && order.status !== 'voided')
          .sort((a, b) => b.placedAtUtc.localeCompare(a.placedAtUtc))
          .map(orderEntry),
      );
    },

    async listOrdersByStatus({ status }): Promise<readonly OrderQueueEntry[]> {
      return settle(
        [...orders.values()]
          .filter((order) => order.status === status)
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
      const at = now();
      return settle(
        [...serviceRequests.values()]
          .filter((request) => request.acknowledgedAtUtc === null)
          .sort((a, b) => a.requestedAtUtc.localeCompare(b.requestedAtUtc))
          .map((request) => ({
            ...request,
            waitingMinutes: Math.max(
              0,
              Math.floor((at.getTime() - new Date(request.requestedAtUtc).getTime()) / 60_000),
            ),
          })),
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

    async voidLine(command: VoidLineCommand): Promise<readonly TabLine[]> {
      const tab = requireTab(command.tabId);
      const index = tab.lines.findIndex((line) => line.id === command.lineId);
      const line = tab.lines[index];
      if (!line) throw new NotFoundError({ url: `/api/tabs/${command.tabId}` });
      tab.lines[index] = { ...line, status: 'voided', lineTotalDram: 0 };
      pushEvent(tab, 'lineVoided', now());
      // The endpoint answers with the whole order's lines, not the tab's.
      const orderId = line.orderId;
      return settle(wireLines(tab).filter((candidate) => candidate.orderId === orderId));
    },

    async compLine(command: CompCommand): Promise<TabAdjustment> {
      const tab = requireTab(command.tabId);
      const at = now();
      // A comp is an adjustment, not a line status. The line stays exactly as
      // it was ordered and the reduction is its own row with a reason on it —
      // a bill that quietly shrinks is a bill nobody trusts.
      const record: TabAdjustment = {
        id: id('adj'),
        kind: command.kind,
        lineId: command.lineId,
        percent: command.percent,
        amountDram: command.amountDram,
        reductionDram: 0,
        reason: command.reason,
        isVoided: false,
        byName: null,
        atUtc: iso(at),
      };
      tab.adjustments.push(record);
      // Recomputed after the adjustment lands, so the reduction is the server's
      // arithmetic rather than the client's guess at it.
      const before = tab.adjustments.slice(0, -1);
      const reduction =
        computeBill({
          lines: tab.lines.map((line) => ({
            lineId: line.id,
            ownerParticipantId: line.ownerParticipantId,
            unitPriceDram: line.unitPriceDram,
            quantity: line.quantity,
            isVoided: line.status === 'voided',
            isSplitAcrossParticipants: line.isShared || line.isTableAttributed,
            shareParticipantIds: [],
          })),
          adjustments: before.map((a) => ({
            lineId: a.lineId,
            percent: a.percent,
            amountDram: a.amountDram,
          })),
          participants: [],
          serviceChargePercent: SERVICE_CHARGE_PERCENT,
          paidDram: tab.paidDram,
        }).bill.subtotalDram - totalsFor(tab).subtotalDram;

      const applied: TabAdjustment = { ...record, reductionDram: Math.max(0, reduction) };
      tab.adjustments[tab.adjustments.length - 1] = applied;
      pushEvent(tab, 'adjustmentAdded', at);
      return settle(applied);
    },

    async recordCashPayment(command: RecordCashPaymentCommand): Promise<PaymentResult> {
      const tab = requireTab(command.tabId);
      const at = now();
      const before = totalsFor(tab);

      // Refused, with the real balance on the refusal. The waiter is standing at
      // the table holding notes and that number is the whole point.
      if (command.amountDram > before.remainingDram) {
        throw new PaymentExceedsRemainingError({
          url: `/api/tabs/${tab.id}/payments/cash`,
          tabId: tab.id,
          remainingDram: before.remainingDram,
          requestedDram: command.amountDram,
        });
      }

      // The tip is added to what the venue holds, never to what the tab owes.
      tab.paidDram += command.amountDram;
      tab.tipDram += command.tipDram;
      tab.settlementModeLocked = true;
      const after = totalsFor(tab);
      const closed = after.remainingDram === 0;
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
        totals: after,
        tabClosed: closed,
        // Closing the tab closes the sitting; freeing the table stays a waiter's
        // explicit action, because physical and financial state are independent.
        tableSessionClosed: closed,
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
      pushEvent(tab, 'tabAbandoned', at);
      return settle({ tabId: tab.id, writtenOffDram: written, totals: totalsFor(tab) });
    },
  };
}
