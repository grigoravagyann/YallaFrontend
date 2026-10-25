import type {
  AcknowledgeServiceRequestCommand,
  OrderGuestState,
  TabNotAcceptingStatus,
  PlaceOrderCommand,
  RecordCashPaymentCommand,
  SetOrderStatusCommand,
  TableActionCommand,
  TableActionKind,
  TableConflictState,
  TablePrecondition,
} from '@yalla/api';

/**
 * Everything a waiter can do that has to reach the server.
 *
 * One union rather than a method per action, because the offline queue has to
 * store, order, replay and explain all of them uniformly. A command that is not
 * in this union cannot be queued, which is the point: it is a closed list, and
 * adding to it is a decision rather than an accident.
 */
export type StaffCommandKind =
  | TableActionKind
  | 'placeOrder'
  | 'setOrderStatus'
  | 'acknowledgeServiceRequest'
  | 'recordCashPayment';

export type StaffCommandBody =
  | { readonly kind: TableActionKind; readonly command: TableActionCommand }
  | { readonly kind: 'placeOrder'; readonly command: PlaceOrderCommand }
  | { readonly kind: 'setOrderStatus'; readonly command: SetOrderStatusCommand }
  | {
      readonly kind: 'acknowledgeServiceRequest';
      readonly command: AcknowledgeServiceRequestCommand;
    }
  | { readonly kind: 'recordCashPayment'; readonly command: RecordCashPaymentCommand };

/**
 * The four families that survive being taken offline.
 *
 * Payments are absent and that is the whole design. A cash payment recorded
 * against a balance this device cannot verify is how a table gets charged
 * twice: the tablet has no way to know that the other tablet took 8,000 dram
 * two minutes ago, and "the balance was zero when I tapped" is not a fact
 * anybody can check afterwards. Offline, the waiter takes the cash and records
 * it when the connection returns — which is exactly what they would do with a
 * paper bill.
 *
 * Voids, comps and abandonments are absent for the same reason in a different
 * direction: they change what is owed, and a queued adjustment replayed against
 * a bill that has moved on is an argument at the counter.
 */
const QUEUEABLE: ReadonlySet<StaffCommandKind> = new Set<StaffCommandKind>([
  'seatWalkIn',
  'seatReservation',
  'seatHeldParty',
  'hold',
  'releaseHold',
  'freeTable',
  'outOfService',
  'returnToService',
  'placeOrder',
  'setOrderStatus',
  'acknowledgeServiceRequest',
]);

export function isQueueable(kind: StaffCommandKind): boolean {
  return QUEUEABLE.has(kind);
}

/** The eight table transitions, as a runtime check the reducer can use. */
const TABLE_ACTIONS: ReadonlySet<string> = new Set<TableActionKind>([
  'seatWalkIn',
  'seatReservation',
  'seatHeldParty',
  'hold',
  'releaseHold',
  'freeTable',
  'outOfService',
  'returnToService',
]);

export function isTableAction(kind: StaffCommandKind): kind is TableActionKind {
  return TABLE_ACTIONS.has(kind);
}

/**
 * What a command acts on, in ids and labels only.
 *
 * Deliberately not a rendered sentence. A queue entry can outlive a language
 * change — the tablet is shared and the next waiter may read Armenian — so the
 * conflict list translates at render time from these fields.
 */
export interface CommandSubject {
  readonly tableId: string | null;
  readonly tableLabel: string | null;
  readonly tabId: string | null;
  /** For an order: how many items, so the list can say what was attempted. */
  readonly itemCount?: number | undefined;
}

/**
 * Who took a command: the person signed in when it was tapped.
 *
 * A tablet is shared, and a command queued offline can outlive a sign-in. It is
 * sent under its own person's sign-in, or under somebody else's only when that
 * somebody says so on the conflicts screen (`conflictPolicy.ts`).
 */
export interface CommandAuthor {
  readonly staffMemberId: string;
  readonly name: string;
}

