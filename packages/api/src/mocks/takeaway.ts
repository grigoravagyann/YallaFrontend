import { instantFromZonedClock, zonedParts, type TimeZone } from '@yalla/format';
import type { SpecialDay, WeeklyHours } from '../contracts/branchSettings';
import {
  BookingCommandInUseError,
  TakeawayBusyError,
  TakeawayClosedError,
  TakeawayItemsUnavailableError,
  TakeawayNoShowTooEarlyError,
  TakeawayNotAcceptedError,
  TakeawaySlotUnavailableError,
  TakeawayStatusConflictError,
  type UnavailableTakeawayItem,
} from '../contracts/errors';
import { openStateFrom } from '../contracts/openState';
import type { BranchMenu, MenuItemDetail, OrderQueueEntry } from '../contracts/ordering';
import type { DinerOrder } from '../contracts/places';
import {
  DEFAULT_TAKEAWAY_SETTINGS,
  TAKEAWAY_ACCEPT_WINDOW_MINUTES,
  TAKEAWAY_LIMITS,
  TAKEAWAY_SLOT_STEP_MINUTES,
  isTakeawayActive,
  isTakeawayInProgress,
  takeawayItemCount,
  takeawayNoShowFromUtc,
  takeawayNote,
  takeawayOrderViolations,
  takeawaySettingsViolations,
  type BranchTakeawayOrders,
  type PlaceTakeawayOrderCommand,
  type PublicTakeawayInfo,
  type StaffTakeawayOrder,
  type TakeawayAvailability,
  type TakeawayDeclineCause,
  type TakeawayOrder,
  type TakeawayPaymentMethod,
  type TakeawaySettings,
  type TakeawaySettingsInput,
  type TakeawayStatus,
} from '../contracts/takeaway';
import { NotFoundError, type FieldViolation } from '../errors';
import { requireClientCommandId, validationFailed, type MockViolation } from './problems';

/**
 * Takeaway, as the server keeps it, for the mocks (`docs/takeaway.md`,
 * 2026-10-22).
 *
 * One book per mock world — the diner's and the floor tablet's are separate
 * worlds, as every mock here is — holding the orders, the branches' settings
 * and which dishes are hall-only. The rules a guest's order meets, in the
 * server's order: the command id, the shape, the branch switch, the opening
 * hours and the last order, the kitchen's capacity (ASAP) or the slot, then
 * the dishes — every unavailable one named and nothing saved. Names and prices
 * are snapshotted on the lines. A sent order nobody answers within five
 * minutes is declined on the next read (the server's sweep).
 */

/** Where a branch is and when it is open: what the book reads of a branch. */
export interface MockTakeawayPlace {
  readonly venueName: string;
  readonly branchName: string;
  readonly branchAddress: string;
  readonly branchPhoneE164: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly timeZoneId: string;
  readonly weeklyHours: WeeklyHours;
  readonly specialDays?: readonly SpecialDay[] | undefined;
}

/** One branch's settings, as the console saves them, and its hall-only dishes. */
export interface MockTakeawayBranch extends Partial<TakeawaySettingsInput> {
  /** Dishes switched to "only in the hall": `availableForTakeaway: false`. */
  readonly notForTakeawayMenuItemIds?: readonly string[] | undefined;
}

export interface MockTakeawayBookOptions {
  readonly now: () => Date;
  /** The branch's diner menu — complete dishes only — or `null` for a branch with none. */
  readonly menu: (branchId: string) => BranchMenu | null;
  /** Where the branch is and its hours, or `null` for a branch diners cannot see. */
  readonly place: (branchId: string) => MockTakeawayPlace | null;
  /** Settings per branch. A branch not named takes the server's default: off. */
  readonly branches?: Readonly<Record<string, MockTakeawayBranch>> | undefined;
  /**
   * An order moved — placed, accepted, declined, cancelled, ready, collected or
   * not collected, by a person or by the sweep; never on a replay. The floor's
   * mock writes the change stream's `takeawayChanged` row from it, as the
   * server's `TakeawayChangeStream` does (2026-10-26). `reason` is the row's.
   */
  readonly onChanged?: ((record: MockTakeawayRecord, reason: string) => void) | undefined;
}

interface StoredLine {
  readonly id: string;
  readonly menuItemId: string;
  readonly name: string;
  readonly unitPriceDram: number;
  readonly quantity: number;
}

