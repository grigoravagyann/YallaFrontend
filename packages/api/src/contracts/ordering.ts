/**
 * Ordering, the bill, service requests and the two sequence streams.
 *
 * **These were guesses until Backend 8/8b shipped.** They are not any more: every
 * shape below is a rename of something `generated/schema.ts` describes, and
 * `http/staffMapping.ts` builds each one from its generated counterpart, so a
 * renamed field on the server is a compile error here rather than an `undefined`
 * on a counter screen. Where the client's vocabulary differs from the wire it
 * differs deliberately and in one direction: amounts are `Dram`-suffixed
 * integers rather than the server's `Amd`, and enums are string unions rather
 * than the server's integers. That translation happens in `http/` and nowhere
 * else.
 *
 * Three places where the wire genuinely does not carry what the screens want.
 * Each is `null` here rather than invented, and each says why:
 *
 * 1. **A voided line's reason.** `TabOrderLine.VoidReason` is stored and is not
 *    projected into any read model. `OrderLineView` reports a voided line only
 *    as `lineTotalAmd: 0`.
 * 2. **A tab's adjustments as a read.** `POST /api/tabs/{tabId}/adjustments`
 *    answers with the adjustment it just made; nothing lists them back.
 * 3. **Who did it.** No view carries an actor's name, so "voided by Aram" is
 *    `null` and the copy degrades to "removed by staff".
 *
 * The rule that has not changed: **no component is typed against a mock.**
 * Screens depend on these contracts; both gateways implement them.
 */

import type { Photo } from './menuAdmin';
import type { TabParticipantRole } from './tab';
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
  /**
   * Three variant URLs and the id behind them.
   *
   * Was a single `photoUrl` until Backend 9; a menu photo is now stored once
   * and served at three sizes, and which one a screen uses is a layout
   * decision rather than a data one — a card that loads the 1600px variant to
   * draw it at 120 is a phone connection in a basement wasted.
   */
  readonly photo: Photo;
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
  /**
   * When this copy was read, from the client's own clock.
   *
   * `BranchMenuView` carries no timestamp, so this is not the server's opinion
   * of when the menu last changed — it is when this device fetched it, which is
   * the only honest thing a cached-menu banner can say.
   */
  readonly fetchedAtUtc: string;
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
   *
   * On the wire this is **not** per line: `PlaceOrderRequest` carries one
   * `onBehalfOfParticipantId` for the whole order. The gateway groups a draft
   * by this field and sends one request per distinct value, so the screen can
   * keep offering it per line — which is what a waiter taking a round for a
   * table of four actually needs.
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
  /** When the kitchen expects it: the longest prep time on the order, from the server. */
  readonly estimatedReadyAtUtc: string | null;
  /** The server had this command already. A success, not a duplicate. */
  readonly wasReplay: boolean;
  /** The tab's totals as they stand after this order. */
  readonly totals: TabTotals;
}

export interface SetOrderStatusCommand {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly clientCommandId: string;
}

export interface OrderQueueLine {
  readonly lineId: string;
  readonly name: string;
  readonly quantity: number;
  readonly note: string | null;
}

/** One order as the counter panel lists it. `Yalla.Application.Ordering.KitchenOrderView`. */
export interface OrderQueueEntry {
  readonly orderId: string;
  readonly tabId: string;
  /**
   * Which table, by label only.
   *
   * `KitchenOrderView` carries no table id. The panel walks to a label, not to
   * a GUID, so this is enough for the rail — and a command raised from it
   * carries `tableId: null` rather than a lookup that could name the wrong
   * table when two branches share a label.
   */
  readonly tableLabel: string;
  readonly status: OrderStatus;
  readonly placedAtUtc: string;
  readonly estimatedReadyAtUtc: string | null;
  /** How long it has been waiting, computed by the server at read time. */
  readonly waitingMinutes: number;
  readonly lines: readonly OrderQueueLine[];
}

// ---------------------------------------------------------------------------
// The bill
// ---------------------------------------------------------------------------

export type OrderLineStatus = 'active' | 'voided';

