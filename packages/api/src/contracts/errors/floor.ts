/**
 * Refusals on the floor: taking money, sending orders, voiding lines.
 *
 * Part of `contracts/errors`; import from there (or `@yalla/api`), not from here.
 */
import { ApiError } from '../../errors';

/**
 * More cash was offered than the tab still owes.
 *
 * The payload is the whole reason this is its own type: the waiter is standing
 * at the table holding notes, and `remainingDram` is the number they need. The
 * screen refreshes and shows it. It never retries — a payment retried against a
 * balance this device could not verify is how a table pays twice.
 */
export class PaymentExceedsRemainingError extends ApiError {
  readonly tabId: string;
  readonly remainingDram: number;
  readonly requestedDram: number;

  constructor(options: {
    url: string;
    tabId: string;
    remainingDram: number;
    requestedDram: number;
    requestId?: string | undefined;
  }) {
    super('That is more than this tab still owes.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'PaymentExceedsRemainingError';
    this.tabId = options.tabId;
    this.remainingDram = options.remainingDram;
    this.requestedDram = options.requestedDram;
  }
}

export function isPaymentExceedsRemaining(error: unknown): error is PaymentExceedsRemainingError {
  return error instanceof PaymentExceedsRemainingError;
}

/** A dish sold out between the waiter opening the menu and sending the order. */
export class MenuItemUnavailableError extends ApiError {
  readonly itemName: string;

  constructor(options: { url: string; itemName: string; requestId?: string | undefined }) {
    super(`${options.itemName} has sold out.`, {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'MenuItemUnavailableError';
    this.itemName = options.itemName;
  }
}

/** Why a tab takes no more orders, from `context.status`. Null from a server that does not say. */
export type TabNotAcceptingStatus = 'closing' | 'closed' | 'abandoned';

/** Staff asked to open a tab on a table nobody is sitting at. Seat them first. */
export class TableNotSeatedError extends ApiError {
  readonly tableId: string;

  constructor(options: { url: string; tableId: string; requestId?: string | undefined }) {
    super('Nobody is seated at this table. Seat the party first, then open the tab.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TableNotSeatedError';
    this.tableId = options.tableId;
  }
}

/** The bill has been asked for, so the tab takes no more items. Show the bill. */
export class TabNotAcceptingOrdersError extends ApiError {
  readonly tabId: string;
  /**
   * `closing` — the bill has been asked for; `closed` — paid and settled (an
   * order queued offline that lands after the table paid); `abandoned` —
   * written off. Null when the server did not say.
   */
  readonly tabStatus: TabNotAcceptingStatus | null;

  constructor(options: {
    url: string;
    tabId: string;
    tabStatus?: TabNotAcceptingStatus | null | undefined;
    requestId?: string | undefined;
  }) {
    super('This tab takes no more orders.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TabNotAcceptingOrdersError';
    this.tabId = options.tabId;
    this.tabStatus = options.tabStatus ?? null;
  }
}

/** Voiding a line the tab has already been paid against. That is a refund. */
export class LineAlreadyPaidError extends ApiError {
  readonly lineId: string;

  constructor(options: { url: string; lineId: string; requestId?: string | undefined }) {
    super('This tab has been paid against, so removing a line would be a refund.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'LineAlreadyPaidError';
    this.lineId = options.lineId;
  }
}

/** Why a named guest could not have an order put in their name. */
export type OrderGuestState = 'notOnTab' | 'pending' | 'removed';

/**
 * A waiter's order named a guest who cannot have it put in their name: not on
 * this tab (404), not let on by the host yet, or taken off it (409
 * `conflicting-state`, `context.participantStatus` 1 or 3). The whole send was
 * refused; nothing reached the kitchen.
 *
 * Told apart from everything else with the same status and code by
 * `context.participantId`, which only a guest refusal carries (FT3 wire, S7):
 * a 404 without it is a dish or the tab, a 409 without it a dish on another
 * branch's menu. Its own type because the 409 is otherwise a
 * `ConcurrencyConflictError`, which the tablet's queue would read as a table
 * race.
 */
export class OrderGuestUnavailableError extends ApiError {
  readonly participantId: string;
  /** Null when a 409 named the guest but not their state. */
  readonly guestState: OrderGuestState | null;
  /** Which field named them: `onBehalfOfParticipantId` or `items[i].participantId`. */
  readonly field: string | null;

  constructor(options: {
    url: string;
    status: 404 | 409;
    participantId: string;
    guestState: OrderGuestState | null;
    field?: string | null | undefined;
    requestId?: string | undefined;
  }) {
    super('A guest named on this order cannot have it put in their name.', {
      status: options.status,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'OrderGuestUnavailableError';
    this.participantId = options.participantId;
    this.guestState = options.guestState;
    this.field = options.field ?? null;
  }
}