/** An order as the server stores it. */
export interface MockTakeawayRecord {
  readonly id: string;
  readonly code: string;
  readonly branchId: string;
  /** Who placed it: the command-id rule and the diner's own reads key on it. */
  readonly actor: string;
  readonly guestName: string;
  readonly guestPhone: string;
  readonly lines: readonly StoredLine[];
  readonly note: string | null;
  readonly pickupAsap: boolean;
  readonly requestedPickupUtc: string;
  status: TakeawayStatus;
  readonly sentAtUtc: string;
  acceptDeadlineUtc: string | null;
  readyAtUtc: string | null;
  acceptedAtUtc: string | null;
  acceptedByName: string | null;
  readyMarkedAtUtc: string | null;
  collectedAtUtc: string | null;
  declinedAtUtc: string | null;
  cancelledAtUtc: string | null;
  noShowAtUtc: string | null;
  declinedBecause: TakeawayDeclineCause | null;
  declineReason: string | null;
  paymentMethod: TakeawayPaymentMethod | null;
  paidAmountDram: number | null;
}

type Settings = { -readonly [K in keyof TakeawaySettingsInput]: TakeawaySettingsInput[K] } & {
  notForTakeaway: Set<string>;
};

/** What `seed` takes: a record less what the book derives. */
export type MockTakeawaySeed = Omit<
  MockTakeawayRecord,
  'id' | 'code' | 'acceptDeadlineUtc' | 'status'
> & {
  readonly id?: string | undefined;
  readonly code?: string | undefined;
  readonly status: TakeawayStatus;
  readonly acceptDeadlineUtc?: string | null | undefined;
};

const MINUTE = 60_000;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

/** "19:15" on the branch's clock. */
function wallClock(instant: number, timeZoneId: string): string {
  const parts = zonedParts(new Date(instant), timeZoneId as TimeZone);
  return `${two(parts.hour)}:${two(parts.minute)}`;
}

function toMock(violations: readonly FieldViolation[]): MockViolation[] {
  return violations.map((violation) => ({
    field: violation.field,
    message: violation.message,
    ...(violation.bound !== undefined ? { bound: violation.bound } : {}),
    ...(violation.min !== undefined ? { min: violation.min } : {}),
    ...(violation.max !== undefined ? { max: violation.max } : {}),
  }));
}