/**
 * One line on a tab, as anyone allowed to see it reads it.
 *
 * Mirrors `Yalla.Application.Ordering.OrderLineView` plus the two things the
 * screen needs and the view does not name: which order it came from, and
 * whether it is still on the bill.
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
  /**
   * Who ordered it. `null` for a line attributed to the table.
   *
   * From `TabLineView.placedByParticipantId` on the diner's own tab read. **Null
   * on the staff path**, whatever the truth: `OrderLineView` — the only line
   * shape a staff token can reach — carries neither the participant nor a name,
   * so the counter screen shows the line and not who asked for it.
   */
  readonly participantId: string | null;
  /** Short name or initials. Null on the staff path, for the same reason. */
  readonly orderedByName: string | null;
  /**
   * How many ways a shared line splits, snapshotted when it was ordered.
   *
   * From `sharedWithParticipantIds`, which is that snapshot. Not the current
   * participant count: a badge computed from "who is on the tab now" would
   * relabel every past line the moment somebody joins.
   */
  readonly sharedWithCount: number;
  /**
   * Whether the line still counts.
   *
   * **Inferred, not reported.** No read model carries a void flag; the only
   * signal on the wire is that the server zeroes `lineTotalAmd` for a voided
   * line while `unitPriceAmd` and `quantity` keep their snapshots. A line whose
   * gross is positive and whose total is zero has been voided, and there is no
   * other way to produce that combination.
   */
  readonly status: OrderLineStatus;
  /**
   * Why it was voided. **Always `null` today.**
   *
   * `TabOrderLine.VoidReason` is stored, required by the domain, and projected
   * into nothing. Rendering a reason the server never sent would be worse than
   * rendering none, so the panel says "removed by staff" and stops there.
   */
  readonly voidReason: string | null;
  /** Who voided it. Always `null`: no view carries an actor's name. */
  readonly voidedByName: string | null;
  readonly placedAtUtc: string;
  readonly orderStatus: OrderStatus;
}

/** `Yalla.Domain.Enums.AdjustmentKind`: 1 Discount, 2 Comp. */
export type AdjustmentKind = 'discount' | 'comp';

/**
 * A discount or a comp, shown as its own line rather than folded into a total.
 *
 * A bill that quietly shrinks is a bill nobody trusts, and the manager's reason
 * is the part that makes it make sense. Mirrors
 * `Yalla.Application.Ordering.AdjustmentView`.
 */
export interface TabAdjustment {
  readonly id: string;
  readonly kind: AdjustmentKind;
  /** `null` when it applies to the whole tab. */
  readonly lineId: string | null;
  /** Exactly one of these is set, matching `AddAdjustmentRequest`. */
  readonly percent: number | null;
  readonly amountDram: number | null;
  /** What it actually took off, computed by the server. */
  readonly reductionDram: number;
  readonly reason: string;
  /** True once reversed. It stays on the record either way. */
  readonly isVoided: boolean;
  /** Who applied it. Always `null`: `AdjustmentView` carries no actor. */
  readonly byName: string | null;
  readonly atUtc: string;
}