export interface QueuedCommand {
  /** The `clientCommandId`. Generated once per tap and reused on every retry. */
  readonly id: string;
  readonly kind: StaffCommandKind;
  /**
   * What this is ordered within — a table id, or a tab id for an order.
   *
   * Commands replay in order globally, and within a scope that order is
   * load-bearing: a "free table" that overtook the "seat walk-in" it followed
   * would leave the floor wrong in a way nobody would think to check.
   */
  readonly scope: string;
  /** Monotonic within this device. The replay order. */
  readonly seq: number;
  /** When the waiter tapped, not when it was sent. The conflict list says this. */
  readonly takenAtMs: number;
  readonly attempts: number;
  /**
   * The state and the version the table had when the panel opened.
   *
   * Null for a command with no table precondition, and null after "apply
   * anyway" — which is exactly what that button means.
   */
  readonly precondition: TablePrecondition | null;
  /**
   * The tablet had no connection when the waiter tapped.
   *
   * Sent to the server as `queued`, which is how it decides to insist on a
   * precondition. Attempt count alone is not enough: a command taken with the
   * wifi off is never *attempted*, so it would reach the server on reconnect
   * looking exactly like a live tap — which is the one thing it is not.
   */
  readonly takenOffline: boolean;
  readonly subject: CommandSubject;
  readonly body: StaffCommandBody;
  /**
   * Who took it. Absent on a command a build from before this was kept queued
   * — sent as it always was — and when nobody is signed in (the mock).
   */
  readonly by?: CommandAuthor | null | undefined;
}

/** A command whose precondition no longer holds. Never resolved automatically. */
export interface ConflictEntry {
  readonly command: QueuedCommand;
  readonly detectedAtMs: number;
  /**
   * What the table looks like now, from the server.
   *
   * Null when the server refused without a usable payload; the list then says
   * what was attempted and that the table has since changed, rather than
   * inventing a state.
   */
  readonly observed: TableConflictState | null;
  /**
   * Why it could not be applied. Three cases, and they are not interchangeable:
   *
   * - `precondition` — the command's precondition no longer held. Either the
   *   local check caught it before sending, or the server answered
   *   `precondition-failed`. Never a live race by construction: a precondition
   *   only fails for a command that waited. `observed.failure` says which half
   *   went, and the two are worded differently.
   * - `conflict` — the server answered `table-state-conflict`: somebody else
   *   changed the table first. This is the only one that can be a live race.
   * - `refused` — the server answered 422, or refused on the command's own
   *   merits. Not a race, and re-sending it unchanged would fail identically,
   *   so it is never resolved automatically in either direction.
   */
  readonly reason: 'precondition' | 'conflict' | 'refused';
  /**
   * What the server said was wrong, so the order screen and the conflicts
   * screen can say it in words: an order's own reason, or that the thing acted
   * on is gone (404) or that this sign-in may not do it (403). Absent where the
   * server gave nothing more, and on entries a build from before this stored.
   */
  readonly refusal?: CommandRefusal | undefined;
}

/** Why the server refused a command, beyond its status. */
export type CommandRefusal =
  | OrderRefusal
  | { readonly kind: 'notFound' }
  | { readonly kind: 'forbidden' }
  /**
   * An order voided whole on a tab already paid against (2026-10-25): the
   * void would take money off a paid bill, which is a refund. A manager comps.
   */
  | { readonly kind: 'lineAlreadyPaid' };

/** Why the server would not take an order. The whole send was refused; nothing was placed. */
export type OrderRefusal =
  /**
   * A guest named on a line is not on the tab, not let on yet, or taken off.
   * Who and why are absent on an entry stored before the server said.
   */
  | {
      readonly kind: 'guestUnavailable';
      readonly participantId?: string | null | undefined;
      readonly guestState?: OrderGuestState | null | undefined;
    }
  | { readonly kind: 'soldOut'; readonly itemName: string }
  /** The tab takes no more orders: the bill asked for, paid and closed, or written off. */
  | { readonly kind: 'notAccepting'; readonly tabStatus?: TabNotAcceptingStatus | null | undefined }
  | { readonly kind: 'other' };

export interface CommandState {
  readonly queue: readonly QueuedCommand[];
  readonly conflicts: readonly ConflictEntry[];
  readonly nextSeq: number;
  readonly syncing: boolean;
}

export const initialCommandState: CommandState = {
  queue: [],
  conflicts: [],
  nextSeq: 1,
  syncing: false,
};

/** What a caller hands to `enqueued`; the reducer stamps the rest. */
export interface NewCommand {
  readonly id: string;
  readonly scope: string;
  readonly precondition: TablePrecondition | null;
  readonly subject: CommandSubject;
  readonly body: StaffCommandBody;
}

/** True when the browser says there is no connection. Safe where there is no navigator. */
export function takenOfflineNow(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
