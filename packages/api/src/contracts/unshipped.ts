/**
 * Every shape guessed against an endpoint the backend has not published yet.
 *
 * **One file, deliberately.** The backend's OpenAPI document does not describe
 * ordering, billing, service requests or either sequence stream, so these are
 * hand-written from the domain entities — `MenuItem`, `TabOrderLine`,
 * `TabBilling`, `TabEvent` — rather than generated. Keeping every guess in one
 * module means swapping in `pnpm api:generate` output later is one import path
 * changing, and the compiler then lists every mismatch instead of leaving them
 * to be found on a phone in a cafe.
 *
 * Two rules that make that swap survivable, and that nothing in `apps/` may
 * break:
 *
 * 1. **No component is typed against a mock.** Screens depend on these
 *    contracts; the mock gateway implements them. A screen typed against what
 *    the mock happens to return stops compiling the day the backend ships,
 *    which is the moment it is least affordable.
 * 2. **These are the client's vocabulary, not the wire format.** Amounts are
 *    `Dram`-suffixed integers, enums are string unions, and the mapping from the
 *    server's `Amd` fields and integer enums happens in `http/`. When the real
 *    schema lands, only that mapping moves.
 *
 * Where a field is a genuine guess rather than a rename of something visible in
 * the domain, it says so.
 */

import type {
  SettlementMode,
  StaffTabStatus,
  TabStaffParticipant,
  TabTotals,
  TableStatus,
} from './service';

// ---------------------------------------------------------------------------
// The menu
// ---------------------------------------------------------------------------

/** `Yalla.Domain.Enums.SpiceLevel`: 0 NotSpicy, 1 Mild, 2 Medium, 3 Hot. */
export type SpiceLevel = 'notSpicy' | 'mild' | 'medium' | 'hot';

export const SPICE_LEVELS: readonly SpiceLevel[] = ['notSpicy', 'mild', 'medium', 'hot'];

/**
 * One dish, with everything a diner needs before ordering it.
 *
 * `ingredients`, `allergens`, `portionSize`, `spiceLevel` and `prepMinutes` are
 * **required** on the backend entity, which is the whole reason this screen can
 * exist: they were made non-nullable so that a diner stops having to ask a
 * waiter what is in something. Surfacing them behind a second tap would waste
 * that, so they are on the card's detail rather than in a modal nobody opens.
 */
export interface MenuItemDetail {
  readonly id: string;
  readonly categoryId: string;
  readonly name: string;
  readonly description: string;
  /** Integer dram. The client displays this and never sums prices. */
  readonly priceDram: number;
  readonly photoUrl: string | null;
  /**
   * Free text as the venue wrote it, comma-separated in practice.
   *
   * Not a list of ids: the backend stores a string, and inventing a taxonomy
   * here would mean guessing an allergen vocabulary that Armenian venues do not
   * use. Search matches against it as written.
   */
  readonly ingredients: string;
  readonly allergens: string;
  readonly portionSize: string;
  readonly spiceLevel: SpiceLevel;
  readonly prepMinutes: number;
  /** False when the kitchen has run out. Still listed, visibly marked. */
  readonly isAvailable: boolean;
  readonly displayOrder: number;
}

export interface MenuCategoryView {
  readonly id: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly items: readonly MenuItemDetail[];
}

