import {
  AskOnMyWayAskedRecentlyError,
  AskOnMyWayNotOpenError,
  AskOnMyWayTooEarlyError,
  BookingCommandInUseError,
  BookingNotChangeableError,
  GuestAlreadyAnsweredError,
  OnMyWayNotOpenError,
  PreOrderAlreadySentError,
  PreOrderItemsUnavailableError,
  PreOrderLockedError,
  PreOrdersNotAcceptedError,
  type UnavailablePreOrderItem,
} from '../contracts/errors';
import type { BranchMenu, MenuItemDetail, OrderStatus } from '../contracts/ordering';
import {
  PRE_ORDER_MINUTES_BEFORE_DEFAULT,
  derivePreOrderState,
  preOrderDraftViolations,
  preOrderDueAtUtc,
  preOrderLockedAtUtc,
  preOrderNote,
  type BookingPreOrderFields,
  type OnMyWayResult,
  type PreOrder,
  type PreOrderDraft,
  type PreOrderResult,
  type PreOrderSettingsInput,
} from '../contracts/preOrder';
import {
  STAFF_ASK_INTERVAL_MINUTES,
  isRunningLateMinutes,
  onMyWayOpensAtUtc,
  type AskOnMyWayResult,
  type RunningLateResult,
} from '../contracts/onMyWay';
import type { ReservationStatusCode } from '../contracts/push';
import { requireClientCommandId, validationFailed } from './problems';

/**
 * Pre-orders, as the server keeps them, for the mocks (PO wire, 2026-10-21).
 *
 * One book of pre-orders per mock world — the diner's (the app and the manage
 * link) and the floor tablet's are separate worlds, as every mock here is —
 * holding **only what people did** (the lines, the note, a send, a "not
 * coming"), exactly as the server stores it. The state is derived on every
 * read from those, the booking's status and the clock (`derivePreOrderState`),
 * so a cancelled or missed booking cannot leave a pre-order that disagrees.
 *
 * The rules a save meets, in the server's order: the command id, the
 * booking's status and start, already sent, the two-hour lock, the branch
 * switch (a save only), the bounds, then the dishes — every unavailable one
 * named and nothing saved. Prices are locked when a dish first enters the
 * pre-order and carried by dish across later saves.
 */

/** What the book reads of a booking: whoever holds it keeps the booking itself. */
export interface MockPreOrderBooking {
  readonly id: string;
  readonly branchId: string;
  readonly status: ReservationStatusCode;
  readonly startUtc: string;
  readonly endUtc: string;
}

/** One branch's settings, as the console saves them, and which dishes ran out. */
export interface MockPreOrderBranch {
  readonly acceptsPreOrders?: boolean | undefined;
  readonly minutesBefore?: number | undefined;
  readonly excludedMenuItemIds?: readonly string[] | undefined;
  /** Dishes the kitchen has run out of: `isAvailable: false` on the menu. */
  readonly soldOutMenuItemIds?: readonly string[] | undefined;
}

interface StoredLine {
  readonly id: string;
  readonly menuItemId: string;
  readonly name: string;
  readonly unitPriceDram: number;
  readonly quantity: number;
  readonly note: string | null;
}

/** A pre-order as the server stores it: what people did, never its state. */
export interface MockPreOrderRecord {
  readonly id: string;
  readonly reservationId: string;
  readonly branchId: string;
  lines: readonly StoredLine[];
  note: string | null;
  readonly createdAtUtc: string;
  updatedAtUtc: string;
  sentAtUtc: string | null;
  sentByName: string | null;
  /** The held ticket's place on the kitchen rail, then the tab order's. */
  kitchenStatus: OrderStatus | null;
  onTab: boolean;
  notComingAtUtc: string | null;
  notComingByName: string | null;
}

export interface MockPreOrderBookOptions {
  readonly now: () => Date;
  /**
   * The branch's diner menu — complete dishes only, before sold-out and
   * exclusions are applied — or `null` for a branch with none.
   */
  readonly menu: (branchId: string) => BranchMenu | null;
  /** Settings per branch. A branch not named takes the server's default: off, 30, none. */
  readonly branches?: Readonly<Record<string, MockPreOrderBranch>> | undefined;
}