export function createMockTakeawayBook(options: MockTakeawayBookOptions) {
  const { now } = options;
  const changed = (record: MockTakeawayRecord, reason: string) =>
    options.onChanged?.(record, reason);
  const records = new Map<string, MockTakeawayRecord>();
  const settings = new Map<string, Settings>();
  /** clientCommandId -> the order it placed and who placed it. */
  const commands = new Map<string, { orderId: string; actor: string }>();
  let counter = 0;

  for (const [branchId, branch] of Object.entries(options.branches ?? {})) {
    settings.set(branchId, {
      enabled: branch.enabled ?? DEFAULT_TAKEAWAY_SETTINGS.enabled,
      autoAccept: branch.autoAccept ?? DEFAULT_TAKEAWAY_SETTINGS.autoAccept,
      prepMinutes: branch.prepMinutes ?? DEFAULT_TAKEAWAY_SETTINGS.prepMinutes,
      lastOrderMinutes: branch.lastOrderMinutes ?? DEFAULT_TAKEAWAY_SETTINGS.lastOrderMinutes,
      maxInProgress: branch.maxInProgress ?? DEFAULT_TAKEAWAY_SETTINGS.maxInProgress,
      notForTakeaway: new Set(branch.notForTakeawayMenuItemIds ?? []),
    });
  }

  function settingsOf(branchId: string): Settings {
    let found = settings.get(branchId);
    if (!found) {
      found = {
        enabled: DEFAULT_TAKEAWAY_SETTINGS.enabled,
        autoAccept: DEFAULT_TAKEAWAY_SETTINGS.autoAccept,
        prepMinutes: DEFAULT_TAKEAWAY_SETTINGS.prepMinutes,
        lastOrderMinutes: DEFAULT_TAKEAWAY_SETTINGS.lastOrderMinutes,
        maxInProgress: DEFAULT_TAKEAWAY_SETTINGS.maxInProgress,
        notForTakeaway: new Set(),
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

  /** Why a dish cannot be ordered to take away now, or `null` when it can. */
  function unavailableBecause(
    branchId: string,
    menuItemId: string,
    dishes: Map<string, MenuItemDetail>,
  ): UnavailableTakeawayItem['reason'] | null {
    const dish = dishes.get(menuItemId);
    if (!dish) return 'notOnMenu';
    if (!dish.isAvailable) return 'soldOut';
    if (settingsOf(branchId).notForTakeaway.has(menuItemId)) return 'notForTakeaway';
    return null;
  }

  /** The server's sweep: a sent order nobody answered within five minutes is declined. */
  function sweep(): void {
    const t = now().getTime();
    for (const record of records.values()) {
      if (record.status !== 'sent' || !record.acceptDeadlineUtc) continue;
      if (t < Date.parse(record.acceptDeadlineUtc)) continue;
      if (settingsOf(record.branchId).autoAccept) {
        // A branch switched to auto-accept since: accepted instead.
        accepted(record, record.requestedPickupUtc, null, record.acceptDeadlineUtc);
        changed(record, 'takeaway accepted');
        continue;
      }
      record.status = 'declined';
      record.declinedAtUtc = record.acceptDeadlineUtc;
      record.declinedBecause = 'noAnswer';
      record.acceptDeadlineUtc = null;
      changed(record, 'takeaway declined');
    }
  }

  function accepted(
    record: MockTakeawayRecord,
    readyAtUtc: string,
    byName: string | null,
    atUtc: string,
  ): void {
    record.status = 'accepted';
    record.readyAtUtc = readyAtUtc;
    record.acceptedAtUtc = atUtc;
    record.acceptedByName = byName;
    record.acceptDeadlineUtc = null;
  }

  function placeOf(branchId: string): MockTakeawayPlace {
    return (
      options.place(branchId) ?? {
        venueName: '',
        branchName: '',
        branchAddress: '',
        branchPhoneE164: null,
        latitude: 0,
        longitude: 0,
        timeZoneId: 'Asia/Yerevan',
        weeklyHours: [],
      }
    );
  }

  function lineViews(record: MockTakeawayRecord) {
    return record.lines.map((line) => ({
      id: line.id,
      menuItemId: line.menuItemId,
      name: line.name,
      unitPriceDram: line.unitPriceDram,
      quantity: line.quantity,
      lineTotalDram: line.unitPriceDram * line.quantity,
    }));
  }

  function core(record: MockTakeawayRecord, wasReplay: boolean) {
    const zone = placeOf(record.branchId).timeZoneId;
    const lines = lineViews(record);
    return {
      id: record.id,
      code: record.code,
      status: record.status,
      lines,
      totalDram: lines.reduce((sum, line) => sum + line.lineTotalDram, 0),
      note: record.note,
      pickupAsap: record.pickupAsap,
      requestedPickupUtc: record.requestedPickupUtc,
      requestedPickupAt: wallClock(Date.parse(record.requestedPickupUtc), zone),
      readyAtUtc: record.readyAtUtc,
      readyAt: record.readyAtUtc ? wallClock(Date.parse(record.readyAtUtc), zone) : null,
      sentAtUtc: record.sentAtUtc,
      acceptDeadlineUtc: record.status === 'sent' ? record.acceptDeadlineUtc : null,
      acceptedAtUtc: record.acceptedAtUtc,
      readyMarkedAtUtc: record.readyMarkedAtUtc,
      collectedAtUtc: record.collectedAtUtc,
      declinedAtUtc: record.declinedAtUtc,
      cancelledAtUtc: record.cancelledAtUtc,
      noShowAtUtc: record.noShowAtUtc,
      declinedBecause: record.declinedBecause,
      declineReason: record.declineReason,
      paymentMethod: record.paymentMethod,
      paidAmountDram: record.paidAmountDram,
      wasReplay,
    };
  }

  function guestView(record: MockTakeawayRecord, wasReplay = false): TakeawayOrder {
    const place = placeOf(record.branchId);
    return {
      ...core(record, wasReplay),
      branchId: record.branchId,
      venueName: place.venueName,
      branchName: place.branchName,
      branchAddress: place.branchAddress,
      branchPhoneE164: place.branchPhoneE164,
      latitude: place.latitude,
      longitude: place.longitude,
      canCancel: record.status === 'sent',
    };
  }

  function staffView(record: MockTakeawayRecord, wasReplay = false): StaffTakeawayOrder {
    return {
      ...core(record, wasReplay),
      guestName: record.guestName,
      guestPhone: record.guestPhone.trim() || null,
      acceptedByName: record.acceptedByName,
      noShowFromUtc: takeawayNoShowFromUtc(record),
    };
  }

  function inProgress(branchId: string): MockTakeawayRecord[] {
    return [...records.values()].filter(
      (record) => record.branchId === branchId && isTakeawayInProgress(record.status),
    );
  }

  /** Each in-progress order is cooked in the `prepMinutes` before its pickup. */
  function slotFits(branchId: string, pickup: number, prepMinutes: number, maxInProgress: number) {
    const overlapping = inProgress(branchId).filter((record) => {
      const its = Date.parse(record.readyAtUtc ?? record.requestedPickupUtc);
      return Math.abs(its - pickup) < prepMinutes * MINUTE;
    });
    return overlapping.length < maxInProgress;
  }

  interface Window {
    readonly open: boolean;
    readonly earliest: number;
    readonly last: number;
    readonly opensAtUtc: string | null;
  }

  /** The block open now, and its earliest and last pickups. */
  function windowOf(branchId: string, at: number): Window {
    const place = placeOf(branchId);
    const branch = settingsOf(branchId);
    const zone = place.timeZoneId as TimeZone;
    const state = openStateFrom(place.weeklyHours, new Date(at), zone, place.specialDays ?? []);
    const earliest = at + branch.prepMinutes * MINUTE;
    if (state.isOpen && state.closesAtUtc) {
      const last = Date.parse(state.closesAtUtc) - branch.lastOrderMinutes * MINUTE;
      if (earliest <= last) return { open: true, earliest, last, opensAtUtc: null };
      // Past the last order: the next block, read from just after this one closes.
      const next = openStateFrom(
        place.weeklyHours,
        new Date(Date.parse(state.closesAtUtc) + MINUTE),
        zone,
        place.specialDays ?? [],
      );
      return { open: false, earliest, last, opensAtUtc: next.opensAtUtc };
    }
    return { open: false, earliest, last: earliest, opensAtUtc: state.opensAtUtc };
  }

  /** Quarter hours from the earliest (rounded up) to the last, both included, that still fit. */
  function slotsOf(branchId: string, window: Window): { at: string; utc: number }[] {
    if (!window.open) return [];
    const branch = settingsOf(branchId);
    const zone = placeOf(branchId).timeZoneId;
    const step = TAKEAWAY_SLOT_STEP_MINUTES * MINUTE;
    const slots: { at: string; utc: number }[] = [];
    for (let t = Math.ceil(window.earliest / step) * step; t <= window.last; t += step) {
      if (slotFits(branchId, t, branch.prepMinutes, branch.maxInProgress)) {
        slots.push({ at: wallClock(t, zone), utc: t });
      }
    }
    return slots;
  }

  /** "T-" and three digits, unique per branch per day — deterministic, so a replayed world mints the same. */
  function mintCode(branchId: string): string {
    const taken = new Set(
      [...records.values()].filter((r) => r.branchId === branchId).map((r) => r.code),
    );
    for (let attempt = 0; attempt < 900; attempt += 1) {
      const n = 100 + ((counter * 389 + attempt * 7 + 482 - 100) % 900);
      const code = `T-${n}`;
      if (!taken.has(code)) return code;
    }
    return `T-${100 + (counter % 900)}`;
  }

  function require(url: string, orderId: string): MockTakeawayRecord {
    sweep();
    const record = records.get(orderId);
    if (!record) throw new NotFoundError({ url });
    return record;
  }

  function conflict(url: string, record: MockTakeawayRecord): TakeawayStatusConflictError {
    return new TakeawayStatusConflictError({ url, orderId: record.id, orderStatus: record.status });
  }

  function settingsView(branchId: string): TakeawaySettings {
    const branch = settingsOf(branchId);
    return {
      ...DEFAULT_TAKEAWAY_SETTINGS,
      enabled: branch.enabled,
      autoAccept: branch.autoAccept,
      prepMinutes: branch.prepMinutes,
      lastOrderMinutes: branch.lastOrderMinutes,
      maxInProgress: branch.maxInProgress,
    };
  }

  return {
    // --- The branch -----------------------------------------------------------

    settings: settingsView,

    /** The console's save: all five, every field out of bounds named in one 422. */
    setSettings(url: string, branchId: string, input: TakeawaySettingsInput): TakeawaySettings {
      const violations = takeawaySettingsViolations(input);
      if (violations.length > 0) throw validationFailed(url, toMock(violations));
      const branch = settingsOf(branchId);
      branch.enabled = input.enabled;
      branch.autoAccept = input.autoAccept;
      branch.prepMinutes = input.prepMinutes;
      branch.lastOrderMinutes = input.lastOrderMinutes;
      branch.maxInProgress = input.maxInProgress;
      return settingsView(branchId);
    },

    /** The per-dish switch: "only in the hall" when false. */
    setAvailableForTakeaway(branchId: string, menuItemId: string, available: boolean): void {
      const branch = settingsOf(branchId);
      if (available) branch.notForTakeaway.delete(menuItemId);
      else branch.notForTakeaway.add(menuItemId);
    },

    availableForTakeaway(branchId: string, menuItemId: string): boolean {
      return !settingsOf(branchId).notForTakeaway.has(menuItemId);
    },

    /** The diner menu as the server serves it: `availableForTakeaway` per dish. */
    decorateMenu(menu: BranchMenu): BranchMenu {
      const branch = settingsOf(menu.branchId);
      return {
        ...menu,
        categories: menu.categories.map((category) => ({
          ...category,
          items: category.items.map((item) => ({
            ...item,
            availableForTakeaway: !branch.notForTakeaway.has(item.id),
          })),
        })),
      };
    },

    /** The place page's `takeaway`. */
    publicInfo(branchId: string): PublicTakeawayInfo {
      const branch = settingsOf(branchId);
      return { enabled: branch.enabled, prepMinutes: branch.prepMinutes };
    },

    /** `GET /api/diner/branches/{branchId}/takeaway`. */
    availability(branchId: string): TakeawayAvailability {
      sweep();
      const branch = settingsOf(branchId);
      const zone = placeOf(branchId).timeZoneId;
      const at = now().getTime();
      const window = windowOf(branchId, at);
      const open = branch.enabled && window.open;
      const opensAtUtc = branch.enabled && !window.open ? window.opensAtUtc : null;
      return {
        branchId,
        enabled: branch.enabled,
        open,
        prepMinutes: branch.prepMinutes,
        asapReadyAtUtc: open ? iso(window.earliest) : null,
        asapReadyAt: open ? wallClock(window.earliest, zone) : null,
        slots: open ? slotsOf(branchId, window).map((slot) => slot.at) : [],
        lastPickupAt: open ? wallClock(window.last, zone) : null,
        busy: inProgress(branchId).length >= branch.maxInProgress,
        opensAt: opensAtUtc ? wallClock(Date.parse(opensAtUtc), zone) : null,
        opensAtUtc,
      };
    },

    // --- The guest ------------------------------------------------------------

    /** `POST /api/diner/takeaway-orders`, by the server's rules in its order. */
    place(input: {
      readonly url: string;
      readonly command: PlaceTakeawayOrderCommand;
      readonly actor: string;
      readonly guestName: string;
      readonly guestPhone: string;
    }): TakeawayOrder {
      const { url, command, actor } = input;
      sweep();
      requireClientCommandId(url, command.clientCommandId);
      const used = commands.get(command.clientCommandId);
      if (used) {
        if (used.actor !== actor) throw new BookingCommandInUseError({ url });
        const first = records.get(used.orderId);
        if (first) return guestView(first, true);
      }

      const violations = takeawayOrderViolations(command);
      if (violations.length > 0) throw validationFailed(url, toMock(violations));
      const pickup = command.pickup;
      if ('at' in pickup && !/^\d{2}:\d{2}$/u.test(pickup.at)) {
        throw validationFailed(url, [{ field: 'pickup.at', message: 'A time as HH:mm.' }]);
      }

      const { branchId } = command;
      const branch = settingsOf(branchId);
      if (!branch.enabled) throw new TakeawayNotAcceptedError({ url, branchId });

      const at = now().getTime();
      const window = windowOf(branchId, at);
      const zone = placeOf(branchId).timeZoneId;
      if (!window.open) {
        throw new TakeawayClosedError({
          url,
          branchId,
          opensAtUtc: window.opensAtUtc,
          opensAt: window.opensAtUtc ? wallClock(Date.parse(window.opensAtUtc), zone) : null,
        });
      }

      let requested: number;
      if ('at' in pickup) {
        const slots = slotsOf(branchId, window);
        const slot = slots.find((entry) => entry.at === pickup.at);
        if (!slot) {
          throw new TakeawaySlotUnavailableError({
            url,
            branchId,
            at: pickup.at,
            slots: slots.map((entry) => entry.at),
          });
        }
        requested = slot.utc;
      } else {
        if (inProgress(branchId).length >= branch.maxInProgress) {
          throw new TakeawayBusyError({ url, branchId, maxInProgress: branch.maxInProgress });
        }
        requested = window.earliest;
      }

      const dishes = dishesOf(branchId);
      const offenders: UnavailableTakeawayItem[] = [];
      for (const entry of command.lines) {
        const reason = unavailableBecause(branchId, entry.menuItemId, dishes);
        if (reason && !offenders.some((item) => item.menuItemId === entry.menuItemId)) {
          offenders.push({ menuItemId: entry.menuItemId, reason });
        }
      }
      if (offenders.length > 0) throw new TakeawayItemsUnavailableError({ url, items: offenders });

      counter += 1;
      const id = `tk-${counter}`;
      const sentAtUtc = iso(at);
      const record: MockTakeawayRecord = {
        id,
        code: mintCode(branchId),
        branchId,
        actor,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        lines: command.lines.map((entry, index) => {
          const dish = dishes.get(entry.menuItemId);
          return {
            id: `${id}-l${index + 1}`,
            menuItemId: entry.menuItemId,
            name: dish?.name ?? '',
            unitPriceDram: dish?.priceDram ?? 0,
            quantity: entry.quantity,
          };
        }),
        note: takeawayNote(command.note),
        pickupAsap: !('at' in pickup),
        requestedPickupUtc: iso(requested),
        status: 'sent',
        sentAtUtc,
        acceptDeadlineUtc: branch.autoAccept
          ? null
          : iso(at + TAKEAWAY_ACCEPT_WINDOW_MINUTES * MINUTE),
        readyAtUtc: null,
        acceptedAtUtc: null,
        acceptedByName: null,
        readyMarkedAtUtc: null,
        collectedAtUtc: null,
        declinedAtUtc: null,
        cancelledAtUtc: null,
        noShowAtUtc: null,
        declinedBecause: null,
        declineReason: null,
        paymentMethod: null,
        paidAmountDram: null,
      };
      if (branch.autoAccept) accepted(record, record.requestedPickupUtc, null, sentAtUtc);
      records.set(id, record);
      commands.set(command.clientCommandId, { orderId: id, actor });
      changed(record, 'takeaway placed');
      return guestView(record);
    },

    /** The guest's own order, or `null` for an unknown one or somebody else's. */
    guestOrder(orderId: string, actor: string | null): TakeawayOrder | null {
      sweep();
      const record = records.get(orderId);
      if (!record || (actor !== null && record.actor !== actor)) return null;
      return guestView(record);
    },

    /** `POST …/cancel`: only while sent; a second tap answers it cancelled. */
    cancel(url: string, orderId: string, actor: string | null): TakeawayOrder {
      const record = require(url, orderId);
      if (actor !== null && record.actor !== actor) throw new NotFoundError({ url });
      if (record.status === 'cancelled') return guestView(record, true);
      if (record.status !== 'sent') throw conflict(url, record);
      record.status = 'cancelled';
      record.cancelledAtUtc = now().toISOString();
      record.acceptDeadlineUtc = null;
      changed(record, 'takeaway cancelled');
      return guestView(record);
    },

    /** The Orders tab's takeaway cards, as `GET /api/diner/orders` lists them. */
    dinerOrders(actor: string | null): DinerOrder[] {
      sweep();
      return [...records.values()]
        .filter((record) => actor === null || record.actor === actor)
        .map((record): DinerOrder => {
          const place = placeOf(record.branchId);
          const view = guestView(record);
          return {
            orderId: record.id,
            tabId: null,
            branchId: record.branchId,
            venueName: place.venueName,
            branchName: place.branchName,
            coverPhoto: null,
            kind: 'takeaway',
            status: dinerStatus(record.status),
            tableLabel: null,
            partySize: null,
            placedAtUtc: record.sentAtUtc,
            estimatedReadyAtUtc: record.readyAtUtc,
            totalAmd: view.totalDram,
            items: view.lines.map((line) => ({
              lineId: line.id,
              name: line.name,
              quantity: line.quantity,
              unitPriceAmd: line.unitPriceDram,
              lineTotalAmd: line.lineTotalDram,
              note: null,
              isVoided: false,
            })),
            timeline: timelineOf(record),
            canCancel: record.status === 'sent',
            takeaway: {
              code: record.code,
              status: record.status,
              pickupAsap: record.pickupAsap,
              requestedPickupUtc: record.requestedPickupUtc,
              readyAtUtc: record.readyAtUtc,
              itemCount: takeawayItemCount(record.lines),
            },
          };
        })
        .sort(
          (a, b) =>
            Number(isTakeawayActive(b.takeaway!.status)) -
              Number(isTakeawayActive(a.takeaway!.status)) ||
            Date.parse(b.placedAtUtc) - Date.parse(a.placedAtUtc),
        );
    },

    // --- The counter ------------------------------------------------------------

    /** `GET /api/branches/{branchId}/takeaway-orders`. */
    branchOrders(branchId: string): BranchTakeawayOrders {
      sweep();
      const t = now();
      const zone = placeOf(branchId).timeZoneId as TimeZone;
      const today = zonedParts(t, zone);
      const sameDay = (instant: string) => {
        const parts = zonedParts(new Date(instant), zone);
        return parts.year === today.year && parts.month === today.month && parts.day === today.day;
      };
      const mine = [...records.values()].filter((record) => record.branchId === branchId);
      const active = mine
        .filter((record) => isTakeawayActive(record.status))
        .sort((a, b) => Date.parse(a.sentAtUtc) - Date.parse(b.sentAtUtc));
      const finished = mine
        .filter(
          (record) =>
            (record.status === 'collected' ||
              record.status === 'noShow' ||
              record.status === 'declined') &&
            sameDay(record.sentAtUtc),
        )
        .sort((a, b) => Date.parse(b.sentAtUtc) - Date.parse(a.sentAtUtc));
      return {
        active: active.map((record) => staffView(record)),
        finishedToday: finished.map((record) => staffView(record)),
        sentCount: active.filter((record) => record.status === 'sent').length,
        readyCount: active.filter((record) => record.status === 'ready').length,
        asOfUtc: t.toISOString(),
      };
    },

    /** Accept with a ready time from now (a minute of skew) to twelve hours on. */
    accept(url: string, orderId: string, readyAtUtc: string, byName: string | null) {
      const record = require(url, orderId);
      if (record.status === 'accepted') return staffView(record, true);
      if (record.status !== 'sent') throw conflict(url, record);
      const t = now().getTime();
      const ready = Date.parse(readyAtUtc);
      if (!Number.isFinite(ready) || ready < t - MINUTE || ready > t + 12 * 60 * MINUTE) {
        throw validationFailed(url, [
          { field: 'readyAt', message: 'From now to twelve hours on.', bound: 'range' },
        ]);
      }
      accepted(record, iso(ready), byName, iso(t));
      changed(record, 'takeaway accepted');
      return staffView(record);
    },

    decline(url: string, orderId: string, reason: string | null | undefined) {
      const record = require(url, orderId);
      if (record.status === 'declined') return staffView(record, true);
      if (record.status !== 'sent') throw conflict(url, record);
      const said = takeawayNote(reason);
      if (said && said.length > TAKEAWAY_LIMITS.maxDeclineReason) {
        throw validationFailed(url, [
          {
            field: 'reason',
            message: `At most ${TAKEAWAY_LIMITS.maxDeclineReason} characters.`,
            bound: 'max',
            max: TAKEAWAY_LIMITS.maxDeclineReason,
          },
        ]);
      }
      record.status = 'declined';
      record.declinedAtUtc = now().toISOString();
      record.declinedBecause = 'venue';
      record.declineReason = said;
      record.acceptDeadlineUtc = null;
      changed(record, 'takeaway declined');
      return staffView(record);
    },

    ready(url: string, orderId: string) {
      const record = require(url, orderId);
      if (record.status === 'ready') return staffView(record, true);
      if (record.status !== 'accepted') throw conflict(url, record);
      record.status = 'ready';
      record.readyMarkedAtUtc = now().toISOString();
      changed(record, 'takeaway ready');
      return staffView(record);
    },

    collect(url: string, orderId: string, method: TakeawayPaymentMethod) {
      const record = require(url, orderId);
      if (record.status === 'collected') return staffView(record, true);
      if (record.status !== 'ready') throw conflict(url, record);
      record.status = 'collected';
      record.collectedAtUtc = now().toISOString();
      record.paymentMethod = method;
      record.paidAmountDram = record.lines.reduce(
        (sum, line) => sum + line.unitPriceDram * line.quantity,
        0,
      );
      changed(record, 'takeaway collected');
      return staffView(record);
    },

    noShow(url: string, orderId: string) {
      const record = require(url, orderId);
      if (record.status === 'noShow') return staffView(record, true);
      if (record.status !== 'ready') throw conflict(url, record);
      const from = takeawayNoShowFromUtc(record);
      if (from && now().getTime() < Date.parse(from)) {
        throw new TakeawayNoShowTooEarlyError({ url, orderId, noShowFromUtc: from });
      }
      record.status = 'noShow';
      record.noShowAtUtc = now().toISOString();
      changed(record, 'takeaway not collected');
      return staffView(record);
    },

    /** Accepted and ready orders as kitchen tickets with the "TAKEAWAY" band. */
    kitchenTickets(branchId: string): OrderQueueEntry[] {
      sweep();
      const t = now().getTime();
      const zone = placeOf(branchId).timeZoneId;
      return [...records.values()]
        .filter(
          (record) =>
            record.branchId === branchId &&
            (record.status === 'accepted' || record.status === 'ready') &&
            record.readyAtUtc,
        )
        .map((record) => {
          const placedAt = record.acceptedAtUtc ?? record.sentAtUtc;
          return {
            orderId: record.id,
            tabId: null,
            tableLabel: record.code,
            status: record.status === 'ready' ? ('ready' as const) : ('inKitchen' as const),
            placedAtUtc: placedAt,
            estimatedReadyAtUtc: record.readyAtUtc,
            waitingMinutes: Math.max(0, Math.floor((t - Date.parse(placedAt)) / MINUTE)),
            lines: record.lines.map((line) => ({
              lineId: line.id,
              menuItemId: line.menuItemId,
              name: line.name,
              quantity: line.quantity,
              note: null,
              onBehalfOfParticipantId: null,
            })),
            placedByName: null,
            takeaway: {
              code: record.code,
              readyAtUtc: record.readyAtUtc!,
              readyAtLocalTime: wallClock(Date.parse(record.readyAtUtc!), zone),
              guestName: record.guestName,
              note: record.note,
            },
          };
        });
    },

    /** Every record, for a mock that reads the orders itself (the diner's feed). */
    records(): readonly MockTakeawayRecord[] {
      sweep();
      return [...records.values()];
    },

    record(orderId: string): MockTakeawayRecord | undefined {
      sweep();
      return records.get(orderId);
    },

    /** Seed one, as mock mode's worlds start with. */
    seed(seed: MockTakeawaySeed): MockTakeawayRecord {
      counter += 1;
      const id = seed.id ?? `tk-${counter}`;
      const record: MockTakeawayRecord = {
        ...seed,
        id,
        code: seed.code ?? mintCode(seed.branchId),
        acceptDeadlineUtc:
          seed.acceptDeadlineUtc ??
          (seed.status === 'sent' && !settingsOf(seed.branchId).autoAccept
            ? iso(Date.parse(seed.sentAtUtc) + TAKEAWAY_ACCEPT_WINDOW_MINUTES * MINUTE)
            : null),
      };
      records.set(id, record);
      return record;
    },
  };
}

export type MockTakeawayBook = ReturnType<typeof createMockTakeawayBook>;

/** The app's words for a takeaway order's status (`DinerOrderStatuses.FromTakeaway`). */
function dinerStatus(status: TakeawayStatus): DinerOrder['status'] {
  switch (status) {
    case 'sent':
      return 'inProgress';
    case 'accepted':
      return 'preparing';
    case 'ready':
      return 'ready';
    case 'collected':
      return 'completed';
    default:
      return 'cancelled';
  }
}

function timelineOf(record: MockTakeawayRecord): DinerOrder['timeline'] {
  const steps: { status: TakeawayStatus; at: string | null }[] = [
    { status: 'sent', at: record.sentAtUtc },
    { status: 'accepted', at: record.acceptedAtUtc },
    { status: 'ready', at: record.readyMarkedAtUtc },
    { status: 'collected', at: record.collectedAtUtc },
    { status: 'declined', at: record.declinedAtUtc },
    { status: 'cancelled', at: record.cancelledAtUtc },
    { status: 'noShow', at: record.noShowAtUtc },
  ];
  return steps
    .filter((step): step is { status: TakeawayStatus; at: string } => step.at !== null)
    .map((step) => ({ status: dinerStatus(step.status), atUtc: step.at }));
}

/**
 * Mock mode's takeaway for the diner's world (`resolveGateway`'s
 * `mockTakeaway`): Northern Avenue takes orders, staff accept, 20 minutes'
 * preparation, and the matnakash eggs are "only in the hall". Every other
 * branch is off, as the server's default is.
 */
export const MOCK_TAKEAWAY_BRANCHES: Readonly<Record<string, MockTakeawayBranch>> = {
  'b-lumen-north': {
    enabled: true,
    autoAccept: false,
    prepMinutes: 20,
    lastOrderMinutes: 30,
    maxInProgress: 5,
    notForTakeawayMenuItemIds: ['matnakash-eggs'],
  },
};

/** For tests: the instant of a branch-local clock today. */
export function localInstant(at: Date, clock: string, timeZoneId: string): string {
  const parts = zonedParts(at, timeZoneId as TimeZone);
  const [hour, minute] = clock.split(':').map(Number) as [number, number];
  return instantFromZonedClock(
    { year: parts.year, month: parts.month, day: parts.day, hour, minute },
    timeZoneId as TimeZone,
  ).toISOString();
}