/** What one person owes. Mirrors `Yalla.Application.Ordering.ParticipantShareView`. */
export interface ParticipantShare {
  readonly participantId: string;
  readonly displayName: string;
  /**
   * Whether this is the host.
   *
   * Not on `ParticipantShareView`. The mapper takes it from the tab's
   * `hostParticipantId` when it has one and reports `false` otherwise, rather
   * than inventing a crown.
   */
  readonly isHost: boolean;
  readonly status: TabParticipantStatusCode;
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

/** `Yalla.Domain.Enums.ParticipantStatus`: 1 PendingApproval, 2 Approved, 3 Removed. */
export type TabParticipantStatusCode = 'pendingApproval' | 'approved' | 'removed';

/** The bill. */
export interface TabBill {
  readonly subtotalDram: number;
  readonly serviceChargeDram: number;
  readonly totalDram: number;
  readonly paidDram: number;
  readonly remainingDram: number;
  readonly absorbedFromRemovedDram: number;
}

/**
 * One line on a tab as a **diner** reads it.
 *
 * Separate from {@link TabLine} because the two wires are genuinely different
 * shapes, not two spellings of one. `TabLineView` — the only line a diner token
 * can reach — carries eight fields. `OrderLineView`, which the counter screen
 * assembles from the kitchen queue, carries the menu item, the note, the
 * table-attribution flag and the share snapshot, and keeps voided lines with
 * their totals zeroed. Collapsing them into one interface meant ten fields that
 * were `null` forever on the diner path and a `status` that could never be
 * `voided`.
 *
 * **There is no `status` here, and that is the finding rather than an
 * omission.** `TabProjection` filters `IsVoided` out of both `myLines` and
 * `tableLines`, so a voided line does not arrive at a diner in any form: not
 * struck through, not zeroed, not at all. The `lineVoided` event is the only
 * signal, and what it says is that a line the phone *used to* hold is gone.
 * See `useTabStream` for how that is announced by name.
 */
export interface DinerTabLine {
  readonly id: string;
  /** The name as it was when ordered. A renamed dish does not rewrite history. */
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceDram: number;
  /** `unitPriceDram × quantity`, from the server. */
  readonly lineTotalDram: number;
  /** True when the item belongs to the table and splits across those present. */
  readonly isShared: boolean;
  /** Who ordered it. `null` when a waiter keyed it in without attributing it. */
  readonly participantId: string | null;
  /** Their name at the time of reading. `null` for a table-attributed line. */
  readonly orderedByName: string | null;
}

/** One other person at the table, as the roster lists them. */
export interface TabRosterEntry {
  readonly participantId: string;
  readonly displayName: string;
  readonly role: TabParticipantRole;
  readonly status: TabParticipantStatusCode;
}

/**
 * The caller's own row, with the flags the screens branch on.
 *
 * `canOrderNow` is the one that matters: the server computes it as approved
 * **and** allowed to order **and** the tab still open, by the same rule the
 * ordering endpoint enforces. A screen that assembles that condition itself
 * from three other fields will eventually disagree with the endpoint, and the
 * disagreement shows up as a rejected order the diner was invited to place.
 */
export interface DinerTabMe {
  readonly participantId: string;
  readonly displayName: string;
  readonly role: TabParticipantRole;
  readonly status: TabParticipantStatusCode;
  readonly canOrder: boolean;
  readonly canOrderNow: boolean;
  readonly canPay: boolean;
  readonly canSeeTableTotal: boolean;
  readonly joinedAtUtc: string;
}

/**
 * The money on a tab, or the deliberate absence of it.
 *
 * A union rather than nullable fields, and that is the point. When the host has
 * hidden the total the backend sends no aggregate — `tableTotalVisible` false,
 * and `tableTotal` **absent from the body** because the API serialises with
 * `JsonIgnoreCondition.WhenWritingNull`. A `totalDram` that could be `0` or
 * `null` is one careless render away from a bill that says a table owes
 * nothing. Here the aggregate is unreachable without narrowing.
 *
 * The mapper narrows on **`tableTotalVisible`, never on whether `tableTotal`
 * arrived**. The generated type is `?: T | null` because OpenAPI cannot say
 * "absent exactly when this boolean is false", so presence-testing would flip
 * the branch silently the day the serializer starts emitting nulls.
 *
 * What is hidden is the **table** total and **other people's** items. Never
 * prices, and never your own lines: a guest always knows what their own coffee
 * costs.
 *
 * **There is no `serviceChargePercent` on either branch.** It was here, and it
 * was a guess. The only endpoint that carries a branch's percentage is
 * `GET /api/branches/{id}/reservation-policy`, which is `ManagerOrAbove`; no
 * diner token can read it. The `ownItemsOnly` branch was designed around
 * stating the percentage without stating the total, and that copy cannot be
 * written honestly today — see the README.
 */
export type TabMoney =
  | {
      readonly kind: 'table';
      /** The table aggregate. `TabTotalsView`, in dram. */
      readonly bill: TabTotals;
    }
  | {
      readonly kind: 'ownItemsOnly';
      /**
       * The sum of this participant's own **unshared** lines, from the server.
       *
       * Shared lines are listed in `myLines` with `isShared` set and are
       * apportioned by the shares endpoint, not folded in here. There is
       * deliberately no total, no service charge and no remaining.
       */
      readonly yourItemsSubtotalDram: number;
    };

/**
 * The tab as one diner sees it. `Yalla.Application.Tabs.TabView`.
 *
 * Two line arrays rather than one, because the server sends two and the
 * difference is the permission: `myLines` is always present, `tableLines` is
 * absent exactly when the total is hidden. A single `lines` array — what this
 * interface used to have — had to pick one of them at map time and threw away
 * the distinction the screens need to render "your items" against "the table".
 */
export interface DinerTabView {
  readonly tabId: string;
  readonly branchId: string;
  readonly tableLabel: string;
  readonly status: 'open' | 'closing' | 'closed' | 'abandoned';
  readonly settlementMode: SettlementMode;
  readonly settlementModeLocked: boolean;
  readonly hostParticipantId: string | null;
  /** The table default for a joiner's `canSeeTableTotal`. */
  readonly hideTotalFromGuests: boolean;
  readonly me: DinerTabMe;
  /**
   * Who is at the table. Everyone still on the tab for an approved participant;
   * only the caller themself while they are pending.
   */
  readonly participants: readonly TabRosterEntry[];
  /** The caller's own items — placed by them, or shared with them. */
  readonly myLines: readonly DinerTabLine[];
  /** Every live line on the tab. `null` when the total is hidden. */
  readonly tableLines: readonly DinerTabLine[] | null;
  readonly money: TabMoney;
  readonly openedAtUtc: string;
  readonly closedAtUtc: string | null;
  /**
   * When this copy was read, from the client's own clock.
   *
   * `TabView` carries no `asOfUtc` and no sequence high-water mark. This is not
   * the server's opinion of when the tab last changed — it is when this device
   * fetched it, which is the only honest thing a stale-bill banner can say. The
   * event cursor is seeded from `GET /events`'s `maxSequence` instead; see
   * `useTabStream`.
   */
  readonly fetchedAtUtc: string;
}

// ---------------------------------------------------------------------------
// Settling
// ---------------------------------------------------------------------------

export interface SetSettlementModeCommand {
  readonly tabId: string;
  readonly mode: SettlementMode;
  readonly clientCommandId: string;
}

/**
 * Who owes what, projected through the caller's own visibility.
 *
 * `shares` and `total` are together or absent together, exactly as the server
 * sends them: `TabSharesView.tableTotalVisible` false means the members are not
 * in the body at all. `yourShare` is the one thing always present.
 */
export type TabShares =
  | {
      readonly kind: 'table';
      readonly tabId: string;
      readonly totals: TabTotals;
      readonly absorbedFromRemovedDram: number;
      readonly shares: readonly ParticipantShare[];
      readonly yourShare: ParticipantShare | null;
    }
  | {
      readonly kind: 'yourShareOnly';
      readonly tabId: string;
      readonly absorbedFromRemovedDram: number;
      readonly yourShare: ParticipantShare | null;
    };

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

/** `Yalla.Application.Ordering.ServiceRequestView`. */
export interface ServiceRequest {
  readonly id: string;
  readonly tabId: string;
  /** Label only: the view carries no table id, the same as the order queue. */
  readonly tableLabel: string;
  readonly reason: ServiceRequestReason;
  /** The one optional line the diner may add. */
  readonly note: string | null;
  readonly requestedAtUtc: string;
  readonly waitingMinutes: number;
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

/**
 * A discount or a comp. Manager only, enforced server-side.
 *
 * Exactly one of `percent` and `amountDram`, matching `AddAdjustmentRequest`.
 * Comping a whole line is a 100% comp on that line rather than a separate verb.
 */
export interface CompCommand {
  readonly tabId: string;
  /** `null` applies it to the whole tab. */
  readonly lineId: string | null;
  readonly kind: AdjustmentKind;
  readonly percent: number | null;
  readonly amountDram: number | null;
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
  /** Who handed it over, when the waiter knows. Never a way to settle one share. */
  readonly participantId?: string | undefined;
}

export interface PaymentResult {
  readonly paymentId: string;
  readonly tabId: string;
  readonly amountDram: number;
  readonly tipDram: number;
  readonly totals: TabTotals;
  /** True when this payment took the balance to zero and closed the tab. */
  readonly tabClosed: boolean;
  /**
   * True when closing the tab also closed the sitting. The **table is not
   * freed** by this — that stays an explicit waiter action.
   */
  readonly tableSessionClosed: boolean;
  readonly wasReplay: boolean;
}

export interface AbandonTabCommand {
  readonly tabId: string;
  readonly reason: string;
  readonly clientCommandId: string;
}

/**
 * What abandoning left behind.
 *
 * The endpoint answers with the tab's totals, so `writtenOffDram` is that
 * snapshot's `remainingAmd` — the money the venue has just accepted it will not
 * see. There is no `wasReplay` on this response.
 */
export interface AbandonTabResult {
  readonly tabId: string;
  readonly writtenOffDram: number;
  readonly totals: TabTotals;
}

export interface ReassignHostCommand {
  readonly tabId: string;
  readonly newHostParticipantId: string;
  readonly clientCommandId: string;
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
  /** Who did it, when the server can say. */
  readonly actorId: string | null;
  /**
   * Their name, for "removed by Aram".
   *
   * **Null from the wire.** `TabEventView` carries `actorId` and no name, and
   * there is no endpoint that turns a staff id into one. The copy degrades to
   * "staff", which is what the diner sees today; this field exists so that the
   * day a name is projected, it is one mapper line and no screen changes.
   */
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
  /** Highest sequence on the tab, whether or not it is in this page. */
  readonly lastSequence: number;
  readonly events: readonly TabEvent[];
  readonly hasMore: boolean;
}

/**
 * One entry on the branch's change stream.
 * `Yalla.Application.Floor.BranchChange`.
 *
 * Note what is **not** here, because it is not on the wire: the derived state,
 * the party size, the next booking, and the tab id. A change says what happened
 * to a table's *physical* status and nothing about the reservation overlay, so
 * `live/sequence.ts` folds one in only where that is unambiguous.
 */
export interface FloorChange {
  readonly sequence: number;
  readonly tableId: string;
  readonly tableLabel: string;
  readonly fromStatus: TableStatus;
  readonly toStatus: TableStatus;
  readonly atUtc: string;
  readonly tableSessionId: string | null;
  readonly reservationId: string | null;
  readonly actor: TabEventActor;
  /** Who acted, as an id. Null for a system change. No name is projected. */
  readonly actorId: string | null;
  readonly reason: string;
}

export interface FloorChangePage {
  readonly branchId: string;
  readonly lastSequence: number;
  readonly changes: readonly FloorChange[];
  readonly hasMore: boolean;
}

// ---------------------------------------------------------------------------
// The tab, staff side
// ---------------------------------------------------------------------------

/**
 * A tab as staff see it.
 *
 * `Yalla.Application.Tabs.TabStaffView` carries participants and totals. The
 * lines are assembled from the branch's order queue filtered to this tab —
 * there is no staff-readable endpoint that returns a tab's lines, and
 * `GET /api/tabs/{tabId}` is `TabParticipant`-scoped, which a staff token is
 * not. `linesKnown` says whether that assembly ran, so an empty list is never
 * drawn as "nothing was ordered" when it means "not fetched".
 */
export interface StaffTab {
  readonly id: string;
  readonly branchId: string;
  readonly tableId: string;
  readonly tableLabel: string;
  readonly status: StaffTabStatus;
  readonly settlementMode: SettlementMode;
  readonly settlementModeLocked: boolean;
  readonly openedAtUtc: string;
  readonly closedAtUtc: string | null;
  readonly hostParticipantId: string | null;
  readonly participants: readonly TabStaffParticipant[];
  readonly totals: TabTotals;
  /**
   * The branch percentage, snapshotted when the tab opened.
   *
   * Not on the wire. Derived from the totals when there is a subtotal to derive
   * it from, and `null` otherwise — a zero here would render a service-charge
   * line claiming nothing is charged.
   */
  readonly serviceChargePercent: number | null;
  readonly lines: readonly TabLine[];
  /** False when the lines were not fetched. Empty and unknown are not the same. */
  readonly linesKnown: boolean;
  /**
   * Adjustments applied in this session only.
   *
   * Nothing lists a tab's adjustments back, so this holds the ones this device
   * has just made and is empty on a cold load. `adjustmentsKnown` is false
   * always, and the panel says so rather than implying there are none.
   */
  readonly adjustments: readonly TabAdjustment[];
  readonly adjustmentsKnown: boolean;
}
