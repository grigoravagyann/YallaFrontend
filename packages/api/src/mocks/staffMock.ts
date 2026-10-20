import type { DerivedTableState, FloorPlanData } from '../contracts/tableFloor';
import { cafeFloorPlan } from './roomFloors';
import type { Menu } from '../contracts/menu';
import {
  ConcurrencyConflictError,
  InvalidTransitionError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../errors';
import {
  LineAlreadyPaidError,
  OrderGuestUnavailableError,
  TabNotAcceptingOrdersError,
  PaymentExceedsRemainingError,
  ReservationNotStartedError,
  TableNotSeatedError,
  TabAdmissionDecidedError,
} from '../contracts/errors';
import {
  ADMITTED,
  type FloorChangeSignal,
  type TabAdmission,
  type TabAwaitingAdmission,
} from '../contracts/admission';
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
  OrderQueueLine,
  OrderStatus,
  PaymentResult,
  PlaceOrderCommand,
  OpenTabForStaffCommand,
  PlaceOrderResult,
  ReassignHostCommand,
  RecordCashPaymentCommand,
  ServiceRequest,
  SetOrderStatusCommand,
  StaffTab,
  TabAdjustment,
  TabEvent,
  TabLine,
  TabParticipantStatusCode,
  VoidLineCommand,
} from '../contracts/ordering';
import { voidReasonText } from '../contracts/ordering';
import {
  APPROVAL_EXPIRED_CODE,
  EARLIER_GUEST_WINDOW_MINUTES,
  waitsOnEarlierGuestInApp,
  type ApprovalTrigger,
  type AwaitingApproval,
  type ConsoleBooking,
  type DecideReservationCommand,
  type DeclineReason,
  type NextBookingContext,
  type PreviousBookingContext,
} from '../contracts/approvals';
import type {
  ReleaseReservationCommand,
  ReservationReleaseResult,
  StaffGateway,
} from '../staffGateway';
import { answerWindowClosed, approvalExpiryFor, localDateAndTime } from './approvalWindow';
import type { Photo } from '../contracts/menuAdmin';
import { mockMenuFor } from './menu';
import { mockBranchMenu, mockPhoto } from './menuDetail';
import { computeBill, percentOf, type BillingLine } from './billing';

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
  /**
   * Booking times on the floor, for mock mode: a request on another day that
   * waits for the guest before — who booked on the web, so the floor decides
   * and rings them — and a party that promised to free its table before the
   * next booking. Off in tests, which read the room as it always was.
   */
  readonly seedBookingTimes?: boolean;
  /**
   * More people on the first seeded tab, beside Anahit and Karen, in a state a
   * waiter cannot order for: still waiting for the host, or taken off. For the
   * per-line "who" rules; off by default.
   */
  readonly extraGuests?: readonly {
    readonly displayName: string;
    readonly status: 'pendingApproval' | 'removed';
  }[];
  /**
   * Who the tablet's orders are sent by, as the server names them on a kitchen
   * ticket (`placedByName`, floor tablet gap 2). The mock has no signed-in
   * person of its own, so it stands in for one; a waiter from the staff
   * fixture by default.
   */
  readonly staffName?: string;
  /**
   * A busy pass, for mock mode: more than four tickets, late ones, notes on
   * dishes with allergens, one from the app and one ready, so the kitchen board
   * shows its states. Off in tests, which read the room as it always was.
   */
  readonly seedKitchen?: boolean;
  /**
   * Unverified guests on the floor (2026-10-20): two tables a scan seated with
   * no proved number, waiting for a waiter to let them order — table 8 six
   * minutes ago, table 5 two — and a booking made without a verified number
   * among the requests, at a branch that approves those first. For mock mode
   * and for the admission tests; off otherwise.
   */
  readonly seedUnverifiedGuests?: boolean;
  /**
   * Whether a staff session is signed in now. When given, every staff read
   * and write answers 401 without one, as the server does with no token — so
   * a test can see a request that went out under the PIN gate (FT4 review S6).
   */
  readonly signedIn?: () => boolean;
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
  /** The next booking's guest promised to free the table by this. */
  nextReservationPromisedFreeByUtc: string | null;
  /** The party sitting here now promised to have left by this. */
  sittingPromisedFreeByUtc: string | null;
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
  /** The waiter who sent it; null for a diner's own order from the app. */
  readonly placedByName: string | null;
  /**
   * The ticket's lines when there is no tab behind them: the busy pass seeded
   * for mock mode (`seedKitchen`) is tickets only.
   */
  readonly ticketLines?: readonly OrderQueueLine[];
}

/** A line, plus the owner the wire only carries as a share snapshot. */
type MockLine = TabLine & { readonly ownerParticipantId: string | null };

interface MockParticipant {
  readonly id: string;
  readonly displayName: string | null;
  readonly isHost: boolean;
  /** Approved unless a test seeded somebody else (`extraGuests`). */
  readonly status: TabParticipantStatusCode;
  /** The photo of the account they scanned in with, when it has one. */
  readonly photo: Photo | null;
  /**
   * Cash a waiter recorded as handed over by this person — the ledger their
   * share is settled against. A payment with nobody named counts only on the tab.
   */
  paidDram: number;
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
  /** Whether the table may order yet: a scan with no proved number waits for a waiter. */
  admission: TabAdmission;
  /** The scan itself seated the table: rejecting the tab frees it. */
  readonly seatedByScan: boolean;
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
  /** Booked without a proved number: "number not verified" on the floor. */
  readonly phoneUnverified?: boolean;
}

/**
 * A booking waiting for somebody on the floor, as the server keeps one.
 *
 * `arrivesAtUtc` is when the diner sent it: the list leaves it out before then,
 * so a request can turn up while the floor is open and the tablet's chime has
 * something to announce. The table context the awaiting route answers is held
 * as the fixture wrote it, except who is sitting there now — that is read off
 * the table, so freeing it makes "Sitting now" go.
 */