interface Settings {
  acceptsPreOrders: boolean;
  minutesBefore: number;
  excluded: Set<string>;
  soldOut: Set<string>;
}

/** Who saved: the command-id rule keys on the booking, the command and the diner. */
export type MockPreOrderActor = string;

export function createMockPreOrderBook(options: MockPreOrderBookOptions) {
  const { now } = options;
  const records = new Map<string, MockPreOrderRecord>();
  const settings = new Map<string, Settings>();
  /** clientCommandId -> what it was used for. */
  const commands = new Map<string, { kind: string; reservationId: string; actor: string }>();
  /** reservationId -> when the guest first said "on my way". */
  const onMyWay = new Map<string, string>();
  /** reservationId -> the guest's "running late", the latest answer (2026-10-22). */
  const runningLate = new Map<string, { readonly minutes: number; readonly atUtc: string }>();
  /** reservationId -> when the venue last asked "are you coming?". */
  const staffAsked = new Map<string, string>();
  let counter = 0;

  for (const [branchId, branch] of Object.entries(options.branches ?? {})) {
    settings.set(branchId, {
      acceptsPreOrders: branch.acceptsPreOrders ?? false,
      minutesBefore: branch.minutesBefore ?? PRE_ORDER_MINUTES_BEFORE_DEFAULT,
      excluded: new Set(branch.excludedMenuItemIds ?? []),
      soldOut: new Set(branch.soldOutMenuItemIds ?? []),
    });
  }

  function settingsOf(branchId: string): Settings {
    let found = settings.get(branchId);
    if (!found) {
      found = {
        acceptsPreOrders: false,
        minutesBefore: PRE_ORDER_MINUTES_BEFORE_DEFAULT,
        excluded: new Set(),
        soldOut: new Set(),
      };
      settings.set(branchId, found);
    }
    return found;
  }

  function dishesOf(branchId: string): Map<string, MenuItemDetail> {
    const menu = options.menu(branchId);
    return new Map(
      (menu?.categories ?? []).flatMap((category) =>
        category.items.map((item) => [item.id, item] as const),
      ),
    );
  }

  /** Why a dish cannot be pre-ordered now, or `null` when it can. */
  function unavailableBecause(
    branchId: string,
    menuItemId: string,
    dishes: Map<string, MenuItemDetail>,
  ): UnavailablePreOrderItem['reason'] | null {
    const dish = dishes.get(menuItemId);
    const branch = settingsOf(branchId);
    if (!dish) return 'notOnMenu';
    if (!dish.isAvailable || branch.soldOut.has(menuItemId)) return 'soldOut';
    if (branch.excluded.has(menuItemId)) return 'notForPreOrder';
    return null;
  }

  function stateOf(record: MockPreOrderRecord, booking: MockPreOrderBooking) {
    return derivePreOrderState(
      {
        bookingStatus: booking.status,
        startUtc: booking.startUtc,
        sentAtUtc: record.sentAtUtc,
        notComingAtUtc: record.notComingAtUtc,
      },
      now(),
    );
  }

  function view(booking: MockPreOrderBooking): PreOrder | null {
    const record = records.get(booking.id);
    if (!record) return null;
    const dishes = dishesOf(booking.branchId);
    const lines = record.lines.map((line) => ({
      id: line.id,
      menuItemId: line.menuItemId,
      name: line.name,
      unitPriceDram: line.unitPriceDram,
      quantity: line.quantity,
      lineTotalDram: line.unitPriceDram * line.quantity,
      note: line.note,
      availableNow: unavailableBecause(booking.branchId, line.menuItemId, dishes) === null,
    }));
    return {
      id: record.id,
      reservationId: record.reservationId,
      state: stateOf(record, booking),
      lines,
      note: record.note,
      totalDram: lines.reduce((sum, line) => sum + line.lineTotalDram, 0),
      editableUntilUtc: preOrderLockedAtUtc(booking.startUtc),
      dueAtUtc: preOrderDueAtUtc(booking.startUtc, settingsOf(booking.branchId).minutesBefore),
      sentAtUtc: record.sentAtUtc,
      kitchenStatus: record.kitchenStatus,
      onTab: record.onTab,
      notComingAtUtc: record.notComingAtUtc,
      updatedAtUtc: record.updatedAtUtc,
    };
  }

  /**
   * The members a booking read carries — only those that have a value, so a
   * booking at a branch that never took pre-orders reads as it always did —
   * and when "I'm coming" opens, which every booking read has (2026-10-22).
   */
  function fields(booking: MockPreOrderBooking): BookingPreOrderFields {
    const preOrder = view(booking);
    const offered =
      settingsOf(booking.branchId).acceptsPreOrders &&
      (booking.status === 'pendingApproval' || booking.status === 'confirmed') &&
      now().getTime() < Date.parse(booking.startUtc);
    const answered = onMyWay.get(booking.id);
    const late = runningLate.get(booking.id);
    const asked = staffAsked.get(booking.id);
    return {
      ...(preOrder ? { preOrder } : {}),
      ...(offered ? { preOrderEditableUntilUtc: preOrderLockedAtUtc(booking.startUtc) } : {}),
      ...(answered ? { guestConfirmedOnWayAtUtc: answered } : {}),
      ...(late ? { guestRunningLateMinutes: late.minutes, guestRunningLateAtUtc: late.atUtc } : {}),
      ...(asked ? { staffAskedOnMyWayAtUtc: asked } : {}),
      onMyWayOpensAtUtc: onMyWayOpensAtUtc(booking.startUtc),
    };
  }

  /** The command id: a replay answers as it stands; a reuse for anything else is a 409. */
  function replayOf(
    url: string,
    kind: string,
    booking: MockPreOrderBooking,
    clientCommandId: string,
    actor: MockPreOrderActor,
  ): PreOrderResult | null {
    requireClientCommandId(url, clientCommandId);
    const used = commands.get(clientCommandId);
    if (!used) return null;
    if (used.kind !== kind || used.reservationId !== booking.id || used.actor !== actor) {
      throw new BookingCommandInUseError({ url });
    }
    return { reservationId: booking.id, preOrder: view(booking), wasReplay: true };
  }

  /** Not pending or confirmed, or started; sent; locked — a save's and a clear's shared gates. */
  function requireChangeable(url: string, booking: MockPreOrderBooking): void {
    const t = now().getTime();
    if (
      (booking.status !== 'pendingApproval' && booking.status !== 'confirmed') ||
      t >= Date.parse(booking.startUtc)
    ) {
      throw new BookingNotChangeableError({ url, reservationId: booking.id });
    }
    const record = records.get(booking.id);
    if (record?.sentAtUtc) {
      throw new PreOrderAlreadySentError({
        url,
        reservationId: booking.id,
        sentAtUtc: record.sentAtUtc,
      });
    }
    const lockedAtUtc = preOrderLockedAtUtc(booking.startUtc);
    if (t >= Date.parse(lockedAtUtc)) {
      throw new PreOrderLockedError({ url, reservationId: booking.id, lockedAtUtc });
    }
  }

  return {
    view,
    fields,

    /** The record itself, for a mock that sends it or seats its party. */
    record(reservationId: string): MockPreOrderRecord | undefined {
      return records.get(reservationId);
    },

    /** Every record, for the floor's rail. */
    records(): readonly MockPreOrderRecord[] {
      return [...records.values()];
    },

    settings(branchId: string): PreOrderSettingsInput & { readonly soldOut: readonly string[] } {
      const branch = settingsOf(branchId);
      return {
        acceptsPreOrders: branch.acceptsPreOrders,
        minutesBefore: branch.minutesBefore,
        excludedMenuItemIds: [...branch.excluded],
        soldOut: [...branch.soldOut],
      };
    },

    /** The console's save, or the venue changing its mind in a test. */
    setSettings(branchId: string, input: PreOrderSettingsInput): void {
      const branch = settingsOf(branchId);
      branch.acceptsPreOrders = input.acceptsPreOrders;
      branch.minutesBefore = input.minutesBefore;
      branch.excluded = new Set(input.excludedMenuItemIds);
    },

    /** The kitchen ran out of a dish, or has it again. */
    setSoldOut(branchId: string, menuItemId: string, soldOut: boolean): void {
      const branch = settingsOf(branchId);
      if (soldOut) branch.soldOut.add(menuItemId);
      else branch.soldOut.delete(menuItemId);
    },

    /** The diner menu as the server serves it: sold-out and pre-orderable per dish. */
    decorateMenu(menu: BranchMenu): BranchMenu {
      const branch = settingsOf(menu.branchId);
      return {
        ...menu,
        categories: menu.categories.map((category) => ({
          ...category,
          items: category.items.map((item) => ({
            ...item,
            isAvailable: item.isAvailable && !branch.soldOut.has(item.id),
            availableForPreOrder: !branch.excluded.has(item.id),
          })),
        })),
      };
    },

    /** `PUT …/pre-order`: the whole pre-order, by the server's rules in its order. */
    replace(input: {
      readonly url: string;
      readonly booking: MockPreOrderBooking;
      readonly draft: PreOrderDraft;
      readonly clientCommandId: string;
      readonly actor: MockPreOrderActor;
    }): PreOrderResult {
      const { url, booking, draft, clientCommandId, actor } = input;
      const replay = replayOf(url, 'replace', booking, clientCommandId, actor);
      if (replay) return replay;
      requireChangeable(url, booking);
      if (!settingsOf(booking.branchId).acceptsPreOrders) {
        throw new PreOrdersNotAcceptedError({ url, branchId: booking.branchId });
      }
      const violations = preOrderDraftViolations(draft);
      if (violations.length > 0) {
        throw validationFailed(
          url,
          violations.map((violation) => ({
            field: violation.field,
            message: violation.message,
            ...(violation.bound !== undefined ? { bound: violation.bound } : {}),
            ...(violation.min !== undefined ? { min: violation.min } : {}),
            ...(violation.max !== undefined ? { max: violation.max } : {}),
          })),
        );
      }

      const dishes = dishesOf(booking.branchId);
      const offenders: UnavailablePreOrderItem[] = [];
      for (const entry of draft.lines) {
        const reason = unavailableBecause(booking.branchId, entry.menuItemId, dishes);
        if (reason && !offenders.some((item) => item.menuItemId === entry.menuItemId)) {
          offenders.push({ menuItemId: entry.menuItemId, reason });
        }
      }
      if (offenders.length > 0) throw new PreOrderItemsUnavailableError({ url, items: offenders });

      const at = now().toISOString();
      const existing = records.get(booking.id);
      const id = existing?.id ?? `po-${(counter += 1)}`;
      // The price a dish had when it first entered the pre-order, carried by dish.
      const locked = new Map(
        (existing?.lines ?? []).map((line) => [line.menuItemId, line] as const),
      );
      const lines = draft.lines.map((entry, index): StoredLine => {
        const before = locked.get(entry.menuItemId);
        const dish = dishes.get(entry.menuItemId);
        return {
          id: `${id}-l${index + 1}`,
          menuItemId: entry.menuItemId,
          name: before?.name ?? dish?.name ?? '',
          unitPriceDram: before?.unitPriceDram ?? dish?.priceDram ?? 0,
          quantity: entry.quantity,
          note: preOrderNote(entry.note),
        };
      });
      if (existing) {
        existing.lines = lines;
        existing.note = preOrderNote(draft.note);
        existing.updatedAtUtc = at;
      } else {
        records.set(booking.id, {
          id,
          reservationId: booking.id,
          branchId: booking.branchId,
          lines,
          note: preOrderNote(draft.note),
          createdAtUtc: at,
          updatedAtUtc: at,
          sentAtUtc: null,
          sentByName: null,
          kitchenStatus: null,
          onTab: false,
          notComingAtUtc: null,
          notComingByName: null,
        });
      }
      commands.set(clientCommandId, { kind: 'replace', reservationId: booking.id, actor });
      return { reservationId: booking.id, preOrder: view(booking), wasReplay: false };
    },

    /** `POST …/pre-order/clear`: the same window, whether or not the branch still takes them. */
    clear(input: {
      readonly url: string;
      readonly booking: MockPreOrderBooking;
      readonly clientCommandId: string;
      readonly actor: MockPreOrderActor;
    }): PreOrderResult {
      const { url, booking, clientCommandId, actor } = input;
      const replay = replayOf(url, 'clear', booking, clientCommandId, actor);
      if (replay) return replay;
      requireChangeable(url, booking);
      records.delete(booking.id);
      commands.set(clientCommandId, { kind: 'clear', reservationId: booking.id, actor });
      return { reservationId: booking.id, preOrder: null, wasReplay: false };
    },

    /**
     * "Yes, on my way": confirmed or seated and not over; once — unless the
     * guest said "running late" since: on time after all, the lateness is
     * cleared and "on my way" stamped again.
     */
    confirmOnMyWay(url: string, booking: MockPreOrderBooking): OnMyWayResult {
      const first = onMyWay.get(booking.id);
      if (first && !runningLate.has(booking.id)) {
        return { reservationId: booking.id, guestConfirmedOnWayAtUtc: first, wasReplay: true };
      }
      if (
        (booking.status !== 'confirmed' && booking.status !== 'seated') ||
        now().getTime() >= Date.parse(booking.endUtc)
      ) {
        throw new OnMyWayNotOpenError({
          url,
          reservationId: booking.id,
          bookingStatus: booking.status,
          // The server's window: start − 2 h, always on the refusal.
          opensAtUtc: new Date(Date.parse(booking.startUtc) - 2 * 60 * 60_000).toISOString(),
        });
      }
      const at = now().toISOString();
      onMyWay.set(booking.id, at);
      runningLate.delete(booking.id);
      return { reservationId: booking.id, guestConfirmedOnWayAtUtc: at, wasReplay: false };
    },

    /**
     * "I'm running late" (2026-10-22): 10, 15 or 30, a confirmed booking, from
     * two hours before the start until it ends. A later answer overwrites it;
     * "on my way" stays beside it.
     */
    reportRunningLate(
      url: string,
      booking: MockPreOrderBooking,
      minutes: number,
    ): RunningLateResult {
      if (!isRunningLateMinutes(minutes)) {
        throw validationFailed(url, [
          { field: 'minutes', message: 'minutes must be 10, 15 or 30.', bound: 'range' },
        ]);
      }
      const t = now().getTime();
      const opensAtUtc = onMyWayOpensAtUtc(booking.startUtc);
      if (
        booking.status !== 'confirmed' ||
        t < Date.parse(opensAtUtc) ||
        t >= Date.parse(booking.endUtc)
      ) {
        throw new OnMyWayNotOpenError({
          url,
          reservationId: booking.id,
          bookingStatus: booking.status,
          opensAtUtc,
        });
      }
      const atUtc = new Date(t).toISOString();
      runningLate.set(booking.id, { minutes, atUtc });
      return {
        reservationId: booking.id,
        guestRunningLateMinutes: minutes,
        guestRunningLateAtUtc: atUtc,
        expectedArrivalUtc: new Date(Date.parse(booking.startUtc) + minutes * 60_000).toISOString(),
      };
    },

    /**
     * The venue's "Ask: are you coming?" (2026-10-22): a confirmed booking,
     * from two hours before its start until its start, while the guest has
     * not answered, at most once every fifteen minutes. `notified` is the
     * caller's: whether a live account stands behind the booking.
     */
    askOnMyWay(url: string, booking: MockPreOrderBooking, notified: boolean): AskOnMyWayResult {
      const t = now().getTime();
      if (booking.status !== 'confirmed' || t >= Date.parse(booking.startUtc)) {
        throw new AskOnMyWayNotOpenError({
          url,
          reservationId: booking.id,
          bookingStatus: booking.status,
          startUtc: booking.startUtc,
        });
      }
      const opensAtUtc = onMyWayOpensAtUtc(booking.startUtc);
      if (t < Date.parse(opensAtUtc)) {
        throw new AskOnMyWayTooEarlyError({ url, reservationId: booking.id, opensAtUtc });
      }
      const late = runningLate.get(booking.id);
      const onWay = onMyWay.get(booking.id);
      if (late || onWay) {
        throw new GuestAlreadyAnsweredError({
          url,
          reservationId: booking.id,
          answeredAtUtc: late?.atUtc ?? onWay ?? null,
          runningLateMinutes: late?.minutes ?? null,
        });
      }
      const last = staffAsked.get(booking.id);
      const interval = STAFF_ASK_INTERVAL_MINUTES * 60_000;
      if (last && t < Date.parse(last) + interval) {
        throw new AskOnMyWayAskedRecentlyError({
          url,
          reservationId: booking.id,
          askedAtUtc: last,
          nextAllowedAtUtc: new Date(Date.parse(last) + interval).toISOString(),
        });
      }
      const atUtc = new Date(t).toISOString();
      staffAsked.set(booking.id, atUtc);
      return {
        reservationId: booking.id,
        staffAskedOnMyWayAtUtc: atUtc,
        nextAskAllowedAtUtc: new Date(t + interval).toISOString(),
        notified,
      };
    },

    runningLateOf(
      reservationId: string,
    ): { readonly minutes: number; readonly atUtc: string } | null {
      return runningLate.get(reservationId) ?? null;
    },

    staffAskedAt(reservationId: string): string | null {
      return staffAsked.get(reservationId) ?? null;
    },

    /** Seed a "running late", as a floor that starts with a guest running late. */
    seedRunningLate(reservationId: string, minutes: number, atUtc: string): void {
      runningLate.set(reservationId, { minutes, atUtc });
    },

    /** Seed the venue's ask, as a floor that asked a moment ago. */
    seedStaffAsked(reservationId: string, atUtc: string): void {
      staffAsked.set(reservationId, atUtc);
    },

    onMyWayAt(reservationId: string): string | null {
      return onMyWay.get(reservationId) ?? null;
    },

    /** Seed an answer, as a floor that starts with a guest already on the way. */
    seedOnMyWay(reservationId: string, atUtc: string): void {
      onMyWay.set(reservationId, atUtc);
    },

    /**
     * A move of the booking: refused once the kitchen has the pre-order;
     * otherwise "not coming" is cleared (new time, new call) and the lock is
     * judged against the new start on the next read.
     */
    beforeMove(url: string, reservationId: string): void {
      const record = records.get(reservationId);
      if (!record) return;
      if (record.sentAtUtc) {
        throw new PreOrderAlreadySentError({ url, reservationId, sentAtUtc: record.sentAtUtc });
      }
      record.notComingAtUtc = null;
      record.notComingByName = null;
    },

    /** A waiter's Send: the held ticket enters the kitchen at once. */
    markSent(reservationId: string, byName: string | null): MockPreOrderRecord | undefined {
      const record = records.get(reservationId);
      if (!record || record.sentAtUtc) return record;
      const at = now().toISOString();
      record.sentAtUtc = at;
      record.sentByName = byName;
      record.kitchenStatus = 'inKitchen';
      record.updatedAtUtc = at;
      return record;
    },

    /** A waiter's "Not coming / no answer". */
    markNotComing(reservationId: string, byName: string | null): MockPreOrderRecord | undefined {
      const record = records.get(reservationId);
      if (!record || record.sentAtUtc || record.notComingAtUtc) return record;
      const at = now().toISOString();
      record.notComingAtUtc = at;
      record.notComingByName = byName;
      record.updatedAtUtc = at;
      return record;
    },

    /** Seed one, as the floor tablet's mock world starts with. */
    seed(record: Omit<MockPreOrderRecord, 'id'> & { readonly id?: string }): MockPreOrderRecord {
      const seeded: MockPreOrderRecord = { ...record, id: record.id ?? `po-${(counter += 1)}` };
      records.set(seeded.reservationId, seeded);
      return seeded;
    },
  };
}

export type MockPreOrderBook = ReturnType<typeof createMockPreOrderBook>;

/**
 * Mock mode's pre-orders for the diner's world (`resolveGateway`'s
 * `mockPreOrders`): Northern Avenue takes them, with the gata excluded — the
 * same as the console mock's `seedPreOrders`. Every other branch is off.
 */
export const MOCK_PRE_ORDER_BRANCHES: Readonly<Record<string, MockPreOrderBranch>> = {
  'b-lumen-north': { acceptsPreOrders: true, minutesBefore: 30, excludedMenuItemIds: ['gata'] },
};