export interface BranchMenu {
  readonly branchId: string;
  /** ISO-8601 UTC. Shown so a cached menu can say how old it is. */
  readonly updatedAtUtc: string;
  readonly categories: readonly MenuCategoryView[];
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/** `Yalla.Domain.Enums.TabOrderStatus`: 1 New, 2 InKitchen, 3 Ready, 4 Served, 5 Voided. */
export type OrderStatus = 'new' | 'inKitchen' | 'ready' | 'served' | 'voided';

/** The kitchen's four working states, in the order they happen. `voided` is not one. */
export const ORDER_STATUS_FLOW: readonly OrderStatus[] = ['new', 'inKitchen', 'ready', 'served'];

/** The next status, or `null` at the end of the flow. */
export function nextOrderStatus(status: OrderStatus): OrderStatus | null {
  const index = ORDER_STATUS_FLOW.indexOf(status);
  return index < 0 || index === ORDER_STATUS_FLOW.length - 1
    ? null
    : (ORDER_STATUS_FLOW[index + 1] ?? null);
}

export interface PlaceOrderLine {
  readonly menuItemId: string;
  readonly quantity: number;
  /** A short free-text modifier. Not a modifier system; see the README. */
  readonly note?: string | undefined;
  /**
   * Split evenly across everyone at the table **when the order is sent**.
   *
   * The server snapshots who that is, so a friend who arrives later is not on
   * it and one who leaves early still owes for it.
   */
  readonly isShared: boolean;
  /**
   * Who it is for. `null` attributes the line to the table, which is what a
   * waiter keying in a spoken order usually has to do.
   */
  readonly participantId: string | null;
}

export interface PlaceOrderCommand {
  readonly tabId: string;
  /** Generated once per user action and reused on every retry. */
  readonly clientCommandId: string;
  readonly lines: readonly PlaceOrderLine[];
}

export interface PlaceOrderResult {
  readonly orderId: string;
  readonly tabId: string;
  readonly status: OrderStatus;
  readonly placedAtUtc: string;
  /**
   * When the kitchen expects it. A guess on the wire — the backend stores
   * `PrepMinutes` per item but no endpoint returns a computed estimate.
   *
   * Stated at order time rather than shown as a progress bar afterwards: "about
   * twenty minutes" said once is worth more than a bar that creeps.
   */
  readonly estimatedReadyAtUtc: string | null;
  /** The server had this command already. A success, not a duplicate. */
  readonly wasReplay: boolean;
}

export interface SetOrderStatusCommand {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly clientCommandId: string;
}

export interface OrderQueueLine {
  readonly name: string;
  readonly quantity: number;
  readonly note: string | null;
}

/** One order as the counter panel lists it. */
export interface OrderQueueEntry {
  readonly orderId: string;
  readonly tabId: string;
  readonly tableId: string;
  readonly tableLabel: string;
  readonly status: OrderStatus;
  readonly placedAtUtc: string;
  readonly placedByName: string | null;
  readonly source: 'staff' | 'diner';
  readonly estimatedReadyAtUtc: string | null;
  readonly lines: readonly OrderQueueLine[];
}

// ---------------------------------------------------------------------------
// The bill
// ---------------------------------------------------------------------------

export type OrderLineStatus = 'active' | 'voided';

/**
 * One line on a tab, as anyone allowed to see it reads it.
 *
 * Mirrors `TabOrderLine` plus the two snapshots the arithmetic depends on:
 * `unitPriceDram` is the price when it was ordered, and `sharedWithCount` is how
 * many people were at the table then. Both matter because a bill is settled
 * later than it is built.
 */
export interface TabLine {
  readonly id: string;
  readonly orderId: string;
  readonly menuItemId: string;
  /** The name as it was when ordered. A renamed dish does not rewrite history. */
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceDram: number;
  /** `unitPriceDram × quantity`, from the server. Zero once voided. */
  readonly lineTotalDram: number;
  readonly note: string | null;
  readonly isShared: boolean;
  /** True when a waiter keyed it in and could not say who asked for it. */
  readonly isTableAttributed: boolean;
  /** `null` for a table-attributed line. */
  readonly participantId: string | null;
  /** Short name or initials, so nobody has to ask whose it is. */
  readonly orderedByName: string | null;
  /**
   * How many ways a shared line splits, snapshotted when it was ordered.
   *
   * Not the current participant count. A badge computed from "who is on the tab
   * now" would relabel every past line the moment somebody joins, and the
   * amount beside it would stop matching.
   */
  readonly sharedWithCount: number;
  readonly status: OrderLineStatus;
  /** Set on a voided line. The server requires one. */
  readonly voidReason: string | null;
  readonly voidedByName: string | null;
  readonly voidedAtUtc: string | null;
  readonly placedAtUtc: string;
  readonly orderStatus: OrderStatus;
}

/** `Yalla.Domain.Enums.AdjustmentKind`: 1 Discount, 2 Comp. */
export type AdjustmentKind = 'discount' | 'comp';

/**
 * A discount or a comp, shown as its own line rather than folded into a total.
 *
 * A bill that quietly shrinks is a bill nobody trusts, and the manager's reason
 * is the part that makes it make sense.
 */
export interface TabAdjustment {
  readonly id: string;
  readonly kind: AdjustmentKind;
  /** `null` when it applies to the whole tab. */
  readonly lineId: string | null;
  /** Exactly one of these is set, matching `BillingAdjustment`. */
  readonly percent: number | null;
  readonly amountDram: number | null;
  /** What it actually took off, computed by the server. */
  readonly reductionDram: number;
  readonly reason: string;
  readonly byName: string | null;
  readonly atUtc: string;
}

/** What one person owes. Mirrors `Yalla.Domain.Billing.ParticipantShare`. */
export interface ParticipantShare {
  readonly participantId: string;
  readonly displayName: string | null;
  readonly isHost: boolean;
  /** Their own unshared lines, after any adjustment on those lines. */
  readonly ownItemsDram: number;
  /** Their slice of shared and table-attributed lines. */
  readonly sharedItemsDram: number;
  /**
   * What fell to them because somebody removed from the tab cannot pay for what
   * they ate. Non-zero only for the host, and reported rather than folded in
   * silently.
   */
  readonly absorbedFromRemovedDram: number;
  readonly personalDram: number;
  readonly serviceChargeDram: number;
  /** What they owe in total. These sum to the tab total exactly. */
  readonly shareDram: number;
  readonly paidDram: number;
}

/** The bill. Mirrors `Yalla.Domain.Billing.TabBill`. */
export interface TabBill {
  readonly subtotalDram: number;
  readonly serviceChargeDram: number;
  readonly totalDram: number;
  readonly paidDram: number;
  readonly remainingDram: number;
  readonly absorbedFromRemovedDram: number;
}

/**
 * The money on a tab, or the deliberate absence of it.
 *
 * A union rather than nullable fields, and that is the point. When the host has
 * hidden the total, the backend returns no aggregate at all, and a `totalDram`
 * that could be `0` or `null` is one careless render away from a bill that says
 * a table owes nothing. Here the aggregate is not reachable without narrowing,
 * so the screen cannot draw a zero by accident — it has to handle the case.
 *
 * What is hidden is the **table** total and **other people's** items. Never
 * prices, and never your own lines: a guest always knows what their own coffee
 * costs.
 */
export type TabMoney =
  | {
      readonly kind: 'table';
      readonly bill: TabBill;
      /**
       * The branch percentage, snapshotted when the tab opened. Shown on the
       * service-charge line from the first item, never revealed at the end.
       */
      readonly serviceChargePercent: number;
      /** This participant's own share, when the server can attribute one. */
      readonly yourShare: ParticipantShare | null;
    }
  | {
      readonly kind: 'ownItemsOnly';
      /**
       * The sum of this participant's own lines, from the server.
       *
       * There is deliberately no `total`, no `serviceChargeDram` and no
       * `remaining` on this branch. The percentage is a fact about the branch
       * rather than an aggregate, so it is safe to say a service charge applies
       * without saying what the table's comes to.
       */
      readonly yourItemsSubtotalDram: number;
      readonly serviceChargePercent: number;
    };

/**
 * The tab as one diner sees it: the lines they may see, and the money they may
 * see.
 */
export interface DinerTabView {
  readonly tabId: string;
  readonly branchId: string;
  readonly tableLabel: string;
  readonly timeZoneId: string;
  readonly status: 'open' | 'closing' | 'closed' | 'abandoned';
  readonly settlementMode: SettlementMode;
  readonly settlementModeLocked: boolean;
  /**
   * Every line this participant may see: all of them when they may see the
   * table total, their own only when they may not.
   */
  readonly lines: readonly TabLine[];
  readonly adjustments: readonly TabAdjustment[];
  readonly money: TabMoney;
  /** Sequence high-water mark, so the event stream can continue from here. */
  readonly lastSequence: number;
  readonly asOfUtc: string;
}

// ---------------------------------------------------------------------------
// Settling
// ---------------------------------------------------------------------------

export interface SetSettlementModeCommand {
  readonly tabId: string;
  readonly mode: SettlementMode;
  readonly clientCommandId: string;
}

/** Every approved participant and what they owe. */
export interface TabShares {
  readonly tabId: string;
  readonly serviceChargePercent: number;
  readonly totalDram: number;
  readonly shares: readonly ParticipantShare[];
}

// ---------------------------------------------------------------------------
// Asking for things
// ---------------------------------------------------------------------------

/** `Yalla.Domain.Enums.ServiceRequestPreset`: 1 Napkins, 2 Water, 3 TheBill, 4 Other. */
export type ServiceRequestReason = 'napkins' | 'water' | 'bill' | 'other';

export const SERVICE_REQUEST_REASONS: readonly ServiceRequestReason[] = [
  'napkins',
  'water',
  'bill',
  'other',
];

export interface ServiceRequest {
  readonly id: string;
  readonly tabId: string;
  readonly tableId: string;
  readonly tableLabel: string;
  readonly reason: ServiceRequestReason;
  readonly requestedAtUtc: string;
  readonly acknowledgedAtUtc: string | null;
}

export interface CallWaiterCommand {
  readonly tabId: string;
  readonly reason: ServiceRequestReason;
  readonly clientCommandId: string;
}

export interface AcknowledgeServiceRequestCommand {
  readonly requestId: string;
  readonly clientCommandId: string;
}

// ---------------------------------------------------------------------------
// Money, staff side
// ---------------------------------------------------------------------------

export type VoidReason = 'wrongItem' | 'guestChangedMind' | 'kitchenError' | 'spilled' | 'other';

export const VOID_REASONS: readonly VoidReason[] = [
  'wrongItem',
  'guestChangedMind',
  'kitchenError',
  'spilled',
  'other',
];

export interface VoidLineCommand {
  readonly tabId: string;
  readonly lineId: string;
  readonly reason: VoidReason;
  /** Required when `reason` is `other`; ignored otherwise. */
  readonly detail?: string | undefined;
  readonly clientCommandId: string;
}

export interface CompCommand {
  readonly tabId: string;
  /** `null` comps the whole tab. Manager only, either way. */
  readonly lineId: string | null;
  readonly reason: string;
  readonly clientCommandId: string;
}

/**
 * A cash payment.
 *
 * `tipDram` is separate and never folded into `amountDram` anywhere in this
 * client: a tip added to the balance is how a tab looks settled while money is
 * still owed.
 */
export interface RecordCashPaymentCommand {
  readonly tabId: string;
  readonly amountDram: number;
  readonly tipDram: number;
  readonly clientCommandId: string;
  /** Set to settle one person's share rather than the table's balance. */
  readonly participantId?: string | undefined;
}

export interface PaymentResult {
  readonly paymentId: string;
  readonly tabId: string;
  readonly amountDram: number;
  readonly tipDram: number;
  readonly bill: TabBill;
  /** True when this payment took the balance to zero and closed the tab. */
  readonly tabClosed: boolean;
  readonly wasReplay: boolean;
}

export interface AbandonTabCommand {
  readonly tabId: string;
  readonly reason: string;
  readonly clientCommandId: string;
}

export interface AbandonTabResult {
  readonly tabId: string;
  readonly writtenOffDram: number;
  readonly atUtc: string;
  readonly wasReplay: boolean;
}

// ---------------------------------------------------------------------------
// The sequence streams
// ---------------------------------------------------------------------------

/**
 * `Yalla.Domain.Enums.TabEventType`, 1–20, pinned and persisted.
 *
 * The backend's own note on this enum is a client instruction: **a client that
 * does not recognise a type must ignore it and keep its sequence position
 * rather than failing.** New types will be added, and an old build on somebody's
 * phone must not break on a tab that used one — so `unknown` is a member of this
 * union rather than a parse error, and applying it is a no-op that still
 * advances the sequence.
 */
export type TabEventType =
  | 'tabOpened'
  | 'participantJoined'
  | 'participantApproved'
  | 'participantRejected'
  | 'participantRemoved'
  | 'participantPermissionsChanged'
  | 'participantRenamed'
  | 'hostReassigned'
  | 'settlementModeChanged'
  | 'orderPlaced'
  | 'orderStatusChanged'
  | 'lineVoided'
  | 'adjustmentAdded'
  | 'adjustmentVoided'
  | 'paymentRecorded'
  | 'serviceRequested'
  | 'serviceRequestAcknowledged'
  | 'tabClosing'
  | 'tabClosed'
  | 'tabAbandoned'
  | 'unknown';

/** Who caused it, for "added by the waiter" versus "you added this". */
export type TabEventActor = 'diner' | 'staff' | 'system';

export interface TabEvent {
  /** Per-tab monotonic. Contiguity is what makes incremental application safe. */
  readonly sequence: number;
  readonly tabId: string;
  readonly type: TabEventType;
  readonly actor: TabEventActor;
  /** Short name of whoever did it, when the server can say. */
  readonly actorName: string | null;
  readonly atUtc: string;
  /**
   * The event's own payload, shape depending on `type`.
   *
   * Deliberately opaque. A screen that reconstructs a bill from event payloads
   * is a second implementation of the billing arithmetic, and the one on the
   * server is the one that is right — so an event says *that* something changed
   * and the client refetches the tab.
   */
  readonly data: Readonly<Record<string, unknown>> | null;
}

export interface TabEventPage {
  readonly tabId: string;
  /** Highest sequence in this page, or the caller's own when empty. */
  readonly lastSequence: number;
  readonly events: readonly TabEvent[];
}

export interface FloorChange {
  readonly sequence: number;
  readonly branchId: string;
  readonly tableId: string;
  readonly fromStatus: TableStatus;
  readonly toStatus: TableStatus;
  readonly state: 'free' | 'reservedSoon' | 'held' | 'occupied' | 'outOfService';
  readonly atUtc: string;
  readonly tabId: string | null;
  readonly tableSessionId: string | null;
  readonly partySize: number | null;
  readonly nextReservationStartUtc: string | null;
  /** For "seated by Aram just now". Absent degrades to "someone". */
  readonly actorName?: string | undefined;
}

export interface FloorChangePage {
  readonly branchId: string;
  readonly lastSequence: number;
  readonly changes: readonly FloorChange[];
}

// ---------------------------------------------------------------------------
// The tab, staff side
// ---------------------------------------------------------------------------

/**
 * A tab as staff see it.
 *
 * Here rather than beside the other staff shapes because two of its fields are
 * guesses: the shipped `TabStaffView` carries participants and totals and
 * nothing else, so `lines` and `shares` describe endpoints that do not exist.
 * A type that is part guess is a guess.
 */
export interface StaffTab {
  readonly id: string;
  readonly branchId: string;
  readonly tableId: string;
  readonly tableLabel: string;
  readonly status: StaffTabStatus;
  readonly settlementMode: SettlementMode;
  readonly openedAtUtc: string;
  readonly closedAtUtc: string | null;
  readonly participants: readonly TabStaffParticipant[];
  readonly totals: TabTotals;
  /** The branch percentage, snapshotted when the tab opened. */
  readonly serviceChargePercent: number;
  /** Empty until the ordering endpoints ship; never faked to look populated. */
  readonly lines: readonly TabLine[];
  readonly adjustments: readonly TabAdjustment[];
  readonly shares: readonly ParticipantShare[];
}