interface MockAwaiting {
  readonly id: string;
  readonly code: string;
  readonly tableId: string;
  readonly guestName: string;
  readonly guestPhone: string;
  readonly partySize: number;
  readonly startUtc: string;
  readonly arrivesAtUtc: string;
  readonly approvalExpiresAtUtc: string | null;
  readonly because: ApprovalTrigger;
  readonly note: string | null;
  readonly previousBooking: PreviousBookingContext | null;
  readonly nextBooking: NextBookingContext | null;
  /** This booking's guest promised to free the table by then — a booking follows. */
  readonly promisedFreeByUtc?: string | null;
  /** The time the floor asks the guest before to have left by. */
  readonly earlierGuestFreeByUtc?: string | null;
  /**
   * The guest before answers it themselves, in the app — never listed here and
   * never the floor's to decide. Absent: the floor's.
   */
  readonly awaitsEarlierGuestAnswer?: boolean;
  /** Booked without a proved number. */
  readonly phoneUnverified?: boolean;
  status: 'pendingApproval' | 'confirmed' | 'cancelledByVenue';
  declinedBecause: DeclineReason | null;
  reason: string | null;
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

/**
 * The cafe menu with each dish's allergens, from the same detail fixture the
 * console's menu reads, so the kitchen board warns about what the venue wrote.
 */
function withAllergens(menu: Menu, branchId: string): Menu {
  const detail = new Map(
    mockBranchMenu(branchId, 'cafe').categories.flatMap((category) =>
      category.items.map((item) => [item.id, item.allergens] as const),
    ),
  );
  return {
    ...menu,
    sections: menu.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({ ...item, allergens: detail.get(item.id) || null })),
    })),
  };
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
  /** No token, no answer: the server's 401, when the caller says who is signed in. */
  const requireSession = (url: string) => {
    if (options.signedIn && !options.signedIn()) throw new UnauthorizedError({ url });
  };
  const racing = new Set(options.raceOnTables ?? []);
  const churning = new Set(options.churnOnTables ?? []);

  /**
   * The room this mock serves, adopted from the first branch that asks for it.
   *
   * Hard-coding the fixture's own branch id would tie this mock to whichever id
   * another mock happens to hand the signed-in waiter, and the two would drift
   * the first time either changed. The tables are the cafe fixture's either way;
   * only the id follows the caller.
   */
  let branchId = options.branchId ?? cafeFloorPlan.branchId;
  // The fixture has no branch name — it is a tables fixture — and the floor
  // screen titles itself from one. Without it the header says "Loading…" for
  // the whole session, which is exactly the kind of small permanent lie this
  // screen must not tell.
  const plan: FloorPlanData = { ...cafeFloorPlan, branchId, branchName: 'Lumen · Northern Avenue' };
  const menu: Menu = withAllergens(mockMenuFor(branchId, 'cafe'), branchId);
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
  /** Staff tab openings by command id, so a second tap answers with the same tab. */
  const openedTabs = new Map<string, string>();
  /** Cash by `clientCommandId`: a retry gets the first payment back, as on the server. */
  const payments = new Map<string, PaymentResult>();
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
      nextReservationPromisedFreeByUtc: null,
      sittingPromisedFreeByUtc: null,
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

  /**
   * Two bookings waiting for the floor.
   *
   * The first is the case the feature exists for: a two-top for later today at
   * table 7, where a party of four that booked before it is still sitting. The
   * tablet has to show who they are and how to ring them, and the window is
   * fixed off the mock's start — made two minutes before it, so thirteen of
   * the fifteen minutes are left on a frozen clock. The second, at table 4,
   * arrives forty-five seconds in. A third, a party of eight at table 11 this
   * evening, waits with no clock at all — the large-party rule — and lists
   * after every request that has one, as the server lists it.
   */
  const awaiting = new Map<string, MockAwaiting>();
  const sitting = tables.get('t7');
  if (sitting) {
    sitting.partySize = 4;
    const madeAt = new Date(start.getTime() - 2 * 60_000);
    const startUtc = minutesFrom(start, 105);
    const seatedAt = new Date(sitting.seatedAtUtc ?? iso(start));
    awaiting.set('res-await-1', {
      id: 'res-await-1',
      code: 'Y3107',
      tableId: 't7',
      guestName: 'Լիլիթ Մանուկյան',
      guestPhone: '+37493217788',
      partySize: 2,
      startUtc,
      arrivesAtUtc: iso(madeAt),
      approvalExpiresAtUtc: approvalExpiryFor(madeAt, startUtc),
      because: 'shortNotice',
      note: null,
      previousBooking: {
        startUtc: iso(new Date(seatedAt.getTime() - 5 * 60_000)),
        partySize: 4,
        guestName: 'Anna Petrosyan',
        guestPhone: '+37477889900',
        status: 'seated',
      },
      nextBooking: { startUtc: minutesFrom(start, 105 + 150), partySize: 3 },
      status: 'pendingApproval',
      declinedBecause: null,
      reason: null,
    });
  }
  if (tables.has('t4')) {
    const madeAt = new Date(start.getTime() + 45_000);
    const startUtc = minutesFrom(start, 50);
    awaiting.set('res-await-2', {
      id: 'res-await-2',
      code: 'Y3112',
      tableId: 't4',
      guestName: 'Karen Avetisyan',
      guestPhone: '+37491445566',
      partySize: 3,
      startUtc,
      arrivesAtUtc: iso(madeAt),
      approvalExpiresAtUtc: approvalExpiryFor(madeAt, startUtc),
      because: 'shortNotice',
      note: 'By the window if you can.',
      previousBooking: null,
      nextBooking: null,
      status: 'pendingApproval',
      declinedBecause: null,
      reason: null,
    });
  }

  if (tables.has('t11')) {
    awaiting.set('res-await-3', {
      id: 'res-await-3',
      code: 'Y3120',
      tableId: 't11',
      guestName: 'Gor Harutyunyan',
      guestPhone: '+37494556677',
      partySize: 8,
      startUtc: minutesFrom(start, 240),
      arrivesAtUtc: minutesFrom(start, -30),
      approvalExpiresAtUtc: null,
      because: 'largeParty',
      note: 'A birthday dinner.',
      previousBooking: null,
      nextBooking: null,
      status: 'pendingApproval',
      declinedBecause: null,
      reason: null,
    });
  }

  /*
   * A busy pass, for mock mode only (`seedKitchen`): tickets with no tab behind
   * them, at tables the floor need not know about. Oldest first, so the board
   * shows late, waiting and fresh, a ticket nobody has sent yet, one from the
   * app, and one ready for its waiter.
   */
  if (options.seedKitchen) {
    const labels = plan.tables.map((table) => table.label);
    const tickets: readonly {
      readonly minutesAgo: number;
      readonly status: OrderStatus;
      readonly by: string | null;
      readonly lines: readonly (readonly [string, number, string | null])[];
    }[] = [
      {
        minutesAgo: 16,
        status: 'inKitchen',
        by: 'Ani Hakobyan',
        lines: [
          ['matnakash-eggs', 2, 'Մեկը՝ առանց սոխի'],
          ['croissant', 1, null],
        ],
      },
      {
        minutesAgo: 13,
        status: 'inKitchen',
        by: 'Davit Manukyan',
        lines: [
          ['gata', 2, null],
          ['napoleon', 1, 'Ծննդյան մոմ'],
        ],
      },
      {
        // From the app, and late: the widest age badge beside the sender.
        minutesAgo: 14,
        status: 'inKitchen',
        by: null,
        lines: [
          ['avocado-toast', 1, 'Առանց չիլիի'],
          ['granola', 1, null],
        ],
      },
      { minutesAgo: 7, status: 'ready', by: 'Ani Hakobyan', lines: [['cheesecake', 2, null]] },
      {
        minutesAgo: 4,
        status: 'inKitchen',
        by: 'Davit Manukyan',
        lines: [
          ['cappuccino', 3, null],
          ['croissant', 2, null],
        ],
      },
      {
        minutesAgo: 2,
        status: 'inKitchen',
        by: 'Ani Hakobyan',
        lines: [['granola', 1, 'Մեղրը՝ առանձին']],
      },
      // From the app, old and never sent on by a waiter: not the kitchen's to cook, so never late
      // on its board. A waiter's own order cannot sit here; it reaches the kitchen when it is sent.
      { minutesAgo: 18, status: 'new', by: null, lines: [['lemonade', 2, null]] },
    ];
    tickets.forEach((ticket, index) => {
      const orderId = id('order');
      orders.set(orderId, {
        id: orderId,
        tabId: id('tab-kitchen'),
        tableLabel: labels[(index + 3) % labels.length] ?? String(index + 1),
        status: ticket.status,
        placedAtUtc: minutesFrom(start, -ticket.minutesAgo),
        lineIds: [],
        placedByName: ticket.by,
        ticketLines: ticket.lines.flatMap(([itemId, quantity, note]) => {
          const item = menuItems.get(itemId);
          return item
            ? [{ lineId: id('line'), menuItemId: item.id, name: item.name, quantity, note }]
            : [];
        }),
      });
    });
  }

  /*
   * Booking times, for mock mode only. Tomorrow at table 9, a booking for the
   * table somebody booked shortly before — on the web, so no push reaches
   * them: the floor rings them and decides, with two hours to do it from when
   * the booking was made (reservations.md §3e), as the guest would have in the
   * app. And the
   * party at the first occupied table promised, when it booked, to be gone
   * five minutes before the booking after it.
   */
  if (options.seedBookingTimes) {
    const askTable = tables.has('t9') ? 't9' : [...tables.keys()][0];
    if (askTable) {
      const madeAt = new Date(start.getTime() - 5 * 60_000);
      const startUtc = minutesFrom(start, 26 * 60);
      awaiting.set('res-await-4', {
        id: 'res-await-4',
        code: 'Y3133',
        tableId: askTable,
        guestName: 'Արմեն Սահակյան',
        guestPhone: '+37495112233',
        partySize: 2,
        startUtc,
        arrivesAtUtc: iso(madeAt),
        // The floor's question for another day: two hours, never past either
        // booking's start — both are a day away here.
        approvalExpiresAtUtc: new Date(
          madeAt.getTime() + EARLIER_GUEST_WINDOW_MINUTES * 60_000,
        ).toISOString(),
        because: 'earlierGuestConsent',
        awaitsEarlierGuestAnswer: false,
        note: null,
        previousBooking: {
          startUtc: minutesFrom(start, 26 * 60 - 105),
          partySize: 2,
          guestName: 'Mariam Hovhannisyan',
          guestPhone: '+37477445566',
          status: 'confirmed',
          promisedFreeByUtc: null,
        },
        nextBooking: { startUtc: minutesFrom(start, 26 * 60 + 120), partySize: 4 },
        promisedFreeByUtc: minutesFrom(start, 26 * 60 + 115),
        earlierGuestFreeByUtc: minutesFrom(start, 26 * 60 - 5),
        status: 'pendingApproval',
        declinedBecause: null,
        reason: null,
      });
    }
    const busy = [...tables.values()].find(
      (state) => state.physicalStatus === 'occupied' && state.tableId !== 't7',
    );
    if (busy) {
      const next = minutesFrom(start, 55);
      const reservation: MockReservation = {
        id: id('res'),
        tableId: busy.tableId,
        code: 'Y3141',
        guestName: 'Sona Karapetyan',
        guestPhone: '+37493778899',
        partySize: 2,
        startUtc: next,
        released: false,
      };
      reservations.set(reservation.id, reservation);
      busy.nextReservationId = reservation.id;
      busy.nextReservationStartUtc = next;
      busy.nextReservationPartySize = 2;
      busy.freeUntilUtc = minutesFrom(start, 50);
      // The party sitting here promised, when it booked, to be gone by then.
      busy.sittingPromisedFreeByUtc = minutesFrom(start, 50);
      // And the next one promised to leave before the booking after it.
      busy.nextReservationPromisedFreeByUtc = minutesFrom(start, 55 + 85);
    }
  }

  function openTab(tableId: string, tableLabel: string, at: Date): MockTab {
    // The host scanned in signed in to an account with a photo; the guest is
    // a walk-in with none, which is the common case and draws initials.
    const host: MockParticipant = {
      id: id('p'),
      displayName: 'Anahit',
      isHost: true,
      status: 'approved',
      photo: mockPhoto('avatar-anahit'),
      paidDram: 0,
    };
    const other: MockParticipant = {
      id: id('p'),
      displayName: 'Karen',
      isHost: false,
      status: 'approved',
      photo: null,
      paidDram: 0,
    };
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
      // The host scanned signed in with a proved number: let in on the spot.
      admission: { ...ADMITTED, admittedBecause: 'verifiedHost', decidedAtUtc: iso(at) },
      seatedByScan: false,
    };
    tabs.set(tab.id, tab);
    return tab;
  }

  /**
   * A table a scan seated with no proved number behind it: occupied by the
   * scan, its tab waiting for a waiter. What a photographed QR code scanned
   * from home looks like, and what a real party without a verified number
   * looks like too — the waiter is the one who can tell them apart.
   */
  function seatByUnverifiedScan(
    tableId: string,
    at: Date,
    people: readonly (string | null)[],
  ): MockTab | null {
    const state = tables.get(tableId);
    if (!state || state.physicalStatus !== 'free') return null;
    const participants = people.map((displayName, index): MockParticipant => ({
      id: id('p'),
      displayName,
      isHost: index === 0,
      status: 'approved',
      photo: null,
      paidDram: 0,
    }));
    const tab: MockTab = {
      id: id('tab'),
      tableId,
      tableLabel: label(tableId),
      status: 'open',
      openedAtUtc: iso(at),
      closedAtUtc: null,
      paidDram: 0,
      tipDram: 0,
      lines: [],
      adjustments: [],
      participants,
      hostParticipantId: participants[0]?.id ?? null,
      settlementModeLocked: false,
      sequence: 1,
      events: [],
      admission: {
        status: 'awaiting',
        admittedBecause: null,
        decidedAtUtc: null,
        decidedByStaffId: null,
        tableFreed: null,
      },
      seatedByScan: true,
    };
    tabs.set(tab.id, tab);
    state.physicalStatus = 'occupied';
    state.sessionId = id('session');
    state.seatedAtUtc = iso(at);
    state.partySize = null;
    state.tabId = tab.id;
    state.version += 1;
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

  if (options.seedUnverifiedGuests) {
    // Two phantom-or-real tables, oldest first on the rail.
    seatByUnverifiedScan('t8', new Date(start.getTime() - 6 * 60_000), ['Արամ', null]);
    seatByUnverifiedScan('t5', new Date(start.getTime() - 2 * 60_000), [null]);
    // The booking nobody has turned up for was made without a verified number.
    const late = tables.get('t6')?.nextReservationId;
    const lateBooking = late ? reservations.get(late) : undefined;
    if (lateBooking) reservations.set(lateBooking.id, { ...lateBooking, phoneUnverified: true });
    // And a web booking without a verified number, waiting for the venue.
    if (tables.has('t9')) {
      awaiting.set('res-await-5', {
        id: 'res-await-5',
        code: 'Y3155',
        tableId: 't9',
        guestName: 'Էլեն Վարդանյան',
        guestPhone: '+37498765432',
        partySize: 4,
        startUtc: minutesFrom(start, 180),
        arrivesAtUtc: minutesFrom(start, -10),
        // The sooner of a day after it was made and two hours before it starts.
        approvalExpiresAtUtc: minutesFrom(start, 60),
        because: 'unverifiedPhone',
        phoneUnverified: true,
        note: null,
        previousBooking: null,
        nextBooking: null,
        status: 'pendingApproval',
        declinedBecause: null,
        reason: null,
      });
    }
  }

  const seededTab = [...tabs.values()][0];
  for (const guest of options.extraGuests ?? []) {
    seededTab?.participants.push({
      id: id('p'),
      displayName: guest.displayName,
      isHost: false,
      status: guest.status,
      photo: null,
      paidDram: 0,
    });
  }
  if (seededTab) {
    const seedOrder: MockOrder = {
      id: id('order'),
      tabId: seededTab.id,
      tableLabel: seededTab.tableLabel,
      status: 'inKitchen',
      placedAtUtc: minutesFrom(start, -12),
      lineIds: [],
      placedByName: 'Davit Manukyan',
    };
    const [host, guest] = seededTab.participants;
    // Two things for the table, and one drink that is the guest's own, so the
    // guest has a share of their own to ask to pay.
    for (const [itemId, quantity, owner] of [
      ['cappuccino', 2, null],
      ['gata', 1, null],
      ['lemonade', 1, guest?.id ?? null],
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
        isTableAttributed: owner === null,
        ownerParticipantId: owner,
        participantId: null,
        orderedByName: null,
        onBehalfOfParticipantId: owner,
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
      requestedByParticipantId: guest?.id ?? null,
      bill: null,
    });

    // And two people asking to pay from the pay sheet: the host the whole
    // bill with a 5% tip, then the guest their own share with 10%, so the tab
    // has a choice of which one the keypad opens on. The amounts are the
    // server's rule with nothing paid yet: the balance with the service charge
    // and the tip on the items before it; the guest's share with its service
    // and the tip on their own items.
    const { bill: owed, shares } = billFor(seededTab);
    const billRequestId = id('req');
    serviceRequests.set(billRequestId, {
      id: billRequestId,
      tabId: seededTab.id,
      tableLabel: seededTab.tableLabel,
      reason: 'bill',
      note: null,
      requestedAtUtc: minutesFrom(start, -1),
      waitingMinutes: 1,
      acknowledgedAtUtc: null,
      requestedByParticipantId: host?.id ?? null,
      bill: {
        scope: 'whole',
        amountDram: owed.remainingDram,
        tipPercent: 5,
        tipDram: percentOf(owed.subtotalDram, 5),
      },
    });

    const guestShare = shares.find((share) => share.participantId === guest?.id);
    if (guest && guestShare && guestShare.shareDram > 0) {
      const shareRequestId = id('req');
      serviceRequests.set(shareRequestId, {
        id: shareRequestId,
        tabId: seededTab.id,
        tableLabel: seededTab.tableLabel,
        reason: 'bill',
        note: null,
        requestedAtUtc: iso(new Date(start.getTime() - 20_000)),
        waitingMinutes: 0,
        acknowledgedAtUtc: null,
        requestedByParticipantId: guest.id,
        bill: {
          scope: 'mine',
          amountDram: Math.min(guestShare.shareDram - guestShare.paidDram, owed.remainingDram),
          tipPercent: 10,
          tipDram: percentOf(guestShare.personalDram, 10),
        },
      });
    }
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
            ? approvedOn(tab)
                .slice(0, Math.max(1, line.sharedWithCount))
                .map((p) => p.id)
            : [],
      })),
      adjustments: tab.adjustments.map((adjustment) => ({
        lineId: adjustment.lineId,
        percent: adjustment.percent,
        amountDram: adjustment.amountDram,
      })),
      // Nobody still waiting to be let on is part of the bill.
      participants: tab.participants
        .filter((person) => person.status !== 'pendingApproval')
        .map((person) => ({
          participantId: person.id,
          displayName: person.displayName,
          isHost: person.isHost,
          status: person.status,
          paidDram: person.paidDram,
        })),
      serviceChargePercent: SERVICE_CHARGE_PERCENT,
      paidDram: tab.paidDram,
    });
  }

  /** Who a shared line splits across: the people the host has let on. */
  function approvedOn(tab: MockTab): readonly MockParticipant[] {
    return tab.participants.filter((person) => person.status === 'approved');
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
        status: person.status,
        canOrder: true,
        canOrderNow:
          person.status === 'approved' &&
          tab.status === 'open' &&
          tab.admission.status !== 'awaiting',
        canSeeTableTotal: true,
        photo: person.photo,
      })),
      totals: bill,
      // What `recordCashPayment` took as tips, beside the totals, never in them.
      tipsDram: tab.tipDram,
      serviceChargePercent: SERVICE_CHARGE_PERCENT,
      // As `GET /api/tabs/{id}/participants`: the lines and every adjustment,
      // from the same moment as the totals.
      lines: tab.lines.map(({ ownerParticipantId: _owner, ...line }) => ({
        ...line,
        lineTotalDram: line.status === 'voided' ? 0 : line.unitPriceDram * line.quantity,
      })),
      linesKnown: true,
      adjustments: [...tab.adjustments],
      adjustmentsKnown: true,
      admission: tab.admission,
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

  function record(
    state: MockTableState,
    from: TableStatus,
    at: Date,
    about?: {
      readonly tabId: string;
      readonly signal: FloorChangeSignal;
      readonly reason?: string;
    },
  ): void {
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
      reason: about?.reason ?? '',
      ...(about ? { tabId: about.tabId, signal: about.signal } : {}),
    });
  }

  /** The id a waiter acts under in the mock: there is no signed-in person of its own. */
  const MOCK_STAFF_ID = 'staff-mock-waiter';

  /** Admission commands by command id: a retry answers the tab as it stands. */
  const admissionCommands = new Map<string, { readonly kind: string; readonly tabId: string }>();

  function admissionCommand(kind: 'admit' | 'reject', tabId: string, commandId: string): void {
    const url = `/api/tabs/${tabId}/${kind}`;
    if (!commandId) {
      throw new ValidationError({
        status: 400,
        url,
        problem: {
          type: '',
          title: 'Invalid request',
          status: 400,
          detail: 'clientCommandId is required.',
          code: 'invalid-request',
          traceId: 'mock',
          context: { field: 'clientCommandId' },
        },
      });
    }
    const seen = admissionCommands.get(commandId);
    if (seen && (seen.kind !== kind || seen.tabId !== tabId)) {
      throw new ConcurrencyConflictError({
        url,
        problem: {
          type: '',
          title: 'Conflict',
          status: 409,
          detail: 'This command id was already used for another command.',
          code: 'client-command-id-in-use',
          traceId: 'mock',
        },
      });
    }
    admissionCommands.set(commandId, { kind, tabId });
  }

  /** Let a waiting tab order: a waiter's tap on Admit. */
  function admit(tab: MockTab, because: 'waiter', at: Date): void {
    tab.admission = {
      status: 'admitted',
      admittedBecause: because,
      decidedAtUtc: iso(at),
      decidedByStaffId: MOCK_STAFF_ID,
      tableFreed: null,
    };
    pushEvent(tab, 'tabAdmitted', at);
    const state = tables.get(tab.tableId);
    if (state) record(state, state.physicalStatus, at, { tabId: tab.id, signal: 'tabAdmitted' });
  }

  function orderEntry(order: MockOrder): OrderQueueEntry {
    const tab = tabs.get(order.tabId);
    const lines = (tab?.lines ?? []).filter((line) => order.lineIds.includes(line.id));
    const ticketLines =
      order.ticketLines ??
      lines.map((line) => ({
        lineId: line.id,
        menuItemId: line.menuItemId,
        name: line.name,
        quantity: line.quantity,
        note: line.note,
        // As the server: the line's guest, absent on a shared line.
        onBehalfOfParticipantId:
          line.isShared || line.isTableAttributed ? null : line.onBehalfOfParticipantId,
      }));
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
      lines: ticketLines,
      placedByName: order.placedByName,
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

  /**
   * The server's sweep, run on read: a request whose window closed, or whose
   * start passed, with nobody answering is declined for want of an answer.
   */
  function sweepAwaiting(at: Date): void {
    for (const request of awaiting.values()) {
      if (request.status !== 'pendingApproval') continue;
      if (answerWindowClosed(request.approvalExpiresAtUtc, request.startUtc, at)) {
        request.status = 'cancelledByVenue';
        // The guest before let their two hours in the app run out: said as
        // theirs. Anything the floor left unanswered — its own two hours to
        // ring them included — is the venue's "no answer".
        request.declinedBecause = waitsOnEarlierGuestInApp(
          request.because,
          request.awaitsEarlierGuestAnswer,
        )
          ? 'earlierGuestNoAnswer'
          : 'noAnswer';
      }
    }
  }

  function decidedBooking(request: MockAwaiting): ConsoleBooking {
    const pending = request.status === 'pendingApproval';
    return {
      id: request.id,
      code: request.code,
      branchId,
      guestName: request.guestName,
      guestPhone: request.guestPhone,
      partySize: request.partySize,
      tableLabel: label(request.tableId),
      ...localDateAndTime(request.startUtc, plan.timeZoneId),
      status: request.status,
      awaitingApprovalBecause: pending ? request.because : null,
      approvalExpiresAtUtc: pending ? request.approvalExpiresAtUtc : null,
      awaitsEarlierGuestAnswer: pending && request.awaitsEarlierGuestAnswer === true,
      note: request.note,
      phoneUnverified: request.phoneUnverified === true,
    };
  }

  /** Load (404), then the window (409, too late), then the state (409): the server's order. */
  function decideAwaiting(command: DecideReservationCommand, approve: boolean): ConsoleBooking {
    const at = now();
    const url = `/api/reservations/${command.reservationId}/${approve ? 'approve' : 'reject'}`;
    const request = awaiting.get(command.reservationId);
    if (!request || iso(at) < request.arrivesAtUtc) throw new NotFoundError({ url });

    const conflict = (code: string, detail: string) =>
      new ConcurrencyConflictError({
        url,
        problem: { type: '', title: 'Conflict', status: 409, detail, code, traceId: 'mock' },
      });

    if (
      request.status === 'pendingApproval' &&
      answerWindowClosed(request.approvalExpiresAtUtc, request.startUtc, at)
    ) {
      sweepAwaiting(at);
      throw conflict(
        APPROVAL_EXPIRED_CODE,
        `The answer window for ${request.code} has closed; the guest has been told the venue could not confirm in time.`,
      );
    }
    // The guest before answers it in the app: not the floor's to decide.
    if (
      request.status === 'pendingApproval' &&
      waitsOnEarlierGuestInApp(request.because, request.awaitsEarlierGuestAnswer)
    ) {
      throw conflict(
        'reservation-awaiting-earlier-guest',
        `${request.code} waits on the earlier guest's answer in the app.`,
      );
    }
    if (request.status !== 'pendingApproval') {
      // `DomainStateException`'s code on the server: the booking is not pending.
      throw conflict(
        'conflicting-state',
        `Only a pending reservation can be ${approve ? 'confirmed' : 'rejected'}; ${request.code} is ${
          request.status === 'confirmed' ? 'Confirmed' : 'CancelledByVenue'
        }.`,
      );
    }

    if (approve) {
      request.status = 'confirmed';
      // The booking now holds its table: the floor shows it like any other.
      reservations.set(request.id, {
        id: request.id,
        tableId: request.tableId,
        code: request.code,
        guestName: request.guestName,
        guestPhone: request.guestPhone,
        partySize: request.partySize,
        startUtc: request.startUtc,
        released: false,
      });
      const state = tables.get(request.tableId);
      const current = state?.nextReservationStartUtc ?? null;
      if (
        state &&
        (current === null ||
          new Date(current).getTime() < at.getTime() ||
          request.startUtc < current)
      ) {
        state.nextReservationId = request.id;
        state.nextReservationStartUtc = request.startUtc;
        state.nextReservationPartySize = request.partySize;
        if (state.physicalStatus === 'free') state.freeUntilUtc = request.startUtc;
        state.version += 1;
      }
    } else {
      request.status = 'cancelledByVenue';
      request.declinedBecause = 'staffDeclined';
      request.reason = command.reason?.trim() || null;
    }
    return decidedBooking(request);
  }

  // --- The gateway ----------------------------------------------------------

  return {
    async getFloor(requested): Promise<StaffFloor | null> {
      requireSession('/api/branches/floor');
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
          nextReservationPromisedFreeByUtc: state.nextReservationPromisedFreeByUtc,
          sittingPromisedFreeByUtc: state.sittingPromisedFreeByUtc,
          nextReservationPhoneUnverified:
            (state.nextReservationId
              ? reservations.get(state.nextReservationId)?.phoneUnverified
              : undefined) === true,
          openTabAwaitingAdmission:
            state.tabId !== null && tabs.get(state.tabId)?.admission.status === 'awaiting',
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
      requireSession(`/api/branches/${branchId}/tables/${command.tableId}`);
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

      // A command that says it waited in a queue must say what it expected
      // (`TableStateService.RequirePrecondition`, a 400 on the server). Without
      // this the mock let a resend that broke the rule through, and the
      // tablet's "…anyway" shipped failing against the real API (FT4 review B1).
      if (command.queued && !command.precondition) {
        throw new ValidationError({
          url: `/api/branches/${branchId}/tables/${command.tableId}`,
          status: 400,
          problem: {
            type: 'about:blank',
            title: 'Invalid request',
            status: 400,
            detail: 'A queued command must carry the status it expected the table to be in.',
            code: 'invalid-request',
            traceId: 'mock',
            context: { field: 'expectedFromStatus' },
          },
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
        // A party the waiter sat down has no tab until somebody scans or the
        // waiter starts one — the real backend's behaviour too.
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

      // The server's rule (FT2 wire): no no-show before the booking's start,
      // and nothing changes when it is refused.
      if (command.outcome === 'noShow' && Date.parse(reservation.startUtc) > now().getTime()) {
        throw new ReservationNotStartedError({
          url: `/api/reservations/${reservation.id}/release`,
          reservationId: reservation.id,
          startUtc: reservation.startUtc,
        });
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

    async listAwaitingApproval(requested): Promise<readonly AwaitingApproval[]> {
      if (requested) branchId = requested;
      const at = now();
      sweepAwaiting(at);
      const listed = [...awaiting.values()]
        .filter(
          (request) =>
            request.status === 'pendingApproval' &&
            request.arrivesAtUtc <= iso(at) &&
            // Waiting on the guest before's own answer: theirs, not on this list.
            !waitsOnEarlierGuestInApp(request.because, request.awaitsEarlierGuestAnswer),
        )
        // The server's order: those with a deadline, soonest deadline first,
        // then those with none, by start.
        .sort((a, b) => {
          if (a.approvalExpiresAtUtc !== null && b.approvalExpiresAtUtc !== null) {
            return (
              a.approvalExpiresAtUtc.localeCompare(b.approvalExpiresAtUtc) ||
              a.startUtc.localeCompare(b.startUtc)
            );
          }
          if (a.approvalExpiresAtUtc !== null) return -1;
          if (b.approvalExpiresAtUtc !== null) return 1;
          return a.startUtc.localeCompare(b.startUtc);
        })
        .map((request): AwaitingApproval => {
          const table = plan.tables.find((candidate) => candidate.id === request.tableId);
          const state = tables.get(request.tableId);
          return {
            id: request.id,
            code: request.code,
            branchId,
            guestName: request.guestName,
            guestPhone: request.guestPhone,
            partySize: request.partySize,
            tableId: request.tableId,
            tableLabel: label(request.tableId),
            roomName: table?.floorAreaName ?? null,
            startUtc: request.startUtc,
            ...localDateAndTime(request.startUtc, plan.timeZoneId),
            timeZoneId: plan.timeZoneId,
            note: request.note,
            phoneUnverified: request.phoneUnverified === true,
            approvalExpiresAtUtc: request.approvalExpiresAtUtc,
            because: request.because,
            promisedFreeByUtc: request.promisedFreeByUtc ?? null,
            earlierGuestFreeByUtc: request.earlierGuestFreeByUtc ?? null,
            previousBooking: request.previousBooking,
            nextBooking: request.nextBooking,
            currentSitting:
              state?.physicalStatus === 'occupied' && state.seatedAtUtc
                ? { sinceUtc: state.seatedAtUtc, partySize: state.partySize }
                : null,
          };
        });
      return settle(listed);
    },

    async approveReservation(command): Promise<ConsoleBooking> {
      return settle(decideAwaiting(command, true));
    },

    async rejectReservation(command): Promise<ConsoleBooking> {
      return settle(decideAwaiting(command, false));
    },

    // --- Tables waiting to be let in ---------------------------------------

    async listTabsAwaitingAdmission(): Promise<readonly TabAwaitingAdmission[]> {
      requireSession(`/api/branches/${branchId}/tabs/awaiting-admission`);
      return settle(
        [...tabs.values()]
          .filter((tab) => tab.status === 'open' && tab.admission.status === 'awaiting')
          .sort((a, b) => a.openedAtUtc.localeCompare(b.openedAtUtc))
          .map((tab) => {
            const host = tab.participants.find((person) => person.id === tab.hostParticipantId);
            return {
              tabId: tab.id,
              tableId: tab.tableId,
              tableLabel: tab.tableLabel,
              roomName:
                plan.tables.find((table) => table.id === tab.tableId)?.floorAreaName ?? null,
              openedAtUtc: tab.openedAtUtc,
              hostDisplayName: host?.displayName ?? null,
              participantCount: tab.participants.filter((person) => person.status !== 'removed')
                .length,
              sittingSeatedByScan: tab.seatedByScan,
            };
          }),
      );
    },

    async admitTab({ tabId, clientCommandId }): Promise<StaffTab> {
      requireSession(`/api/tabs/${tabId}/admit`);
      const tab = requireTab(tabId);
      admissionCommand('admit', tabId, clientCommandId);
      if (tab.admission.status === 'rejected') {
        throw new TabAdmissionDecidedError({
          url: `/api/tabs/${tabId}/admit`,
          tabId,
          admission: 'rejected',
        });
      }
      if (tab.admission.status === 'awaiting') admit(tab, 'waiter', now());
      return settle(viewTab(tab));
    },

    async rejectTab({ tabId, clientCommandId }): Promise<StaffTab> {
      requireSession(`/api/tabs/${tabId}/reject`);
      const tab = requireTab(tabId);
      admissionCommand('reject', tabId, clientCommandId);
      if (tab.admission.status === 'admitted') {
        throw new TabAdmissionDecidedError({
          url: `/api/tabs/${tabId}/reject`,
          tabId,
          admission: 'admitted',
        });
      }
      if (tab.admission.status === 'awaiting') {
        // Orders keyed on it: somebody is there. The server refuses the reject.
        if (tab.lines.length > 0) {
          throw new ConcurrencyConflictError({
            url: `/api/tabs/${tabId}/reject`,
            problem: {
              type: '',
              title: 'Conflicting state',
              status: 409,
              detail: 'Orders were taken on this tab; admit it instead.',
              code: 'conflicting-state',
              traceId: 'mock',
            },
          });
        }
        const at = now();
        const state = tables.get(tab.tableId);
        const freesTable = tab.seatedByScan && state?.tabId === tab.id;
        tab.admission = {
          status: 'rejected',
          admittedBecause: null,
          decidedAtUtc: iso(at),
          decidedByStaffId: MOCK_STAFF_ID,
          tableFreed: freesTable,
        };
        tab.status = 'closed';
        tab.closedAtUtc = iso(at);
        // Its calls are answered by the waiter who turned it away.
        for (const [requestId, request] of serviceRequests) {
          if (request.tabId === tab.id && request.acknowledgedAtUtc === null) {
            serviceRequests.set(requestId, { ...request, acknowledgedAtUtc: iso(at) });
          }
        }
        pushEvent(tab, 'tabAdmissionRejected', at);
        if (state && state.tabId === tab.id) {
          const from = state.physicalStatus;
          state.tabId = null;
          if (freesTable) {
            // The scan seated it, so nobody is there: the table goes free.
            state.physicalStatus = 'free';
            state.sessionId = null;
            state.seatedAtUtc = null;
            state.partySize = null;
          }
          state.version += 1;
          record(state, from, at, {
            tabId: tab.id,
            signal: 'tabAdmissionRejected',
            reason: freesTable ? 'phantom tab rejected' : '',
          });
        }
      }
      return settle(viewTab(tab));
    },

    // --- The tab ------------------------------------------------------------

    async getStaffTab(tabId): Promise<StaffTab | null> {
      const tab = tabs.get(tabId);
      return settle(tab ? viewTab(tab) : null);
    },

    async getTabLines({ tabId }): Promise<readonly TabLine[]> {
      const tab = tabs.get(tabId);
      return settle(tab ? wireLines(tab) : []);
    },

    async openTabForStaff(command: OpenTabForStaffCommand): Promise<StaffTab> {
      const url = `/api/branches/${command.branchId}/tables/${command.tableId}/open-tab`;
      const replayed = openedTabs.get(command.clientCommandId);
      if (replayed) return settle(viewTab(requireTab(replayed)));

      const state = tables.get(command.tableId);
      if (!state) throw new NotFoundError({ url });
      // A tab hangs off a sitting, exactly as on the server: a free or held
      // table has nobody to bill.
      if (state.physicalStatus !== 'occupied') {
        throw new TableNotSeatedError({ url, tableId: command.tableId });
      }
      // Occupied with no sitting: the party paid in full and is still there.
      // The new bill gets a sitting of its own, for the same people.
      if (!state.sessionId) state.sessionId = id('session');

      // Somebody scanned first, or this is the second tap: that tab.
      const existing = state.tabId ? tabs.get(state.tabId) : undefined;
      if (existing) {
        openedTabs.set(command.clientCommandId, existing.id);
        return settle(viewTab(existing));
      }

      // Nobody on it and no host — staff are not participants.
      const tab: MockTab = {
        id: id('tab'),
        tableId: command.tableId,
        tableLabel: label(command.tableId),
        status: 'open',
        openedAtUtc: iso(now()),
        closedAtUtc: null,
        paidDram: 0,
        tipDram: 0,
        lines: [],
        adjustments: [],
        participants: [],
        hostParticipantId: null,
        settlementModeLocked: false,
        sequence: 1,
        events: [],
        // A waiter opened it, standing at the table: admitted on the spot.
        admission: {
          ...ADMITTED,
          admittedBecause: 'openedByStaff',
          decidedAtUtc: iso(now()),
          decidedByStaffId: MOCK_STAFF_ID,
        },
        seatedByScan: false,
      };
      tabs.set(tab.id, tab);
      state.tabId = tab.id;
      openedTabs.set(command.clientCommandId, tab.id);
      return settle(viewTab(tab));
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
      requireSession(`/api/tabs/${command.tabId}/staff-orders`);
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
        // A waiter's order is in the kitchen the moment it is sent, as on the server.
        status: 'inKitchen',
        placedAtUtc: iso(at),
        lineIds: [],
        placedByName: options.staffName ?? 'Ani Hakobyan',
      };

      // A tab that takes no more orders says why, as the server's `context.status`.
      if (tab.status !== 'open') {
        throw new TabNotAcceptingOrdersError({
          url: `/api/tabs/${tab.id}/staff-orders`,
          tabId: tab.id,
          tabStatus: tab.status,
        });
      }
      // A waiter's order on a waiting tab is taken, and admits nothing: only
      // Admit lets the table in (review round, 2026-10-20).

      // Refused whole, as on the server: nothing is placed when one line is wrong.
      command.lines.forEach((line, index) => {
        if (!line.participantId) return;
        const url = `/api/tabs/${tab.id}/staff-orders`;
        // A shared line is the table's; naming a guest on it contradicts itself.
        if (line.isShared) {
          throw new ValidationError({
            url,
            status: 400,
            problem: {
              type: 'about:blank',
              title: 'Invalid request',
              status: 400,
              detail: 'A shared line belongs to the table and cannot name a guest.',
              code: 'invalid-request',
              traceId: 'mock',
              context: { field: `items[${index}].participantId` },
            },
          });
        }
        const named = tab.participants.find((person) => person.id === line.participantId);
        const field = `items[${index}].participantId`;
        if (!named) {
          throw new OrderGuestUnavailableError({
            url,
            status: 404,
            participantId: line.participantId,
            guestState: 'notOnTab',
            field,
          });
        }
        if (named.status !== 'approved') {
          throw new OrderGuestUnavailableError({
            url,
            status: 409,
            participantId: named.id,
            guestState: named.status === 'removed' ? 'removed' : 'pending',
            field,
          });
        }
      });

      for (const line of command.lines) {
        const item = menuItems.get(line.menuItemId);
        if (!item) continue;
        const lineId = id('line');
        const owner = line.isShared ? null : line.participantId;
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
          // As the server: a line nobody owns and nobody shares is the table's,
          // and says the waiter did not know.
          isTableAttributed: !line.isShared && owner === null,
          ownerParticipantId: owner,
          // Null even here, because `OrderLineView` carries neither and the
          // panel must not be built against something the wire never sends.
          participantId: null,
          orderedByName: null,
          onBehalfOfParticipantId: owner,
          /*
           * Snapshotted now, and zero when the line does not split.
           *
           * The count is `sharedWithParticipantIds.length` on the wire, so an
           * owned line is 0 rather than "everyone currently here". Reporting
           * the roster size for every line was the mock's own version of the
           * bug its comment warns about — it just made the error on the
           * *unshared* lines instead of the late-arriving ones.
           */
          sharedWithCount: owner === null ? approvedOn(tab).length : 0,
          status: 'active',
          voidReason: null,
          voidedByName: null,
          placedAtUtc: iso(at),
          orderStatus: 'inKitchen',
        });
        order.lineIds.push(lineId);
      }

      orders.set(order.id, order);
      pushEvent(tab, 'orderPlaced', at);
      pushEvent(tab, 'orderStatusChanged', at);

      return settle({
        orderId: order.id,
        tabId: tab.id,
        status: 'inKitchen',
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
      requireSession(`/api/orders/${command.orderId}/status`);
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
      requireSession(`/api/service-requests/${command.requestId}/acknowledge`);
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
      // As the server: once the tab has been paid against, a void is a refund.
      if (tab.paidDram > 0) {
        throw new LineAlreadyPaidError({
          url: `/api/tabs/${command.tabId}/lines/${command.lineId}/void`,
          lineId: command.lineId,
        });
      }
      tab.lines[index] = {
        ...line,
        status: 'voided',
        lineTotalDram: 0,
        voidReason: voidReasonText(command),
      };
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
      const replayed = payments.get(command.clientCommandId);
      if (replayed) return settle({ ...replayed, wasReplay: true });
      const tab = requireTab(command.tabId);
      const at = now();
      const before = totalsFor(tab);

      // Who handed it over, when the waiter said: somebody on this tab, as on
      // the server, which answers a stranger's id with a 404.
      const payer = command.participantId
        ? tab.participants.find((person) => person.id === command.participantId)
        : undefined;
      if (command.participantId && !payer) {
        throw new NotFoundError({ url: `/api/tabs/${tab.id}/payments/cash` });
      }

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
      // And against the payer's own share when the waiter named one — the
      // person who asked to pay their share has paid it.
      if (payer) payer.paidDram += command.amountDram;
      tab.settlementModeLocked = true;
      const after = totalsFor(tab);
      const closed = after.remainingDram === 0;
      if (closed && tab.status !== 'closed') {
        tab.status = 'closed';
        tab.closedAtUtc = iso(at);
        // As on the server: paying in full closes the sitting, not the table. The party is
        // usually still there, so the table stays occupied with no sitting and no tab.
        for (const state of tables.values()) {
          if (state.tabId === tab.id) {
            state.tabId = null;
            state.sessionId = null;
          }
        }
      }
      pushEvent(tab, 'paymentRecorded', at);

      const result: PaymentResult = {
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
      };
      payments.set(command.clientCommandId, result);
      return settle(result);
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
